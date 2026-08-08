import { describe, expect, test } from "bun:test";
import type { SftpOps } from "./types";
import {
  createScopedSftp,
  RemoteSftpPathError,
  scopeRemotePath,
} from "./scoped-sftp";

const ROOT = "/srv/hermes-console/workdir";

function fakeSftp(calls: string[]): SftpOps {
  return {
    async mkdirp(remotePath) {
      calls.push(`mkdirp:${remotePath}`);
    },
    async list(remotePath, maxEntries) {
      calls.push(`list:${remotePath}:${maxEntries}`);
      return [];
    },
    async stat(remotePath) {
      calls.push(`stat:${remotePath}`);
      return { size: 0, type: "file" };
    },
    async upload(localPath, remotePath, mode) {
      calls.push(`upload:${localPath}:${remotePath}:${mode?.toString(8)}`);
    },
    async download(remotePath, localPath, maxBytes) {
      calls.push(`download:${remotePath}:${localPath}:${maxBytes}`);
    },
    async remove(remotePath) {
      calls.push(`remove:${remotePath}`);
    },
  };
}

describe("scopeRemotePath", () => {
  test("canonicalizes a root child while preserving the workdir boundary", () => {
    expect(scopeRemotePath(`${ROOT}/`, `${ROOT}//runs/run-1/`)).toBe(
      `${ROOT}/runs/run-1`,
    );
    expect(scopeRemotePath(ROOT, ROOT)).toBe(ROOT);
  });

  test("rejects traversal, relative paths, NULs, and sibling prefixes", () => {
    for (const candidate of [
      `${ROOT}/../secrets`,
      `${ROOT}/runs/./run-1`,
      "relative/path",
      `${ROOT}/safe\0.txt`,
      "/srv/hermes-console/workdir-evil/file",
      "/tmp/file",
    ]) {
      expect(() => scopeRemotePath(ROOT, candidate)).toThrow(
        RemoteSftpPathError,
      );
    }
  });

  test("rejects an invalid or system-root scope", () => {
    expect(() => scopeRemotePath("relative", "/tmp/file")).toThrow(
      RemoteSftpPathError,
    );
    expect(() => scopeRemotePath("/", "/tmp/file")).toThrow(
      RemoteSftpPathError,
    );
  });
});

describe("createScopedSftp", () => {
  test("scopes every remote operation and leaves local paths untouched", async () => {
    const calls: string[] = [];
    const scoped = createScopedSftp(fakeSftp(calls), ROOT);

    await scoped.mkdirp(`${ROOT}/runs/run-1/in`);
    await scoped.list(`${ROOT}/runs/run-1/out`, 5);
    await scoped.stat(`${ROOT}/runs/run-1/out/report.txt`);
    await scoped.upload("/tmp/local-input.txt", `${ROOT}/runs/run-1/in/input.txt`, 0o644);
    await scoped.download(
      `${ROOT}/runs/run-1/out/report.txt`,
      "/tmp/local-output.part",
      100,
    );
    await scoped.remove(`${ROOT}/runs/run-1/in/input.txt`);

    expect(calls).toEqual([
      `mkdirp:${ROOT}/runs/run-1/in`,
      `list:${ROOT}/runs/run-1/out:5`,
      `stat:${ROOT}/runs/run-1/out/report.txt`,
      `upload:/tmp/local-input.txt:${ROOT}/runs/run-1/in/input.txt:644`,
      `download:${ROOT}/runs/run-1/out/report.txt:/tmp/local-output.part:100`,
      `remove:${ROOT}/runs/run-1/in/input.txt`,
    ]);
  });

  test("rejects before delegating an out-of-scope operation", async () => {
    const calls: string[] = [];
    const scoped = createScopedSftp(fakeSftp(calls), ROOT);

    await expect(scoped.stat(`${ROOT}/../../etc/passwd`)).rejects.toMatchObject({
      code: "SSH_REMOTE_PATH_INVALID",
    });
    await expect(scoped.download("/tmp/escape", "/tmp/out", 10)).rejects.toMatchObject({
      code: "SSH_REMOTE_PATH_OUTSIDE_WORKDIR",
    });
    expect(calls).toEqual([]);
  });
});
