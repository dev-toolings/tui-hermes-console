"use client";

import { Link } from "@/lib/router";
import { PlusIcon } from "lucide-react";

/** Empty `/chat` — OpenClaw cold boot until a session is selected. */
export function OpenClawChatHome() {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-[image:var(--gradient-primary)] text-xl font-bold text-primary-foreground">
        H
      </div>
      <h1 className="text-xl font-semibold tracking-tight">Chat</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Select a thread in the sidebar, or start a new session. Slash commands work inside a
        session (<code className="rounded bg-muted px-1">/model</code>). Configure reusable
        agents from the <Link href="/agents" className="font-semibold hover:underline">Agents</Link> workspace.
      </p>
      <Link
        href="/chat/new"
        className="mt-6 inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        <PlusIcon className="size-4" />
        New session
      </Link>
    </div>
  );
}
