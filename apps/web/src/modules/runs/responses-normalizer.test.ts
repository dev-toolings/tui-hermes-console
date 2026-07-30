import { describe, expect, test } from "bun:test";
import { HermesResponsesNormalizer } from "./responses-normalizer";

describe("HermesResponsesNormalizer", () => {
  test("préserve l’ordre texte, outil, résultat et terminaison", () => {
    const normalizer = new HermesResponsesNormalizer();
    const events = [
      ...normalizer.push({
        event: "response.output_text.delta",
        data: { type: "response.output_text.delta", delta: "Je vérifie. " },
      }),
      ...normalizer.push({
        event: "response.output_item.added",
        data: {
          type: "response.output_item.added",
          item: {
            type: "function_call",
            call_id: "call_1",
            name: "read_file",
            arguments: "{\"path\":\"notes.txt\"}",
          },
        },
      }),
      ...normalizer.push({
        event: "response.output_item.added",
        data: {
          type: "response.output_item.added",
          item: {
            type: "function_call_output",
            call_id: "call_1",
            output: [{ type: "output_text", text: "42" }],
          },
        },
      }),
      ...normalizer.push({
        event: "response.completed",
        data: {
          type: "response.completed",
          response: {
            id: "resp_1",
            output: [
              {
                type: "message",
                content: [{ type: "output_text", text: "Le total est 42." }],
              },
            ],
            usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
          },
        },
      }),
    ];

    expect(events.map((event) => event.type)).toEqual([
      "agent.message",
      "tool.call",
      "tool.result",
      "run.completed",
    ]);
    expect(events.map((event) => event.sequence)).toEqual([0, 1, 2, 3]);
    expect(events[2]?.payload.result).toBe("42");
    expect(events[3]?.payload).toMatchObject({
      responseId: "resp_1",
      output: "Le total est 42.",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });
  });

  test("coalesce le reasoning summary avant le texte", () => {
    const normalizer = new HermesResponsesNormalizer();
    const events = [
      ...normalizer.push({
        event: "response.reasoning_summary_text.delta",
        data: { type: "response.reasoning_summary_text.delta", delta: "Je " },
      }),
      ...normalizer.push({
        event: "response.reasoning_summary_text.delta",
        data: { type: "response.reasoning_summary_text.delta", delta: "réfléchis." },
      }),
      ...normalizer.push({
        event: "response.output_text.delta",
        data: { type: "response.output_text.delta", delta: "Voici." },
      }),
      ...normalizer.flush(),
    ];

    expect(events.map((event) => event.type)).toEqual([
      "agent.reasoning",
      "agent.message",
    ]);
    expect(events[0]?.payload.text).toBe("Je réfléchis.");
    expect(events[1]?.payload.text).toBe("Voici.");
  });

  test("extrait le reasoning depuis response.completed.output", () => {
    const normalizer = new HermesResponsesNormalizer();
    const events = normalizer.push({
      event: "response.completed",
      data: {
        type: "response.completed",
        response: {
          id: "resp_reason",
          output: [
            {
              type: "reasoning",
              summary: [{ type: "summary_text", text: "Analyse du problème." }],
            },
            {
              type: "message",
              content: [{ type: "output_text", text: "La réponse finale." }],
            },
          ],
          usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
        },
      },
    });

    expect(events.map((event) => event.type)).toEqual([
      "agent.reasoning",
      "run.completed",
    ]);
    expect(events[0]?.payload.text).toBe("Analyse du problème.");
    expect(events[1]?.payload.output).toBe("La réponse finale.");
  });
});
