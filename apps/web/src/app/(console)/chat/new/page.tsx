import { ChatPane } from "@/components/chat/openclaw-shell";
import { OpenClawNewSessionDraft } from "@/components/chat/openclaw-new-draft";

export default function ChatNewPage() {
  return (
    <ChatPane title="New session">
      <OpenClawNewSessionDraft />
    </ChatPane>
  );
}
