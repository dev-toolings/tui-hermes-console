import { afterEach, describe, expect, test } from "bun:test";
import { setPersonaCapabilities } from "@/lib/persona-capabilities";
import { loadInbox } from "./loaders";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  setPersonaCapabilities();
});

function inboxFetch(failedPath?: string) {
  return (async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path === "/api/healthz") return Response.json({ ok: true });
    if (path === failedPath) return Response.json({ error: { message: "indisponible" } }, { status: 500 });
    if (path === "/api/guided/tasks") return Response.json({ tasks: [{ id: "task_1", projectName: "Projet Un" }], page: { hasMore: false, nextCursor: null } });
    if (path === "/api/inbox/missions") return Response.json({ missions: [{ id: "thread_1" }], page: { hasMore: false, nextCursor: null } });
    throw new Error(`appel inattendu: ${path}`);
  }) as typeof fetch;
}

describe("loadInbox", () => {
  test("sans capacité de lecture, ne lance aucune source et rend une file vide", async () => {
    let calls = 0;
    globalThis.fetch = (async (_input: RequestInfo | URL) => {
      calls++;
      throw new Error("aucun fetch n’est attendu");
    }) as unknown as typeof fetch;

    await expect(loadInbox()).resolves.toEqual({ tasks: [], page: { hasMore: false, nextCursor: null }, missions: [], missionPage: { hasMore: false, nextCursor: null }, degraded: false });
    expect(calls).toBe(0);
  });

  test("charge le résumé des tâches et les missions pour l’Inbox guidée", async () => {
    setPersonaCapabilities(["guided.task.read", "thread.read"]);
    globalThis.fetch = inboxFetch();

    const data = await loadInbox();
    expect(data.degraded).toBe(false);
    expect(data.tasks[0]?.id).toBe("task_1");
    expect(data.missions[0]?.id).toBe("thread_1");
    expect(data.tasks[0]?.projectName).toBe("Projet Un");
  });

  test.each([
    ["/api/guided/tasks", "tasks"],
    ["/api/inbox/missions", "missions"],
  ])("garde les autres sources si %s échoue", async (failedPath, failedSource) => {
    setPersonaCapabilities(["guided.task.read", "thread.read"]);
    globalThis.fetch = inboxFetch(failedPath);

    const data = await loadInbox();
    expect(data.degraded).toBe(true);
    expect(data[failedSource as "tasks" | "missions"]).toEqual([]);
    for (const source of ["tasks", "missions"] as const) {
      if (source !== failedSource) expect(data[source]).not.toEqual([]);
    }
  });
});
