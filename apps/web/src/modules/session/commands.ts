export type SessionCommandResult =
  | { handled: false }
  | {
      handled: true;
      systemMessage: string;
      refreshThread?: boolean;
      navigateTo?: string;
    };

export type ParsedSessionCommand =
  | { kind: "agent_show" }
  | { kind: "agent_create"; name: string; instructions: string }
  | { kind: "agent_edit"; field: "name" | "instructions" | "model" | "description"; value: string }
  | { kind: "agent_switch"; target: string }
  | { kind: "model"; model: string }
  | { kind: "connector_status" };

const COMMAND_HELP = `Commandes session :
• /model <modèle>
• /connector status — connecteurs requis

Agents (missions /runs uniquement) :
• /agent show — agent actif
• /agent create Nom | instructions…
• /agent edit name=… | instructions=… | model=… | description=…
• /agent switch <slug|id>`;

export function parseSessionCommand(raw: string): ParsedSessionCommand | null {
  const text = raw.trim();
  if (!text.startsWith("/")) return null;

  if (text === "/help" || text === "/commands") {
    return { kind: "agent_show" }; // handled specially
  }

  if (text === "/agent show" || text === "/agent") {
    return { kind: "agent_show" };
  }

  if (text.startsWith("/agent create ")) {
    const rest = text.slice("/agent create ".length).trim();
    const pipe = rest.indexOf("|");
    if (pipe === -1) return null;
    const name = rest.slice(0, pipe).trim();
    const instructions = rest.slice(pipe + 1).trim();
    if (!name || !instructions) return null;
    return { kind: "agent_create", name, instructions };
  }

  if (text.startsWith("/agent edit ")) {
    const rest = text.slice("/agent edit ".length).trim();
    const eq = rest.indexOf("=");
    if (eq === -1) return null;
    const field = rest.slice(0, eq).trim() as "name" | "instructions" | "model" | "description";
    const value = rest.slice(eq + 1).trim();
    if (!value) return null;
    if (!["name", "instructions", "model", "description"].includes(field)) return null;
    return { kind: "agent_edit", field, value };
  }

  if (text.startsWith("/agent switch ")) {
    const target = text.slice("/agent switch ".length).trim();
    if (!target) return null;
    return { kind: "agent_switch", target };
  }

  if (text.startsWith("/model ")) {
    const model = text.slice("/model ".length).trim();
    if (!model) return null;
    return { kind: "model", model };
  }

  if (text === "/connector status" || text === "/connector") {
    return { kind: "connector_status" };
  }

  return null;
}

export function sessionCommandHelp(): string {
  return COMMAND_HELP;
}

export function isSessionCommandMessage(raw: string): boolean {
  const text = raw.trim();
  if (!text.startsWith("/")) return false;
  if (text === "/help" || text === "/commands") return true;
  return parseSessionCommand(text) !== null;
}
