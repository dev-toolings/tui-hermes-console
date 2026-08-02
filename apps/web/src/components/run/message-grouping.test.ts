import { describe, expect, test } from "bun:test";
import { hermesMessageGroupBy } from "./message-grouping";

describe("hermesMessageGroupBy", () => {
  test("sépare reasoning et tool-call dans deux groupes racine", () => {
    expect(
      hermesMessageGroupBy({
        type: "reasoning",
        text: "Résumé de raisonnement",
        status: { type: "complete" },
      } as never),
    ).toEqual(["group-reasoning"]);

    expect(
      hermesMessageGroupBy({
        type: "tool-call",
        toolCallId: "call_1",
        toolName: "terminal",
        args: {},
        argsText: "{}",
        status: { type: "complete" },
      } as never),
    ).toEqual(["group-tool"]);
  });
});
