import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

describe("SSH shutdown hooks", () => {
  test("SIGTERM closes transport state and lets a background process exit", async () => {
    const moduleUrl = pathToFileURL(join(import.meta.dir, "index.ts")).href;
    const child = spawn(
      process.execPath,
      [
        "-e",
        `await import(${JSON.stringify(moduleUrl)}); console.log("ready"); setInterval(() => {}, 60_000);`,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    await waitForReady(child);
    child.kill("SIGTERM");

    const result = await Promise.race([
      new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
        child.once("close", (code, signal) => resolve({ code, signal }));
      }),
      Bun.sleep(2_000).then(() => null),
    ]);

    if (!result) child.kill("SIGKILL");
    expect(result).toEqual({ code: 0, signal: null });
  });
});

function waitForReady(child: ReturnType<typeof spawn>) {
  return new Promise<void>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`child did not become ready: ${stderr}`));
    }, 2_000);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (!stdout.includes("ready")) return;
      clearTimeout(timeout);
      resolve();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}
