import { describe, expect, test } from "bun:test";
import {
  attachInternalRuntimeConfigurationVersion,
  databaseRevisionFromRuntimeVersion,
  databaseRuntimeConfigurationVersion,
  environmentRuntimeConfigurationVersion,
} from "./config";

describe("runtime configuration version", () => {
  test("round-trips a positive database revision", () => {
    const version = databaseRuntimeConfigurationVersion(7);
    expect(version).toBe("database:7");
    expect(databaseRevisionFromRuntimeVersion(version)).toBe(7);
    expect(
      databaseRevisionFromRuntimeVersion("environment:abc"),
    ).toBeNull();
  });

  test("fingerprints env configuration without exposing its token", () => {
    const first = environmentRuntimeConfigurationVersion(
      "http://127.0.0.1:8642/",
      "top-secret-token",
      "server-secret-a",
    );
    expect(first?.startsWith("environment:")).toBe(true);
    expect(first).not.toContain("top-secret-token");
    expect(
      environmentRuntimeConfigurationVersion(
        "http://127.0.0.1:8642",
        "top-secret-token",
        "server-secret-a",
      ),
    ).toBe(first);

    expect(
      environmentRuntimeConfigurationVersion(
        "http://127.0.0.1:8642",
        "changed-token",
        "server-secret-a",
      ),
    ).not.toBe(first);
    expect(
      environmentRuntimeConfigurationVersion(
        "http://127.0.0.1:9999",
        "top-secret-token",
        "server-secret-a",
      ),
    ).not.toBe(first);
    expect(
      environmentRuntimeConfigurationVersion(
        "http://127.0.0.1:8642",
        "top-secret-token",
        "server-secret-b",
      ),
    ).not.toBe(first);
  });

  test("fails closed when the server HMAC secret is absent", () => {
    expect(() =>
      environmentRuntimeConfigurationVersion(
        "http://127.0.0.1:8642",
        "top-secret-token",
        "",
      ),
    ).toThrow("APP_ENCRYPTION_KEY manquant");
  });

  test("keeps the proof readable by the CAS but absent from public JSON", () => {
    const result = attachInternalRuntimeConfigurationVersion(
      { ok: true, runtime: { configured: true } },
      "environment:opaque-proof",
    );
    expect(result.configurationVersion).toBe("environment:opaque-proof");
    expect(JSON.stringify(result)).toBe(
      '{"ok":true,"runtime":{"configured":true}}',
    );
  });
});
