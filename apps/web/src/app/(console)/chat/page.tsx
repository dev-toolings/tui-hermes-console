import { OpenClawChatShell } from "@/components/chat/openclaw-shell";
import { OpenClawChatHome } from "@/components/chat/openclaw-chat-home";

export default function ChatPage() {
  return (
    <OpenClawChatShell title="Chat">
      <OpenClawChatHome />
    </OpenClawChatShell>
  );
}
