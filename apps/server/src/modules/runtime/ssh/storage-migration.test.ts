import { describe, expect, test } from "bun:test";
import {
  parseStorageInspection,
  renderBackupAndCopyCommand,
  renderManagedCompose,
  storageMigrationBlockers,
} from "./storage-migration";

const digest = `nousresearch/hermes-agent@sha256:${"a".repeat(64)}`;

function eligibleInspection() {
  return parseStorageInspection([
    "container_name=hermes-console-runtime",
    `image=${digest}`,
    "container_user=root",
    "mount_type=volume",
    "volume_name=hermes-console-runtime-data",
    "mount_driver=local",
    "mount_destination=/opt/data",
    "restart_policy=unless-stopped",
    "network_mode=bridge",
    "privileged=false",
    "readonly_rootfs=false",
    "mount_count=1",
    "published_port=127.0.0.1:8642",
    "compose_available=yes",
    "tools_available=yes",
    "source_bytes=32000000",
    "file_count=120",
    "data_uid=10000",
    "data_gid=10000",
    "data_mode=755",
    "free_bytes=2000000000",
    "target_state=missing",
    "compose_state=missing",
  ].join("\n"));
}

describe("SSH Docker storage migration", () => {
  test("accepts only the bounded recognized Hermes topology", () => {
    expect(storageMigrationBlockers(eligibleInspection(), "root")).toEqual([]);
  });

  test("routes customized or unsafe installations to the manual guide", () => {
    const inspection = eligibleInspection();
    expect(storageMigrationBlockers({
      ...inspection,
      mountCount: 2,
      targetState: "nonempty",
      publishedPort: "0.0.0.0:8642",
    }, "deploy")).toEqual(expect.arrayContaining([
      expect.stringContaining("SSH root"),
      expect.stringContaining("127.0.0.1:8642"),
      expect.stringContaining("topologie"),
      expect.stringContaining("absent ou vide"),
    ]));
  });

  test("renders a root-only managed Compose shape without embedding secrets", () => {
    const compose = renderManagedCompose(digest);
    expect(compose).toContain(`image: ${digest}`);
    expect(compose).toContain("source: /srv/hermes-console/data");
    expect(compose).toContain("target: /opt/data");
    expect(compose).toContain('127.0.0.1:8642:8642');
    expect(compose).toContain("./runtime.env");
    expect(compose).not.toMatch(/API_SERVER_KEY\s*=/);
  });

  test("rejects an image tag in place of an immutable digest", () => {
    expect(() => renderManagedCompose("nousresearch/hermes-agent:latest")).toThrow(
      "digest Hermes invalide",
    );
  });

  test("stops Hermes as a command before launching the copy helper", () => {
    const command = renderBackupAndCopyCommand(
      {
        containerName: "hermes-console-runtime",
        volumeName: "hermes-console-runtime-data",
        imageDigest: digest,
      },
      {
        hostDataRoot: "/srv/hermes-console/data",
        backupDirectory: "/srv/hermes-console/backups/plan-id",
      },
    );
    expect(command).toStartWith("set -eu\ndocker stop");
    expect(command).toContain("\ndocker run --rm --entrypoint sh \\\n");
    expect(command).not.toContain("set -eu \\\n");
    expect(command).toContain("cd /backup && sha256sum opt-data.tar.gz");
    expect(command).not.toContain("sha256sum /backup/opt-data.tar.gz");
  });
});
