import { describe, expect, test } from "bun:test";
import { isSessionCommandMessage, parseSessionCommand } from "@/modules/session/commands";
import { getRequiredConnectors } from "@/modules/connectors/requirements";

describe("parseSessionCommand", () => {
  test("parses agent show", () => {
    expect(parseSessionCommand("/agent show")).toEqual({ kind: "agent_show" });
  });

  test("parses agent create", () => {
    expect(parseSessionCommand("/agent create Brief | Tu es un analyste.")).toEqual({
      kind: "agent_create",
      name: "Brief",
      instructions: "Tu es un analyste.",
    });
  });

  test("parses agent edit", () => {
    expect(parseSessionCommand("/agent edit model=hermes-agent")).toEqual({
      kind: "agent_edit",
      field: "model",
      value: "hermes-agent",
    });
  });

  test("parses model command", () => {
    expect(parseSessionCommand("/model gpt-5")).toEqual({ kind: "model", model: "gpt-5" });
  });
});

describe("isSessionCommandMessage", () => {
  test("detects slash commands", () => {
    expect(isSessionCommandMessage("/agent show")).toBe(true);
    expect(isSessionCommandMessage("hello")).toBe(false);
  });
});

describe("getRequiredConnectors", () => {
  test("flags email triage agents", () => {
    const required = getRequiredConnectors({
      slug: "email-triage",
      name: "Email Triage",
      instructions: "Trie les mails Gmail via IMAP.",
    });
    expect(required).toContain("gmail_imap");
  });
});
