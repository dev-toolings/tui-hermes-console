import { describe, expect, test } from "bun:test";
import { assertSameOriginMutation } from "./same-origin";

describe("assertSameOriginMutation", () => {
  test("accepts a browser mutation from the Console origin", () => {
    const request = new Request("http://localhost:3000/api/runtime/restart", {
      headers: {
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
      },
    });

    expect(() => assertSameOriginMutation(request)).not.toThrow();
  });

  test("accepts the public origin reported by a reverse proxy", () => {
    const request = new Request("http://127.0.0.1:3000/api/runtime/restart", {
      headers: {
        origin: "https://console.example.test",
        "x-forwarded-host": "console.example.test",
        "x-forwarded-proto": "https",
      },
    });

    expect(() => assertSameOriginMutation(request)).not.toThrow();
  });

  /**
   * Ces deux cas régressaient depuis que le SPA a sa propre origine : la règle
   * « même origine » refusait toutes les mutations de la Console elle-même.
   * L'écran Runtime affichait « Origine de requête refusée » sur Enregistrer.
   */
  test("accepts the Vite dev server serving the SPA", () => {
    const request = new Request("http://127.0.0.1:3170/api/runtime", {
      method: "PUT",
      headers: { origin: "http://localhost:1420", "sec-fetch-site": "same-site" },
    });

    expect(() => assertSameOriginMutation(request)).not.toThrow();
  });

  test("accepts a packaged Tauri window", () => {
    for (const origin of ["tauri://localhost", "http://tauri.localhost"]) {
      const request = new Request("http://127.0.0.1:3170/api/runtime", {
        method: "PUT",
        headers: { origin },
      });

      expect(() => assertSameOriginMutation(request)).not.toThrow();
    }
  });

  test("rejects cross-site and malformed origins", () => {
    const crossSite = new Request("http://localhost:3000/api/runtime/restart", {
      headers: {
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
    });
    const malformed = new Request("http://localhost:3000/api/runtime/restart", {
      headers: { origin: "not-an-origin" },
    });

    expect(() => assertSameOriginMutation(crossSite)).toThrow("depuis la Console");
    expect(() => assertSameOriginMutation(malformed)).toThrow("Origine de requête refusée");
  });
});
