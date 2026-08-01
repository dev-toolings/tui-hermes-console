import { describe, expect, mock, test } from "bun:test";
import type { SFTPWrapper, Stats } from "ssh2";
import {
  ensureSftpDirectory,
  readSftpDirectoryBounded,
} from "./ssh2-password";

function stats(directory: boolean) {
  return {
    isDirectory: () => directory,
  } as Stats;
}

function handle(options: { mkdirError?: Error; directory?: boolean }) {
  const stat = mock(
    (_path: string, callback: (error: Error | undefined, value: Stats) => void) =>
      callback(undefined, stats(options.directory ?? false)),
  );
  return {
    mkdir: (
      _path: string,
      callback: (error: Error | undefined) => void,
    ) => callback(options.mkdirError),
    stat,
  } as unknown as Pick<SFTPWrapper, "mkdir" | "stat">;
}

describe("ensureSftpDirectory", () => {
  test("accepts a newly created directory without a fallback stat", async () => {
    const sftp = handle({ directory: false });
    await expect(ensureSftpDirectory(sftp, "/work")).resolves.toBeUndefined();
    expect(sftp.stat).not.toHaveBeenCalled();
  });

  test("tolerates mkdir failure only when stat verifies an existing directory", async () => {
    const sftp = handle({ mkdirError: new Error("failure"), directory: true });
    await expect(ensureSftpDirectory(sftp, "/work")).resolves.toBeUndefined();
    expect(sftp.stat).toHaveBeenCalledTimes(1);
  });

  test("rejects mkdir failure when the existing node is not a directory", async () => {
    const sftp = handle({ mkdirError: new Error("failure"), directory: false });
    await expect(ensureSftpDirectory(sftp, "/work")).rejects.toThrow();
  });
});

describe("readSftpDirectoryBounded", () => {
  test("closes the handle after maxCount plus one entries without reading again", async () => {
    const readdir = mock(
      (_directory: Buffer, callback: (error: undefined, entries: Array<{ filename: string }>) => void) =>
        callback(undefined, [
          { filename: "one" },
          { filename: "two" },
          { filename: "three" },
          { filename: "four" },
        ]),
    );
    const close = mock((_directory: Buffer, callback: (error?: Error) => void) => callback());
    const listing = {
      opendir: (_path: string, callback: (error: undefined, directory: Buffer) => void) =>
        callback(undefined, Buffer.from("handle")),
      readdir,
      close,
    } as unknown as Pick<SFTPWrapper, "opendir" | "readdir" | "close">;

    await expect(readSftpDirectoryBounded(listing, "/out", 2)).resolves.toEqual([
      "one",
      "two",
      "three",
    ]);
    expect(readdir).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
