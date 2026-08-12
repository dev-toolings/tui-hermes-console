// @ts-expect-error Bun test types are not part of the application build.
import { describe, expect, test } from "bun:test";
import { buildThreadSummaries, formatLastReply, initialsOf } from "./thread-summary";
import type { SlackChannelMessage } from "./types";

function message(patch: Partial<SlackChannelMessage> & { id: string }): SlackChannelMessage {
  return {
    channelId: "produit",
    author: "Marie Dupont",
    body: "",
    createdAt: "2026-08-11T10:00:00.000Z",
    ...patch,
  };
}

describe("thread summaries", () => {
  test("folds replies onto their parent and ignores root messages", () => {
    const summaries = buildThreadSummaries([
      message({ id: "root" }),
      message({ id: "other-root" }),
      message({ id: "r1", parentMessageId: "root", author: "Kevin Tourteau" }),
      message({ id: "r2", parentMessageId: "root", author: "Sam Ito" }),
    ]);

    expect(summaries.has("other-root")).toBe(false);
    expect(summaries.get("root")).toEqual({
      count: 2,
      authors: ["Kevin Tourteau", "Sam Ito"],
      lastReplyAt: "2026-08-11T10:00:00.000Z",
    });
  });

  test("counts every reply but lists each replier once, in first-reply order", () => {
    const summaries = buildThreadSummaries([
      message({ id: "r1", parentMessageId: "root", author: "Sam Ito" }),
      message({ id: "r2", parentMessageId: "root", author: "Kevin Tourteau" }),
      message({ id: "r3", parentMessageId: "root", author: "Sam Ito" }),
    ]);

    expect(summaries.get("root")?.count).toBe(3);
    expect(summaries.get("root")?.authors).toEqual(["Sam Ito", "Kevin Tourteau"]);
  });

  test("keeps the latest reply even when the replies arrive out of order", () => {
    const summaries = buildThreadSummaries([
      message({ id: "r1", parentMessageId: "root", createdAt: "2026-08-11T12:00:00.000Z" }),
      message({ id: "r2", parentMessageId: "root", createdAt: "2026-08-11T09:00:00.000Z" }),
    ]);

    expect(summaries.get("root")?.lastReplyAt).toBe("2026-08-11T12:00:00.000Z");
  });

  test("never lets an unparsable date shadow a real last reply", () => {
    const summaries = buildThreadSummaries([
      message({ id: "r1", parentMessageId: "root", createdAt: "2026-08-11T12:00:00.000Z" }),
      message({ id: "r2", parentMessageId: "root", createdAt: "pas une date" }),
    ]);

    expect(summaries.get("root")?.lastReplyAt).toBe("2026-08-11T12:00:00.000Z");
  });

  test("separates threads that belong to different parents", () => {
    const summaries = buildThreadSummaries([
      message({ id: "a1", parentMessageId: "alpha" }),
      message({ id: "b1", parentMessageId: "beta" }),
      message({ id: "b2", parentMessageId: "beta" }),
    ]);

    expect(summaries.get("alpha")?.count).toBe(1);
    expect(summaries.get("beta")?.count).toBe(2);
  });
});

describe("last reply copy", () => {
  const now = new Date("2026-08-11T12:00:00.000Z").getTime();

  test("collapses the first minute instead of printing a zero", () => {
    expect(formatLastReply("2026-08-11T11:59:30.000Z", now)).toBe("à l’instant");
  });

  test("scales through minutes, hours and days", () => {
    expect(formatLastReply("2026-08-11T11:45:00.000Z", now)).toBe("il y a 15 minutes");
    expect(formatLastReply("2026-08-11T10:00:00.000Z", now)).toBe("il y a 2 heures");
    expect(formatLastReply("2026-08-08T12:00:00.000Z", now)).toBe("il y a 3 jours");
  });

  test("returns nothing for an unparsable date so the caller can drop the line", () => {
    expect(formatLastReply("pas une date", now)).toBe("");
  });
});

describe("author initials", () => {
  test("keeps at most two uppercase initials", () => {
    expect(initialsOf("Kevin Tourteau")).toBe("KT");
    expect(initialsOf("marie")).toBe("M");
    expect(initialsOf("Jean Michel Pierre Dupont")).toBe("JM");
  });
});
