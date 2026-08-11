/**
 * Journal structuré, sans dépendance.
 *
 * Un `console.error("…", error)` déverse la stack complète — pour une erreur
 * Drizzle, ce sont quarante lignes de source du driver qui noient le message
 * utile dans la sortie multiplexée de `make dev`. Ici chaque événement tient
 * sur une ligne : JSON en production, lisible ailleurs.
 */

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const COLORS: Record<Level, string> = {
  debug: "\u001b[2m",
  info: "\u001b[36m",
  warn: "\u001b[33m",
  error: "\u001b[31m",
};
const RESET = "\u001b[0m";

const POSTGRES_CODE = /^[0-9A-Z]{5}$/;
/**
 * Champs d'une `PostgresError`, sous les noms que `postgres@3.4` leur donne
 * réellement (`table_name`, pas `table`), projetés sur des clés courtes.
 *
 * Deux exclusions délibérées, l'une et l'autre vérifiées contre le vrai driver :
 *
 * - `detail` recopie les **valeurs de la ligne** : « Key (email)=(a@b.c) already
 *   exists », « Failing row contains (3, x@y.z, ENC:v1:…) ». Les index uniques de
 *   cette base portent sur `console_users.email`, `console_users.google_subject`
 *   et `console_sessions.token_hash`, et le CHECK de la 0030 est posé sur
 *   `runtime_config`, qui porte `encrypted_token` et `encrypted_ssh_password`.
 *   `code` + `constraint` + `table` disent *quelle* contrainte a sauté : c'est
 *   ce qu'il faut pour agir, sans le contenu.
 * - on ne lit jamais `.table`/`.column` directement : Bun attache `line`/`column`
 *   (la position du `throw` dans la source) à toute `Error`, et `column` vaudrait
 *   alors `21` — un nombre qu'un lecteur prendrait pour une colonne SQL.
 */
const POSTGRES_FIELDS = [
  ["code", "code"],
  ["message", "message"],
  ["table_name", "table"],
  ["column_name", "column"],
  ["constraint_name", "constraint"],
  ["routine", "routine"],
  ["severity", "severity"],
] as const;

/**
 * `JSON.stringify` lève sur une structure cyclique ou un `BigInt`. Ce throw
 * partirait de l'intérieur d'un `catch` et remplacerait l'erreur d'origine par
 * une erreur de sérialisation : le journal saboterait le diagnostic qu'il sert.
 */
function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return "[unserializable]";
  }
}

function formatValue(value: unknown) {
  return typeof value === "string" && !/\s/.test(value) ? value : safeStringify(value);
}

function emit(level: Level, msg: string, fields?: Fields) {
  if (level === "debug" && process.env.LOG_LEVEL !== "debug") return;
  const write = level === "warn" || level === "error" ? console.error : console.log;

  if (process.env.NODE_ENV === "production") {
    // Champ par champ, comme en mode lisible : sérialiser l'enregistrement d'un
    // bloc ferait perdre l'horodatage, le niveau ET le message pour un seul
    // champ cyclique — le journal effacerait l'incident qu'il doit rapporter.
    const safeFields: Fields = {};
    for (const [key, value] of Object.entries(fields ?? {})) {
      try {
        JSON.stringify(value);
        safeFields[key] = value;
      } catch {
        safeFields[key] = "[unserializable]";
      }
    }
    write(safeStringify({ ts: new Date().toISOString(), level, msg, ...safeFields }));
    return;
  }

  const color = process.stdout.isTTY && !process.env.NO_COLOR ? COLORS[level] : "";
  const reset = color ? RESET : "";
  const pairs = Object.entries(fields ?? {}).map(([key, value]) => `${key}=${formatValue(value)}`);
  write(
    [`${new Date().toTimeString().slice(0, 8)}`, `${color}${level.toUpperCase()}${reset}`, msg, ...pairs].join(" "),
  );
}

export const log = {
  debug: (msg: string, fields?: Fields) => emit("debug", msg, fields),
  info: (msg: string, fields?: Fields) => emit("info", msg, fields),
  warn: (msg: string, fields?: Fields) => emit("warn", msg, fields),
  error: (msg: string, fields?: Fields) => emit("error", msg, fields),
};

/**
 * Aplatit une erreur en champs primitifs compacts.
 *
 * Ne renvoie jamais l'objet `Error` lui-même : c'est lui qui, sérialisé par
 * `console.*`, déverse la source du driver.
 */
export function describeError(error: unknown): Fields {
  if (!(error instanceof Error)) return { error: String(error) };

  // Drizzle enveloppe l'erreur du driver. On la reconnaît à sa classe et à ses
  // champs, JAMAIS à `error.name` : `DrizzleQueryError` n'affecte pas `name`,
  // qui vaut « Error » (vérifié contre drizzle-orm@0.45.2).
  //
  // Son `message` est délibérément écarté : il vaut « Failed query: <SQL>\nparams:
  // <TOUS LES PARAMÈTRES LIÉS> ». Le laisser passer déverserait dans le journal
  // les jetons chiffrés, mots de passe SSH et emails passés en paramètres — ce
  // que ce module existe précisément pour empêcher. Seul le diagnostic de la
  // cause remonte, plus le SQL tronqué, qui situe la panne sans porter de valeur.
  const wrapper = error as Error & { query?: unknown; params?: unknown };
  if (
    error.constructor?.name === "DrizzleQueryError" &&
    "query" in wrapper &&
    error.cause instanceof Error
  ) {
    return {
      ...describeError(error.cause),
      ...(typeof wrapper.query === "string" ? { query: wrapper.query.slice(0, 200) } : {}),
    };
  }

  const source = error as Error & Record<string, unknown>;
  if (typeof source.code === "string" && POSTGRES_CODE.test(source.code)) {
    const fields: Fields = {};
    for (const [key, label] of POSTGRES_FIELDS) {
      const value = source[key];
      if (value !== undefined && value !== null && value !== "") fields[label] = value;
    }
    return fields;
  }

  const frames = (error.stack ?? "")
    .split("\n")
    .filter((line) => line.trimStart().startsWith("at "))
    .slice(0, 3)
    .map((line) => line.trim())
    .join(" | ");
  return { name: error.name, message: error.message, ...(frames ? { stack: frames } : {}) };
}
