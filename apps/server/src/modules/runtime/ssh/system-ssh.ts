import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream, mkdirSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createByteLimit } from "./byte-limit";
import { mapSystemSshStderr, sshBinaryMissing } from "./errors";
import { configuredKnownHostsPath } from "./known-hosts";
import type { SftpOps, SshChannel, SshExecResult, SshTarget } from "./types";

/** Socket ControlMaster. `/tmp` plutôt que os.tmpdir() : sur macOS ce dernier est un chemin
 *  très long et un socket Unix est limité à ~104 caractères. */
const CONTROL_DIR = "/tmp/hermes-console-ssh";
const CONTROL_PERSIST = "300";
/** Doit rester supérieur à ConnectTimeout : sinon notre délai expire avant que `ssh`
 *  ait pu écrire la vraie cause, et on perd le diagnostic. */
const READY_TIMEOUT_MS = 20_000;
const CONNECT_TIMEOUT_S = "10";
const PROBE_TIMEOUT_MS = 2_000;
/** Délai laissé au master détaché pour publier son port avant de conclure à l'échec. */
const EXIT_GRACE_MS = 1_500;

/** Options communes à toutes les invocations : jamais de prompt interactif (le serveur
 *  n'a pas de TTY), et échec immédiat si le forward ne peut pas être établi. */
export function baseSshArgs(target: SshTarget, controlId = "shared"): string[] {
  return [
    "-o",
    "BatchMode=yes",
    "-o",
    "IdentitiesOnly=yes",
    "-o",
    "ControlMaster=auto",
    "-o",
    `ControlPath=${controlPath(target, controlId)}`,
    "-o",
    `ControlPersist=${CONTROL_PERSIST}`,
    "-o",
    `ConnectTimeout=${CONNECT_TIMEOUT_S}`,
    "-o",
    "StrictHostKeyChecking=yes",
    "-o",
    "UpdateHostKeys=no",
    "-o",
    `UserKnownHostsFile=${configuredKnownHostsPath()}`,
    "-o",
    "GlobalKnownHostsFile=/dev/null",
    "-o",
    "ServerAliveInterval=15",
    "-o",
    "ServerAliveCountMax=3",
    // Sans ça, la bannière MOTD de l'hôte arrive sur stderr et pollue le diagnostic.
    "-o",
    "LogLevel=ERROR",
    "-p",
    String(target.port),
  ];
}

export function forwardArgs(
  target: SshTarget,
  localPort: number,
  remote: string,
  controlId = "shared",
): string[] {
  return [
    ...baseSshArgs(target, controlId),
    "-o",
    "ExitOnForwardFailure=yes",
    "-N",
    "-L",
    `127.0.0.1:${localPort}:${remote}`,
    `${target.user}@${target.host}`,
  ];
}

export function scpArgs(
  target: SshTarget,
  from: string,
  to: string,
  controlId = "shared",
): string[] {
  return [
    "-o",
    "BatchMode=yes",
    "-o",
    "IdentitiesOnly=yes",
    "-o",
    "ControlMaster=auto",
    "-o",
    `ControlPath=${controlPath(target, controlId)}`,
    "-o",
    "StrictHostKeyChecking=yes",
    "-o",
    "UpdateHostKeys=no",
    "-o",
    `UserKnownHostsFile=${configuredKnownHostsPath()}`,
    "-o",
    "GlobalKnownHostsFile=/dev/null",
    "-P",
    String(target.port),
    "--",
    from,
    to,
  ];
}

export function controlPath(target: SshTarget, controlId = "shared") {
  const digest = createHash("sha256")
    .update(`${target.user}\0${target.host}\0${target.port}\0${controlId}`)
    .digest("hex")
    .slice(0, 32);
  return path.join(CONTROL_DIR, digest);
}

