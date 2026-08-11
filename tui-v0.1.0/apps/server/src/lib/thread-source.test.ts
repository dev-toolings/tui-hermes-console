import { describe, expect, test } from "bun:test";

function parseThreadSource(value: string | null): "chat" | "mission" | undefined {
  if (value === "chat" || value === "mission") return value;
  return undefined;
}

describe("thread source", () => {
  test("parseThreadSource accepts chat and mission", () => {
    expect(parseThreadSource("chat")).toBe("chat");
    expect(parseThreadSource("mission")).toBe("mission");
    expect(parseThreadSource("all")).toBeUndefined();
    expect(parseThreadSource(null)).toBeUndefined();
  });
});
