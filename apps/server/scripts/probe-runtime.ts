import { closeChannel, ensureTunnel, type SshAuth } from "../src/modules/runtime/ssh";
import { testHermesRuntimeAgainst } from "../src/modules/runtime/hermes-adapter";

type ProbeTransport = "direct" | "ssh";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function positiveInteger(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return value;
}

async function resolveTarget(transport: ProbeTransport) {
  const configuredBaseUrl = requiredEnv("HERMES_BASE_URL").replace(/\/+$/, "");
  if (transport === "direct") return configuredBaseUrl;

  const endpoint = new URL(configuredBaseUrl);
  if (endpoint.protocol !== "http:") {
    throw new Error("HERMES_BASE_URL must use http:// when HERMES_TRANSPORT=ssh");
  }

  const auth = (process.env.HERMES_SSH_AUTH?.trim() || "agent") as SshAuth;
  if (auth !== "agent" && auth !== "password") {
    throw new Error("HERMES_SSH_AUTH must be agent or password");
  }

  return ensureTunnel(
    {
      host: requiredEnv("HERMES_SSH_HOST"),
      port: positiveInteger("HERMES_SSH_PORT", 22),
      user: requiredEnv("HERMES_SSH_USER"),
      auth,
      password: auth === "password" ? requiredEnv("HERMES_SSH_PASSWORD") : undefined,
    },
    endpoint.hostname,
    positiveInteger("HERMES_REMOTE_PORT", Number(endpoint.port || 80)),
  );
}

const transport = (process.env.HERMES_TRANSPORT?.trim() || "direct") as ProbeTransport;
if (transport !== "direct" && transport !== "ssh") {
  throw new Error("HERMES_TRANSPORT must be direct or ssh");
}

try {
  const startedAt = performance.now();
  const baseUrl = await resolveTarget(transport);
  const result = await testHermesRuntimeAgainst({
    baseUrl,
    token: requiredEnv("HERMES_RUNTIME_TOKEN"),
  });
  const health = result.health as { status?: unknown; platform?: unknown; version?: unknown };
  const enabledFeatures = Object.entries(result.capabilities.features ?? {})
    .filter(([, enabled]) => enabled === true)
    .map(([name]) => name)
    .sort();

  console.log(
    JSON.stringify({
      ok: true,
      transport,
      target: transport === "ssh" ? "ssh-loopback" : new URL(baseUrl).origin,
      latencyMs: Math.round(performance.now() - startedAt),
      health: {
        status: health.status ?? null,
        platform: health.platform ?? result.capabilities.platform ?? null,
        version: health.version ?? null,
      },
      enabledFeatures,
    }),
  );
} finally {
  closeChannel(true);
}
