import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { resolveHermesRuntimeConfig } from "./config";
import { HermesRuntimeError } from "./hermes-adapter";

const CONSOLE_CREDENTIAL_PREFIX = "console-web-";

type CommandResult = {
  stdout: string;
  stderr: string;
};

export async function assertLocalHermesRuntime(action: string) {
  const config = await resolveHermesRuntimeConfig();
  const hostname = new URL(config.baseUrl).hostname;
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

async function runHermesCommand(
  args: string[],
  options: {
    stdin?: string;
    pseudoTerminal?: boolean;
    stdinPrompt?: string;
    timeoutMs: number;
  },
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    // Hermes utilise getpass pour les clés API et exige donc un terminal. `script`
    // fournit ce PTY tout en gardant le secret sur stdin, hors des arguments du process.
    const executable = options.pseudoTerminal ? "script" : "hermes";
    const commandArgs = options.pseudoTerminal
      ? ["-qefc", ["hermes", ...args].map(shellQuote).join(" "), "/dev/null"]
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
    let stdinSent = false;

    const sendStdinWhenReady = (output: string) => {
      if (
        stdinSent ||
        !options.stdin ||
        !options.stdinPrompt ||
        !output.includes(options.stdinPrompt)
      ) {
        return;
      }
      stdinSent = true;
      child.stdin.end(options.stdin);
    };

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(() =>
        reject(
          new HermesRuntimeError(
            "La commande Hermes a dépassé le délai autorisé.",
            504,
            "HERMES_CLI_TIMEOUT",
          ),
        ),
      );
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = `${stdout}${chunk.toString("utf8")}`.slice(-20_000);
      sendStdinWhenReady(stdout);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-20_000);
      sendStdinWhenReady(stderr);
    });
    child.on("error", () => {
      finish(() =>
        reject(
          new HermesRuntimeError(
            "Hermes CLI n’est pas disponible sur cette machine.",
            503,
            "HERMES_CLI_UNAVAILABLE",
          ),
        ),
      );
    });
    child.on("close", (code) => {
      finish(() => {
        if (code === 0) resolve({ stdout: stripAnsi(stdout), stderr: stripAnsi(stderr) });
        else {
          reject(
            new HermesRuntimeError(
              "La commande Hermes a échoué.",
              502,
              "HERMES_CLI_FAILED",
            ),
          );
        }
      });
    });

    if (!options.stdin) {
      child.stdin.end();
    } else if (!options.stdinPrompt) {
      stdinSent = true;
      child.stdin.end(options.stdin);
    }
  });
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
