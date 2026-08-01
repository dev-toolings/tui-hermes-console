import { expect, test } from "bun:test";
import { z } from "zod";
import { apiErrorResponse } from "./errors";

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
