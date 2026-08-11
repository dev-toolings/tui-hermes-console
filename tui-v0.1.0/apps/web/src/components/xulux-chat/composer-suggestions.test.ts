import { describe, expect, test } from "bun:test";
import {
  agentMentionFormatter,
  commandSuggestionFormatter,
  getSessionCommandSuggestions,
} from "./composer-suggestions";

describe("existing-thread composer suggestions", () => {
  test("chat exposes creation without agent attachment commands", () => {
    const ids = getSessionCommandSuggestions("chat").map((command) => command.id);

    expect(ids).toContain("agent-create");
    expect(ids).not.toContain("agent-show");
    expect(ids).not.toContain("agent-edit");
    expect(ids).not.toContain("agent-switch");
  });

  test("mission exposes the complete agent command set", () => {
    const ids = getSessionCommandSuggestions("mission").map((command) => command.id);

    expect(ids).toEqual(expect.arrayContaining([
      "agent-create",
      "agent-show",
      "agent-edit",
      "agent-switch",
    ]));
  });

  test("agent selection inserts the slug understood by the send path", () => {
    expect(agentMentionFormatter.serialize({
      id: "agent-ux-synthetique",
      type: "agent",
      label: "Agent UX synthétique",
    })).toBe("@agent-ux-synthetique");
  });

  test("slash selection inserts an executable command template", () => {
    expect(commandSuggestionFormatter.serialize({
      id: "agent-create",
      type: "command",
      label: "/agent create",
    })).toBe("/agent create Nom | instructions");
  });
});
