import { afterEach, describe, expect, test } from "bun:test";

const realFetch = globalThis.fetch;
const realDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

afterEach(() => {
  globalThis.fetch = realFetch;
  delete globalThis.__CONSOLE_API_ORIGIN__;
  if (realDocument) {
    Object.defineProperty(globalThis, "document", realDocument);
  } else {
    Reflect.deleteProperty(globalThis, "document");
  }
});

/** L'origine est lue à l'import : chaque scénario a besoin d'un module neuf. */
async function freshModule(tag: string) {
  return (await import(`./api-origin.ts?case=${tag}`)) as typeof import("./api-origin");
}

describe("api-origin", () => {
  test("sans injection, les chemins restent relatifs et le garde CSRF est installé", async () => {
    const before = globalThis.fetch;
    const { apiOrigin, apiUrl, installApiOrigin } = await freshModule("none");
    installApiOrigin();

    expect(apiOrigin).toBe("");
    expect(apiUrl("/api/agents")).toBe("/api/agents");
    expect(globalThis.fetch).not.toBe(before);
  });

  test("préfixe les appels /api vers l'origine injectée", async () => {
    globalThis.__CONSOLE_API_ORIGIN__ = "http://127.0.0.1:3170";
    const called: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      called.push(String(input));
      return new Response("{}");
    }) as typeof fetch;

    const { installApiOrigin } = await freshModule("local");
    installApiOrigin();
    await fetch("/api/agents");

    expect(called).toEqual(["http://127.0.0.1:3170/api/agents"]);
  });

  test("ajoute le jeton CSRF aux mutations d'API avant le premier rendu", async () => {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { cookie: "theme=dark; hc_csrf=token%20site" },
    });
    let capturedHeaders = new Headers();
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response("{}");
    }) as typeof fetch;

    const { installApiOrigin } = await freshModule("csrf-site-selection");
    installApiOrigin();
    await fetch("/api/auth?action=select-site", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ siteId: "paris" }),
    });

    expect(capturedHeaders.get("x-csrf-token")).toBe("token site");
    expect(capturedHeaders.get("content-type")).toBe("application/json");
  });

  test("marche pour un serveur distant, et ignore le / final", async () => {
    globalThis.__CONSOLE_API_ORIGIN__ = "https://console.exemple.fr/";
    const { apiUrl } = await freshModule("vps");

    expect(apiUrl("/api/threads?source=mission")).toBe(
      "https://console.exemple.fr/api/threads?source=mission",
    );
  });

  test("ne touche ni les autres chemins ni les URL absolues", async () => {
    globalThis.__CONSOLE_API_ORIGIN__ = "https://console.exemple.fr";
    const called: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      called.push(String(input));
      return new Response("{}");
    }) as typeof fetch;

    const { apiUrl, installApiOrigin } = await freshModule("autres");
    installApiOrigin();
    await fetch("/assets/index.js");
    await fetch("https://ailleurs.example/api/agents");

    expect(apiUrl("/apidocs")).toBe("/apidocs");
    expect(called).toEqual(["/assets/index.js", "https://ailleurs.example/api/agents"]);
  });
});
