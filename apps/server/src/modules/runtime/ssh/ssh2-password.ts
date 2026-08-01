import { createReadStream, createWriteStream } from "node:fs";
import net from "node:net";
import { pipeline } from "node:stream/promises";
import { Client, type SFTPWrapper, type Stats } from "ssh2";
import { createByteLimit } from "./byte-limit";
import { mapForwardError, mapSshError, sshHostKeyRejected } from "./errors";
import {
  configuredKnownHostsPath,
  hostLookupKey,
  loadKnownHosts,
  verifyHostKey,
} from "./known-hosts";
import type { SftpOps, SshChannel, SshTarget } from "./types";

const CONNECT_TIMEOUT_MS = 12_000;
const KEEPALIVE_MS = 15_000;

/** Repli tout-JS pour les hôtes qui n'acceptent que le mot de passe : le binaire `ssh`
 *  ne sait pas en recevoir un sans TTY (et macOS n'a pas `sshpass`). */
export function createSsh2Channel(target: SshTarget): SshChannel {
  let client: Client | null = null;
  let connecting: Promise<Client> | null = null;
  let server: net.Server | null = null;
  let forwarded: { url: string; remote: string } | null = null;
  let sftpHandle: SFTPWrapper | null = null;

  function connect(): Promise<Client> {
    if (client) return Promise.resolve(client);
    if (connecting) return connecting;

    connecting = new Promise<Client>((resolve, reject) => {
      const next = new Client();
      let settled = false;
      let hostKeyError: Error | null = null;

      next.on("ready", () => {
        settled = true;
        client = next;
        resolve(next);
      });
      next.on("error", (error) => {
        if (settled) return;
        settled = true;
        reject(hostKeyError ?? mapSshError(error));
      });
      next.on("close", () => {
        if (client === next) close();
        if (!settled) {
          settled = true;
          // Un refus de clé d'hôte ferme la connexion : sans ce report, l'échec
          // remonterait en « connexion SSH fermée », message qui masque la cause.
          reject(hostKeyError ?? mapSshError(new Error("connexion SSH fermée")));
        }
      });

      try {
        next.connect({
          host: target.host,
          port: target.port,
          username: target.user,
          password: target.password,
          readyTimeout: CONNECT_TIMEOUT_MS,
          keepaliveInterval: KEEPALIVE_MS,
          // Sans ce verificateur, ssh2 accepte n'importe quelle cle d'hote et le
          // mot de passe part au premier serveur qui repond. On refuse un hote
          // inconnu, comme le fait `ssh -o BatchMode=yes` sur l'autre chemin.
          hostVerifier: (key: Buffer, callback: (accepted: boolean) => void) => {
            const verdict = verifyHostKey(
              loadKnownHosts([configuredKnownHostsPath()]),
              hostLookupKey(target.host, target.port),
              key.toString("base64"),
            );
            if (!verdict.ok) hostKeyError = sshHostKeyRejected(verdict.reason);
            callback(verdict.ok);
          },
        });
      } catch (error) {
        settled = true;
        reject(mapSshError(error));
      }
    }).finally(() => {
      connecting = null;
    });

    return connecting;
  }

  async function forward(remoteHost: string, remotePort: number): Promise<string> {
    const remote = `${remoteHost}:${remotePort}`;
    if (forwarded && forwarded.remote === remote && client) return forwarded.url;

    const conn = await connect();
    // Canal de test : sans lui, un refus de forwarding ou un port distant mort ne se
    // manifesterait qu'au premier fetch, sous forme d'ECONNRESET opaque.
    await new Promise<void>((resolve, reject) => {
      conn.forwardOut("127.0.0.1", 0, remoteHost, remotePort, (error, stream) => {
        if (error) {
          reject(mapForwardError(error, remote));
          return;
        }
        stream.end();
        resolve();
      });
    });

    const url = await listen(conn, remoteHost, remotePort);
    forwarded = { url, remote };
    return url;
  }

  function listen(conn: Client, remoteHost: string, remotePort: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const next = net.createServer((socket) => {
        socket.on("error", () => socket.destroy());
        conn.forwardOut("127.0.0.1", 0, remoteHost, remotePort, (error, stream) => {
          if (error) {
            socket.destroy();
            return;
          }
          stream.on("error", () => socket.destroy());
          socket.pipe(stream).pipe(socket);
        });
      });

      next.on("error", reject);
      next.listen(0, "127.0.0.1", () => {
        const address = next.address();
        if (typeof address === "string" || !address) {
          next.close();
          reject(new Error("port local du tunnel indisponible"));
          return;
        }
        server?.close();
        server = next;
        resolve(`http://127.0.0.1:${address.port}`);
      });
    });
  }

  async function sftp(): Promise<SftpOps> {
    const conn = await connect();
    // Une session SFTP par appel épuisait `MaxSessions` (10 par défaut) au bout
    // de quelques missions : on en garde une seule, rouverte si elle se ferme.
    if (!sftpHandle) {
      sftpHandle = await new Promise<SFTPWrapper>((resolve, reject) => {
        conn.sftp((error, wrapper) => (error ? reject(mapSshError(error)) : resolve(wrapper)));
      });
      sftpHandle.once("close", () => {
        sftpHandle = null;
      });
    }
    const handle = sftpHandle;

    return {
      async mkdirp(remotePath: string) {
        // SFTP n'a pas de mkdir récursif : chaque segment est créé et un échec
        // n'est toléré que si un stat prouve qu'un répertoire existe déjà.
        const segments = remotePath.split("/").filter(Boolean);
        let current = remotePath.startsWith("/") ? "" : ".";
        for (const segment of segments) {
          current = `${current}/${segment}`;
          await ensureSftpDirectory(handle, current);
        }
      },
      list(remotePath: string, maxEntries: number) {
        return readSftpDirectoryBounded(handle, remotePath, maxEntries);
      },
      stat(remotePath: string) {
        return new Promise((resolve, reject) => {
          handle.lstat(remotePath, (error, stats) => {
            if (error) {
              reject(mapSshError(error));
              return;
            }
            resolve(toSftpStat(stats));
          });
        });
      },
      async upload(localPath: string, remotePath: string) {
        await pipeline(createReadStream(localPath), handle.createWriteStream(remotePath));
      },
      async download(remotePath: string, localPath: string, maxBytes: number) {
        await pipeline(
          handle.createReadStream(remotePath),
          createByteLimit(maxBytes),
          createWriteStream(localPath, { flags: "wx", mode: 0o600 }),
        );
      },
    };
  }

  function close() {
    forwarded = null;
    sftpHandle = null;
    server?.close();
    server = null;
    const conn = client;
    client = null;
    conn?.end();
  }

  return { forward, sftp, close };
}

