// Bun exposes this module at runtime; the project deliberately has no Bun type package.
// @ts-expect-error Bun test types are not part of the application build.
import { describe, expect, test } from "bun:test";
import {
  MOBILE_TAB_ENTRIES,
  mobileTabForPath,
  resolveMobileStack,
  withWorkspace,
} from "./mobile-nav";

describe("mobile PWA tab model", () => {
  test("exposes the four product tabs without the legacy File/Missions/Salons/Plus shell", () => {
    expect(MOBILE_TAB_ENTRIES.map((entry) => entry.label)).toEqual([
      "Accueil",
      "Activité",
      "Hermes",
      "Recherche",
    ]);
    expect(mobileTabForPath("/channels")).toBe("home");
    expect(mobileTabForPath("/activity")).toBe("activity");
    expect(mobileTabForPath("/hermes")).toBe("hermes");
    expect(mobileTabForPath("/hermes/session-42")).toBe("hermes");
    expect(mobileTabForPath("/inbox/item-1")).toBeNull();
  });

  test("keeps established deep routes and returns their parent inside the new activity shell", () => {
    const stack = resolveMobileStack({
      pathname: "/inbox/item-1",
      search: "?workspace=alpha",
      workspaceId: "alpha",
      itemTitle: "Décision à prendre",
    });

    expect(stack).toEqual({
      title: "Décision à prendre",
      parent: { to: withWorkspace("/inbox", "alpha"), label: "File" },
    });
    expect(
      resolveMobileStack({
        pathname: "/inbox",
        search: "",
        workspaceId: "alpha",
      }).parent,
    ).toEqual({ to: withWorkspace("/activity", "alpha"), label: "Activité" });
    expect(
      resolveMobileStack({
        pathname: "/hermes/session-42",
        search: "",
        workspaceId: "alpha",
      }),
    ).toEqual({
      title: "Conversation",
      parent: { to: withWorkspace("/hermes", "alpha"), label: "Hermes" },
    });
  });
});
