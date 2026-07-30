import { OpenClawChatShell } from "@/components/chat/openclaw-shell";
import { OpenClawNewSessionDraft } from "@/components/chat/openclaw-new-draft";

export default function ChatNewPage() {
  return (
    <OpenClawChatShell title="New session" draft>
      <OpenClawNewSessionDraft />
    </OpenClawChatShell>
  );
}
