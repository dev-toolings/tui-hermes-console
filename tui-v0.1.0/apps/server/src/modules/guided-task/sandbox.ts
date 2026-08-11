import { copyFile, mkdir, readFile, readdir, realpath, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { GuidedRepositoryNetworkPolicy } from "@/db/schema";

const FORBIDDEN_ARG = /[;&|`$<>\n\r\0]/;
const MAX_COMMANDS = 8;
const MAX_ARGS = 24;
const MAX_ARG_LENGTH = 1_000;

export class GuidedSandboxError extends Error {
  constructor(
    readonly code:
      | "GUIDED_COMMAND_NOT_ALLOWED"
      | "GUIDED_TEST_COMMANDS_REQUIRED"
      | "GUIDED_REPOSITORY_INVALID"
      | "GUIDED_SANDBOX_UNAVAILABLE"
      | "GUIDED_COMMAND_FAILED"
      | "GUIDED_COMMAND_TIMEOUT",
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "GuidedSandboxError";
  }
}

export type GuidedCommandResult = {
  command: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export type GuidedDependencyMount = {
  source: string;
  target: string;
  ephemeralCacheTargets: string[];
};

export function validateGuidedTestCommands(input: unknown): string[][] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new GuidedSandboxError(
      "GUIDED_TEST_COMMANDS_REQUIRED",
      "Au moins une commande Bun vérifiable est requise.",
    );
  }
  if (input.length > MAX_COMMANDS) {
    throw new GuidedSandboxError(
      "GUIDED_COMMAND_NOT_ALLOWED",
      `La policy accepte au plus ${MAX_COMMANDS} commandes de preuve.`,
    );
  }
  return input.map((rawCommand) => {
    if (!Array.isArray(rawCommand) || rawCommand.length === 0 || rawCommand.length > MAX_ARGS) {
      throw commandNotAllowed();
    }
    const command = rawCommand.map((rawArg) => {
      if (
        typeof rawArg !== "string" ||
        rawArg.length === 0 ||
        rawArg.length > MAX_ARG_LENGTH ||
        FORBIDDEN_ARG.test(rawArg)
      ) {
        throw commandNotAllowed();
      }
      return rawArg;
    });
    if (command[0] !== "bun" && command[0] !== "bunx") throw commandNotAllowed();
    return command;
  });
}

function commandNotAllowed() {
  return new GuidedSandboxError(
    "GUIDED_COMMAND_NOT_ALLOWED",
    "Seules les commandes argv bun/bunx explicitement configurées, sans shell, sont autorisées.",
  );
}

export function buildBubblewrapArgs(input: {
  workspace: string;
  sandboxHome: string;
  hermesInstall: string;
  bunInstall: string;
  pythonRuntime?: string;
  resolverPath?: string;
  dependencyMounts?: GuidedDependencyMount[];
  networkPolicy: GuidedRepositoryNetworkPolicy;
  command: string[];
}) {
  const args = [
    "--die-with-parent",
    "--new-session",
    "--unshare-pid",
    "--unshare-ipc",
    "--unshare-uts",
    "--cap-drop",
    "ALL",
    "--ro-bind",
    "/usr",
    "/usr",
    "--ro-bind",
    "/bin",
    "/bin",
    "--ro-bind",
    "/lib",
    "/lib",
    "--ro-bind",
    "/lib64",
    "/lib64",
    "--ro-bind",
    "/etc",
    "/etc",
    "--dev",
    "/dev",
    "--proc",
    "/proc",
    "--tmpfs",
    "/tmp",
    "--dir",
    "/opt",
    "--ro-bind",
    input.hermesInstall,
    "/opt/hermes-agent",
    "--ro-bind",
    input.bunInstall,
    "/opt/bun",
    "--bind",
    input.workspace,
    "/workspace",
    "--bind",
    input.sandboxHome,
    "/sandbox-home",
    "--setenv",
    "HOME",
    "/sandbox-home",
    "--setenv",
    "PATH",
    "/opt/hermes-agent/venv/bin:/opt/bun/bin:/usr/local/bin:/usr/bin:/bin",
    "--setenv",
    "HERMES_HOME",
    "/sandbox-home/.hermes",
    "--setenv",
    "NO_COLOR",
    "1",
    "--chdir",
    "/workspace",
  ];
  if (input.pythonRuntime) {
    const expected = path.join(os.homedir(), ".local", "share", "uv", "python");
    if (input.pythonRuntime !== expected) {
      throw new GuidedSandboxError(
        "GUIDED_SANDBOX_UNAVAILABLE",
        "Le runtime Python Hermes sort du répertoire UV autorisé.",
      );
    }
    const mount = directoryPrefixes(path.dirname(input.pythonRuntime))
      .flatMap((directory) => ["--dir", directory]);
    mount.push("--ro-bind", input.pythonRuntime, input.pythonRuntime);
    args.splice(args.indexOf("--bind"), 0, ...mount);
  }
  if (input.resolverPath && !input.resolverPath.startsWith("/etc/")) {
    const mount = directoryPrefixes(path.dirname(input.resolverPath))
      .flatMap((directory) => ["--dir", directory]);
    mount.push("--ro-bind", input.resolverPath, input.resolverPath);
    args.splice(args.indexOf("--bind"), 0, ...mount);
  }
  if (input.dependencyMounts?.length) {
    const mountArgs = input.dependencyMounts.flatMap(
      ({ source, target, ephemeralCacheTargets }) => [
        "--ro-bind",
        source,
        target,
        ...ephemeralCacheTargets.flatMap((cacheTarget) => ["--tmpfs", cacheTarget]),
      ],
    );
    args.splice(args.indexOf("--setenv"), 0, ...mountArgs);
  }
  if (input.networkPolicy === "none") args.push("--unshare-net");
  args.push("--", ...input.command);
  return args;
}

export async function inspectGuidedRepository(rootPath: string, baseRef: string) {
  if (!path.isAbsolute(rootPath) || rootPath.includes("\0")) throw repositoryInvalid();
  const root = await realpath(rootPath).catch(() => null);
  if (!root) throw repositoryInvalid();
  const topLevel = await runCommand(["git", "-C", root, "rev-parse", "--show-toplevel"]);
  if (topLevel.exitCode !== 0) throw repositoryInvalid();
  const gitRoot = await realpath(topLevel.stdout.trim()).catch(() => null);
  if (!gitRoot || gitRoot !== root) throw repositoryInvalid();
  const commit = await runCommand([
    "git",
    "-C",
    root,
    "rev-parse",
    "--verify",
    `${baseRef}^{commit}`,
  ]);
  if (commit.exitCode !== 0 || !/^[0-9a-f]{40,64}$/.test(commit.stdout.trim())) {
    throw repositoryInvalid();
  }
  return { rootPath: root, baseCommit: commit.stdout.trim() };
}

function repositoryInvalid() {
  return new GuidedSandboxError(
    "GUIDED_REPOSITORY_INVALID",
    "Le dépôt ou la référence de base ne peut pas être vérifié.",
  );
}

export async function createGuidedWorktree(input: {
  repositoryPath: string;
  baseCommit: string;
  branchName: string;
  sandboxPath: string;
}) {
  await mkdir(path.dirname(input.sandboxPath), { recursive: true, mode: 0o700 });
  const result = await runCommand([
    "git",
    "-C",
    input.repositoryPath,
    "worktree",
    "add",
    "-b",
    input.branchName,
    input.sandboxPath,
    input.baseCommit,
  ]);
  if (result.exitCode !== 0) {
    throw new GuidedSandboxError(
      "GUIDED_SANDBOX_UNAVAILABLE",
      `La création du worktree a échoué : ${result.stderr.trim() || "erreur Git"}`,
    );
  }
  return result;
}

export async function cleanupGuidedWorktree(input: {
  repositoryPath: string;
  sandboxPath: string;
  sandboxHome: string;
  branchName: string;
}) {
  const worktree = await runCommand([
    "git",
    "-C",
    input.repositoryPath,
    "worktree",
    "remove",
    "--force",
    input.sandboxPath,
  ]);
  await rm(input.sandboxHome, { recursive: true, force: true });
  if (worktree.exitCode !== 0) return worktree;
  return runCommand([
    "git",
    "-C",
    input.repositoryPath,
    "branch",
    "--delete",
    "--force",
    input.branchName,
  ]);
}

export async function prepareGuidedSandboxHome(sandboxHome: string) {
  const hermesHome = process.env.HERMES_HOME?.trim() || path.join(os.homedir(), ".hermes");
  const target = path.join(sandboxHome, ".hermes");
  await mkdir(target, { recursive: true, mode: 0o700 });
  for (const filename of ["config.yaml", ".env", "auth.json"] as const) {
    const source = path.join(hermesHome, filename);
    if (await exists(source)) await copyFile(source, path.join(target, filename));
  }
  await mkdir(path.join(target, "sessions"), { recursive: true, mode: 0o700 });
  await mkdir(path.join(target, "logs"), { recursive: true, mode: 0o700 });
  const hermesInstall =
    process.env.HERMES_AGENT_HOME?.trim() || path.join(hermesHome, "hermes-agent");
  const pythonExecutable = await realpath(path.join(hermesInstall, "venv", "bin", "python"));
  return {
    hermesInstall,
    pythonRuntime: path.dirname(path.dirname(path.dirname(pythonExecutable))),
    bunInstall: process.env.BUN_INSTALL?.trim() || path.join(os.homedir(), ".bun"),
    resolverPath: await realpath("/etc/resolv.conf"),
  };
}

export async function resolveGuidedDependencyMounts(
  repositoryPath: string,
): Promise<GuidedDependencyMount[]> {
  const repositoryRoot = await realpath(repositoryPath);
  const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8")) as {
    workspaces?: unknown;
  };
  const workspacePatterns = Array.isArray(packageJson.workspaces)
    ? packageJson.workspaces.filter((value): value is string => typeof value === "string")
    : [];
  const packageDirectories = new Set([repositoryRoot]);
  for (const pattern of workspacePatterns) {
    if (path.isAbsolute(pattern) || pattern.split("/").includes("..")) continue;
    if (pattern.endsWith("/*") && !pattern.slice(0, -2).includes("*")) {
      const parent = path.join(repositoryRoot, pattern.slice(0, -2));
      const entries = await readdir(parent, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (entry.isDirectory()) packageDirectories.add(path.join(parent, entry.name));
      }
    } else if (!pattern.includes("*")) {
      packageDirectories.add(path.join(repositoryRoot, pattern));
    }
  }
  const mounts: GuidedDependencyMount[] = [];
  for (const directory of packageDirectories) {
    const candidate = path.join(directory, "node_modules");
    const source = await realpath(candidate).catch(() => null);
    if (!source || (source !== repositoryRoot && !source.startsWith(`${repositoryRoot}${path.sep}`))) continue;
    const relative = path.relative(repositoryRoot, candidate);
    const target = path.posix.join("/workspace", relative);
    const ephemeralCacheTargets: string[] = [];
    for (const cacheDirectory of [".vite-temp", ".cache"]) {
      if (await exists(path.join(source, cacheDirectory))) {
        ephemeralCacheTargets.push(path.posix.join(target, cacheDirectory));
      }
    }
    mounts.push({ source, target, ephemeralCacheTargets });
  }
  return mounts;
}

function directoryPrefixes(directory: string) {
  const segments = path.resolve(directory).split(path.sep).filter(Boolean);
  const prefixes: string[] = [];
  let current: string = path.sep;
  for (const segment of segments) {
    current = path.join(current, segment);
    prefixes.push(current);
  }
  return prefixes;
}

async function exists(candidate: string) {
  return stat(candidate).then(() => true).catch(() => false);
}

export async function runInGuidedSandbox(input: {
  workspace: string;
  sandboxHome: string;
  hermesInstall: string;
  bunInstall: string;
  pythonRuntime?: string;
  resolverPath?: string;
  dependencyMounts?: GuidedDependencyMount[];
  networkPolicy: GuidedRepositoryNetworkPolicy;
  command: string[];
  timeoutMs: number;
}) {
  const args = buildBubblewrapArgs(input);
  return runCommand(["bwrap", ...args], undefined, input.timeoutMs);
}

export async function runCommand(
  command: string[],
  cwd?: string,
  timeoutMs = 30_000,
): Promise<GuidedCommandResult> {
  const startedAt = performance.now();
  const child = Bun.spawn(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: processEnv(),
  });
  const stdout = new Response(child.stdout).text();
  const stderr = new Response(child.stderr).text();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new GuidedSandboxError(
        "GUIDED_COMMAND_TIMEOUT",
        `La commande a dépassé ${timeoutMs} ms.`,
      ));
    }, timeoutMs);
  });
  try {
    const exitCode = await Promise.race([child.exited, timedOut]);
    return {
      command,
      exitCode,
      stdout: await stdout,
      stderr: await stderr,
      durationMs: Math.round(performance.now() - startedAt),
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function processEnv(): Record<string, string> {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    HOME: process.env.HOME ?? os.homedir(),
    LANG: process.env.LANG ?? "C.UTF-8",
    NO_COLOR: "1",
  };
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY"] as const) {
    if (process.env[key]) env[key] = process.env[key]!;
  }
  return env;
}
