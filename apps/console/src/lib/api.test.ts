import { afterEach, describe, expect, test } from "bun:test";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

/**
 * `awaitServerReady` mémoïse sa sonde pour toute la session : chaque scénario
 * a donc besoin d'une instance fraîche du module. Le suffixe de requête suffit
 * à contourner le cache de modules de Bun.
 */
async function freshApi(tag: string) {
  return (await import(`./api.ts?boot=${tag}`)) as typeof import("./api");
}

describe("awaitServerReady", () => {
  test("réessaie tant que le sidecar n'écoute pas, puis laisse passer", async () => {
    let healthCalls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/healthz")) {
        healthCalls++;
        // Les deux premiers appels reproduisent le démarrage : `fetch` rejette
        // quand rien n'écoute, le proxy Vite répond 500 quand l'amont est mort.
        if (healthCalls === 1) throw new TypeError("Failed to fetch");
        if (healthCalls === 2) return new Response("proxy error", { status: 500 });
        return new Response("ok", { status: 200 });
      }
      return Response.json({ agents: [] });
    }) as typeof fetch;

    const { fetchAgents } = await freshApi("retry");
    expect(await fetchAgents()).toEqual([]);
    expect(healthCalls).toBe(3);
  });

  test("ne sonde qu'une fois pour toute la session", async () => {
    let healthCalls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/healthz")) {
        healthCalls++;
        return new Response("ok", { status: 200 });
      }
      return Response.json({ agents: [] });
    }) as typeof fetch;

    const { fetchAgents, awaitServerReady } = await freshApi("once");
    await Promise.all([fetchAgents(), fetchAgents(), awaitServerReady()]);
    await fetchAgents();
    expect(healthCalls).toBe(1);
  });

  test("une erreur d'API reste une erreur, le garde ne la masque pas", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/healthz")) {
        return new Response("ok", { status: 200 });
      }
      return Response.json({ error: { code: "boom", message: "cassé" } }, { status: 500 });
    }) as typeof fetch;

    const { fetchAgents, ApiError } = await freshApi("error");
    const failure = await fetchAgents().catch((reason: unknown) => reason);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as InstanceType<typeof ApiError>).message).toBe("cassé");
  });
});
