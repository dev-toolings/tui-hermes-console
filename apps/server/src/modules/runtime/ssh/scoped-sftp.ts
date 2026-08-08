import path from "node:path";
import type { SftpOps } from "./types";

export type RemoteSftpPathErrorCode =
  | "SSH_REMOTE_PATH_INVALID"
  | "SSH_REMOTE_PATH_OUTSIDE_WORKDIR";

/**
 * A lexical guard for paths sent to a remote SFTP implementation.
 *
 * This is deliberately only a Console-side path guard. It does not turn a
 * remote SSH account into an OS sandbox: the system-ssh transport still has
 * a remote command channel, and symlink/race resistance requires a server-side
 * helper or equivalent boundary.
 */
export class RemoteSftpPathError extends Error {
  constructor(
    readonly code: RemoteSftpPathErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RemoteSftpPathError";
  }
}

/**
 * Resolve an absolute remote path inside a non-root workdir.
 *
 * Dot segments are rejected instead of normalized so a caller cannot hide a
 * traversal attempt in an otherwise valid-looking path. Repeated separators
 * and trailing separators are canonicalized for the underlying transport.
 */
export function scopeRemotePath(root: string, candidate: string): string {
  const normalizedRoot = normalizeRoot(root);
  if (candidate.includes("\0") || !candidate.startsWith("/")) {
    throw invalidPath(candidate);
  }
  rejectDotSegments(candidate);

  const normalizedCandidate = normalizeAbsolute(candidate);
  if (
    normalizedCandidate !== normalizedRoot &&
    !normalizedCandidate.startsWith(`${normalizedRoot}/`)
  ) {
    throw new RemoteSftpPathError(
      "SSH_REMOTE_PATH_OUTSIDE_WORKDIR",
      "Le chemin SFTP distant sort du workdir autorisé.",
    );
  }
  return normalizedCandidate;
}

/** Wrap every remote SFTP operation with the same workdir scope. */
export function createScopedSftp(ops: SftpOps, root: string): SftpOps {
  const normalizedRoot = normalizeRoot(root);
  const scoped = (candidate: string) =>
    scopeRemotePath(normalizedRoot, candidate);

  return {
    async mkdirp(remotePath) {
      await ops.mkdirp(scoped(remotePath));
    },
    async list(remotePath, maxEntries) {
      return ops.list(scoped(remotePath), maxEntries);
    },
    async stat(remotePath) {
      return ops.stat(scoped(remotePath));
    },
    async upload(localPath, remotePath, mode) {
      await ops.upload(localPath, scoped(remotePath), mode);
    },
    async download(remotePath, localPath, maxBytes) {
      await ops.download(scoped(remotePath), localPath, maxBytes);
    },
    async remove(remotePath) {
      await ops.remove(scoped(remotePath));
    },
  };
}

function normalizeRoot(root: string): string {
  if (root.includes("\0") || !root.startsWith("/")) {
    throw invalidPath(root);
  }
  rejectDotSegments(root);
  const normalized = normalizeAbsolute(root);
  if (normalized === "/") {
    throw new RemoteSftpPathError(
      "SSH_REMOTE_PATH_INVALID",
      "Le workdir SFTP distant ne peut pas être la racine du système.",
    );
  }
  return normalized;
}

function normalizeAbsolute(value: string): string {
  return path.posix.normalize(value).replace(/\/+$/, "") || "/";
}

function rejectDotSegments(value: string): void {
  if (value.split("/").some((segment) => segment === "." || segment === "..")) {
    throw invalidPath(value);
  }
}

function invalidPath(value: string): RemoteSftpPathError {
  return new RemoteSftpPathError(
    "SSH_REMOTE_PATH_INVALID",
    `Le chemin SFTP distant est invalide : ${JSON.stringify(value)}.`,
  );
}
