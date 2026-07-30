import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assertWithinDir,
  getSharedWorkdirRoot,
  sanitizeFilename,
} from "./paths";

describe("artifact paths", () => {
  test("defaults shared workdir", () => {
    expect(getSharedWorkdirRoot({})).toBe(path.resolve("/tmp/hermes-console-work"));
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
      expect(assertWithinDir(path.join(dir, "ok.txt"), dir)).toContain("ok.txt");
      expect(() => assertWithinDir(path.join(dir, "..", "escape.txt"), dir)).toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
