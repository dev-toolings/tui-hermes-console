import { createReadStream, createWriteStream } from "node:fs";
import net from "node:net";
import { pipeline } from "node:stream/promises";
import { Client, type SFTPWrapper } from "ssh2";
import { mapForwardError, mapSshError } from "./errors";
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

  function connect(): Promise<Client> {
    if (client) return Promise.resolve(client);
    if (connecting) return connecting;

    connecting = new Promise<Client>((resolve, reject) => {
      const next = new Client();
      let settled = false;

      next.on("ready", () => {
        settled = true;
        client = next;
        resolve(next);
      });
      next.on("error", (error) => {
        if (settled) return;
        settled = true;
        reject(mapSshError(error));
      });
      next.on("close", () => {
        if (client === next) close();
        if (!settled) {
          settled = true;
          reject(mapSshError(new Error("connexion SSH fermée")));
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
    const handle = await new Promise<SFTPWrapper>((resolve, reject) => {
      conn.sftp((error, wrapper) => (error ? reject(mapSshError(error)) : resolve(wrapper)));
    });

    return {
      async mkdirp(remotePath: string) {
        // SFTP n'a pas de mkdir récursif : on crée chaque segment, en ignorant "existe déjà".
        const segments = remotePath.split("/").filter(Boolean);
        let current = remotePath.startsWith("/") ? "" : ".";
        for (const segment of segments) {
          current = `${current}/${segment}`;
          await new Promise<void>((resolve) => handle.mkdir(current, () => resolve()));
        }
      },
      list(remotePath: string) {
        return new Promise<string[]>((resolve) => {
          handle.readdir(remotePath, (error, entries) =>
            resolve(error ? [] : entries.map((entry) => entry.filename)),
          );
        });
      },
      async upload(localPath: string, remotePath: string) {
        await pipeline(createReadStream(localPath), handle.createWriteStream(remotePath));
      },
      async download(remotePath: string, localPath: string) {
        await pipeline(handle.createReadStream(remotePath), createWriteStream(localPath));
      },
    };
  }

  function close() {
    forwarded = null;
    server?.close();
    server = null;
    const conn = client;
    client = null;
    conn?.end();
  }

  return { forward, sftp, close };
}
