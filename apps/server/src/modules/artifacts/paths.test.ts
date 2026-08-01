import { describe, expect, test } from "bun:test";
import { link, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assertWithinDir,
  assertSafeRegularFile,
  getSharedWorkdirRoot,
  sanitizeFilename,
} from "./paths";

describe("artifact paths", () => {
  test("defaults shared workdir", () => {
    expect(getSharedWorkdirRoot({})).toBe(
      path.resolve("/tmp/hermes-console-work"),
    );
    expect(getSharedWorkdirRoot({ HERMES_SHARED_WORKDIR: "/work" })).toBe(
      path.resolve("/work"),
    );
  });

  test("sanitizeFilename rejects traversal", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(() => sanitizeFilename("..")).toThrow();
  });

  test("assertWithinDir blocks escape", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "hermes-art-"));
    try {
      await writeFile(path.join(dir, "ok.txt"), "x");
      expect(assertWithinDir(path.join(dir, "ok.txt"), dir)).toContain(
        "ok.txt",
      );
      expect(() =>
        assertWithinDir(path.join(dir, "..", "escape.txt"), dir),
      ).toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("refuses symlink and hardlink artifacts inside an allowed directory", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "hermes-art-"));
    try {
      const regular = path.join(dir, "regular.txt");
      await writeFile(regular, "x");
      await symlink(regular, path.join(dir, "linked.txt"));
      await link(regular, path.join(dir, "hardlinked.txt"));

      await expect(
        assertSafeRegularFile(path.join(dir, "linked.txt"), dir),
      ).rejects.toThrow();
      await expect(
        assertSafeRegularFile(path.join(dir, "hardlinked.txt"), dir),
      ).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
