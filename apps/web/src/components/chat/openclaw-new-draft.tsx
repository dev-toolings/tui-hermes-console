"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpIcon, LoaderCircleIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/** OpenClaw `/new` — draft page; nothing persisted until first send. */
export function OpenClawNewSessionDraft() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const text = message.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const body = (await response.json()) as {
        threadId?: string;
        error?: { message?: string };
      };
      if (!response.ok || !body.threadId) {
        throw new Error(body.error?.message ?? "Could not create session.");
      }
      router.push(`/chat/${body.threadId}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Error.");
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-[image:var(--gradient-primary)] text-xl font-bold text-primary-foreground shadow-sm">
          H
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Ready to chat</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Chat libre — session créée à l’envoi. Les agents se configurent via **Missions**.
        </p>
      </div>

      <div className="w-full max-w-xl">
        <div className="rounded-2xl border border-border bg-background p-3 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.18)]">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            rows={3}
            placeholder="Message…"
            className="max-h-40 min-h-[4.5rem] w-full resize-none bg-transparent px-1 py-1 text-base outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between pt-1">
            <span className="text-[0.6875rem] text-muted-foreground">
              Enter to send · Shift+Enter newline
            </span>
            <button
              type="button"
              disabled={submitting || !message.trim()}
              onClick={() => void send()}
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity",
                (submitting || !message.trim()) && "opacity-40",
              )}
              aria-label="Send"
            >
              {submitting ? (
                <LoaderCircleIcon className="size-4 animate-spin" />
              ) : (
                <ArrowUpIcon className="size-4" strokeWidth={2.25} />
              )}
            </button>
          </div>
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-center text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
