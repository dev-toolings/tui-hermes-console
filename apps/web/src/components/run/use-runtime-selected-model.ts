"use client";

/**
 * Le modèle que le runtime sert réellement.
 *
 * Un agent Hermes peut être configuré sur `hermes-agent` — le nom du runtime,
 * pas d'un LLM. Ce qui fixe la fenêtre de contexte, c'est le modèle du
 * fournisseur derrière (`gpt-5.4-nano`, `claude-sonnet-5`, …), et il n'est
 * connu que du catalogue `/api/runtime/models`.
 *
 * Le client sous-jacent partage une seule requête entre tous les consommateurs
 * et garde le résultat en cache : monter ce hook sous le composer ne rajoute
 * pas d'appel réseau si l'écran des paramètres l'a déjà chargé.
 */
import { useEffect, useState } from "react";
import {
  getModelSettingsClient,
  peekModelSettingsClient,
} from "@/lib/runtime/models-client";

export function useRuntimeSelectedModel(): string | null {
  const [model, setModel] = useState<string | null>(
    () => peekModelSettingsClient()?.selectedModel ?? null,
  );

  useEffect(() => {
    if (model) return;
    let alive = true;
    void getModelSettingsClient()
      .then((settings) => {
        if (alive) setModel(settings.selectedModel ?? null);
      })
      .catch(() => {
        // Le catalogue est un confort : sans lui, l'anneau reste simplement
        // masqué. Rien à signaler à l'utilisateur ici.
      });
    return () => {
      alive = false;
    };
  }, [model]);

  return model;
}
