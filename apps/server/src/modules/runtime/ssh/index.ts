import { createHash } from "node:crypto";
import { createSsh2Channel } from "./ssh2-password";
import { createSystemSshChannel } from "./system-ssh";
import type { SshChannel, SshTarget } from "./types";

export type { SftpOps, SshAuth, SshChannel, SshTarget } from "./types";
export { readSshConfigHosts, type SshConfigHost } from "./ssh-config";

let active: { fingerprint: string; channel: SshChannel } | null = null;

/** Identité d'une cible. Le mot de passe est haché : deux cibles identiques réutilisent
 *  le canal, un changement de mot de passe en ouvre un neuf. */
export function targetFingerprint(target: SshTarget): string {
  const secret = target.password
    ? createHash("sha256").update(target.password).digest("hex").slice(0, 16)
    : "";
  return [target.user, target.host, target.port, target.auth, secret].join("|");
}

/** Canal SSH partagé par le port-forward HTTP et le SFTP des artefacts. */
export function getChannel(target: SshTarget): SshChannel {
  const fingerprint = targetFingerprint(target);
  if (active?.fingerprint === fingerprint) return active.channel;

  closeChannel();
  const channel =
    target.auth === "password" ? createSsh2Channel(target) : createSystemSshChannel(target);
  active = { fingerprint, channel };
  return channel;
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
  for (const signal of ["exit", "SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => closeChannel(true));
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