type DirectorySftp = Pick<SFTPWrapper, "mkdir" | "stat">;

type ListingSftp = Pick<SFTPWrapper, "opendir" | "readdir" | "close">;

export function readSftpDirectoryBounded(
  handle: ListingSftp,
  remotePath: string,
  maxEntries: number,
): Promise<string[]> {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 0) {
    return Promise.reject(new Error("limite de liste SFTP invalide"));
  }
  const readLimit = maxEntries + 1;
  return new Promise((resolve, reject) => {
    handle.opendir(remotePath, (openError, directory) => {
      if (openError) {
        reject(mapSshError(openError));
        return;
      }
      const names: string[] = [];
      let settled = false;
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        handle.close(directory, (closeError) => {
          if (error) reject(mapSshError(error));
          else if (closeError) reject(mapSshError(closeError));
          else resolve(names);
        });
      };
      const readNext = () => {
        handle.readdir(directory, (readError, entries) => {
          if (readError) {
            finish(readError);
            return;
          }
          if (!entries) {
            finish();
            return;
          }
          for (const entry of entries) {
            names.push(entry.filename);
            if (names.length >= readLimit) {
              finish();
              return;
            }
          }
          readNext();
        });
      };
      readNext();
    });
  });
}

export function ensureSftpDirectory(
  handle: DirectorySftp,
  remotePath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    handle.mkdir(remotePath, (mkdirError) => {
      if (!mkdirError) {
        resolve();
        return;
      }
      handle.stat(remotePath, (statError, stats) => {
        if (!statError && stats.isDirectory()) {
          resolve();
          return;
        }
        reject(mapSshError(mkdirError));
      });
    });
  });
}

function toSftpStat(stats: Stats) {
  const type = stats.isFile()
    ? ("file" as const)
    : stats.isDirectory()
      ? ("directory" as const)
      : stats.isSymbolicLink()
        ? ("symlink" as const)
        : ("other" as const);
  return { size: stats.size, type };
}
