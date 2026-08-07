export type RuntimeMode = "direct" | "ssh";

export type RuntimeSection =
  | "status"
  | "connection"
  | "workspace"
  | "services"
  | "advanced";

const RUNTIME_SECTIONS = new Set<RuntimeSection>([
  "status",
  "connection",
  "workspace",
  "services",
  "advanced",
]);

export function parseRuntimeSection(value: unknown): RuntimeSection | undefined {
  return typeof value === "string" && RUNTIME_SECTIONS.has(value as RuntimeSection)
    ? (value as RuntimeSection)
    : undefined;
}

export function normalizeRuntimeSection(
  section: RuntimeSection | undefined,
  _mode: RuntimeMode | undefined,
): RuntimeSection {
  return section ?? "status";
}

export function runtimeSettingsHref(mode: RuntimeMode, section: RuntimeSection) {
  return `/settings/runtime?mode=${mode}&section=${section}`;
}
