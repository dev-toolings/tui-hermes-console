// @ts-expect-error Bun test types are not part of the application build.
import { describe, expect, test } from "bun:test";
import {
  clampDrawerProgress,
  getDrawerSwipeAxis,
  shouldOpenDrawer,
  shouldFollowThreadResize,
  shouldRestoreDrawerTriggerFocus,
} from "./assistant-page";

describe("assistant thread resize", () => {
  const composerControl = {} as Node;
  const outsideComposer = {} as Node;
  const composer = {
    contains: (element: Node | null) => element === composerControl,
  };

  test("does not follow the bottom while a composer control has focus", () => {
    expect(shouldFollowThreadResize(true, composer, composerControl)).toBe(false);
  });

  test("continues to follow the bottom when pinned outside the composer", () => {
    expect(shouldFollowThreadResize(true, composer, outsideComposer)).toBe(true);
  });
});

describe("assistant drawer focus restoration", () => {
  test("only restores focus after the drawer closes", () => {
    expect(shouldRestoreDrawerTriggerFocus(false, false)).toBe(false);
    expect(shouldRestoreDrawerTriggerFocus(false, true)).toBe(false);
    expect(shouldRestoreDrawerTriggerFocus(true, false)).toBe(true);
  });
});

describe("assistant drawer swipe decisions", () => {
  test("does not claim vertical scrolling before horizontal dominance", () => {
    expect(getDrawerSwipeAxis(4, 2)).toBe("pending");
    expect(getDrawerSwipeAxis(7, 9)).toBe("vertical");
    expect(getDrawerSwipeAxis(10, 3)).toBe("horizontal");
  });

  test("keeps progress within the drawer bounds during a drag", () => {
    expect(clampDrawerProgress(-0.2)).toBe(0);
    expect(clampDrawerProgress(0.38)).toBe(0.38);
    expect(clampDrawerProgress(1.2)).toBe(1);
  });

  test("settles by distance when the swipe is not fast", () => {
    expect(shouldOpenDrawer(0.49, 0)).toBe(false);
    expect(shouldOpenDrawer(0.5, 0)).toBe(true);
  });

  test("settles by velocity before reaching the distance threshold", () => {
    expect(shouldOpenDrawer(0.2, 0.6)).toBe(true);
    expect(shouldOpenDrawer(0.8, -0.6)).toBe(false);
  });
});
