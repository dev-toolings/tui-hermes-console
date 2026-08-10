import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  getStoredSshRuntime,
  resolveHermesRuntimeConfig,
} from "./config";
import { HermesRuntimeError } from "./hermes-adapter";
import { getChannel, type SshTarget } from "./ssh";
import { REMOTE_UPDATE_MANAGER_PATH } from "./ssh/remote-update-manager";

const CONSOLE_CREDENTIAL_PREFIX = "console-web-";
const REMOTE_CLI_UNAVAILABLE_MESSAGE = "Hermes CLI introuvable sur l’hôte SSH.";

export function hermesCliExecutable(
  env: Record<string, string | undefined> = process.env,
) {
  return env.HERMES_CLI_PATH?.trim() || "hermes";
}

type CommandResult = {
  stdout: string;
  stderr: string;
};

export type HermesCommandOutput = {
  stream: "stdout" | "stderr";
  chunk: string;
};

export type HermesCommandSession = {
  onOutput(listener: (output: HermesCommandOutput) => void): () => void;
  write(input: string): void;
  endInput(): void;
  kill(): void;
  result: Promise<CommandResult & { code: number }>;
};

type HermesCommandOptions = {
  stdin?: string;
  pseudoTerminal?: boolean;
  stdinPrompt?: string;
  timeoutMs: number;
};

export async function assertLocalHermesRuntime(action: string) {
  const config = await resolveHermesRuntimeConfig();
  // En mode tunnel, baseUrl pointe sur 127.0.0.1 alors qu'Hermes tourne ailleurs :
  // lancer la CLI ici piloterait la mauvaise machine.
  const hostname =
    config.transport === "ssh" ? "remote" : new URL(config.baseUrl).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    throw new HermesRuntimeError(
      `${action} n’est disponible que pour un runtime Hermes local. Le runtime distant doit exposer une API d’administration dédiée.`,
      501,
      "HERMES_REMOTE_ADMIN_UNAVAILABLE",
    );
  }
  return config;
}

export async function replaceConsoleManagedApiKey(input: {
  provider: string;
  apiKey: string;
}) {
  const provider = input.provider.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(provider)) {
    throw new HermesRuntimeError(
      "Identifiant de provider invalide.",
      400,
      "HERMES_PROVIDER_INVALID",
    );
  }

  const before = await runHermesCommand(["auth", "list", provider], {
    timeoutMs: 10_000,
  });
  const previousIndexes = consoleManagedCredentialIndexes(before.stdout);
  const label = `${CONSOLE_CREDENTIAL_PREFIX}${randomUUID().replaceAll("-", "").slice(0, 12)}`;

  try {
    await runHermesCommand(
      ["auth", "add", provider, "--type", "api-key", "--label", label],
      {
        stdin: `${input.apiKey}\n`,
        pseudoTerminal: true,
        stdinPrompt: "Paste your API key:",
        timeoutMs: 20_000,
      },
    );
  } catch {
    throw new HermesRuntimeError(
      "Hermes n’a pas pu enregistrer cette clé API.",
      502,
      "HERMES_API_KEY_ADD_FAILED",
    );
  }

  const after = await runHermesCommand(["auth", "list", provider], {
    timeoutMs: 10_000,
  });
  if (!after.stdout.includes(label)) {
    throw new HermesRuntimeError(
      "Hermes n’a pas confirmé l’enregistrement de la clé.",
      502,
      "HERMES_API_KEY_NOT_CONFIRMED",
    );
  }

  let removedPrevious = 0;
  for (const index of previousIndexes.sort((left, right) => right - left)) {
    try {
      await runHermesCommand(["auth", "remove", provider, String(index)], {
        timeoutMs: 10_000,
      });
      removedPrevious += 1;
    } catch {
      // La nouvelle clé est déjà sûre dans Hermes. Une ancienne clé Console
      // restante peut continuer à participer à la rotation sans perte d’accès.
    }
  }

  return {
    provider,
    replacedConsoleCredentials: removedPrevious,
  };
}

export async function restartLocalHermesGateway() {
  await runHermesCommand(["gateway", "restart"], { timeoutMs: 45_000 });
}

