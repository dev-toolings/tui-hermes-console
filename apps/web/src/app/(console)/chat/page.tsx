import { ChatPane } from "@/components/chat/openclaw-shell";
import { OpenClawChatHome } from "@/components/chat/openclaw-chat-home";

export default function ChatPage() {
  return (
    <ChatPane title="Chat">
      <OpenClawChatHome />
    </ChatPane>
  );
}
