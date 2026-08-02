import { afterEach, describe, expect, test } from "bun:test";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { describeError, log } from "./log";

const originalNodeEnv = process.env.NODE_ENV;
const originalLogLevel = process.env.LOG_LEVEL;

/** Capture les deux flux : `warn`/`error` partent sur stderr, le reste sur stdout. */
function captureConsole(run: () => void) {
  const lines: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => lines.push(args.join(" "));
  console.error = (...args: unknown[]) => lines.push(args.join(" "));
  try {
    run();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  return lines;
}

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalLogLevel === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = originalLogLevel;
});

describe("log", () => {
  test("production emits one JSON line carrying ts, level, msg and fields", () => {
    process.env.NODE_ENV = "production";
    const [line] = captureConsole(() => log.info("Mission démarrée", { runId: "run_1" }));

    expect(line).toBeDefined();
    const payload = JSON.parse(line!) as Record<string, unknown>;
    expect(payload.level).toBe("info");
    expect(payload.msg).toBe("Mission démarrée");
    expect(payload.runId).toBe("run_1");
    expect(typeof payload.ts).toBe("string");
    expect(new Date(payload.ts as string).getTime()).toBeGreaterThan(0);
  });

  test("human mode prints one line with key=value fields", () => {
    process.env.NODE_ENV = "development";
    const [line] = captureConsole(() => log.warn("Thread delete: cancel skipped", { runId: "run_2" }));

    expect(line).toContain("WARN");
    expect(line).toContain("Thread delete: cancel skipped");
    expect(line).toContain("runId=run_2");
  });

  test("debug stays silent unless LOG_LEVEL=debug", () => {
    delete process.env.LOG_LEVEL;
    expect(captureConsole(() => log.debug("invisible"))).toHaveLength(0);

    process.env.LOG_LEVEL = "debug";
    expect(captureConsole(() => log.debug("visible"))).toHaveLength(1);
  });
});

describe("describeError", () => {
  /**
   * Les champs portent les noms que `postgres@3.4` produit réellement
   * (`table_name`, `constraint_name`), pas ceux qu'on pourrait supposer. Un test
   * écrit sur une forme inventée passerait sans rien garantir.
   */
  test("keeps the PostgresError diagnostic and drops values and source noise", () => {
    const error = Object.assign(new Error('duplicate key value violates unique constraint "console_users_email_unique"'), {
      code: "23505",
      severity: "ERROR",
      table_name: "console_users",
      constraint_name: "console_users_email_unique",
      routine: "_bt_check_unique",
      // PostgreSQL recopie ici la valeur en cause : jamais dans le journal.
      detail: "Key (email)=(alice@corp.com) already exists.",
      // Bruit attaché par postgres.js et par Bun (`column` = position source).
      file: "nbtinsert.c",
      line: "666",
      column: 21,
    });

    const fields = describeError(error);

    expect(fields.code).toBe("23505");
    expect(fields.table).toBe("console_users");
    expect(fields.constraint).toBe("console_users_email_unique");
    expect(fields).not.toHaveProperty("detail");
    expect(fields).not.toHaveProperty("stack");
    expect(fields).not.toHaveProperty("file");
    // `column` ne doit pas remonter la position source de Bun déguisée en colonne SQL.
    expect(fields.column).toBeUndefined();
    expect(JSON.stringify(fields)).not.toContain("alice@corp.com");
  });

  /**
   * Construit avec la VRAIE classe de drizzle : elle n'affecte pas `name`, qui
   * vaut « Error ». Une détection par `error.name` serait morte, et le message
   * de l'enveloppe — qui contient le SQL et tous les paramètres liés — sortirait
   * tel quel. C'est exactement le régression que ce test verrouille.
   */
  test("unwraps a real DrizzleQueryError without leaking its bound parameters", () => {
    const cause = Object.assign(new Error('column "remote_hermes_workdir" does not exist'), {
      code: "42703",
    });
    const wrapper = new DrizzleQueryError(
      `SELECT ${"column_name, ".repeat(60)}FROM runtime_config WHERE token = $1`,
      ["ENC:v1:SUPER_SECRET_TOKEN"],
      cause,
    );

    expect(wrapper.name).toBe("Error");

    const fields = describeError(wrapper);

    expect(fields.code).toBe("42703");
    expect(fields.message).toBe('column "remote_hermes_workdir" does not exist');
    expect((fields.query as string).length).toBe(200);
    expect(fields).not.toHaveProperty("stack");
    expect(fields).not.toHaveProperty("params");
    expect(JSON.stringify(fields)).not.toContain("SUPER_SECRET_TOKEN");
    expect(JSON.stringify(fields)).not.toContain("Failed query");
  });

  test("plain errors keep name, message and at most three stack frames", () => {
    const fields = describeError(new Error("boom"));

    expect(fields.name).toBe("Error");
    expect(fields.message).toBe("boom");
    expect((fields.stack as string).split(" | ").length).toBeLessThanOrEqual(3);
    expect(fields.stack).toContain("log.test.ts");
    expect(fields.stack).not.toContain("\n");

    // Une stack profonde — celle qui déverse la source de Drizzle — est coupée.
    const deep = new Error("deep");
    deep.stack = `Error: deep\n${Array.from({ length: 40 }, (_, i) => `    at frame${i} (drizzle-orm/session.js:${i})`).join("\n")}`;
    expect((describeError(deep).stack as string).split(" | ")).toHaveLength(3);
  });

  test("non-Error values never leak an object", () => {
    expect(describeError("plain string")).toEqual({ error: "plain string" });
  });
});

/**
 * Le logger est appelé depuis l'intérieur des `catch`. S'il lève, il remplace
 * l'erreur d'origine par la sienne et détruit le diagnostic qu'il devait servir.
 */
describe("robustesse du logger", () => {
  const unserializable = () => {
    const cyclic: Record<string, unknown> = { name: "boucle" };
    cyclic.self = cyclic;
    return cyclic;
  };

  test("une valeur cyclique ne fait pas lever le logger", () => {
    const lines = captureConsole(() => {
      log.error("cas limite", { payload: unserializable() });
    });
    expect(lines.join("")).toContain("[unserializable]");
  });

  test("un BigInt ne fait pas lever le logger, y compris en JSON", () => {
    process.env.NODE_ENV = "production";
    const lines = captureConsole(() => {
      log.error("cas limite", { size: 10n });
    });
    expect(lines.join("")).toContain("[unserializable]");
  });
});