export async function startHermesCommand(
  args: string[],
  options: Pick<HermesCommandOptions, "pseudoTerminal"> = {},
): Promise<HermesCommandSession> {
  const config = await resolveHermesRuntimeConfig();
  if (config.transport === "ssh") {
    const stored = await getStoredSshRuntime();
    return startRemoteHermesCommand(stored.target, args, options);
  }
  return startLocalHermesCommand(args, options);
}

export async function runHermesCommand(
  args: string[],
  options: HermesCommandOptions,
): Promise<CommandResult> {
  const session = await startHermesCommand(args, options);
  let observedOutput = "";
  let stdinSent = false;
  const unsubscribe = session.onOutput(({ chunk }) => {
    observedOutput = stripAnsi(`${observedOutput}${chunk}`).slice(-20_000);
    if (
      !stdinSent &&
      options.stdin &&
      (!options.stdinPrompt || observedOutput.includes(options.stdinPrompt))
    ) {
      stdinSent = true;
      session.write(options.stdin);
      session.endInput();
    }
  });
  if (!options.stdin) session.endInput();
  else if (!options.stdinPrompt) {
    stdinSent = true;
    session.write(options.stdin);
    session.endInput();
  }

  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const result = await Promise.race([
      session.result,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          session.kill();
          reject(
            new HermesRuntimeError(
              "La commande Hermes a dépassé le délai autorisé.",
              504,
              "HERMES_CLI_TIMEOUT",
            ),
          );
        }, options.timeoutMs);
      }),
    ]);
    if (result.code !== 0) {
      throw hermesCommandFailure(result);
    }
    return { stdout: stripAnsi(result.stdout), stderr: stripAnsi(result.stderr) };
  } finally {
    if (timeout) clearTimeout(timeout);
    unsubscribe();
  }
}

