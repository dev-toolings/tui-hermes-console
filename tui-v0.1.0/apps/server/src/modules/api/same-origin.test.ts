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
      headers: { origin: "http://localhost:1470", "sec-fetch-site": "same-site" },
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

  /**
   * Accès depuis un autre appareil du réseau local : l'`Origin` porte l'IP LAN,
   * qu'aucune origine loopback ne couvre. Sans déclaration explicite, la
   * mutation est refusée ; avec `CONSOLE_DEV_LAN_ORIGIN`, cette origine-là
   * passe, et elle seule.
   */
  test("accepts a LAN origin only when CONSOLE_DEV_LAN_ORIGIN declares it", () => {
    const mutationFrom = (origin: string) =>
      new Request("http://192.168.1.57:3170/api/runtime", {
        method: "PUT",
        headers: { origin, "sec-fetch-site": "same-site" },
      });
    const previous = process.env.CONSOLE_DEV_LAN_ORIGIN;

    try {
      delete process.env.CONSOLE_DEV_LAN_ORIGIN;
      expect(() => assertSameOriginMutation(mutationFrom("http://192.168.1.57:1470"))).toThrow(
        "Origine de requête refusée",
      );

      process.env.CONSOLE_DEV_LAN_ORIGIN = "http://192.168.1.57:1470";
      expect(() =>
        assertSameOriginMutation(mutationFrom("http://192.168.1.57:1470")),
      ).not.toThrow();
      // Déclarer une origine LAN n'ouvre pas le réseau entier.
      expect(() => assertSameOriginMutation(mutationFrom("http://192.168.1.99:1470"))).toThrow(
        "Origine de requête refusée",
      );
    } finally {
      if (previous === undefined) delete process.env.CONSOLE_DEV_LAN_ORIGIN;
      else process.env.CONSOLE_DEV_LAN_ORIGIN = previous;
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
