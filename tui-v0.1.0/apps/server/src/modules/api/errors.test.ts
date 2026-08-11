import { expect, test } from "bun:test";
import { z } from "zod";
import { apiErrorResponse } from "./errors";
import { HermesRuntimeError } from "@/modules/runtime/hermes-adapter";

test("apiErrorResponse exposes Zod field errors as a 400 contract", async () => {
  const schema = z.object({ token: z.string().min(1) });
  const result = schema.safeParse({ token: "" });
  if (result.success) throw new Error("Fixture invalide attendue.");

  const response = apiErrorResponse(result.error);
  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({
    error: {
      code: "INVALID_INPUT",
      message: "La requête contient des données invalides.",
      fields: { token: expect.any(Array) },
    },
  });
});

test("apiErrorResponse preserves a Hermes precondition for the runtime dialog", async () => {
  const response = apiErrorResponse(
    new HermesRuntimeError(
      "Le runtime Hermes termine son initialisation.",
      412,
      "HERMES_PRECONDITION_FAILED",
    ),
  );

  expect(response.status).toBe(412);
  expect(await response.json()).toEqual({
    error: {
      code: "HERMES_PRECONDITION_FAILED",
      message: "Le runtime Hermes termine son initialisation.",
    },
  });
});
