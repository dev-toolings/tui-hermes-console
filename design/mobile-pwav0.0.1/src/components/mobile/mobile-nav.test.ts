// Bun exposes this module at runtime; the project deliberately has no Bun type package.
// @ts-expect-error Bun test types are not part of the application build.
import { describe, expect, test } from "bun:test";
import {
  MOBILE_TAB_ENTRIES,
  mobileTabForPath,
  orgPath,
  resolveMobileStack,
  stripOrg,
} from "./mobile-nav";

describe("org path helpers", () => {
  test("orgPath prefixes the slug and keeps search and hash intact", () => {
    expect(orgPath("alpha", "/inbox")).toBe("/alpha/inbox");
    expect(orgPath("alpha", "/channels/general?thread=t-1#m-2")).toBe(
      "/alpha/channels/general?thread=t-1#m-2",
    );
    expect(orgPath("alpha", "/")).toBe("/alpha");
  });

  test("stripOrg removes exactly the first segment", () => {
    expect(stripOrg("/alpha/inbox/item-1")).toBe("/inbox/item-1");
    expect(stripOrg("/alpha")).toBe("/");
    expect(stripOrg("/alpha/channels/general")).toBe("/channels/general");
  });
});

describe("mobile tab model", () => {
  test("exposes the four product tabs without the legacy File/Missions/Salons/Plus shell", () => {
    expect(MOBILE_TAB_ENTRIES.map((entry) => entry.label)).toEqual([
      "Accueil",
      "Activité",
      "Hermes",
      "Recherche",
    ]);
    expect(mobileTabForPath("/inbox")).toBe("home");
    expect(mobileTabForPath("/channels")).toBeNull();
    expect(mobileTabForPath("/activity")).toBe("activity");
    expect(mobileTabForPath("/hermes")).toBe("hermes");
    expect(mobileTabForPath("/hermes/session-42")).toBe("hermes");
    expect(mobileTabForPath("/inbox/item-1")).toBeNull();
    expect(mobileTabForPath(stripOrg("/alpha/inbox"))).toBe("home");
  });

  test("keeps established deep routes and returns their parent inside the new activity shell", () => {
    const stack = resolveMobileStack({
      pathname: "/inbox/item-1",
      search: "",
      org: "alpha",
      itemTitle: "Décision à prendre",
    });

    expect(stack).toEqual({
      title: "Décision à prendre",
      parent: { to: "/alpha/inbox", label: "File" },
    });
    expect(
      resolveMobileStack({
        pathname: "/inbox",
        search: "",
        org: "alpha",
      }).parent,
    ).toBeNull();
    expect(
      resolveMobileStack({
        pathname: "/channels",
        search: "",
        org: "alpha",
      }),
    ).toEqual({
      title: "Canaux",
      parent: { to: "/alpha/menu", label: "Menu" },
    });
    expect(
      resolveMobileStack({
        pathname: "/hermes/session-42",
        search: "",
        org: "alpha",
      }),
    ).toEqual({
      title: "Conversation",
      parent: { to: "/alpha/hermes", label: "Hermes" },
    });
  });
});
