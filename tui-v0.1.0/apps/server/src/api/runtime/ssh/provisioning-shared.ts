import { z } from "zod";
import type { RuntimeProvisionMode } from "@console/core/types/api";
import type { RuntimeSshProvisionInput } from "@/modules/runtime/ssh/provisioning";

const targetSchema = z.object({
  host: z.string().trim().min(1).max(255).regex(/^[A-Za-z0-9._:-]+$/),
  port: z.number().int().min(1).max(65_535),
  user: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._-]+$/),
  auth: z.enum(["agent", "password"]),
  password: z.string().min(1).max(1_000).optional(),
});

export const provisionInputSchema = z.object({
  provisioner: targetSchema,
  target: targetSchema,
  mode: z.enum(["docker", "native"]),
  remoteBaseUrl: z.string().trim().url().max(500),
  remoteWorkdir: z.string().trim().min(1).max(400),
  token: z.string().trim().min(1).max(2_000).optional(),
  confirmation: z.string().trim().max(500).optional(),
});

export function parseProvisionInput(value: unknown): RuntimeSshProvisionInput {
  const parsed = provisionInputSchema.parse(value);
  return {
    provisioner: parsed.provisioner,
    target: parsed.target,
    mode: parsed.mode as RuntimeProvisionMode,
    remoteBaseUrl: parsed.remoteBaseUrl,
    remoteWorkdir: parsed.remoteWorkdir,
    token: parsed.token,
    confirmation: parsed.confirmation,
  };
}
