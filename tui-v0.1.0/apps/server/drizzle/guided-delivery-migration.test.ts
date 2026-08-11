import { describe, expect, test } from "bun:test";

const migration = await Bun.file(
  new URL("./0037_guided_software_delivery.sql", import.meta.url),
).text();

describe("0037 guided software delivery migration", () => {
  test("persists repositories, tasks, immutable revisions, attempts, decisions and evidence", () => {
    for (const table of [
      "project_repositories",
      "guided_tasks",
      "guided_task_revisions",
      "guided_task_attempts",
      "guided_task_decisions",
      "guided_task_evidence",
    ]) {
      expect(migration).toContain(`CREATE TABLE \"${table}\"`);
    }
    expect(migration).toContain("guided_task_revisions_immutable");
    expect(migration).toContain("guided_task_decisions_idempotency_idx");
    expect(migration).toContain("guided_task_attempts_idempotency_idx");
    expect(migration).toContain("guided_tasks_idempotency_idx");
    expect(migration).toContain("guided_task_revisions_idempotency_idx");
    expect(migration).toContain("guided_task_attempts_task_revision_fk");
    expect(migration).toContain("guided_task_attempts_project_scope_fk");
  });

  test("fails closed on invalid workflow and lifecycle values", () => {
    expect(migration).toContain("threads_workflow_check");
    expect(migration).toContain("guided_tasks_status_check");
    expect(migration).toContain("guided_task_attempts_status_check");
    expect(migration).toContain("guided_task_decisions_kind_check");
  });
});
