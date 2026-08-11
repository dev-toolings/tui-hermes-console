import { describe, expect, test } from "bun:test";
import { getRequiredConnectors } from "./requirements";

const agent = (instructions: string, name = "Agent") => ({
  slug: "agent",
  name,
  instructions,
});

describe("getRequiredConnectors", () => {
  test("n'exige rien quand « email » n'est qu'un champ de données", () => {
    // Régression : l'agent Prospect demandait Gmail (IMAP) parce que ses
    // consignes disaient « n'invente jamais un email ». La Console envoyait
    // l'utilisateur configurer un secret dont la mission n'a aucun usage.
    expect(
      getRequiredConnectors(
        agent(
          "Trouve des prospects B2B. N'invente jamais un nom, un téléphone ou un email. " +
            "Ne collecte que des coordonnées publiées publiquement (contact@, standard).",
          "Prospect",
        ),
      ),
    ).toEqual([]);
  });

  test("exige Gmail quand l'agent doit lire une boîte", () => {
    expect(getRequiredConnectors(agent("Trie ma boîte de réception chaque matin."))).toEqual([
      "gmail_imap",
    ]);
    expect(getRequiredConnectors(agent("Connecte-toi en IMAP et résume."))).toEqual([
      "gmail_imap",
    ]);
    expect(getRequiredConnectors(agent("Lis mes mails et fais un triage."))).toEqual([
      "gmail_imap",
    ]);
  });

  test("suit le fournisseur nommé", () => {
    expect(getRequiredConnectors(agent("Trie ma boîte de réception Gmail."))).toEqual([
      "gmail_imap",
    ]);
    expect(getRequiredConnectors(agent("Consulte mes messages sur Outlook."))).toEqual([
      "outlook_imap",
    ]);
  });

  test("peut exiger les deux quand les deux sont nommés", () => {
    const required = getRequiredConnectors(
      agent("Relève ma boîte de réception Gmail puis celle sur Office 365."),
    );
    expect(required).toContain("gmail_imap");
    expect(required).toContain("outlook_imap");
  });

  test("ne se déclenche pas sur un fournisseur cité sans boîte mail", () => {
    // « Google » apparaît dans une consigne de recherche web, pas de mail.
    expect(
      getRequiredConnectors(agent("Cherche l'entreprise sur Google et cite la source.")),
    ).toEqual([]);
  });
});
