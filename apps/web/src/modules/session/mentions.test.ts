import { describe, expect, test } from "bun:test";
import { isAgentMentionMessage, parseAgentMention } from "@/modules/session/mentions";

describe("parseAgentMention", () => {
  test("parses a mention followed by an instruction", () => {
    expect(parseAgentMention("@audit-seo analyse la home")).toEqual({
      ref: "audit-seo",
      prompt: "analyse la home",
    });
  });

  test("keeps multi-line instructions", () => {
    expect(parseAgentMention("@audit-seo analyse la home\net le blog")).toEqual({
      ref: "audit-seo",
      prompt: "analyse la home\net le blog",
    });
  });

  test("parses a mention with no instruction", () => {
    expect(parseAgentMention("@audit-seo")).toEqual({ ref: "audit-seo", prompt: "" });
    expect(parseAgentMention("  @audit-seo   ")).toEqual({ ref: "audit-seo", prompt: "" });
  });

  test("ignores a mention that is not leading", () => {
    expect(parseAgentMention("merci @audit-seo")).toBeNull();
  });

  test("ignores a bare @ and invalid slugs", () => {
    expect(parseAgentMention("@")).toBeNull();
    expect(parseAgentMention("@ audit-seo")).toBeNull();
    expect(parseAgentMention("@-audit")).toBeNull();
  });

  test("accepts ids and names used as refs", () => {
    expect(parseAgentMention("@agent_hermes_runtime ping")).toEqual({
      ref: "agent_hermes_runtime",
      prompt: "ping",
    });
  });
});

describe("isAgentMentionMessage", () => {
  test("catches mentions even without an instruction", () => {
    expect(isAgentMentionMessage("@audit-seo")).toBe(true);
    expect(isAgentMentionMessage("@audit-seo go")).toBe(true);
    expect(isAgentMentionMessage("bonjour")).toBe(false);
    expect(isAgentMentionMessage("/model gpt-5")).toBe(false);
  });
});
