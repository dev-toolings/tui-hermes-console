import { expect, test } from "bun:test";
import {
  findLocalOAuthRoutingProblem,
  googleCallbackRequiresLoopback,
} from "./local-oauth-routing";

const CALLBACK = "/api/auth?action=callback";

test("accepts the callback served by the API itself", () => {
  expect(
    findLocalOAuthRoutingProblem(3170, {
      GOOGLE_REDIRECT_URI: `http://127.0.0.1:3170${CALLBACK}`,
      CONSOLE_APP_ORIGIN: "http://127.0.0.1:1470",
      CONSOLE_WEB_PORT: "1470",
    }),
  ).toBeNull();
});

test("accepts the callback proxied by the Vite dev server", () => {
  expect(
    findLocalOAuthRoutingProblem(3170, {
      GOOGLE_REDIRECT_URI: `http://127.0.0.1:1470${CALLBACK}`,
      CONSOLE_APP_ORIGIN: "http://127.0.0.1:1470",
      CONSOLE_WEB_PORT: "1470",
    }),
  ).toBeNull();
});

test("rejects a callback port nothing in this repository listens on", () => {
  const problem = findLocalOAuthRoutingProblem(3170, {
    GOOGLE_REDIRECT_URI: `http://localhost:1420${CALLBACK}`,
    CONSOLE_APP_ORIGIN: "http://localhost:1420",
    CONSOLE_WEB_PORT: "1470",
  });
  expect(problem?.fields).toMatchObject({ callbackPort: "1420", reachable: "3170 ou 1470" });
});

test("follows the ports overridden for a second local instance", () => {
  const env = { GOOGLE_REDIRECT_URI: `http://127.0.0.1:3171${CALLBACK}`, CONSOLE_WEB_PORT: "1471" };
  expect(findLocalOAuthRoutingProblem(3171, env)).toBeNull();
  expect(findLocalOAuthRoutingProblem(3170, env)?.fields.callbackPort).toBe("3171");
});

test("rejects a callback host the session cookies cannot follow", () => {
  const problem = findLocalOAuthRoutingProblem(3170, {
    GOOGLE_REDIRECT_URI: `http://localhost:3170${CALLBACK}`,
    CONSOLE_APP_ORIGIN: "http://127.0.0.1:1470",
    CONSOLE_WEB_PORT: "1470",
  });
  expect(problem?.fields).toMatchObject({ callbackHost: "localhost", appOriginHost: "127.0.0.1" });
});

test("stays silent outside a local plaintext deployment", () => {
  // Production derrière un domaine public, et sidecar Tauri : le port du
  // callback et l'hôte du SPA ne sont plus comparables à ceux du process.
  expect(
    findLocalOAuthRoutingProblem(3170, {
      GOOGLE_REDIRECT_URI: `https://console.example.com${CALLBACK}`,
      CONSOLE_APP_ORIGIN: "https://console.example.com",
    }),
  ).toBeNull();
  expect(
    findLocalOAuthRoutingProblem(3170, {
      GOOGLE_REDIRECT_URI: `http://127.0.0.1:3170${CALLBACK}`,
      CONSOLE_APP_ORIGIN: "tauri://localhost",
    }),
  ).toBeNull();
});

test("stays silent while Google authentication is still unconfigured", () => {
  expect(findLocalOAuthRoutingProblem(3170, { GOOGLE_REDIRECT_URI: "" })).toBeNull();
  expect(findLocalOAuthRoutingProblem(3170, {})).toBeNull();
  expect(findLocalOAuthRoutingProblem(3170, { GOOGLE_REDIRECT_URI: "pas-une-url" })).toBeNull();
});

test("reports a loopback callback so the SPA can hide a dead end", () => {
  // Développement : le retour de Google ne peut viser que cette machine.
  expect(
    googleCallbackRequiresLoopback({
      GOOGLE_REDIRECT_URI: `http://127.0.0.1:3170${CALLBACK}`,
    }),
  ).toBe(true);
  expect(
    googleCallbackRequiresLoopback({
      GOOGLE_REDIRECT_URI: `http://localhost:1470${CALLBACK}`,
    }),
  ).toBe(true);
});

test("leaves Google alone outside a local callback", () => {
  // Production, et configuration absente : le bouton doit rester cliquable.
  expect(
    googleCallbackRequiresLoopback({
      GOOGLE_REDIRECT_URI: `https://console.example.com${CALLBACK}`,
    }),
  ).toBe(false);
  expect(googleCallbackRequiresLoopback({ GOOGLE_REDIRECT_URI: "" })).toBe(false);
  expect(googleCallbackRequiresLoopback({})).toBe(false);
});
