import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildBubblewrapArgs,
  cleanupGuidedWorktree,
  createGuidedWorktree,
  inspectGuidedRepository,
  prepareGuidedSandboxHome,
  resolveGuidedDependencyMounts,
  runCommand,
  runInGuidedSandbox,
  validateGuidedTestCommands,
} from "./sandbox";

describe("guided delivery sandbox policy", () => {
  test("mounts only the sandbox and ephemeral home read-write with network disabled", () => {
    const args = buildBubblewrapArgs({
      workspace: "/var/lib/hermes-console/sandboxes/attempt_1",
      sandboxHome: "/var/lib/hermes-console/homes/attempt_1",
      hermesInstall: "/opt/hermes-agent",
      bunInstall: "/opt/bun",
      networkPolicy: "none",
      command: ["/opt/hermes-agent/venv/bin/python", "/opt/hermes-agent/hermes", "-z", "Do it"],
    });

    expect(args).toContain("--unshare-net");
    expect(args).toContain("--cap-drop");
    expect(args).toContain("ALL");
    expect(args).toContain("--chdir");
    expect(args).toContain("/workspace");
    expect(args.join(" ")).toContain("--bind /var/lib/hermes-console/sandboxes/attempt_1 /workspace");
    expect(args.join(" ")).toContain("--bind /var/lib/hermes-console/homes/attempt_1 /sandbox-home");
    expect(args.join(" ")).not.toContain("--bind / /");
  });

  test("shares network only when the connected project policy says host", () => {
    const args = buildBubblewrapArgs({
      workspace: "/sandbox",
      sandboxHome: "/sandbox-home",
      hermesInstall: "/opt/hermes-agent",
      bunInstall: "/opt/bun",
      networkPolicy: "host",
      command: ["/bin/true"],
    });
    expect(args).not.toContain("--unshare-net");
  });

  test("accepts only explicit bun or bunx argv without shell metacharacters", () => {
    expect(validateGuidedTestCommands([["bun", "test"], ["bun", "run", "typecheck"]])).toEqual([
      ["bun", "test"],
      ["bun", "run", "typecheck"],
    ]);
    expect(() => validateGuidedTestCommands([["npm", "test"]])).toThrow("GUIDED_COMMAND_NOT_ALLOWED");
    expect(() => validateGuidedTestCommands([["bun", "test;", "rm", "-rf", "/"]])).toThrow(
      "GUIDED_COMMAND_NOT_ALLOWED",
    );
    expect(() => validateGuidedTestCommands([])).toThrow("GUIDED_TEST_COMMANDS_REQUIRED");
  });

  test("mounts only verified repository dependency directories read-only", async () => {
    const repositoryRoot = path.resolve(import.meta.dir, "../../../../..");
    const mounts = await resolveGuidedDependencyMounts(repositoryRoot);
    expect(mounts.map((mount) => mount.target)).toEqual([
      "/workspace/node_modules",
      "/workspace/apps/server/node_modules",
      "/workspace/apps/web/node_modules",
      "/workspace/packages/console-core/node_modules",
      "/workspace/packages/ui/node_modules",
    ]);
    const args = buildBubblewrapArgs({
      workspace: "/sandbox",
      sandboxHome: "/sandbox-home",
      hermesInstall: "/opt/hermes-agent",
      bunInstall: "/opt/bun",
      dependencyMounts: mounts,
      networkPolicy: "none",
      command: ["/bin/true"],
    });
    expect(args.join(" ")).toContain(`--ro-bind ${mounts[0]!.source} /workspace/node_modules`);
    expect(args.join(" ")).toContain("--tmpfs /workspace/apps/web/node_modules/.vite-temp");
  });

  test("creates a detached worktree and proves the host root is not writable", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "guided-sandbox-test-"));
    const repository = path.join(root, "repository");
    const workspace = path.join(root, "worktrees", "attempt_1");
    const sandboxHome = path.join(root, "homes", "attempt_1");
    await mkdir(repository);
    await mkdir(sandboxHome, { recursive: true });
    await runCommand(["git", "init", "-b", "main", repository]);
    await writeFile(path.join(repository, "README.md"), "before\n");
    await runCommand(["git", "-C", repository, "add", "README.md"]);
    await runCommand([
      "git",
      "-C",
      repository,
      "-c",
      "user.name=Hermes Console Test",
      "-c",
      "user.email=test@console.invalid",
      "commit",
      "-m",
      "fixture",
    ]);
    const inspected = await inspectGuidedRepository(repository, "HEAD");
    await createGuidedWorktree({
      repositoryPath: inspected.rootPath,
      baseCommit: inspected.baseCommit,
      branchName: "hermes/test/attempt-1",
      sandboxPath: workspace,
    });
    const result = await runInGuidedSandbox({
      workspace,
      sandboxHome,
      hermesInstall: "/home/kev/.hermes/hermes-agent",
      bunInstall: "/home/kev/.bun",
      networkPolicy: "none",
      command: ["/usr/bin/touch", "/workspace/proof.txt"],
      timeoutMs: 5_000,
    });
    expect(result.exitCode).toBe(0);
    expect(await readFile(path.join(workspace, "proof.txt"), "utf8")).toBe("");
    const escape = await runInGuidedSandbox({
      workspace,
      sandboxHome,
      hermesInstall: "/home/kev/.hermes/hermes-agent",
      bunInstall: "/home/kev/.bun",
      networkPolicy: "none",
      command: ["/usr/bin/touch", "/host-escape"],
      timeoutMs: 5_000,
    });
    expect(escape.exitCode).toBe(0);
    expect(await stat("/host-escape").then(() => true).catch(() => false)).toBe(false);
    const cleanup = await cleanupGuidedWorktree({
      repositoryPath: repository,
      sandboxPath: workspace,
      sandboxHome,
      branchName: "hermes/test/attempt-1",
    });
    expect(cleanup.exitCode).toBe(0);
    const branch = await runCommand([
      "git",
      "-C",
      repository,
      "branch",
      "--list",
      "hermes/test/attempt-1",
    ]);
    expect(branch.stdout.trim()).toBe("");
    await rm(root, { recursive: true, force: true });
  });

  test("starts the installed Hermes CLI inside the filesystem sandbox", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "guided-hermes-start-"));
    const workspace = path.join(root, "workspace");
    const sandboxHome = path.join(root, "home");
    await mkdir(workspace);
    const installs = await prepareGuidedSandboxHome(sandboxHome);
    const result = await runInGuidedSandbox({
      workspace,
      sandboxHome,
      hermesInstall: installs.hermesInstall,
      bunInstall: installs.bunInstall,
      pythonRuntime: installs.pythonRuntime,
      resolverPath: installs.resolverPath,
      networkPolicy: "none",
      command: ["/opt/hermes-agent/venv/bin/python", "/opt/hermes-agent/hermes", "--version"],
      timeoutMs: 10_000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Hermes Agent v0.20.0");
    await rm(root, { recursive: true, force: true });
  });

  test("resolves public hosts when the repository explicitly permits host networking", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "guided-hermes-dns-"));
    const workspace = path.join(root, "workspace");
    const sandboxHome = path.join(root, "home");
    await mkdir(workspace);
    const installs = await prepareGuidedSandboxHome(sandboxHome);
    const result = await runInGuidedSandbox({
      workspace,
      sandboxHome,
      hermesInstall: installs.hermesInstall,
      bunInstall: installs.bunInstall,
      pythonRuntime: installs.pythonRuntime,
      resolverPath: installs.resolverPath,
      networkPolicy: "host",
      command: ["/usr/bin/getent", "hosts", "api.openai.com"],
      timeoutMs: 10_000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("api.openai.com");
    await rm(root, { recursive: true, force: true });
  });
});
