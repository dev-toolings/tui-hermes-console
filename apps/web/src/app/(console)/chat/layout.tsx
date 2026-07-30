import type { ReactNode } from "react";
import { ChatSurfaceFrame } from "@/components/chat/openclaw-shell";

/**
 * Layout de la surface chat : il possède la coque (sidebar + colonne), donc
 * naviguer entre `/chat`, `/chat/new` et `/chat/:id` ne remonte que la page.
 */
export default function ChatLayout({ children }: { children: ReactNode }) {
  return <ChatSurfaceFrame>{children}</ChatSurfaceFrame>;
}
