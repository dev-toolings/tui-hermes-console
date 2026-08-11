import {
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { describe, expect, test } from "bun:test";
import {
  assertOutputArtifactQuota,
  copySafeFile,
  readDirectoryBounded,
  type CopySourceHandle,
} from "./repository";

const limits = { maxFile: 10, maxTotal: 20, maxCount: 2 };

describe("output artifact quota", () => {
  test("accepts a bounded regular output candidate", () => {
    expect(() =>
      assertOutputArtifactQuota("report.txt", 5, { count: 0, total: 0 }, limits),
    ).not.toThrow();
  });

  test("fails explicitly on per-file, aggregate, and count limits", () => {
    for (const fixture of [
      { size: 11, current: { count: 0, total: 0 } },
      { size: 6, current: { count: 1, total: 15 } },
      { size: 1, current: { count: 2, total: 2 } },
    ]) {
      expect(() =>
        assertOutputArtifactQuota(
          "blocked.bin",
          fixture.size,
          fixture.current,
          limits,
        ),
      ).toThrow("quotas");
    }
  });
});

describe("output artifact private copy", () => {
  test("materializes at most maxCount plus one local output names", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hermes-list-bounded-"));
    try {
      await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          writeFile(path.join(root, `${index}.txt`), "x"),
        ),
      );
      expect(await readDirectoryBounded(root, 2)).toHaveLength(3);
      expect(await readDirectoryBounded(root, 0)).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("copies a regular source through its verified file descriptor", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hermes-copy-safe-"));
    try {
      const source = path.join(root, "source.txt");
      const destination = path.join(root, "copy.txt");
      await writeFile(source, "trusted");
      await copySafeFile(source, destination, root);
      expect(await readFile(destination, "utf8")).toBe("trusted");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("never follows a symlink source", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hermes-copy-safe-"));
    try {
      const outside = path.join(root, "outside.txt");
      const source = path.join(root, "source.txt");
      await writeFile(outside, "secret");
      await symlink(outside, source);
      await expect(
        copySafeFile(source, path.join(root, "copy.txt"), root),
      ).rejects.toThrow("non régulier");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("aborts and cleans the private copy when the source grows during read", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hermes-copy-safe-"));
    try {
      const source = path.join(root, "growing.bin");
      const destination = path.join(root, "copy.bin");
      await writeFile(source, "initial");
      const realHandle = await open(source, "r");
      const info = await realHandle.stat();
      const controlledHandle: CopySourceHandle = {
        stat: async () => info,
        createReadStream: () =>
          Readable.from([
            Buffer.alloc(info.size, 1),
            Buffer.from("growth"),
          ]) as unknown as ReturnType<CopySourceHandle["createReadStream"]>,
        close: () => realHandle.close(),
      };

      await expect(
        copySafeFile(source, destination, root, {
          openSource: async () => controlledHandle,
        }),
      ).rejects.toThrow("agrandi");
      expect((await readdir(root)).sort()).toEqual(["growing.bin"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("does not publish the destination when closing the source FD fails", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hermes-copy-safe-"));
    const source = path.join(root, "source.txt");
    const destination = path.join(root, "copy.txt");
    await writeFile(source, "trusted");
    const realHandle = await open(source, "r");
    const info = await realHandle.stat();
    let closeCalls = 0;
    const controlledHandle: CopySourceHandle = {
      stat: async () => info,
      createReadStream: () =>
        Readable.from([Buffer.from("trusted")]) as unknown as ReturnType<
          CopySourceHandle["createReadStream"]
        >,
      close: async () => {
        closeCalls += 1;
        throw new Error("close FD failed");
      },
    };
    try {
      await expect(
        copySafeFile(source, destination, root, {
          openSource: async () => controlledHandle,
        }),
      ).rejects.toThrow("close FD failed");
      expect(closeCalls).toBe(1);
      expect((await readdir(root)).sort()).toEqual(["source.txt"]);
    } finally {
      await realHandle.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
