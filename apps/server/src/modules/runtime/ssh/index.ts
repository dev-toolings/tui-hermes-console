import { createHash } from "node:crypto";
import { createSsh2Channel } from "./ssh2-password";
import { createSystemSshChannel } from "./system-ssh";
import type { SshChannel, SshTarget } from "./types";

export type { SshAuth, SshChannel, SshTarget } from "./types";
export { readSshConfigHosts, type SshConfigHost } from "./ssh-config";

let active: { fingerprint: string; channel: SshChannel } | null = null;

function createChannel(target: SshTarget): SshChannel {
  return target.auth === "password"
    ? createSsh2Channel(target)
    : createSystemSshChannel(target);
}

/** Identité d'une cible. Le mot de passe est haché : deux cibles identiques réutilisent
 *  le canal, un changement de mot de passe en ouvre un neuf. */
export function targetFingerprint(target: SshTarget): string {
  const secret = target.password
    ? createHash("sha256").update(target.password).digest("hex").slice(0, 16)
    : "";
  return [target.user, target.host, target.port, target.auth, secret].join("|");
}

/** Canal SSH partagé par le port-forward HTTP et les commandes de contrôle. */
export function getChannel(target: SshTarget): SshChannel {
  const fingerprint = targetFingerprint(target);
  if (active?.fingerprint === fingerprint) return active.channel;

  closeChannel();
  const channel = createChannel(target);
  active = { fingerprint, channel };
  return channel;
}

/**
 * Canal réservé à une opération de contrôle. Il ne touche jamais au tunnel
 * partagé par une mission et est fermé même si le probe distant échoue.
 */
export async function withEphemeralSshChannel<T>(
  target: SshTarget,
  operation: (channel: SshChannel) => Promise<T>,
): Promise<T> {
  const channel = createChannel(target);
  try {
    return await operation(channel);
  } finally {
    channel.close();
  }
}

export function closeChannel(sync = false) {
  if (!active) return;
  const { channel } = active;
  active = null;
  channel.close(sync);
}

// Sans ça, le master SSH détaché survit à l'arrêt du serveur jusqu'à expiration
// de ControlPersist — une connexion ouverte vers la machine distante pour rien.
let hooked = false;
if (!hooked) {
  hooked = true;
  process.once("exit", () => closeChannel(true));
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      closeChannel(true);
      // Installer un listener remplace le comportement de sortie par défaut de
      // Node/Bun. Sans cette sortie explicite, un service systemd reste bloqué
      // en `deactivating` après avoir pourtant fermé son ControlMaster.
      process.exit(0);
    });
  }
}

/** Ouvre (ou réutilise) le tunnel et renvoie l'URL locale à appeler à la place d'Hermes. */
export async function ensureTunnel(
  target: SshTarget,
  remoteHost: string,
  remotePort: number,
): Promise<string> {
  return getChannel(target).forward(remoteHost, remotePort);
}