export function createSystemSshChannel(target: SshTarget): SshChannel {
  // Deux objets canal ne doivent jamais partager le ControlMaster OpenSSH :
  // fermer un probe éphémère tuerait sinon le tunnel d'une mission active.
  const controlId = randomUUID();
  let master: ChildProcess | null = null;
  let stderr = "";
  let forwarded: { url: string; remote: string; port: number } | null = null;
  let forwarding: Promise<string> | null = null;

  /**
   * Sérialisé : `openForward()` commence par `close()`, qui tue le ControlMaster
   * partagé. Sans ce verrou, deux appels concurrents — le cas normal, la surface
   * de suivi interrogeant le runtime pendant qu'une mission stream — se coupent
   * mutuellement le tunnel.
   */
  async function forward(remoteHost: string, remotePort: number): Promise<string> {
    if (forwarding) return forwarding;

    const remote = `${remoteHost}:${remotePort}`;
    // Le master étant détaché, son process enfant n'est pas un indicateur de vie :
    // seul le port local qui répond encore l'est.
    if (forwarded && forwarded.remote === remote && (await isListening(forwarded.port))) {
      return forwarded.url;
    }
    // Une autre requête a pu démarrer l'ouverture pendant le `await` ci-dessus.
    if (forwarding) return forwarding;

    forwarding = openForward(remote).finally(() => {
      forwarding = null;
    });
    return forwarding;
  }

  async function openForward(remote: string): Promise<string> {
    close();
    mkdirSync(CONTROL_DIR, { recursive: true, mode: 0o700 });
    const localPort = await reserveLocalPort();

    stderr = "";
    const child = spawn("ssh", forwardArgs(target, localPort, remote, controlId), {
      stdio: ["ignore", "ignore", "pipe"],
    });
    master = child;
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4_000);
    });

    try {
      await waitForForward(child, localPort, () => stderr);
      await probeForward(localPort, () => stderr, remote);
    } catch (error) {
      close();
      throw error;
    }

    forwarded = { url: `http://127.0.0.1:${localPort}`, remote, port: localPort };
    return forwarded.url;
  }

  async function sftp(): Promise<SftpOps> {
    return {
      async mkdirp(remotePath: string) {
        await run(["mkdir", "-p", "--", shellQuote(remotePath)]);
      },
      async list(remotePath: string, maxEntries: number) {
        // Un dossier absent/illisible est un échec de livraison, pas une liste vide.
        const out = await run([systemSftpListCommand(remotePath, maxEntries)]);
        return parseSystemSftpList(out, maxEntries);
      },
      async stat(remotePath: string) {
        const out = await run([
          "stat",
          "--format=%f:%s",
          "--",
          shellQuote(remotePath),
        ]);
        return parseSystemSftpStat(out);
      },
      async upload(localPath: string, remotePath: string) {
        await scp(localPath, `${target.user}@${target.host}:${remotePath}`);
      },
      async download(remotePath: string, localPath: string, maxBytes: number) {
        await downloadBounded(remotePath, localPath, maxBytes);
      },
    };
  }

  function close(sync = false) {
    forwarded = null;
    const child = master;
    master = null;
    child?.kill("SIGTERM");

    // Le master vit dans un process détaché (ControlPersist) : tuer l'enfant ne suffit pas.
    // Sur arrêt du serveur, il faut la variante synchrone — un spawn asynchrone n'aurait
    // pas le temps de partir et la connexion survivrait jusqu'à l'expiration du persist.
    const args = [...baseSshArgs(target, controlId), "-O", "exit", `${target.user}@${target.host}`];
    if (sync) {
      spawnSync("ssh", args, { stdio: "ignore" });
      return;
    }
    spawn("ssh", args, { stdio: "ignore" }).on("error", () => undefined);
  }

  /** Commande distante via le master existant : pas de nouvelle authentification. */
  function run(command: string[]): Promise<string> {
    return exec("ssh", [
      ...baseSshArgs(target, controlId),
      `${target.user}@${target.host}`,
      command.join(" "),
    ]);
  }

  function scp(from: string, to: string): Promise<string> {
    return exec("scp", scpArgs(target, from, to, controlId));
  }

  async function downloadBounded(
    remotePath: string,
    localPath: string,
    maxBytes: number,
  ) {
    const child = spawn(
      "ssh",
      [
        ...baseSshArgs(target, controlId),
        `${target.user}@${target.host}`,
        `cat -- ${shellQuote(remotePath)}`,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4_000);
    });
    const completed = new Promise<void>((resolve, reject) => {
      child.on("error", (error: NodeJS.ErrnoException) => {
        reject(
          error.code === "ENOENT"
            ? sshBinaryMissing()
            : mapSystemSshStderr(error.message, ""),
        );
      });
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(mapSystemSshStderr(stderr || `ssh a échoué (code ${code})`, ""));
      });
    });
    try {
      await Promise.all([
        pipeline(
          child.stdout!,
          createByteLimit(maxBytes),
          createWriteStream(localPath, { flags: "wx", mode: 0o600 }),
        ),
        completed,
      ]);
    } catch (error) {
      child.kill("SIGTERM");
      throw error;
    }
  }

  async function execRemote(command: string): Promise<SshExecResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        "ssh",
        [...baseSshArgs(target, controlId), `${target.user}@${target.host}`, command],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout = (stdout + chunk.toString()).slice(-64_000);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-16_000);
      });
      child.on("error", (error: NodeJS.ErrnoException) => {
        reject(error.code === "ENOENT" ? sshBinaryMissing() : mapSystemSshStderr(error.message, ""));
      });
      child.on("close", (code) => {
        resolve({ stdout, stderr, code: typeof code === "number" ? code : 1 });
      });
    });
  }

  return { forward, sftp, exec: execRemote, close };
}

export function systemSftpListCommand(remotePath: string, maxEntries: number) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 0) {
    throw new Error("limite de liste SSH invalide");
  }
  return [
    "{ find --",
    shellQuote(remotePath),
    "-mindepth 1 -maxdepth 1 -printf '%f\\0';",
    "printf '/__hermes_find_status__:%s\\0' \"$?\"; }",
    "| head -z -n",
    String(maxEntries + 2),
  ].join(" ");
}

