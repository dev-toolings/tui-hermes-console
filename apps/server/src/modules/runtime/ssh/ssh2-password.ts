import { createReadStream, createWriteStream } from "node:fs";
import net from "node:net";
import { pipeline } from "node:stream/promises";
import { Client } from "ssh2";
import { createByteLimit } from "./byte-limit";
import { mapForwardError, mapSshError, sshHostKeyRejected } from "./errors";
import {
  configuredKnownHostsPath,
  hostLookupKey,
  loadKnownHosts,
  verifyHostKey,
} from "./known-hosts";
import type {
  SshChannel,
  SshCommandSession,
  SshExecResult,
  SshTarget,
} from "./types";

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

  function close() {
    forwarded = null;
    server?.close();
    server = null;
    const conn = client;
    client = null;
    conn?.end();
  }

  async function startRemote(
    command: string,
    options: { pseudoTerminal?: boolean } = {},
  ): Promise<SshCommandSession> {
    const conn = await connect();
    return new Promise((resolve, reject) => {
      conn.exec(command, { pty: options.pseudoTerminal === true }, (error, stream) => {
        if (error) {
          reject(mapSshError(error));
          return;
        }
        let stdout = "";
        let stderr = "";
        let exitCode: number | null = null;
        let settled = false;
        const listeners = new Set<
          (output: { stream: "stdout" | "stderr"; chunk: string }) => void
        >();
        const emit = (streamName: "stdout" | "stderr", chunk: Buffer) => {
          const text = chunk.toString();
          for (const listener of listeners) listener({ stream: streamName, chunk: text });
          if (streamName === "stdout") stdout = (stdout + text).slice(-64_000);
          else stderr = (stderr + text).slice(-16_000);
        };
        stream.on("data", (chunk: Buffer) => {
          emit("stdout", chunk);
        });
        stream.stderr.on("data", (chunk: Buffer) => {
          emit("stderr", chunk);
        });
        stream.on("exit", (code: number) => {
          exitCode = code;
        });
        const result = new Promise<SshExecResult>((resolveResult, rejectResult) => {
          stream.on("close", () => {
            if (settled) return;
            settled = true;
            resolveResult({ stdout, stderr, code: exitCode ?? 0 });
          });
          stream.on("error", (streamError: Error) => {
            if (settled) return;
            settled = true;
            rejectResult(mapSshError(streamError));
          });
        });
        resolve({
          onOutput(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
          write(input) {
            stream.write(input);
          },
          endInput() {
            stream.end();
          },
          kill() {
            stream.signal("TERM");
            stream.close();
          },
          result,
        });
      });
    });
  }

  async function execRemote(command: string): Promise<SshExecResult> {
    return (await startRemote(command)).result;
  }

  return { forward, exec: execRemote, start: startRemote, close };
}

