import { describe, expect, test } from "bun:test";
import {
  runtimeTargetLabel,
  runtimeTransportLabel,
  sshTargetLabel,
} from "@/lib/runtime/target";

const DIRECT = {
  transport: "direct" as const,
  baseUrl: "http://127.0.0.1:8642",
  sshHost: null,
  sshPort: 22,
  sshUser: null,
};

const TUNNEL = {
  transport: "ssh" as const,
  baseUrl: "http://127.0.0.1:8642",
  sshHost: "192.168.1.57",
  sshPort: 22,
  sshUser: "kev",
};

describe("runtimeTargetLabel", () => {
  test("en accès direct, montre l'endpoint tel quel", () => {
    expect(runtimeTargetLabel(DIRECT)).toBe("127.0.0.1:8642");
  });

  test("en tunnel, nomme la machine qui exécute vraiment", () => {
    // Régression : l'UI affichait « Cible : http://127.0.0.1:8642 », ce qui
    // laissait croire que l'agent tournait en local — alors qu'il écrivait ses
    // fichiers sur un autre host.
    expect(runtimeTargetLabel(TUNNEL)).toBe("kev@192.168.1.57 → 127.0.0.1:8642");
  });

  test("n'affiche le port SSH que s'il est non standard", () => {
    expect(sshTargetLabel(TUNNEL)).toBe("kev@192.168.1.57");
    expect(sshTargetLabel({ ...TUNNEL, sshPort: 2222 })).toBe("kev@192.168.1.57:2222");
  });

  test("pas d'étiquette SSH en accès direct", () => {
    expect(sshTargetLabel(DIRECT)).toBeNull();
  });

  test("tient sans URL configurée", () => {
    expect(runtimeTargetLabel({ ...TUNNEL, baseUrl: null })).toBe("kev@192.168.1.57");
    expect(runtimeTargetLabel({ ...DIRECT, baseUrl: null })).toBe("Runtime Hermes");
  });

  test("ne casse pas sur une URL invalide", () => {
    expect(runtimeTargetLabel({ ...DIRECT, baseUrl: "pas-une-url" })).toBe("pas-une-url");
  });

  test("nomme la nature du lien", () => {
    expect(runtimeTransportLabel(TUNNEL)).toBe("Tunnel SSH");
    expect(runtimeTransportLabel(DIRECT)).toBe("Accès direct");
  });
});
