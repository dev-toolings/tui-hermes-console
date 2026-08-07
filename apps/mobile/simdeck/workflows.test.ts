import { describe, expect, test } from "bun:test";

const repoRoot = new URL("../../..", import.meta.url);

async function read(relativePath: string) {
  return Bun.file(new URL(relativePath, repoRoot)).text();
}

describe("SimDeck delivery workflows", () => {
  test("keeps native identifiers aligned with Expo config", async () => {
    const appConfig = await Bun.file(
      new URL("../app.json", import.meta.url),
    ).json();
    const ios = await read(".github/workflows/simdeck-ios-comment.yml");
    const android = await read(".github/workflows/simdeck-android-comment.yml");

    expect(ios).toContain(`bundle_id: ${appConfig.expo.ios.bundleIdentifier}`);
    expect(android).toContain(
      `package_name: ${appConfig.expo.android.package}`,
    );
  });

  test("uploads the native artifacts expected by SimDeck", async () => {
    const iosBuild = await read(".github/workflows/build-ios-simulator.yml");
    const androidBuild = await read(".github/workflows/build-android-apk.yml");

    expect(iosBuild).toContain("-scheme HermesConsole");
    expect(iosBuild).toContain("Debug-iphonesimulator/*.app");
    expect(androidBuild).toContain("./gradlew assembleDebug");
    expect(androidBuild).toContain("outputs/apk/debug/*.apk");
  });

  test("runs full-profile streams and gives Android 6 GiB", async () => {
    const ios = await read(".github/workflows/simdeck-ios-comment.yml");
    const android = await read(".github/workflows/simdeck-android-comment.yml");

    expect(ios).toContain("stream_profile: full");
    expect(android).toContain("stream_profile: full");
    expect(android).toMatch(/android_emulator_args: \|\n\s+-memory\n\s+6144/);
    expect(android).toMatch(/\s+-gpu\n\s+host/);
  });

  test("uses the repository Node 24 compatible action floor", async () => {
    const iosBuild = await read(".github/workflows/build-ios-simulator.yml");
    const androidBuild = await read(".github/workflows/build-android-apk.yml");

    for (const workflow of [iosBuild, androidBuild]) {
      expect(workflow).toContain("actions/checkout@v6");
      expect(workflow).toContain("oven-sh/setup-bun@v2");
      expect(workflow).not.toMatch(/actions\/checkout@v[1-5]/);
    }
  });
});
