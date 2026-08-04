import { z } from "zod";
import type { HermesSkillDto } from "@console/core/types/api";
import { getRuntimePublic, getStoredSshRuntime } from "./config";
import { HermesRuntimeError } from "./hermes-adapter";
import { withEphemeralSshChannel } from "./ssh";

const DEFAULT_DASHBOARD_PORT = 9119;
const DASHBOARD_TIMEOUT_MS = 1_500;

const dashboardSkillSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().default(""),
    category: z.string().nullable().optional(),
    enabled: z.boolean(),
  })
  .passthrough();

const dashboardSkillsResponseSchema = z.union([
  z.array(dashboardSkillSchema),
  z.object({ data: z.array(dashboardSkillSchema) }).passthrough(),
]);

const toggleResponseSchema = z
  .object({
    ok: z.literal(true),
    name: z.string().min(1),
    enabled: z.boolean(),
  })
  .passthrough();

function dashboardPort() {
  const parsed = Number(process.env.HERMES_DASHBOARD_PORT ?? DEFAULT_DASHBOARD_PORT);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535
    ? parsed
    : DEFAULT_DASHBOARD_PORT;
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function directDashboardBaseUrl(runtimeBaseUrl: string | null) {
  const configured = process.env.HERMES_DASHBOARD_BASE_URL?.trim();
  if (configured) return normalizeBaseUrl(configured);

  try {
    const url = new URL(runtimeBaseUrl ?? "http://127.0.0.1:8642");
    url.port = String(dashboardPort());
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return normalizeBaseUrl(url.toString());
  } catch {
    return `http://127.0.0.1:${dashboardPort()}`;
  }
}

export async function withDashboardBaseUrl<T>(operation: (baseUrl: string) => Promise<T>) {
  const runtime = await getRuntimePublic();

  if (runtime.transport === "ssh") {
    const stored = await getStoredSshRuntime();
    return withEphemeralSshChannel(stored.target, async (channel) => {
      const baseUrl = await channel.forward("127.0.0.1", dashboardPort());
      return operation(baseUrl);
    });
  }

  return operation(directDashboardBaseUrl(runtime.baseUrl));
}

export async function dashboardJson<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DASHBOARD_TIMEOUT_MS);

  try {
    const sessionToken = await dashboardSessionToken(baseUrl, controller.signal);
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "X-Hermes-Session-Token": sessionToken,
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new HermesRuntimeError(
        `Le Dashboard Hermes a répondu HTTP ${response.status}.`,
        response.status,
        "HERMES_DASHBOARD_UNAVAILABLE",
      );
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof HermesRuntimeError) throw error;
    throw new HermesRuntimeError(
      "Le Dashboard Hermes n’est pas accessible pour administrer les skills.",
      503,
      "HERMES_DASHBOARD_UNAVAILABLE",
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function dashboardSessionToken(baseUrl: string, signal: AbortSignal) {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/`, {
    headers: { Accept: "text/html" },
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new HermesRuntimeError(
      `Le Dashboard Hermes a répondu HTTP ${response.status} lors de l’ouverture de sa session.`,
      response.status,
      "HERMES_DASHBOARD_UNAVAILABLE",
    );
  }
  const html = await response.text();
  const token = extractDashboardSessionToken(html);
  if (!token) {
    throw new HermesRuntimeError(
      "Le Dashboard Hermes n’a pas fourni de session d’administration.",
      503,
      "HERMES_DASHBOARD_SESSION_UNAVAILABLE",
    );
  }
  return token;
}

export function extractDashboardSessionToken(html: string) {
  return html.match(/__HERMES_SESSION_TOKEN__\s*=\s*["']([^"']+)["']/)?.[1] ?? null;
}

export async function listHermesDashboardSkills(): Promise<HermesSkillDto[]> {
  return withDashboardBaseUrl(async (baseUrl) => {
    const body = dashboardSkillsResponseSchema.parse(
      await dashboardJson<unknown>(baseUrl, "/api/skills"),
    );
    const skills = Array.isArray(body) ? body : body.data;
    return skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      category: skill.category ?? null,
      enabled: skill.enabled,
    }));
  });
}

export async function toggleHermesDashboardSkill(input: {
  name: string;
  enabled: boolean;
}) {
  return withDashboardBaseUrl(async (baseUrl) => {
    const body = toggleResponseSchema.parse(
      await dashboardJson<unknown>(baseUrl, "/api/skills/toggle", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    );
    return { name: body.name, enabled: body.enabled };
  });
}
