import { describe, expect, mock, test } from "bun:test";
import { POST as createThread } from "@/api/threads/route";
import { POST as createMessage } from "@/api/threads/[threadId]/messages/route";
import { POST as retryRun } from "@/api/runs/[runId]/retry/route";
import {
  aiDisclosureRequiredResponse,
  withCurrentAiDisclosureConsent,
} from "./ai-disclosure";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";

type ConsentGuard = typeof withCurrentAiDisclosureConsent;

function blockedDependencies() {
  const withConsent = mock(async () => aiDisclosureRequiredResponse());
  return {
    withConsent: withConsent as unknown as ConsentGuard,
    invocation: withConsent,
  };
}

function untouchedContext<T extends Record<string, string>>() {
  const context = {
    siteContext: {
      siteId: "paris",
      userId: "usr",
      role: "operator" as const,
      correlationId: "req",
    },
  };
  return Object.defineProperty(context, "params", {
    get() {
      throw new Error("Les paramètres ne doivent pas être lus avant le consentement.");
    },
  }) as AuthenticatedRouteContext<T>;
}

describe("handler consent fallback after the mounted setup boundary", () => {
  test("blocks initial thread creation before parsing or persistence", async () => {
    const blocked = blockedDependencies();
    const response = await createThread(
      new Request("http://console.test/api/threads", {
        method: "POST",
        body: "not-json",
      }),
      untouchedContext(),
      blocked,
    );
    expect(response.status).toBe(428);
    expect(blocked.invocation).toHaveBeenCalledTimes(1);
  });

  test("blocks a new message before params, body, files or run creation", async () => {
    const blocked = blockedDependencies();
    const response = await createMessage(
      new Request("http://console.test/api/threads/thr_1/messages", {
        method: "POST",
        body: "not-json",
      }),
      untouchedContext<{ threadId: string }>(),
      blocked,
    );
    expect(response.status).toBe(428);
    expect(blocked.invocation).toHaveBeenCalledTimes(1);
  });

  test("blocks retry before resolving the source run", async () => {
    const blocked = blockedDependencies();
    const response = await retryRun(
      new Request("http://console.test/api/runs/run_1/retry", {
        method: "POST",
      }),
      untouchedContext<{ runId: string }>(),
      blocked,
    );
    expect(response.status).toBe(428);
    expect(blocked.invocation).toHaveBeenCalledTimes(1);
  });
});
