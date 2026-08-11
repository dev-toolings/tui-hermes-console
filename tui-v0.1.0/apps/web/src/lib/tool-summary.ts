/**
 * Résumé d'une ligne d'appel d'outil.
 *
 * La ligne repliée ne dispose que d'une poignée de caractères : elle doit dire
 * ce que l'outil a *rapporté*, pas prouver qu'il a répondu. Reprendre la
 * première ligne brute de la sortie donnait `{"success": true, "url": "https…`
 * cinq fois de suite — exact, et sans aucune information.
 *
 * Module pur : aucune dépendance React, testable directement.
 */

const MAX_SUMMARY = 120;

/**
 * Enveloppe que Hermes pose autour de toute donnée venue de l'extérieur :
 * balise ouvrante, avertissement fixe, balise fermante. Elle est conservée dans
 * la vue dépliée — c'est la sortie réelle du runtime — mais la répéter dans
 * l'aperçu de cinq lignes n'apprendrait rien.
 */
const UNTRUSTED_PREAMBLE = [
  "<untrusted_tool_result",
  "</untrusted_tool_result>",
  "The following content was retrieved",
];

/** Outils dont la sortie est une liste : on compte, on ne cite pas. */
const MATCH_TOOLS = new Set(["grep", "glob", "search", "list_dir", "ls", "find"]);

/** Outils dont la sortie est un contenu de fichier : la taille est le résumé. */
const CONTENT_TOOLS = new Set(["read_file", "write_file", "edit_file"]);

export function summarizeToolResult(
  tool: string,
  output: unknown,
  target?: string | null,
): string {
  if (output == null) return "";
  if (typeof output === "string") return summarizeText(tool, output, target);
  if (Array.isArray(output)) return pluralize(output.length, "élément");
  if (typeof output === "object") {
    return summarizeObject(output as Record<string, unknown>, target);
  }
  return truncate(String(output));
}

function summarizeText(tool: string, text: string, target?: string | null): string {
  // L'enveloppe est retirée avant tout comptage : sinon un résultat d'une ligne
  // emballé par le runtime s'annonce comme « 4 lignes ».
  const body = stripUntrusted(text);
  const lines = body.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) return "Sortie vide";

  // Beaucoup d'outils renvoient du JSON sérialisé : le lire comme un objet
  // donne un bien meilleur résumé que sa première ligne.
  const parsed = tryParseJson(body);
  if (parsed !== undefined) return summarizeToolResult(tool, parsed, target);

  if (MATCH_TOOLS.has(tool)) return pluralize(lines.length, "résultat");
  if (CONTENT_TOOLS.has(tool)) return pluralize(countLines(body), "ligne");

  const first = truncate(lines[0] ?? "");
  const total = countLines(body);
  return total > 1 ? `${first} · ${pluralize(total, "ligne")}` : first;
}

/**
 * Champs qui répondent à « qu'est-ce qui est revenu ? ». Un objet de résultat
 * mélange l'essentiel et l'accessoire dans un ordre de clés arbitraire : sans
 * ce classement, une ligne s'annonce par le premier avertissement venu plutôt
 * que par son titre.
 */
const HEADLINE_KEYS = [
  "title",
  "status",
  "statusCode",
  "message",
  "name",
  "count",
  "total",
  "path",
  "file",
  "url",
  "summary",
  "text",
];

function summarizeObject(output: Record<string, unknown>, target?: string | null): string {
  const entries = Object.entries(output)
    // Le libellé de la ligne montre déjà la cible de l'appel (l'URL, le chemin) :
    // la réécrire dans le résumé prend la place de ce qui est réellement revenu.
    .filter(([, value]) => isInformative(value) && !(target && String(value) === target))
    .sort(([a], [b]) => headlineRank(a) - headlineRank(b));

  const fields = entries.slice(0, 2).map(([key, value]) => `${key}: ${describeValue(value)}`);
  if (fields.length === 0) return "";
  return truncate(fields.join(" · "));
}

function headlineRank(key: string): number {
  const rank = HEADLINE_KEYS.indexOf(key);
  return rank === -1 ? HEADLINE_KEYS.length : rank;
}

/** Un booléen ou un vide ne dit que « ça a répondu » — l'échec a déjà son propre affichage. */
function isInformative(value: unknown): boolean {
  if (value == null || typeof value === "boolean") return false;
  if (typeof value === "string") {
    // Un bloc multi-ligne ou très long est une charge utile, pas un résumé :
    // il est là, entier, dans la vue dépliée. Le `\n` littéral compte aussi —
    // les sorties d'outil arrivent parfois sérialisées deux fois.
    if (value.includes("\n") || value.includes("\\n")) return false;
    return value.trim().length > 0 && value.length <= 160;
  }
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function describeValue(value: unknown): string {
  if (Array.isArray(value)) return pluralize(value.length, "élément");
  if (typeof value === "object" && value !== null) {
    return pluralize(Object.keys(value).length, "champ");
  }
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

function stripUntrusted(text: string): string {
  return text
    .split("\n")
    .filter((line) => !UNTRUSTED_PREAMBLE.some((prefix) => line.trim().startsWith(prefix)))
    .join("\n")
    .trim();
}

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function countLines(text: string): number {
  return text.replace(/\n+$/, "").split("\n").length;
}

function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${count > 1 ? "s" : ""}`;
}

function truncate(text: string): string {
  const value = text.trim();
  return value.length > MAX_SUMMARY ? `${value.slice(0, MAX_SUMMARY - 1)}…` : value;
}

const MAX_BODY = 12_000;

/**
 * Sortie de la vue dépliée.
 *
 * Le runtime renvoie le plus souvent du JSON sérialisé, emballé dans
 * l'enveloppe `untrusted_tool_result` : affiché tel quel, ça donnait quatre
 * lignes d'avertissement fixe suivies d'une ligne de JSON compressée. On
 * reformate le JSON et on remonte l'enveloppe en un simple drapeau — la mise
 * en garde reste portée par l'UI, sans coûter la moitié du bloc.
 */
export function prettyToolOutput(output: unknown): { text: string; external: boolean } {
  if (output == null) return { text: "Sortie vide", external: false };

  if (typeof output !== "string") {
    return { text: bound(JSON.stringify(output, null, 2)), external: false };
  }

  const external = UNTRUSTED_PREAMBLE.some((prefix) => output.includes(prefix));
  const body = external ? stripUntrusted(output) : output;
  const parsed = tryParseJson(body);
  const text = parsed === undefined ? body : JSON.stringify(parsed, null, 2);
  return { text: bound(text) || "Sortie vide", external };
}

/** Arguments de l'appel, formatés comme la sortie. Vide si l'outil n'en a pas. */
export function prettyToolArgs(args: unknown): string {
  if (args == null) return "";
  if (typeof args === "string") {
    const parsed = tryParseJson(args);
    return bound(parsed === undefined ? args : JSON.stringify(parsed, null, 2));
  }
  if (typeof args === "object" && Object.keys(args as object).length === 0) return "";
  return bound(JSON.stringify(args, null, 2));
}

function bound(text: string): string {
  const value = text.trim();
  return value.length > MAX_BODY ? `${value.slice(0, MAX_BODY)}\n…` : value;
}
