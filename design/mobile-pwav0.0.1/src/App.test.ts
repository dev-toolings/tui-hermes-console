// @ts-expect-error Bun test types are not part of the application build.
import { describe, expect, test } from "bun:test";
import { shouldOpenEdgeSwipe } from "./App";

describe("mobile navigation drawer edge swipe", () => {
  test("opens from distance once the drawer width is half covered", () => {
    expect(shouldOpenEdgeSwipe(159, 400)).toBe(false);
    expect(shouldOpenEdgeSwipe(160, 400)).toBe(true);
  });

  test("opens from velocity even under the distance threshold", () => {
    expect(shouldOpenEdgeSwipe(64, 200)).toBe(false);
    expect(shouldOpenEdgeSwipe(64, 100)).toBe(true);
  });

  test("stays shut on a slow, short swipe", () => {
    expect(shouldOpenEdgeSwipe(20, 400)).toBe(false);
  });
});