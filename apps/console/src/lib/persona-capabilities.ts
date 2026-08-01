export type PersonaCapability =
  | "agent.read"
  | "connector.read"
  | "thread.read"
  | "thread.create"
  | "run.read"
  | "run.approve"
  | "artifact.read"
  | "membership.manage"
  | "audit.read";

let activeCapabilities = new Set<string>();

export function setPersonaCapabilities(capabilities: readonly string[] = []) {
  activeCapabilities = new Set(capabilities);
}

export function readPersonaCapabilities(): ReadonlySet<string> {
  return activeCapabilities;
}
