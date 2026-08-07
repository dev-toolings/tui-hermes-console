import { describe, expect, test } from "bun:test";

const packageJson = await Bun.file(
  new URL("../package.json", import.meta.url),
).json();

describe("Expo development commands", () => {
  test("keep every default start path safe on a headless SSH host", () => {
    for (const command of ["start", "android", "ios", "web"]) {
      expect(packageJson.scripts[command]).toStartWith(
        "EXPO_UNSTABLE_HEADLESS=1 ",
      );
    }
  });

  test("retain an explicit graphical DevTools path", () => {
    expect(packageJson.scripts["start:interactive"]).toBe("expo start");
  });
});
