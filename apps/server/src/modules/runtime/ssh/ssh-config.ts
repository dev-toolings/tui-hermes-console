import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export type SshConfigHost = {
  /** Alias déclaré après `Host` — ce que l'utilisateur tape dans `ssh <alias>`. */
  alias: string;
  hostname: string | null;
  user: string | null;
  port: number | null;
};

const MAX_INCLUDE_DEPTH = 5;

/** Lit ~/.ssh/config (et ses Include) et renvoie les Host exploitables.
 *  Lecture seule : la Console n'écrit jamais dans la configuration SSH. */
export async function readSshConfigHosts(
  configPath = path.join(homedir(), ".ssh", "config"),
): Promise<SshConfigHost[]> {
  const seen = new Set<string>();
  const hosts: SshConfigHost[] = [];

  for (const host of await collect(configPath, 0)) {
    if (seen.has(host.alias)) continue;
    seen.add(host.alias);
    hosts.push(host);
  }

  return hosts;
}

/** Un motif (`*`, `?`, `!`) n'est pas une cible connectable : on ne le propose pas. */
export function isConnectableAlias(alias: string) {
  return alias.length > 0 && !/[*?!]/.test(alias);
}

export function parseSshConfig(content: string): {
  hosts: SshConfigHost[];
  includes: string[];
} {
  const hosts: SshConfigHost[] = [];
  const includes: string[] = [];
  let current: SshConfigHost[] = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    // `Key value` ou `Key=value`, insensible à la casse (comme OpenSSH).
    const match = /^([A-Za-z]+)[\s=]+(.+)$/.exec(line);
    if (!match) continue;
    const keyword = match[1].toLowerCase();
    const value = match[2].trim();

    if (keyword === "host") {
      current = value
        .split(/\s+/)
        .filter(isConnectableAlias)
        .map((alias) => ({ alias, hostname: null, user: null, port: null }));
      hosts.push(...current);
      continue;
    }

    if (keyword === "include") {
      includes.push(...value.split(/\s+/));
      continue;
    }

    if (current.length === 0) continue;
    for (const host of current) {
      if (keyword === "hostname") host.hostname = value;
      else if (keyword === "user") host.user = value;
      else if (keyword === "port") {
        const port = Number(value);
        if (Number.isInteger(port) && port > 0 && port <= 65_535) host.port = port;
      }
    }
  }

  return { hosts, includes };
}

async function collect(configPath: string, depth: number): Promise<SshConfigHost[]> {
  if (depth > MAX_INCLUDE_DEPTH) return [];

  let content: string;
  try {
    content = await readFile(configPath, "utf8");
  } catch {
    return [];
  }

  const { hosts, includes } = parseSshConfig(content);
  const collected = [...hosts];

  for (const include of includes) {
    const resolved = resolveIncludePath(include, configPath);
    // Les jokers d'Include ne sont pas développés : on ne fait que suggérer des hôtes,
    // et `ssh` reste seul juge de la configuration effective au moment de la connexion.
    if (/[*?]/.test(resolved)) continue;
    collected.push(...(await collect(resolved, depth + 1)));
  }

  return collected;
}

function resolveIncludePath(include: string, parentPath: string) {
  if (include.startsWith("~/")) return path.join(homedir(), include.slice(2));
  if (path.isAbsolute(include)) return include;
  return path.join(path.dirname(parentPath), include);
}
