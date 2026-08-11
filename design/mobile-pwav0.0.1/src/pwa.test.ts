// Bun exposes this module at runtime; the project deliberately has no Bun type package.
// @ts-expect-error Bun test types are not part of the application build.
import { describe, expect, test } from "bun:test";
import {
  hasPwaDirtyMarker,
  isPwaEditingElement,
  shouldDeferPwaReload,
} from "./pwa";

const element = (tagName: string, attributes: Record<string, string> = {}) =>
  ({
    tagName,
    getAttribute: (name: string) => attributes[name] ?? null,
  }) as unknown as Element;

const safeSnapshot = {
  dirty: false,
  busy: false,
  visibilityState: "visible" as DocumentVisibilityState,
  activeElement: null,
};

describe("PWA reload safety", () => {
  test("identifies text editing targets without a browser runtime", () => {
    expect(isPwaEditingElement(element("TEXTAREA"))).toBe(true);
    expect(isPwaEditingElement(element("INPUT", { type: "text" }))).toBe(true);
    expect(isPwaEditingElement(element("INPUT", { type: "checkbox" }))).toBe(false);
    expect(isPwaEditingElement(element("DIV", { contenteditable: "plaintext-only" }))).toBe(true);
    expect(isPwaEditingElement(element("DIV", { contenteditable: "false" }))).toBe(false);
  });

  test("defers a reload for dirty, busy, hidden, or actively edited app state", () => {
    expect(shouldDeferPwaReload(safeSnapshot)).toBe(false);
    expect(shouldDeferPwaReload({ ...safeSnapshot, dirty: true })).toBe(true);
    expect(shouldDeferPwaReload({ ...safeSnapshot, busy: true })).toBe(true);
    expect(shouldDeferPwaReload({ ...safeSnapshot, visibilityState: "hidden" })).toBe(true);
    expect(
      shouldDeferPwaReload({
        ...safeSnapshot,
        activeElement: element("INPUT", { type: "email" }),
      }),
    ).toBe(true);
  });

  test("keeps a blurred draft safe through its DOM marker", () => {
    expect(hasPwaDirtyMarker({ querySelector: () => element("FORM") })).toBe(true);
    expect(hasPwaDirtyMarker({ querySelector: () => null })).toBe(false);
  });
});
