import { describe, expect, test } from "bun:test";
import {
  findMentionQuery,
  isAgentMentionMessage,
  parseAgentMention,
} from "./mentions";

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

describe("findMentionQuery", () => {
  test("opens on a bare @", () => {
    expect(findMentionQuery("@", 1)).toEqual({ start: 0, end: 1, query: "" });
  });

  test("captures what is typed after the @", () => {
    expect(findMentionQuery("@au", 3)).toEqual({ start: 0, end: 3, query: "au" });
  });

  test("matches anywhere as long as the @ opens a word", () => {
    expect(findMentionQuery("merci @au", 9)).toEqual({ start: 6, end: 9, query: "au" });
    expect(findMentionQuery("ligne\n@au", 9)).toEqual({ start: 6, end: 9, query: "au" });
  });

  test("spans the whole token when the caret sits inside it", () => {
    expect(findMentionQuery("@audit-seo", 3)).toEqual({ start: 0, end: 10, query: "au" });
  });

  test("ignores an @ glued to a previous word", () => {
    expect(findMentionQuery("kevin@kweli", 11)).toBeNull();
  });

  test("closes once the token is left behind", () => {
    expect(findMentionQuery("@audit-seo go", 13)).toBeNull();
    expect(findMentionQuery("@audit-seo ", 11)).toBeNull();
  });

  test("ignores text after the caret", () => {
    expect(findMentionQuery("@audit-seo", 0)).toBeNull();
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
