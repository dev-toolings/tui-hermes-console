export type PersonaCapability =
  | "agent.read"
  | "connector.read"
  | "thread.read"
  | "thread.create"
  | "guided.task.create"
  | "guided.task.read"
  | "guided.task.decide"
  | "guided.task.execute"
  | "guided.repository.manage"
  | "run.read"
  | "run.approve"
  | "artifact.read"
  | "membership.manage"
  | "audit.read";

let activeCapabilities = new Set<string>();
let activeRole: "admin" | "operator" | "requester" | "approver" | "auditor" | null = null;

export function setPersonaCapabilities(capabilities: readonly string[] = []) {
  activeCapabilities = new Set(capabilities);
}

export function readPersonaCapabilities(): ReadonlySet<string> {
  return activeCapabilities;
}

export function setPersonaRole(role: typeof activeRole) {
  activeRole = role;
}

export function readPersonaRole() {
  return activeRole;
}
