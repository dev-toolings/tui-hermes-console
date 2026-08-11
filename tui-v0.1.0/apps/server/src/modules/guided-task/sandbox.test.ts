import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
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

  test("mounts one read-only directory per declared workspace with a node_modules, with no hardcoded exception", async () => {
    const repositoryRoot = path.resolve(import.meta.dir, "../../../../..");
    const mounts = await resolveGuidedDependencyMounts(repositoryRoot);

    // Property 1: exactly one mount per workspace directory declared in the root package.json
    // (plus the repository root itself) that actually has a node_modules directory. Derived
    // independently from resolveGuidedDependencyMounts so this does not just restate its logic.
    const rootPackageJson = JSON.parse(
      await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
    ) as { workspaces: string[] };
    const expectedWorkspaceDirectories = [repositoryRoot];
    for (const pattern of rootPackageJson.workspaces) {
      const parent = path.join(repositoryRoot, pattern.replace(/\/\*$/, ""));
      const entries = await readdir(parent, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (entry.isDirectory()) expectedWorkspaceDirectories.push(path.join(parent, entry.name));
      }
    }
    const expectedTargets = new Set<string>();
    for (const directory of expectedWorkspaceDirectories) {
      const candidate = path.join(directory, "node_modules");
      const isDirectory = await stat(candidate)
        .then((info) => info.isDirectory())
        .catch(() => false);
      if (isDirectory) {
        expectedTargets.add(path.posix.join("/workspace", path.relative(repositoryRoot, candidate)));
      }
    }
    expect(new Set(mounts.map((mount) => mount.target))).toEqual(expectedTargets);
    expect(mounts.length).toBeGreaterThan(0);

    // Property 2: every mount is read-only, targets /workspace/<repo-relative path>, and the
    // resulting bubblewrap args bind it read-only (never read-write).
    const args = buildBubblewrapArgs({
      workspace: "/sandbox",
      sandboxHome: "/sandbox-home",
      hermesInstall: "/opt/hermes-agent",
      bunInstall: "/opt/bun",
      dependencyMounts: mounts,
      networkPolicy: "none",
      command: ["/bin/true"],
    });
    const joinedArgs = args.join(" ");
    for (const mount of mounts) {
      expect(mount.target.startsWith("/workspace/")).toBe(true);
      expect(path.isAbsolute(mount.source)).toBe(true);
      expect(joinedArgs).toContain(`--ro-bind ${mount.source} ${mount.target}`);
    }

    // Property 3: no mount source escapes the repository root.
    for (const mount of mounts) {
      const resolvedSource = await realpath(mount.source);
      expect(
        resolvedSource === repositoryRoot || resolvedSource.startsWith(`${repositoryRoot}${path.sep}`),
      ).toBe(true);
    }

    // Property 4: known cache directories are neutralized as tmpfs, and only when present.
    for (const mount of mounts) {
      for (const cacheDirectory of [".vite-temp", ".cache"]) {
        const cacheTarget = path.posix.join(mount.target, cacheDirectory);
        const cacheExists = await stat(path.join(mount.source, cacheDirectory))
          .then(() => true)
          .catch(() => false);
        if (cacheExists) {
          expect(mount.ephemeralCacheTargets).toContain(cacheTarget);
          expect(joinedArgs).toContain(`--tmpfs ${cacheTarget}`);
        } else {
          expect(mount.ephemeralCacheTargets).not.toContain(cacheTarget);
        }
      }
    }
  });

  test("derives a mount for a workspace added after the fact, without repository changes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "guided-workspace-fixture-"));
    try {
      await writeFile(
        path.join(root, "package.json"),
        JSON.stringify({ name: "fixture", workspaces: ["apps/*"] }),
      );
      await mkdir(path.join(root, "apps", "freshly-added", "node_modules"), { recursive: true });
      await writeFile(path.join(root, "apps", "freshly-added", "node_modules", ".keep"), "");
      await mkdir(path.join(root, "apps", "without-deps"), { recursive: true });

      const mounts = await resolveGuidedDependencyMounts(root);
      const realRoot = await realpath(root);
      const targets = mounts.map((mount) => mount.target);

      expect(targets).toContain("/workspace/apps/freshly-added/node_modules");
      expect(targets).not.toContain("/workspace/apps/without-deps/node_modules");
      expect(mounts.find((mount) => mount.target === "/workspace/apps/freshly-added/node_modules")?.source).toBe(
        path.join(realRoot, "apps", "freshly-added", "node_modules"),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("ignores a node_modules symlinked outside the repository root", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "guided-escape-fixture-"));
    const outside = await mkdtemp(path.join(os.tmpdir(), "guided-escape-outside-"));
    try {
      await writeFile(
        path.join(root, "package.json"),
        JSON.stringify({ name: "fixture", workspaces: [] }),
      );
      await writeFile(path.join(outside, "marker.txt"), "outside the repository root");
      await symlink(outside, path.join(root, "node_modules"));

      const mounts = await resolveGuidedDependencyMounts(root);

      expect(mounts).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
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