export function parseSystemSftpList(output: string, maxEntries: number) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 0) {
    throw new Error("limite de liste SSH invalide");
  }
  const fields = output.split("\0").filter((name) => name.length > 0);
  const markerIndex = fields.findIndex((field) =>
    field.startsWith("/__hermes_find_status__:"),
  );
  if (markerIndex >= 0) {
    const status = Number(fields[markerIndex]!.slice("/__hermes_find_status__:".length));
    if (!Number.isSafeInteger(status) || status !== 0) {
      throw new Error(`énumération distante échouée (find=${String(status)})`);
    }
    return fields.slice(0, Math.min(markerIndex, maxEntries + 1));
  }
  // Le marqueur n'est normalement absent que lorsque `head` a atteint sa
  // borne avant la fin de find : on garde maxCount+1 pour signaler le quota.
  if (fields.length >= maxEntries + 2) {
    return fields.slice(0, maxEntries + 1);
  }
  throw new Error("énumération distante incomplète (statut find absent)");
}

export function parseSystemSftpStat(output: string) {
  const [modeHex, sizeRaw] = output.trim().split(":");
  const mode = Number.parseInt(modeHex ?? "", 16);
  const size = Number(sizeRaw);
  if (!Number.isSafeInteger(mode) || !Number.isSafeInteger(size) || size < 0) {
    throw new Error("stat distant invalide");
  }
  const kind = mode & 0o170000;
  const type =
    kind === 0o100000
      ? ("file" as const)
      : kind === 0o040000
        ? ("directory" as const)
        : kind === 0o120000
          ? ("symlink" as const)
          : ("other" as const);
  return { size, type };
}

function exec(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", (error: NodeJS.ErrnoException) => {
      reject(error.code === "ENOENT" ? sshBinaryMissing() : mapSystemSshStderr(error.message, ""));
    });
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(mapSystemSshStderr(stderr || `${command} a échoué (code ${code})`, ""));
    });
  });
}

/** Le forward est prêt quand le port local accepte une connexion.
 *
 *  Attention : avec `ControlPersist`, le client `ssh` se détache après l'authentification et le
 *  process de premier plan se termine **normalement**, master vivant. Sa sortie n'est donc pas un
 *  échec en soi — seule l'absence de port à l'écoute en est un. */
function waitForForward(
  child: ChildProcess,
  localPort: number,
  getStderr: () => string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let exitedAt: number | null = null;

    const done = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      clearTimeout(deadline);
      if (error) reject(error);
      else resolve();
    };

    child.on("error", (error: NodeJS.ErrnoException) => {
      done(error.code === "ENOENT" ? sshBinaryMissing() : mapSystemSshStderr(getStderr(), ""));
    });
    child.on("close", () => {
      exitedAt = Date.now();
    });

    const timer = setInterval(() => {
      const socket = net.connect({ host: "127.0.0.1", port: localPort });
      socket.on("connect", () => {
        socket.destroy();
        done();
      });
      socket.on("error", () => {
        socket.destroy();
        // ssh est parti sans laisser de port : là c'est un vrai échec.
        if (exitedAt !== null && Date.now() - exitedAt > EXIT_GRACE_MS) {
          done(mapSystemSshStderr(getStderr() || "ssh s’est arrêté sans ouvrir le tunnel", ""));
        }
      });
    }, 200);

    const deadline = setTimeout(
      () => done(mapSystemSshStderr(getStderr() || "délai dépassé", "")),
      READY_TIMEOUT_MS,
    );
  });
}

/** Un forward local est paresseux : le refus côté serveur (`AllowTcpForwarding no`) ou l'absence
 *  de service distant n'apparaissent qu'à la première connexion réelle. On la provoque ici pour
 *  diagnostiquer maintenant plutôt qu'au milieu d'un run. */
function probeForward(
  localPort: number,
  getStderr: () => string,
  remote: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port: localPort });
    const finish = (error?: Error) => {
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };

    socket.on("close", () => {
      const stderr = getStderr();
      if (/administratively prohibited|open failed/i.test(stderr)) {
        finish(mapSystemSshStderr(stderr, remote));
        return;
      }
      finish();
    });
    socket.on("error", () => finish());

    const timer = setTimeout(() => {
      const stderr = getStderr();
      if (/administratively prohibited|open failed/i.test(stderr)) {
        finish(mapSystemSshStderr(stderr, remote));
        return;
      }
      finish();
    }, PROBE_TIMEOUT_MS);
  });
}

/** Réserve un port éphémère libre puis le relâche. `ExitOnForwardFailure=yes` fait échouer
 *  vite si un autre process l'a pris entre-temps. */
function reserveLocalPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "string" || !address) {
        server.close();
        reject(new Error("port local indisponible"));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

function isListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const finish = (alive: boolean) => {
      socket.destroy();
      resolve(alive);
    };
    socket.setTimeout(500, () => finish(false));
    socket.on("connect", () => finish(true));
    socket.on("error", () => finish(false));
  });
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
