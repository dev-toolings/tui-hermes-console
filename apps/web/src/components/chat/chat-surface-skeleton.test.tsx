import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatSurfaceSkeleton } from "./chat-surface-skeleton";

describe("ChatSurfaceSkeleton", () => {
  test("keeps the chat home final while only thread rows are loading", () => {
    const html = renderToStaticMarkup(
      <ChatSurfaceSkeleton home={<p>État vide final</p>} />,
    );

    expect(html).toContain('data-slot="chat-home-fallback"');
    expect(html).toContain('data-slot="chat-sidebar-thread-skeleton"');
    expect(html).toContain('data-slot="chat-sidebar-new"');
    expect(html).toContain("New</span>");
    expect(html).toContain("État vide final");
    expect(html).not.toContain('data-slot="chat-conversation-skeleton"');
  });

  test("keeps the conversation skeleton for a session route", () => {
    const html = renderToStaticMarkup(<ChatSurfaceSkeleton />);

    expect(html).toContain('data-slot="chat-conversation-skeleton"');
    expect(html).not.toContain('data-slot="chat-home-fallback"');
  });
});
