import { describe, expect, test } from "bun:test";
import { RuntimeApiError, runtimeApiErrorFromResponse } from "./models-client";

describe("runtimeApiErrorFromResponse", () => {
  test("préserve le statut, le code et le message de l’API", () => {
    const error = runtimeApiErrorFromResponse(
      { status: 412 },
      {
        error: {
          code: "HERMES_RUNTIME_NOT_READY",
          message: "Le runtime Hermes prépare le catalogue.",
        },
      },
      "Impossible de charger les modèles Hermes.",
    );

    expect(error).toBeInstanceOf(RuntimeApiError);
    expect(error).toMatchObject({
      status: 412,
      code: "HERMES_RUNTIME_NOT_READY",
      message: "Le runtime Hermes prépare le catalogue.",
    });
  });

  test("garde le statut et le message de repli quand le corps est incomplet", () => {
    const error = runtimeApiErrorFromResponse(
      { status: 503 },
      null,
      "Impossible de charger les modèles Hermes.",
    );

    expect(error).toMatchObject({
      status: 503,
      code: null,
      message: "Impossible de charger les modèles Hermes.",
    });
  });
});
