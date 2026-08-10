import { afterEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { setPersonaCapabilities, setPersonaRole } from "@/lib/persona-capabilities";
import { InboxScreen, inboxHeading } from "./inbox";

afterEach(() => {
  setPersonaCapabilities();
  setPersonaRole(null);
});

describe("InboxScreen", () => {
  test("renders the shared empty header without personal wording", () => {
    const html = renderToStaticMarkup(<InboxScreen data={{ tasks: [], page: { hasMore: false, nextCursor: null }, missions: [], missionPage: { hasMore: false, nextCursor: null }, degraded: false }} />);

    expect(html).toContain("File à jour");
    expect(html).not.toContain("votre signature");
    expect(html).not.toContain("en attente de vous");
    expect(html).not.toContain("Rien ne vous attend");
  });

  test("uses a shared action count for a non-empty header", () => {
    expect(inboxHeading(2)).toBe("2 actions à traiter");
  });

  test("shows the next-page control even when this page projects no visible item", () => {
    const html = renderToStaticMarkup(<InboxScreen data={{
      tasks: [{ id: "task_1", title: "Terminée", status: "completed", projectName: "Projet", currentRevision: null, latestAttempt: null, decisions: [], updatedAt: "2026-08-09T10:00:00.000Z" }],
      page: { hasMore: true, nextCursor: "next" }, missions: [], missionPage: { hasMore: false, nextCursor: null }, degraded: false,
    }} />);
    expect(html).toContain("Charger la suite");
    expect(html).toContain("Cette page ne contient aucun élément visible");
    expect(html).not.toContain("Toutes les actions actives sont décidées ou reprises");
  });

  test("uses the mission cursor when the task page is exhausted", () => {
    const html = renderToStaticMarkup(<InboxScreen data={{
      tasks: [], page: { hasMore: false, nextCursor: null }, missions: [],
      missionPage: { hasMore: true, nextCursor: "mission-next" }, degraded: false,
    }} />);
    expect(html).toContain("Cette page ne contient aucun élément visible");
    expect(html).toContain("Charger la suite");
    expect(html).not.toContain('disabled=""');
  });
});
