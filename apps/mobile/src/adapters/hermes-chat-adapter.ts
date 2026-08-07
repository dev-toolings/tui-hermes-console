import type { ChatModelAdapter, ThreadMessage } from "@assistant-ui/react-native";

import { ConsoleApiClient } from "@/lib/api-client";

function textOf(message: ThreadMessage) {
  return message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n").trim();
}

const terminal = new Set(["completed", "failed", "cancelled"]);

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new Error("Mission interrompue."));
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function createHermesChatAdapter(client: ConsoleApiClient): ChatModelAdapter {
  let threadId: string | null = null;
  return {
    async *run({ messages, abortSignal }) {
      const prompt = textOf(messages.at(-1)!);
      if (!prompt) throw new Error("La demande est vide.");
      const started = threadId
        ? await client.sendMessage(threadId, prompt)
        : await client.createThread(prompt);
      if (!threadId && "threadId" in started && typeof started.threadId === "string") {
        threadId = started.threadId;
      }
      if (!threadId) throw new Error("La Console n’a pas retourné de conversation.");

      let previous = "";
      while (!abortSignal.aborted) {
        const { thread } = await client.thread(threadId);
        const run = thread.runs.find((candidate) => candidate.id === started.runId);
        const output = run?.output?.trim() ?? "";
        if (output && output !== previous) {
          previous = output;
          yield { content: [{ type: "text", text: output }] };
        }
        if (run && terminal.has(run.status)) {
          if (run.status === "failed") throw new Error(run.error ?? "La mission a échoué.");
          if (!output) yield { content: [{ type: "text", text: run.status === "cancelled" ? "Mission annulée." : "Mission terminée sans réponse textuelle." }] };
          return;
        }
        await wait(900, abortSignal);
      }
    },
  };
}
