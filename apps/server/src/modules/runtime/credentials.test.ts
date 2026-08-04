import { describe, expect, test } from "bun:test";
import {
  parseRemoteCredentialInspection,
  sanitizeRemoteCommandFailure,
} from "./credentials";

describe("remote credential adapter detection", () => {
  test("recognizes a managed Docker runtime and its token state", () => {
    expect(
      parseRemoteCredentialInspection(
        "adapter=docker\nmanager=docker\nservice=\nconfig_present=no\nmanaged=yes\ntoken_present=yes\n",
      ),
    ).toEqual({
      adapter: "docker",
      manager: "docker",
      service: null,
      configPresent: false,
      managed: true,
      tokenPresent: true,
    });
  });

  test("recognizes a native systemd runtime without inventing a service", () => {
    expect(
      parseRemoteCredentialInspection(
        "adapter=native_systemd\nmanager=systemd-user\nservice=\nconfig_present=yes\nmanaged=no\ntoken_present=no\n",
      ),
    ).toEqual({
      adapter: "native_systemd",
      manager: "systemd-user",
      service: null,
      configPresent: true,
      managed: false,
      tokenPresent: false,
    });
  });

  test("fails closed for unknown adapter output", () => {
    expect(
      parseRemoteCredentialInspection(
        "adapter=surprise\nmanager=launchd\nservice=custom.service\nconfig_present=yes\nmanaged=yes\ntoken_present=yes\n",
      ),
    ).toEqual({
      adapter: "unknown",
      manager: "unknown",
      service: "custom.service",
      configPresent: true,
      managed: true,
      tokenPresent: true,
    });
  });

  test("keeps remote failure diagnostics useful without exposing credentials", () => {
    expect(
      sanitizeRemoteCommandFailure(
        "docker: Error response from daemon\nAPI_SERVER_KEY=super-secret-value\n",
      ),
    ).toBe("API_SERVER_KEY=[redacted]");
    expect(sanitizeRemoteCommandFailure("")).toBe("la commande distante a échoué sans diagnostic");
  });
});
