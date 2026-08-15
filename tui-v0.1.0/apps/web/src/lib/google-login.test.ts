import { describe, expect, test } from "bun:test";
import { googleLoginReachable, isLoopbackHostname } from "./google-login";

describe("google login reachability", () => {
  test("keeps Google available whenever the callback is not loopback", () => {
    // Production : le callback est un domaine en HTTPS, l'origine aussi.
    expect(googleLoginReachable(false, "console.exemple.com")).toBe(true);
    expect(googleLoginReachable(undefined, "console.exemple.com")).toBe(true);
  });

  test("keeps Google available on the machine that serves the Console", () => {
    expect(googleLoginReachable(true, "127.0.0.1")).toBe(true);
    expect(googleLoginReachable(true, "localhost")).toBe(true);
    expect(googleLoginReachable(true, "[::1]")).toBe(true);
  });

  test("marks Google unreachable from another device on the network", () => {
    // Le callback loopback désignerait le téléphone ou le Mac, pas l'hôte.
    expect(googleLoginReachable(true, "192.168.1.57")).toBe(false);
    expect(googleLoginReachable(true, "10.0.0.4")).toBe(false);
    expect(googleLoginReachable(true, "hermes.local")).toBe(false);
  });

  test("reads loopback hostnames regardless of case and spacing", () => {
    expect(isLoopbackHostname("LOCALHOST")).toBe(true);
    expect(isLoopbackHostname(" 127.0.0.1 ")).toBe(true);
    expect(isLoopbackHostname("127.0.0.2")).toBe(false);
    expect(isLoopbackHostname("")).toBe(false);
  });
});
