import { describe, expect, test } from "bun:test";
import { buildAssistantContent } from "./repository";

/**
 * Le message persisté est ce que l'utilisateur relit après coup. Une décision
 * d'autorisation visible pendant le run mais absente au rechargement serait pire
 * qu'aucune trace : elle ferait croire à une trace.
 */
describe("buildAssistantContent — trace d’autorisation", () => {
  const call = {
    type: "tool.call",
    payload: { toolCallId: "tc_0", tool: "terminal", preview: "curl | python3" },
  };

  test("rattache la décision à l’appel d’outil qu’elle débloque", () => {
    const content = buildAssistantContent(
      [
        call,
        {
          type: "approval.requested",
          payload: { command: "curl | python3", choices: ["once", "deny"] },
        },
        { type: "approval.responded", payload: { choice: "once", resolved: 1 } },
        {
          type: "tool.result",
          payload: { toolCallId: "tc_0", durationMs: 1400, error: false, hasResultPayload: true, result: "31 29" },
        },
      ],
      "31 29",
    );

    const part = content[0];
    expect(part?.type).toBe("tool-call");
    expect(part?.type === "tool-call" ? part.args.approval : null).toEqual({ choice: "once" });
    // Les arguments d'origine ne sont pas écrasés au passage.
    expect(part?.type === "tool-call" ? part.args.preview : null).toBe("curl | python3");
  });

  test("un refus se trace comme une autorisation", () => {
    const content = buildAssistantContent(
      [call, { type: "approval.responded", payload: { choice: "deny" } }],
      "",
    );
    const part = content[0];
    expect(part?.type === "tool-call" ? part.args.approval : null).toEqual({ choice: "deny" });
  });

  test("sans décision, l’appel ne porte rien", () => {
    const content = buildAssistantContent([call], "");
    const part = content[0];
    expect(part?.type === "tool-call" ? part.args.approval : null).toBeUndefined();
  });

  test("une décision orpheline ne marque aucun outil", () => {
    const content = buildAssistantContent(
      [{ type: "approval.responded", payload: { choice: "once" } }, call],
      "",
    );
    const part = content[0];
    expect(part?.type === "tool-call" ? part.args.approval : null).toBeUndefined();
  });

  test("seul le dernier appel ouvert est marqué", () => {
    const content = buildAssistantContent(
      [
        { type: "tool.call", payload: { toolCallId: "tc_0", tool: "terminal", preview: "date" } },
        { type: "tool.call", payload: { toolCallId: "tc_1", tool: "terminal", preview: "curl | python3" } },
        { type: "approval.responded", payload: { choice: "once" } },
      ],
      "",
    );

    expect(content[0]?.type === "tool-call" ? content[0].args.approval : null).toBeUndefined();
    expect(content[1]?.type === "tool-call" ? content[1].args.approval : null).toEqual({
      choice: "once",
    });
  });
});
