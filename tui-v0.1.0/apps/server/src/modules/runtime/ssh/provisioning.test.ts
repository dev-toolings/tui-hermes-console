import { describe, expect, test } from "bun:test";
import type { RuntimeSshInspectionDto } from "@console/core/types/api";
import type { SshChannel } from "./types";
import { buildSshProvisionPlan, provisionNativeRuntime } from "./provisioning";

const target = {
  host: "vps.example.test",
  port: 22,
  user: "hermes-console",
  auth: "agent" as const,
};

const provisioner = {
  host: "vps-admin.example.test",
  port: 22,
  user: "hermes-admin",
  auth: "agent" as const,
};

const inspection: RuntimeSshInspectionDto = {
  target: provisioner,
  client: {
    sshAvailable: true,
    agentAvailable: true,
    knownHostStatus: "known",
    configAlias: "hermes-vps",
  },
  remote: {
    reachable: true,
    os: "ubuntu",
    osVersion: "24.04",
    architecture: "x86_64",
    sudo: "available",
    docker: "missing",
    systemd: "available",
    hermes: "unreachable",
    hermesVersion: null,
    hermesMode: "unknown",
    port8642: "closed",
    dashboard: "closed",
    dashboardManager: "unknown",
    workdir: "missing",
  },
  warnings: [],
  checkedAt: new Date().toISOString(),
};

describe("SSH provisioning plan", () => {
  test("builds an idempotent Docker plan without exposing a token", () => {
    const plan = buildSshProvisionPlan(
      {
        provisioner,
        target,
        mode: "docker",
        remoteBaseUrl: "http://127.0.0.1:8642",
        remoteWorkdir: "/home/hermes/hermes-console-workdir",
        token: "super-secret-token",
      },
      inspection,
    );

    expect(plan.blockers).toEqual([]);
    expect(plan.steps.map((step) => step.id)).toEqual([
      "inspect",
      "workdir",
      "docker",
      "hermes-docker",
      "dashboard",
      "verify",
    ]);
    expect(plan.steps.find((step) => step.id === "dashboard")?.commandPreview).toContain(
      "--network host",
    );
    expect(plan.steps.find((step) => step.id === "dashboard")?.commandPreview).toContain(
      "--host 127.0.0.1",
    );
    expect(plan.steps.find((step) => step.id === "hermes-docker")?.commandPreview).toContain(
      "--cap-drop ALL --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER --cap-add SETGID --cap-add SETUID",
    );
    expect(plan.steps.find((step) => step.id === "hermes-docker")?.commandPreview).toContain(
      "HERMES_UID=<uid-service>",
    );
    expect(plan.steps.find((step) => step.id === "hermes-docker")?.commandPreview).toContain(
      "docker pull nousresearch/hermes-agent:latest",
    );
    expect(plan.steps.find((step) => step.id === "hermes-docker")?.commandPreview).toContain(
      "<digest-résolu>",
    );
    expect(plan.provisioner.user).toBe("hermes-admin");
    expect(plan.target.user).toBe("hermes-console");
    expect(JSON.stringify(plan)).not.toContain("super-secret-token");
  });

  test("blocks an unknown host key and unreachable SSH target", () => {
    const plan = buildSshProvisionPlan(
      {
        provisioner,
        target,
        mode: "native",
        remoteBaseUrl: "http://127.0.0.1:8642",
        remoteWorkdir: "/home/hermes/hermes-console-workdir",
      },
      {
        ...inspection,
        client: { ...inspection.client, knownHostStatus: "unknown" },
        remote: { ...inspection.remote, reachable: false },
      },
    );

    expect(plan.blockers).toEqual(
      expect.arrayContaining([
        "La clé d’hôte SSH n’est pas validée dans known_hosts.",
        "La session SSH distante est injoignable.",
      ]),
    );
  });

  test("blocks a new deployment when a healthy Hermes already owns the port", () => {
    const plan = buildSshProvisionPlan(
      {
        provisioner,
        target,
        mode: "docker",
        remoteBaseUrl: "http://127.0.0.1:8642",
        remoteWorkdir: "/home/hermes/hermes-console-workdir",
        token: "new-token",
      },
      {
        ...inspection,
        remote: { ...inspection.remote, hermes: "healthy", port8642: "listening" },
      },
    );
    expect(plan.blockers).toContain(
      "Une installation Hermes saine existe déjà : connectez-la avec le parcours SSH normal pour éviter de la remplacer.",
    );
  });

  test("builds a latest system-wide plan with a service identity and rollback", () => {
    const plan = buildSshProvisionPlan(
      {
        provisioner,
        target,
        mode: "native",
        remoteBaseUrl: "http://127.0.0.1:8642",
        remoteWorkdir: "/home/hermes/hermes-console-workdir",
      },
      inspection,
    );
    expect(plan.blockers).toEqual([]);
    expect(plan.steps.map(({ id }) => id)).toEqual(
      expect.arrayContaining(["native-dependencies", "hermes-native", "verify"]),
    );
    expect(plan.steps.find(({ id }) => id === "hermes-native")?.description).toContain(
      "suivre main",
    );
    expect(plan.steps.find(({ id }) => id === "hermes-native")?.description).toContain(
      "rollback",
    );
  });

  test("generates the system-wide latest contract with observed revision, non-root systemd and rollback", async () => {
    let command = "";
    const channel = {
      exec: async (value: string) => {
        command = value;
        return { code: 0, stdout: "hermes_token=generated-token\n", stderr: "" };
      },
    } as SshChannel;

    await provisionNativeRuntime(
      channel,
      "hermes-admin",
      "hermes-console",
      { uid: 1002, gid: 1003, home: "/home/hermes-console", machineId: "vm-proof" },
      "/srv/hermes-console/workdir",
      "",
    );

    expect(command).toContain("NousResearch/hermes-agent/main/scripts/install.sh");
    expect(command).toContain("--branch 'main'");
    expect(command).toContain("installer_sha256=%s");
    expect(command).toContain("hermes_commit=%s");
    expect(command).not.toContain("--commit");
    expect(command).toContain("systemctl restart hermes-gateway.service");
    expect(command).toContain("rollback exécuté");
    expect(command).toContain("API_SERVER_HOST=127.0.0.1");
    const encodedUnit = command.match(/printf '%s' '([A-Za-z0-9+/=]+)' \| base64 -d/)?.[1];
    expect(encodedUnit).toBeTruthy();
    const unit = Buffer.from(encodedUnit!, "base64").toString("utf8");
    expect(unit).toContain("User=1002");
    expect(unit).toContain("Group=1003");
    expect(unit).toContain("NoNewPrivileges=true");
    expect(command).not.toContain("generated-token");
  });

  test("blocks a provisioning plan that reuses the service identity as admin", () => {
    const plan = buildSshProvisionPlan(
      {
        provisioner: target,
        target,
        mode: "docker",
        remoteBaseUrl: "http://127.0.0.1:8642",
        remoteWorkdir: "/srv/hermes-console/workdir",
      },
      inspection,
    );
    expect(plan.blockers).toContain(
      "Les identités SSH de provisioning et de service doivent être distinctes.",
    );
  });
});