function startLocalHermesCommand(
  args: string[],
  options: Pick<HermesCommandOptions, "pseudoTerminal">,
): HermesCommandSession {
  // Hermes utilise getpass pour les clés API et exige donc un terminal. `script`
  // fournit ce PTY tout en gardant le secret sur stdin, hors des arguments du process.
  const executable = options.pseudoTerminal ? "script" : hermesCliExecutable();
  const commandArgs = options.pseudoTerminal
    ? [
        "-qefc",
        [hermesCliExecutable(), ...args].map(shellQuote).join(" "),
        "/dev/null",
      ]
    : args;
  const child = spawn(executable, commandArgs, {
    env: {
      ...process.env,
      NO_COLOR: "1",
      PYTHONUNBUFFERED: "1",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let settled = false;
  const listeners = new Set<(output: HermesCommandOutput) => void>();
  let resolveResult!: (result: CommandResult & { code: number }) => void;
  let rejectResult!: (error: unknown) => void;
  const result = new Promise<CommandResult & { code: number }>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  const emit = (stream: "stdout" | "stderr", chunk: Buffer) => {
    const text = chunk.toString("utf8");
    for (const listener of listeners) listener({ stream, chunk: text });
    if (stream === "stdout") stdout = `${stdout}${text}`.slice(-20_000);
    else stderr = `${stderr}${text}`.slice(-20_000);
  };
  child.stdout.on("data", (chunk: Buffer) => emit("stdout", chunk));
  child.stderr.on("data", (chunk: Buffer) => emit("stderr", chunk));
  child.on("error", () => {
    if (settled) return;
    settled = true;
    rejectResult(
      new HermesRuntimeError(
        "Hermes CLI n’est pas disponible sur cette machine.",
        503,
        "HERMES_CLI_UNAVAILABLE",
      ),
    );
  });
  child.on("close", (code) => {
    if (settled) return;
    settled = true;
    resolveResult({ stdout, stderr, code: typeof code === "number" ? code : 1 });
  });

  return {
    onOutput(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    write(input) {
      child.stdin.write(input);
    },
    endInput() {
      child.stdin.end();
    },
    kill() {
      child.kill("SIGTERM");
    },
    result,
  };
}

async function startRemoteHermesCommand(
  target: SshTarget,
  args: string[],
  options: Pick<HermesCommandOptions, "pseudoTerminal">,
): Promise<HermesCommandSession> {
  const remote = await getChannel(target).start(
    remoteHermesCommand(args, options),
    options,
  );
  return {
    onOutput(listener) {
      return remote.onOutput(listener);
    },
    write(input) {
      remote.write(input);
    },
    endInput() {
      remote.endInput();
    },
    kill() {
      remote.kill();
    },
    result: remote.result.then((result) => ({
      stdout: stripAnsi(result.stdout),
      stderr: stripAnsi(result.stderr),
      code: result.code,
    })),
  };
}

export function remoteHermesCommand(
  args: string[],
  options: Pick<HermesCommandOptions, "pseudoTerminal">,
) {
  const dockerExec = [
    "docker",
    "exec",
    options.pseudoTerminal ? "-it" : "-i",
    "-u",
    "hermes",
    "-e",
    "HOME=/opt/data",
    "-e",
    "PATH=/opt/hermes/.venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "-w",
    "/opt/hermes",
    "hermes-console-runtime",
    "/opt/hermes/.venv/bin/hermes",
    ...args,
  ]
    .map(shellQuote)
    .join(" ");
  const managerExec = [
    "sudo",
    "-n",
    REMOTE_UPDATE_MANAGER_PATH,
    options.pseudoTerminal ? "cli-pty" : "cli",
    ...args,
  ]
    .map(shellQuote)
    .join(" ");
  // Un canal SSH non interactif ne charge ni .profile ni les shims utilisateur.
  // Résoudre explicitement le launcher distant évite aussi de réutiliser par
  // erreur HERMES_CLI_PATH, qui décrit uniquement la machine de la Console.
  const hostCommand = [
    'export PATH="$HOME/.local/bin:$HOME/.bun/bin:/opt/hermes-console/current/venv/bin:/opt/hermes/.venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"',
    "hermes_bin=",
    'for candidate in "$(command -v hermes 2>/dev/null || true)" "$HOME/.local/bin/hermes" /opt/hermes-console/current/venv/bin/hermes /opt/hermes/.venv/bin/hermes /usr/local/bin/hermes /usr/bin/hermes; do',
    '  if [ -n "$candidate" ] && [ -x "$candidate" ]; then hermes_bin="$candidate"; break; fi',
    "done",
    'if [ -z "$hermes_bin" ]; then',
    `  printf '%s\\n' ${shellQuote(REMOTE_CLI_UNAVAILABLE_MESSAGE)} >&2`,
    "  exit 127",
    "fi",
    ['exec "$hermes_bin"', ...args.map(shellQuote)].join(" "),
  ].join("\n");
  return [
    `if [ -x ${shellQuote(REMOTE_UPDATE_MANAGER_PATH)} ]; then`,
    `  exec ${managerExec}`,
    "elif docker inspect hermes-console-runtime >/dev/null 2>&1; then",
    `  exec ${dockerExec}`,
    "else",
    `  ${hostCommand}`,
    "fi",
  ].join("\n");
}

export function hermesCommandFailure(result: CommandResult & { code: number }) {
  if (
    result.code === 127 &&
    stripAnsi(`${result.stdout}\n${result.stderr}`).includes(
      REMOTE_CLI_UNAVAILABLE_MESSAGE,
    )
  ) {
    return new HermesRuntimeError(
      REMOTE_CLI_UNAVAILABLE_MESSAGE,
      503,
      "HERMES_REMOTE_CLI_UNAVAILABLE",
    );
  }
  return new HermesRuntimeError(
    "La commande Hermes a échoué.",
    502,
    "HERMES_CLI_FAILED",
  );
}

function consoleManagedCredentialIndexes(output: string) {
  const indexes: number[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(
      /^\s*#(\d+)\s+console-web-[a-f0-9]+\s+api_key\s+manual(?:\s|$)/i,
    );
    if (match) indexes.push(Number(match[1]));
  }
  return indexes;
}

function stripAnsi(value: string) {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}
