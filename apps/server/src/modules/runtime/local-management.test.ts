import { describe, expect, test } from "bun:test";
import { hermesCliExecutable } from "./local-management";

describe("Hermes CLI executable", () => {
  test("uses an explicit executable for background services with a minimal PATH", () => {
    expect(hermesCliExecutable({ HERMES_CLI_PATH: "/opt/hermes/bin/hermes" })).toBe(
      "/opt/hermes/bin/hermes",
    );
  });

  test("keeps interactive PATH lookup as the default", () => {
    expect(hermesCliExecutable({})).toBe("hermes");
    expect(hermesCliExecutable({ HERMES_CLI_PATH: "  " })).toBe("hermes");
  });
});
