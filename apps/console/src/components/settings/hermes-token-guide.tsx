"use client";

import { useState, type ReactNode } from "react";
import { BookOpenIcon } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";

/** Badge « Guide » + modale expliquant l'API_SERVER_KEY d'Hermes, en dev local et en prod. */
export function HermesTokenGuide() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-info-100 px-2 text-[0.6875rem] font-medium text-info-700 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <BookOpenIcon className="size-3" />
        Guide
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Token d’accès Hermes (API_SERVER_KEY)"
        description="Ce que c’est, pourquoi Hermes l’exige, et quoi faire en dev local comme en production."
        className="max-w-[calc(100%-2rem)] md:w-[50vw] md:max-w-[50vw]"
      >
        {/* @container : la modale fait 50vw, les breakpoints viewport ne disent rien de sa largeur. */}
        <div className="@container space-y-6">
          <Section title="En bref">
            <p>
              Le token est l’<Code>API_SERVER_KEY</Code> d’Hermes — le mot de passe de son serveur
              API. La Console ne le génère pas : vous le définissez sur la machine où tourne Hermes
              (<Code>~/.hermes/.env</Code>), puis vous le recopiez ici. Toute requête part ensuite
              avec un en-tête <Code>Authorization: Bearer …</Code>.
            </p>
          </Section>

          <Section title="Deux authentifications, à ne pas confondre">
            <Pre>{`Console ──1) SSH ───────────▶  ouvre le CHEMIN réseau
        │                       (hôte, utilisateur, clé/mot de passe)
        └─2) Bearer token ────▶  AUTORISE l'appel une fois arrivé
                                (API_SERVER_KEY)`}</Pre>
            <p>
              SSH vous fait entrer dans la machine, le token ouvre la porte de l’API. En mode
              « accès direct » il n’y a pas de couche SSH — le token reste obligatoire.
            </p>
          </Section>

          <Section title="Pourquoi Hermes l’exige">
            <p>
              L’API d’Hermes dispatche du travail d’agent avec accès terminal : une clé devinable
              équivaut à de l’exécution de code à distance. Le garde de démarrage refuse donc de
              lancer le serveur API si la clé est absente, trop courte ou générique.
            </p>
            <ul className="ml-4 list-disc space-y-1">
              <li>
                Requise <strong>même en bind loopback</strong> (<Code>127.0.0.1</Code>) — pas
                d’exception.
              </li>
              <li>
                Minimum <strong>16 caractères</strong>, et les valeurs placeholder sont rejetées.
              </li>
              <li>
                Si la vérification de robustesse ne peut pas tourner, Hermes échoue <em>fermé</em> :
                il ne démarre pas.
              </li>
              <li>
                Le refus est <strong>non-retryable</strong> : après correction, relancez la
                plateforme (<Code>/platform resume api_server</Code>) ou le gateway.
              </li>
            </ul>
          </Section>

          <div className="grid gap-4 @2xl:grid-cols-2">
            <Card title="Mode dev local">
              <Steps>
                <li>
                  Générer une clé : <Code>openssl rand -hex 32</Code>
                </li>
                <li>
                  L’écrire dans <Code>~/.hermes/.env</Code> :
                  <Pre>{`API_SERVER_ENABLED=true
API_SERVER_KEY=<votre-clé>`}</Pre>
                  <span className="text-muted-foreground">
                    Sans <Code>API_SERVER_ENABLED</Code>, rien n’écoute sur <Code>:8642</Code>.
                  </span>
                </li>
                <li>
                  Redémarrer : <Code>hermes gateway run</Code>
                </li>
                <li>
                  Vérifier : <Code>ss -lntp | grep 8642</Code>
                </li>
                <li>
                  Ici : URL <Code>http://127.0.0.1:8642</Code>, transport « Accès direct », coller la
                  clé, puis <strong>Tester</strong>.
                </li>
              </Steps>
            </Card>

            <Card title="Mode prod (VPS, autre machine)">
              <Steps>
                <li>
                  Clé <strong>distincte</strong> de celle de dev, jamais commitée, jamais partagée
                  entre environnements.
                </li>
                <li>
                  Laisser Hermes écouter sur <Code>127.0.0.1:8642</Code> — n’ouvrez pas ce port au
                  réseau.
                </li>
                <li>
                  Traverser par le <strong>tunnel SSH</strong> de la Console (ou un reverse proxy en
                  TLS si l’exposition est assumée).
                </li>
                <li>
                  Côté serveur : <Code>AllowTcpForwarding yes</Code> dans <Code>sshd_config</Code>,
                  sinon le tunnel est refusé.
                </li>
                <li>
                  L’URL à saisir est celle vue <strong>depuis la machine distante</strong>, en{" "}
                  <Code>http://</Code> : le lien est déjà chiffré par SSH.
                </li>
                <li>
                  Redémarrage du service :{" "}
                  <Code>systemctl --user restart hermes-gateway</Code>
                </li>
              </Steps>
            </Card>
          </div>

          <Section title="Rotation de la clé">
            <Steps>
              <li>
                Remplacer <Code>API_SERVER_KEY</Code> dans <Code>~/.hermes/.env</Code>.
              </li>
              <li>Redémarrer le gateway — la nouvelle clé n’est lue qu’au démarrage.</li>
              <li>
                Revenir ici, coller la nouvelle valeur, <strong>Tester</strong> puis{" "}
                <strong>Enregistrer</strong>. Entre les deux, la Console répond{" "}
                <Code>unauthorized</Code>.
              </li>
            </Steps>
          </Section>

          <Section title="Diagnostic">
            <dl className="space-y-2">
              <Row symptom="401 / statut « unauthorized »">
                Le chemin réseau est bon, le token est faux. Recopiez la valeur exacte du{" "}
                <Code>.env</Code> distant.
              </Row>
              <Row symptom="Statut « unreachable »">
                Ce n’est pas le token : URL, port, tunnel — ou le garde a refusé le démarrage.
                Vérifiez <Code>ss -lntp | grep 8642</Code> et les logs du gateway.
              </Row>
              <Row symptom="/health répond mais le test échoue">
                Normal : <Code>/health</Code> n’est pas authentifié, tout <Code>/v1/*</Code> l’est.
                C’est donc bien le token.
              </Row>
              <Row symptom="« hermes --version » échoue en SSH">
                Faux négatif : un SSH non interactif ne charge pas le <Code>PATH</Code> du shell.
                Fiez-vous au service ou au port.
              </Row>
            </dl>
          </Section>

          <Section title="Côté Console">
            <p>
              Le token est chiffré au repos (AES-256-GCM, clé dérivée de{" "}
              <Code>APP_ENCRYPTION_KEY</Code>) et n’est jamais réaffiché. Un champ laissé vide
              conserve la valeur enregistrée — <strong>Enregistrer</strong> ne le redemande pas. La
              variable d’environnement <Code>HERMES_RUNTIME_TOKEN</Code> ne sert que de repli quand
              aucune connexion n’est stockée en base.
            </p>
          </Section>
        </div>
      </Dialog>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[0.8125rem] font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** Bordure seule : un fond ferait disparaître les `Pre`/`Code` en `bg-inset`. */
function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 rounded-xl border border-seam p-3">
      <h3 className="text-[0.8125rem] font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="ml-4 list-decimal space-y-1.5">{children}</ol>;
}

/** Bordure seule, comme `Card` : ces lignes contiennent des `Code` en `bg-inset`. */
function Row({ symptom, children }: { symptom: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-seam px-3 py-2">
      <dt className="font-medium text-foreground">{symptom}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-inset px-1 py-0.5 font-mono text-[0.75em] text-foreground">
      {children}
    </code>
  );
}

function Pre({ children }: { children: string }) {
  return (
    <pre className="my-1.5 overflow-x-auto rounded-lg bg-inset px-3 py-2 font-mono text-[0.6875rem] leading-relaxed text-foreground">
      {children}
    </pre>
  );
}
