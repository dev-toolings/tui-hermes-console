import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Vérification de clé d'hôte pour le chemin `ssh2` (auth par mot de passe).
 *
 * Le chemin `agent` délègue au binaire `ssh`, qui vérifie `known_hosts` et
 * échoue en `SSH_HOST_KEY_UNKNOWN`. Sans l'équivalent ici, basculer sur
 * « mot de passe » perdait silencieusement cette protection : ssh2 accepte
 * n'importe quelle clé d'hôte, donc livre le mot de passe au premier serveur
 * qui répond (MITM trivial sur le chemin réseau).
 */

export type KnownHostEntry = {
  /** Motifs d'hôte en clair (`host`, `[host]:port`), vide si l'entrée est hachée. */
  patterns: string[];
  /** Entrée hachée `|1|<salt b64>|<hash b64>`. */
  hashed: { salt: string; hash: string } | null;
  keyType: string;
  keyBase64: string;
  revoked: boolean;
};

/** Clé de recherche OpenSSH : `host` sur le port 22, `[host]:port` sinon. */
export function hostLookupKey(host: string, port: number): string {
  return port === 22 ? host : `[${host}]:${port}`;
}

export function parseKnownHosts(content: string): KnownHostEntry[] {
  const entries: KnownHostEntry[] = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    let rest = line;
    let revoked = false;
    if (rest.startsWith("@")) {
      const [marker, ...tail] = rest.split(/\s+/);
      // `@cert-authority` demande une validation de certificat qu'on ne sait pas
      // faire : on ignore l'entrée plutôt que de l'accepter à tort.
      if (marker !== "@revoked") continue;
      revoked = true;
      rest = tail.join(" ");
    }

    const [hostField, keyType, keyBase64] = rest.split(/\s+/);
    if (!hostField || !keyType || !keyBase64) continue;

    if (hostField.startsWith("|1|")) {
      const [, , salt, hash] = hostField.split("|");
      if (!salt || !hash) continue;
      entries.push({ patterns: [], hashed: { salt, hash }, keyType, keyBase64, revoked });
      continue;
    }

    entries.push({
      patterns: hostField.split(","),
      hashed: null,
      keyType,
      keyBase64,
      revoked,
    });
  }

  return entries;
}

function hashedMatches(entry: KnownHostEntry, lookup: string): boolean {
  if (!entry.hashed) return false;
  try {
    const digest = createHmac("sha1", Buffer.from(entry.hashed.salt, "base64"))
      .update(lookup)
      .digest("base64");
    return digest === entry.hashed.hash;
  } catch {
    return false;
  }
}

function patternMatches(pattern: string, lookup: string): boolean {
  if (pattern === lookup) return true;
  // Jokers OpenSSH : `*` (n'importe quelle suite) et `?` (un caractère).
  if (!pattern.includes("*") && !pattern.includes("?")) return false;
  const source = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${source}$`).test(lookup);
}

export function entriesForHost(entries: KnownHostEntry[], lookup: string): KnownHostEntry[] {
  return entries.filter(
    (entry) =>
      hashedMatches(entry, lookup) ||
      (entry.patterns.some(
        (pattern) => !pattern.startsWith("!") && patternMatches(pattern, lookup),
      ) &&
        !entry.patterns.some(
          (pattern) =>
            pattern.startsWith("!") && patternMatches(pattern.slice(1), lookup),
        )),
  );
}

export type HostKeyVerdict =
  | { ok: true }
  | { ok: false; reason: "unknown_host" | "key_mismatch" | "revoked" };

export function verifyHostKey(
  entries: KnownHostEntry[],
  lookup: string,
  offeredKeyBase64: string,
): HostKeyVerdict {
  const candidates = entriesForHost(entries, lookup);
  if (candidates.length === 0) return { ok: false, reason: "unknown_host" };

  const matching = candidates.filter((entry) => entry.keyBase64 === offeredKeyBase64);
  if (matching.some((entry) => entry.revoked)) return { ok: false, reason: "revoked" };
  if (matching.length > 0) return { ok: true };

  // L'hôte est connu mais présente une autre clé : c'est le cas que
  // `known_hosts` existe pour signaler.
  return { ok: false, reason: "key_mismatch" };
}

export function defaultKnownHostsPaths(home = homedir()): string[] {
  return [path.join(home, ".ssh", "known_hosts"), "/etc/ssh/ssh_known_hosts"];
}

export function configuredKnownHostsPath(
  env: Record<string, string | undefined> = process.env,
  home = homedir(),
) {
  const configured = env.HERMES_SSH_KNOWN_HOSTS_FILE?.trim();
  return configured || path.join(home, ".ssh", "known_hosts");
}

export function loadKnownHosts(paths = defaultKnownHostsPaths()): KnownHostEntry[] {
  const entries: KnownHostEntry[] = [];
  for (const file of paths) {
    try {
      entries.push(...parseKnownHosts(readFileSync(file, "utf8")));
    } catch {
      // Fichier absent ou illisible : les autres sources restent valables.
    }
  }
  return entries;
}
