import { describe, expect, test } from "bun:test";
import { hermesCliExecutable, remoteHermesCommand } from "./local-management";

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

describe("remote Hermes command", () => {
  test("executes the Docker Hermes CLI with the runtime user and persistent HOME", () => {
    const command = remoteHermesCommand(
      ["auth", "add", "openai-codex", "--no-browser"],
      { pseudoTerminal: true },
    );

    expect(command).toContain("if docker inspect hermes-console-runtime");
    expect(command).toContain(
      "'docker' 'exec' '-it' '-u' 'hermes' '-e' 'HOME=/opt/data'",
    );
    expect(command).toContain("'/opt/hermes/.venv/bin/hermes' 'auth' 'add'");
    expect(command).toContain("else");
    expect(command).toContain("exec 'hermes' 'auth' 'add'");
  });
});
