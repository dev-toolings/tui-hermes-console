import {
  mkdir,
  mkdtemp,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import type { SftpOps } from "@/modules/runtime/ssh";
import {
  pullRunOutputsFromWorkspace,
  pushRunInputsToWorkspace,
  removeArtifactFromWorkspace,
} from "./remote-sync";
import { runInputDir, runOutputDir } from "./paths";

function workspace(sftp: Partial<SftpOps>, root = "/srv/hermes-console") {
  const defaults: SftpOps = {
    mkdirp: async () => undefined,
    list: async () => [],
    stat: async () => ({ size: 2, type: "file" }),
    upload: async () => undefined,
    download: async () => undefined,
    remove: async () => undefined,
    ...sftp,
  };
  return {
    root,
    channel: { sftp: async () => defaults },
  };
}

describe("remote artifact sync", () => {
  test("supprime la copie distante dans le dossier exact du run", async () => {
    const removed: string[] = [];
    await removeArtifactFromWorkspace(
      "run_delete",
      "input",
      "brief.pdf",
      workspace({ remove: async (remote) => void removed.push(remote) }),
    );
    expect(removed).toEqual([
      "/srv/hermes-console/runs/run_delete/in/brief.pdf",
    ]);
  });

  test("publishes remote inputs with a mode readable by the Hermes runtime", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hermes-remote-sync-"));
    const uploads: Array<{ remote: string; mode?: number }> = [];
    try {
      await mkdir(runInputDir("run_readable", root), { recursive: true });
      await writeFile(path.join(runInputDir("run_readable", root), "brief.txt"), "ok");

      await pushRunInputsToWorkspace(
        "run_readable",
        workspace({
          upload: async (_local, remote, mode) => {
            uploads.push({ remote, mode });
          },
        }),
        root,
      );

      expect(uploads).toEqual([
        {
          remote: "/srv/hermes-console/runs/run_readable/in/brief.txt",
          mode: 0o644,
        },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects an unsafe remote workspace before any SFTP operation", async () => {
    const calls: string[] = [];
    const root = await mkdtemp(path.join(tmpdir(), "hermes-remote-sync-"));
    try {
      await expect(
        pushRunInputsToWorkspace(
          "run_invalid_remote_root",
          workspace(
            {
              mkdirp: async () => {
                calls.push("mkdirp");
              },
            },
            "/",
          ),
          root,
        ),
      ).rejects.toMatchObject({
        runId: "run_invalid_remote_root",
        operation: "open_sftp",
      });
      expect(calls).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("propagates a correlated remote list failure", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hermes-remote-sync-"));
    try {
      await expect(
        pullRunOutputsFromWorkspace(
          "run_list_failure",
          workspace({ list: async () => Promise.reject(new Error("SFTP down")) }),
          root,
        ),
      ).rejects.toMatchObject({
        runId: "run_list_failure",
        operation: "list_remote_outputs",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("removes a partial download and propagates the transport failure", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hermes-remote-sync-"));
    try {
      await expect(
        pullRunOutputsFromWorkspace(
          "run_partial",
          workspace({
            list: async () => ["report.txt"],
            download: async (_remote, local) => {
              await writeFile(local, "partial");
              throw new Error("connection lost");
            },
          }),
          root,
        ),
      ).rejects.toMatchObject({
        runId: "run_partial",
        operation: "download_output",
      });
      expect(await readdir(runOutputDir("run_partial", root))).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects hostile remote names before any download", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hermes-remote-sync-"));
    const downloaded: string[] = [];
    try {
      await expect(
        pullRunOutputsFromWorkspace(
          "run_hostile",
          workspace({
            list: async () => ["../escape", "report.txt"],
            download: async (remote) => {
              downloaded.push(remote);
            },
          }),
          root,
        ),
      ).rejects.toMatchObject({
        runId: "run_hostile",
        operation: "validate_remote_output",
      });
      expect(downloaded).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects oversized remote output before filling the local volume", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hermes-remote-sync-"));
    let downloaded = false;
    try {
      await expect(
        pullRunOutputsFromWorkspace(
          "run_oversized",
          workspace({
            list: async () => ["huge.bin"],
            stat: async () => ({ size: 11, type: "file" }),
            download: async () => {
              downloaded = true;
            },
          }),
          root,
          { maxFile: 10, maxTotal: 20, maxCount: 2 },
        ),
      ).rejects.toMatchObject({
        runId: "run_oversized",
        operation: "output_quota",
      });
      expect(downloaded).toBe(false);
      await expect(readdir(runOutputDir("run_oversized", root))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("bounds enumeration and rejects excess count before any remote stat", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hermes-remote-sync-"));
    const limitsSeen: number[] = [];
    let statCount = 0;
    try {
      await expect(
        pullRunOutputsFromWorkspace(
          "run_too_many",
          workspace({
            list: async (_path, maxEntries) => {
              limitsSeen.push(maxEntries);
              return ["one.txt", "two.txt", "three.txt"];
            },
            stat: async () => {
              statCount += 1;
              return { size: 1, type: "file" };
            },
          }),
          root,
          { maxFile: 10, maxTotal: 20, maxCount: 2 },
        ),
      ).rejects.toMatchObject({ operation: "output_quota" });
      expect(limitsSeen).toEqual([2]);
      expect(statCount).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("stops stat preflight as soon as aggregate quota is exceeded", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hermes-remote-sync-"));
    let statCount = 0;
    try {
      await expect(
        pullRunOutputsFromWorkspace(
          "run_total_quota",
          workspace({
            list: async () => ["one.txt", "two.txt", "three.txt"],
            stat: async () => {
              statCount += 1;
              return { size: 6, type: "file" };
            },
          }),
          root,
          { maxFile: 10, maxTotal: 10, maxCount: 3 },
        ),
      ).rejects.toMatchObject({ operation: "output_quota" });
      expect(statCount).toBe(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects symlink output reported by remote lstat", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hermes-remote-sync-"));
    try {
      await expect(
        pullRunOutputsFromWorkspace(
          "run_remote_link",
          workspace({
            list: async () => ["linked.txt"],
            stat: async () => ({ size: 4, type: "symlink" }),
          }),
          root,
        ),
      ).rejects.toMatchObject({
        operation: "validate_remote_output",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects a remote file that changes size during transfer", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hermes-remote-sync-"));
    try {
      await expect(
        pullRunOutputsFromWorkspace(
          "run_size_race",
          workspace({
            list: async () => ["changing.txt"],
            stat: async () => ({ size: 4, type: "file" }),
            download: async (_remote, local) => {
              await writeFile(local, "x");
            },
          }),
          root,
        ),
      ).rejects.toMatchObject({
        operation: "validate_remote_output",
      });
      expect(await readdir(runOutputDir("run_size_race", root))).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("fails closed when a local input is a symlink", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hermes-remote-sync-"));
    try {
      const input = runInputDir("run_link", root);
      await mkdir(input, { recursive: true });
      const outside = path.join(root, "outside.txt");
      await writeFile(outside, "secret");
      await symlink(outside, path.join(input, "linked.txt"));

      await expect(
        pushRunInputsToWorkspace("run_link", workspace({}), root),
      ).rejects.toMatchObject({
        runId: "run_link",
        operation: "validate_local_input",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
