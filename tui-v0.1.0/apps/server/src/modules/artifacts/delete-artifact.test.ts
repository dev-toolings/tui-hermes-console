import { describe, expect, test } from "bun:test";
import path from "node:path";
import { artifactDeletionPaths, ArtifactDeletionError } from "./delete-artifact";

describe("artifact deletion paths", () => {
  test("cible le coffre et le workspace selon la direction", () => {
    expect(
      artifactDeletionPaths(
        {
          runId: "run_1",
          direction: "input",
          filename: "brief.pdf",
          storagePath: "/vault/runs/run_1/in/brief.pdf",
        },
        { artifactRoot: "/vault", workRoot: "/work" },
      ),
    ).toEqual({
      privateDir: path.resolve("/vault/runs/run_1/in"),
      privateFile: path.resolve("/vault/runs/run_1/in/brief.pdf"),
      workDir: path.resolve("/work/runs/run_1/in"),
      workFile: path.resolve("/work/runs/run_1/in/brief.pdf"),
    });
  });

  test("refuse un storage_path DB qui ne correspond pas au coffre attendu", () => {
    expect(() =>
      artifactDeletionPaths(
        {
          runId: "run_1",
          direction: "output",
          filename: "report.pdf",
          storagePath: "/tmp/escape.pdf",
        },
        { artifactRoot: "/vault", workRoot: "/work" },
      ),
    ).toThrow(ArtifactDeletionError);
  });
});
