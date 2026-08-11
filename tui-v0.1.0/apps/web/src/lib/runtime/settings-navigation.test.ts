import { describe, expect, test } from "bun:test";
import {
  normalizeRuntimeSection,
  parseRuntimeSection,
  runtimeSettingsHref,
} from "./settings-navigation";

describe("runtime settings navigation", () => {
  test("accepts only known sections", () => {
    expect(parseRuntimeSection("services")).toBe("services");
    expect(parseRuntimeSection("unknown")).toBeUndefined();
    expect(parseRuntimeSection(null)).toBeUndefined();
  });

  test("keeps the workspace section stable in both runtime modes", () => {
    expect(normalizeRuntimeSection("workspace", "ssh")).toBe("workspace");
    expect(normalizeRuntimeSection("workspace", "direct")).toBe("workspace");
  });

  test("builds a shareable mode and section URL", () => {
    expect(runtimeSettingsHref("ssh", "workspace")).toBe(
      "/settings/runtime?mode=ssh&section=workspace",
    );
  });
});
