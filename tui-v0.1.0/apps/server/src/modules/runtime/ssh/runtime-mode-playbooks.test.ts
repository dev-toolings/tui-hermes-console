import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "../../../../../..");
const dockerPlaybook = readFileSync(
  resolve(repositoryRoot, "deploy/proxmox/ansible/deploy-hermes.yml"),
  "utf8",
);
const nativePlaybook = readFileSync(
  resolve(repositoryRoot, "deploy/proxmox/ansible/deploy-hermes-native.yml"),
  "utf8",
);

describe("remote Hermes runtime mode playbooks", () => {
  test("both modes preserve the one real Hermes data root", () => {
    for (const playbook of [dockerPlaybook, nativePlaybook]) {
      expect(playbook).toContain("runtime_root: /srv/hermes-console/data");
      expect(playbook).not.toContain("runtime_root: /srv/hermes-console/workdir");
    }
  });

  test("both modes install the bounded CLI policy and exact sudo entry points", () => {
    for (const playbook of [dockerPlaybook, nativePlaybook]) {
      expect(playbook).toContain("remote-manager-cli-policy.sh");
      expect(playbook).toContain(
        "/usr/local/libexec/hermes-console-runtime-manager cli *",
      );
      expect(playbook).toContain(
        "/usr/local/libexec/hermes-console-runtime-manager cli-pty *",
      );
      expect(playbook).not.toContain("NOPASSWD: ALL");
    }
  });

  test("native cutover removes Docker only after identity proof and always rolls back to the previously active Docker mode", () => {
    expect(nativePlaybook).toContain("remove_managed_docker_after_native_health: false");
    expect(nativePlaybook).toContain("managed_docker_is_contract");
    expect(nativePlaybook).toContain("managed_dashboard_is_contract");
    expect(nativePlaybook).toContain("Refuser tout conteneur homonyme hors contrat");
    expect(nativePlaybook).toContain("Refuser tout dashboard homonyme hors contrat");
    expect(nativePlaybook).toContain("Sauvegarder l'environnement Docker avant adaptation native");
    expect(nativePlaybook).toContain("Restaurer l'environnement Docker après échec natif");
    expect(nativePlaybook).toContain("Restaurer le mode Docker après échec natif");
    expect(nativePlaybook).toContain("Rétablir la topologie manager Docker après rollback");
    expect(nativePlaybook).toContain("Prouver l'identité du service natif et de son listener");
    expect(nativePlaybook).toContain(
      "Arrêter le service natif incomplet sans rollback disponible",
    );
    expect(nativePlaybook).toContain("Prouver le listener natif restauré");
    expect(nativePlaybook).toContain("Supprimer le conteneur Docker après preuve native");
    expect(nativePlaybook).toContain("Supprimer le dashboard Docker après preuve native");
    expect(nativePlaybook).toContain(
      "Refuser tout processus Hermes dans un scope Docker après bascule native",
    );
    expect(nativePlaybook).not.toContain("systemctl kill --kill-whom=all");
    expect(nativePlaybook).toMatch(
      /Restaurer la release native précédemment active[\s\S]*not \(managed_docker_was_running \| bool\)/,
    );
    expect(nativePlaybook).toMatch(
      /Restaurer le mode Docker après échec natif[\s\S]*managed_docker_was_running \| bool/,
    );

    const health = nativePlaybook.indexOf("Attendre l'API native");
    const removal = nativePlaybook.indexOf(
      "Supprimer le conteneur Docker après preuve native",
    );
    expect(health).toBeGreaterThan(-1);
    expect(removal).toBeGreaterThan(health);
    expect(nativePlaybook).toMatch(
      /native_health\.json\.status[\s\S]*native_health\.json\.platform/,
    );
    expect(nativePlaybook).toMatch(
      /rollback_docker_health\.json\.status[\s\S]*rollback_docker_health\.json\.platform/,
    );
    expect(nativePlaybook).toMatch(/systemctl is-active --quiet[\s\S]*pid=\$main_pid,/);
  });

  test("Docker selection disables the native service to avoid a reboot race", () => {
    expect(dockerPlaybook).toContain("Désactiver Hermes natif pour sélectionner Docker");
    expect(dockerPlaybook).toContain("Nettoyer l'état systemd du runtime natif arrêté");
    expect(dockerPlaybook).toContain("reset-failed");
    expect(dockerPlaybook).toMatch(/enabled:\s*false/);
  });

  test("Docker mode adopts the preinstalled engine without migrating package families", () => {
    expect(dockerPlaybook).toContain("Activer le moteur Docker préinstallé");
    expect(dockerPlaybook).toContain("Vérifier le moteur Docker préinstallé");
    expect(dockerPlaybook).not.toContain("name: docker.io");
    expect(dockerPlaybook).not.toMatch(/ansible\.builtin\.apt:[\s\S]{0,120}docker/);
    expect(dockerPlaybook).toContain("regex_replace', '^CAP_', ''");
  });

  test("Docker cutover happens after preparation and restores the selected previous runtime on health failure", () => {
    expect(dockerPlaybook).toContain("Mémoriser le mode natif actif avant toute mutation");
    expect(dockerPlaybook).toContain("Préserver l'ancien conteneur comme rollback");
    expect(dockerPlaybook).toContain("Restaurer l'ancien conteneur Docker après échec");
    expect(dockerPlaybook).toContain("Restaurer l'environnement natif après échec Docker");
    expect(dockerPlaybook).toContain("Arrêter le candidat Docker avant rollback natif");
    expect(dockerPlaybook).toContain("Restaurer le service natif après échec Docker");
    expect(dockerPlaybook).toContain("Prouver le rollback du runtime précédent");
    expect(dockerPlaybook).toContain("Prouver le listener natif restauré");

    const pull = dockerPlaybook.indexOf("Tirer le canal officiel latest");
    const stopNative = dockerPlaybook.indexOf(
      "Désactiver Hermes natif pour sélectionner Docker",
    );
    const health = dockerPlaybook.indexOf("Attendre l'API Hermes");
    const dockerEnv = dockerPlaybook.indexOf(
      "Garantir la configuration API du mode Docker sans tourner le secret",
    );
    const managerMode = dockerPlaybook.indexOf(
      "Sceller la topologie Docker administrable",
    );
    expect(pull).toBeGreaterThan(-1);
    expect(stopNative).toBeGreaterThan(pull);
    expect(dockerEnv).toBeGreaterThan(stopNative);
    expect(health).toBeGreaterThan(stopNative);
    expect(managerMode).toBeGreaterThan(health);
  });
});
