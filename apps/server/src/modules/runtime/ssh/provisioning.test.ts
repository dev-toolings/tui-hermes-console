import { describe, expect, test } from "bun:test";
import type { RuntimeSshInspectionDto } from "@console/core/types/api";
import { buildSshProvisionPlan } from "./provisioning";

const target = {
  host: "vps.example.test",
  port: 22,
  user: "hermes",
  auth: "agent" as const,
};

const inspection: RuntimeSshInspectionDto = {
  target,
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
      "--label hermes.console.managed=true",
    );
    expect(JSON.stringify(plan)).not.toContain("super-secret-token");
  });

  test("blocks an unknown host key and unreachable SSH target", () => {
    const plan = buildSshProvisionPlan(
      {
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

  test("blocks native provisioning until an official release checksum is pinned", () => {
    const plan = buildSshProvisionPlan(
      {
        target,
        mode: "native",
        remoteBaseUrl: "http://127.0.0.1:8642",
        remoteWorkdir: "/home/hermes/hermes-console-workdir",
      },
      inspection,
    );
    expect(plan.blockers).toContain(
      "Le provisioning natif est désactivé tant qu’une release Hermes et son checksum officiel ne sont pas épinglés.",
    );
    expect(plan.steps.find(({ id }) => id === "hermes-native")?.commandPreview).toBeNull();
  });
});
