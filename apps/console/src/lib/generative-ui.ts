import type { GenerativeUISpec } from "@assistant-ui/react";

/**
 * Extraction du spec d'interface porté par un résultat d'outil.
 *
 * Le runtime Hermes n'a aucun canal structuré : `tool.started` ne transporte
 * qu'un nom et un aperçu. Le contrat vit donc dans le retour de l'outil —
 * une clé `ui` dans son JSON — ce qui met le protocole entre les mains de
 * celui qui écrit l'outil, pas du runtime.
 *
 * ATTENTION : cette donnée est explicitement non fiable. Le runtime l'emballe
 * lui-même dans `untrusted_tool_result` en rappelant qu'elle vient d'une
 * source externe. Tout ce qui sort d'ici est donc validé, borné, et ne peut
 * désigner que des composants d'une liste blanche (assurée en aval par
 * `MessagePrimitive.GenerativeUI`).
 */

/** Un arbre plus profond que ça n'est pas un widget, c'est une charge. */
const MAX_DEPTH = 8;
/** Plafond de nœuds : un spec hostile ne doit pas pouvoir figer le thread. */
const MAX_NODES = 200;

const UNTRUSTED_PREFIXES = [
  "<untrusted_tool_result",
  "</untrusted_tool_result>",
  "The following content was retrieved",
];

export function extractUiSpec(output: unknown): GenerativeUISpec | null {
  const payload = asRecord(output);
  if (!payload) return null;

  const spec = asRecord(payload.ui);
  if (!spec || spec.root === undefined) return null;

  const budget = { nodes: 0 };
  const root = Array.isArray(spec.root)
    ? spec.root.map((node) => sanitizeNode(node, 0, budget)).filter(isPresent)
    : sanitizeNode(spec.root, 0, budget);

  if (root === null || (Array.isArray(root) && root.length === 0)) return null;
  return { root } as GenerativeUISpec;
}

type SanitizedNode =
  | string
  | { component: string; props?: Record<string, unknown>; children?: SanitizedNode[]; key?: string };

function sanitizeNode(
  node: unknown,
  depth: number,
  budget: { nodes: number },
): SanitizedNode | null {
  if (depth > MAX_DEPTH) return null;
  if (++budget.nodes > MAX_NODES) return null;

  if (typeof node === "string") return node;
  if (typeof node === "number" || typeof node === "boolean") return String(node);

  const record = asRecord(node);
  // Le nom du composant est résolu contre la liste blanche en aval ; ici on
  // se contente d'exiger qu'il existe et qu'il soit une chaîne.
  if (!record || typeof record.component !== "string" || !record.component) return null;

  const children = Array.isArray(record.children)
    ? record.children.map((child) => sanitizeNode(child, depth + 1, budget)).filter(isPresent)
    : undefined;

  const props = asRecord(record.props) ?? undefined;

  return {
    component: record.component,
    ...(props ? { props } : {}),
    ...(children && children.length > 0 ? { children } : {}),
    ...(typeof record.key === "string" ? { key: record.key } : {}),
  };
}

/**
 * Le résultat arrive le plus souvent en JSON sérialisé, emballé dans
 * l'enveloppe du runtime : on la retire avant de tenter la lecture.
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    const body = value
      .split("\n")
      .filter((line) => !UNTRUSTED_PREFIXES.some((prefix) => line.trim().startsWith(prefix)))
      .join("\n")
      .trim();
    if (!body.startsWith("{")) return null;
    try {
      return asRecord(JSON.parse(body));
    } catch {
      return null;
    }
  }
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
