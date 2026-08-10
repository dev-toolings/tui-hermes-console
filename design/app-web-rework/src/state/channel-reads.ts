import { useEffect, useState } from "react";

/**
 * Per-workspace read markers for channels, persisted in this browser.
 * Shared by the desktop sidebar and the mobile channel list so both surfaces
 * agree on what counts as unread.
 */
export function readCountsStorageKey(workspaceId: string) {
  return `hermes-channel-read-counts:${workspaceId}`;
}

function loadReadCounts(workspaceId: string): Record<string, number> {
  try {
    const value = window.localStorage.getItem(readCountsStorageKey(workspaceId));
    if (!value) return {};
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, count]) => typeof count === "number" && count >= 0,
      ),
    ) as Record<string, number>;
  } catch {
    return {};
  }
}

export function useChannelReadCounts(
  workspaceId: string,
  channelMessageCounts: Record<string, number>,
  activeChannelId: string | null,
) {
  const [readCounts, setReadCounts] = useState<Record<string, number>>(() =>
    loadReadCounts(workspaceId),
  );
  const activeMessageCount = activeChannelId
    ? channelMessageCounts[activeChannelId] ?? 0
    : 0;

  const persist = (next: Record<string, number>) => {
    setReadCounts(next);
    try {
      window.localStorage.setItem(
        readCountsStorageKey(workspaceId),
        JSON.stringify(next),
      );
    } catch {
      /* Read markers stay available for the current session. */
    }
  };

  const markRead = (channelId: string) =>
    persist({
      ...readCounts,
      [channelId]: channelMessageCounts[channelId] ?? 0,
    });

  useEffect(() => {
    if (!activeChannelId || readCounts[activeChannelId] === activeMessageCount)
      return;
    persist({ ...readCounts, [activeChannelId]: activeMessageCount });
  }, [activeChannelId, activeMessageCount]);

  const unreadFor = (channelId: string) =>
    Math.max(
      0,
      (channelMessageCounts[channelId] ?? 0) - (readCounts[channelId] ?? 0),
    );

  return { unreadFor, markRead };
}
