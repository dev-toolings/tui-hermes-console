import type { SlackChannelMessage } from "./types";

export type ThreadSummary = {
  count: number;
  /** Distinct repliers in first-reply order, which is the facepile order. */
  authors: string[];
  lastReplyAt: string;
};

export function initialsOf(author: string) {
  return author
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Replies are stored flat next to their parent, so the channel timeline has to
 * fold them back into one entry per thread to render the indicator Slack shows
 * under the parent message.
 */
export function buildThreadSummaries(
  messages: readonly SlackChannelMessage[],
): Map<string, ThreadSummary> {
  const summaries = new Map<string, ThreadSummary>();
  for (const message of messages) {
    const parentId = message.parentMessageId;
    if (!parentId) continue;
    const summary = summaries.get(parentId);
    if (!summary) {
      summaries.set(parentId, {
        count: 1,
        authors: [message.author],
        lastReplyAt: message.createdAt,
      });
      continue;
    }
    summary.count += 1;
    if (!summary.authors.includes(message.author)) {
      summary.authors.push(message.author);
    }
    if (isAfter(message.createdAt, summary.lastReplyAt)) {
      summary.lastReplyAt = message.createdAt;
    }
  }
  return summaries;
}

/** An unparsable date never wins, so a bad record cannot hide a real last reply. */
function isAfter(candidate: string, current: string) {
  const candidateTime = new Date(candidate).getTime();
  const currentTime = new Date(current).getTime();
  if (Number.isNaN(candidateTime)) return false;
  if (Number.isNaN(currentTime)) return true;
  return candidateTime > currentTime;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const relativeFormat = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });

/**
 * `now` is injected rather than read from the clock so the copy is testable and
 * so a re-render mid-minute cannot produce two different labels for one thread.
 */
export function formatLastReply(value: string, now: number) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "";
  const elapsed = now - time;
  if (elapsed < MINUTE) return "à l’instant";
  if (elapsed < HOUR) return relativeFormat.format(-Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return relativeFormat.format(-Math.floor(elapsed / HOUR), "hour");
  return relativeFormat.format(-Math.floor(elapsed / DAY), "day");
}
