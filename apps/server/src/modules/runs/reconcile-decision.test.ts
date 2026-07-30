import { describe, expect, test } from "bun:test";
import { decideReconcileAction } from "./reconcile-decision";
import { resolveHermesProtocol } from "./protocol";

describe("decideReconcileAction", () => {
  test("completed → complete with output/usage", () => {
    const usage = { inputTokens: 1, outputTokens: 2, totalTokens: 3 };
    expect(
      decideReconcileAction({
        status: "completed",
        output: "ok",
        usage,
      }),
    ).toEqual({ action: "complete", output: "ok", usage });
  });

  test("failed → fail with Hermes output or fallback", () => {
    expect(
      decideReconcileAction({
        status: "failed",
        output: " boom ",
        usage: null,
      }),
    ).toEqual({ action: "fail", message: "boom" });

    expect(
      decideReconcileAction({
        status: "failed",
        output: null,
        usage: null,
      }).action,
    ).toBe("fail");
  });

  test("cancelled → cancel", () => {
    expect(
      decideReconcileAction({
        status: "cancelled",
        output: null,
        usage: null,
      }),
    ).toEqual({ action: "cancel" });
  });

  test("active statuses → resume (including waiting_for_approval)", () => {
    for (const status of [
      "started",
      "running",
      "stopping",
      "waiting_for_approval",
    ] as const) {
      expect(
        decideReconcileAction({ status, output: null, usage: null }),
      ).toEqual({ action: "resume" });
    }
  });
});

describe("resolveHermesProtocol", () => {
  test("defaults to agent", () => {
    expect(resolveHermesProtocol({})).toBe("agent");
    expect(resolveHermesProtocol({ HERMES_PROTOCOL: "" })).toBe("agent");
    expect(resolveHermesProtocol({ HERMES_PROTOCOL: "AGENT" })).toBe("agent");
  });

  test("responses when explicitly set", () => {
    expect(resolveHermesProtocol({ HERMES_PROTOCOL: "responses" })).toBe(
      "responses",
    );
    expect(resolveHermesProtocol({ HERMES_PROTOCOL: " Responses " })).toBe(
      "responses",
    );
  });
});
