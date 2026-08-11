import type { RuntimePublicDto } from "@console/core/types/api";

type DirectRuntimeIdentity = Pick<
  RuntimePublicDto,
  "baseUrl" | "configured" | "source" | "tokenConfigured" | "transport"
>;

type SshRuntimeIdentity = Pick<
  RuntimePublicDto,
  | "baseUrl"
  | "configured"
  | "source"
  | "sshAuth"
  | "sshHost"
  | "sshPort"
  | "sshUser"
  | "sshPasswordConfigured"
  | "tokenConfigured"
  | "transport"
>;

export type SshConnectionIdentity = {
  baseUrl: string;
  sshAuth: "agent" | "password";
  sshHost: string;
  sshPort: number;
  sshUser: string;
};

function normalizedUrl(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\/+$/, "");
}

/** Mirrors the server rule: an encrypted token belongs to one exact direct target. */
export function canReuseDirectRuntimeToken(
  runtime: DirectRuntimeIdentity | null,
  baseUrl: string,
) {
  return Boolean(
    runtime?.configured &&
      runtime.source === "database" &&
      runtime.transport === "direct" &&
      runtime.tokenConfigured &&
      normalizedUrl(runtime.baseUrl) === normalizedUrl(baseUrl),
  );
}

/** Mirrors `sameSshConnectionIdentity` without exposing either stored secret. */
export function isSameSshConnectionIdentity(
  runtime: SshRuntimeIdentity | null,
  candidate: SshConnectionIdentity,
) {
  return Boolean(
    runtime?.configured &&
      runtime.source === "database" &&
      runtime.transport === "ssh" &&
      normalizedUrl(runtime.baseUrl) === normalizedUrl(candidate.baseUrl) &&
      runtime.sshHost === candidate.sshHost.trim() &&
      runtime.sshPort === candidate.sshPort &&
      runtime.sshUser === candidate.sshUser.trim() &&
      runtime.sshAuth === candidate.sshAuth,
  );
}

export function canReuseSshRuntimeToken(
  runtime: SshRuntimeIdentity | null,
  candidate: SshConnectionIdentity,
) {
  return isSameSshConnectionIdentity(runtime, candidate) && runtime?.tokenConfigured === true;
}

export function canReuseSshPassword(
  runtime: SshRuntimeIdentity | null,
  candidate: SshConnectionIdentity,
) {
  return (
    candidate.sshAuth === "password" &&
    isSameSshConnectionIdentity(runtime, candidate) &&
    runtime?.sshPasswordConfigured === true
  );
}
