import { describe, expect, test } from "bun:test";
import { requireDurableRemoteWorkdir } from "./config";

function errorCode(value: string | undefined) {
  try {
    requireDurableRemoteWorkdir(value);
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? null;
  }
}

describe("SSH remote workdir", () => {
  test("requires an explicit absolute workdir", () => {
    expect(errorCode(undefined)).toBe("SSH_WORKDIR_REQUIRED");
    expect(errorCode("relative/workdir")).toBe("SSH_WORKDIR_INVALID");
    expect(requireDurableRemoteWorkdir(" /srv/hermes-console/workdir/ ")).toBe(
      "/srv/hermes-console/workdir",
    );
  });

  test("rejects known transient roots instead of falling back to them", () => {
    for (const root of ["/tmp/hermes-console-work", "/var/tmp/hermes", "/run/hermes", "/dev/shm/hermes"]) {
      expect(errorCode(root)).toBe("SSH_WORKDIR_NOT_DURABLE");
    }
  });

  test("normalizes traversal before applying the durability guard", () => {
    expect(errorCode("/srv/../tmp/hermes")).toBe("SSH_WORKDIR_NOT_DURABLE");
  });
});
