import { LockKeyholeIcon, ServerIcon, TriangleAlertIcon } from "lucide-react";
import { RuntimeConnectionForm } from "@/components/forms/runtime-connection-form";
import { Card, CardSurface } from "@/components/ui/boardui";

export function SetupScreen() {
  return (
    <main className="min-h-dvh bg-surface-sunken p-3 sm:p-6">
      <div className="mx-auto grid min-h-[calc(100dvh-1.5rem)] max-w-6xl overflow-hidden rounded-3xl bg-panel shadow-board-elevated lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="flex flex-col justify-between bg-sidebar p-6 text-sidebar-foreground sm:p-8">
          <div>
            <span className="flex size-10 items-center justify-center rounded-[10px] bg-[image:var(--gradient-primary)] font-bold text-primary-foreground shadow-[var(--shadow-xs)]">
              H
            </span>
            <p className="mt-4 text-sm font-semibold">Hermes Console</p>
            <p className="mt-1 text-[0.75rem] leading-5 text-muted-foreground">
              Pilotez un runtime Hermes sans dépendre de son lieu d’installation.
            </p>
          </div>

          <ol className="my-10 space-y-5">
            <Step number="01" icon={TriangleAlertIcon} title="Accès non protégé">
              L’authentification n’est pas encore livrée. Gardez la Console sur 127.0.0.1.
            </Step>
            <Step number="02" icon={ServerIcon} title="Runtime Hermes">
              Connectez une installation locale, privée ou distante.
            </Step>
            <Step number="03" icon={LockKeyholeIcon} title="Découverte">
              Vérifiez la santé et les capacités disponibles.
            </Step>
          </ol>

          <p className="text-[0.6875rem] leading-5 text-muted-foreground">
            Aucun secret Hermes n’est exposé au navigateur après l’enregistrement.
          </p>
        </aside>

        <section className="min-w-0 overflow-y-auto p-5 scrollbar-subtle sm:p-8 lg:p-10">
          <div className="mx-auto max-w-3xl">
            <p className="font-mono text-[0.6875rem] font-semibold text-primary">CONFIGURATION 01</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Préparer la Console</h1>
            <p className="mt-2 max-w-2xl text-[0.8125rem] leading-6 text-muted-foreground">
              Cette première passe définit la frontière réseau. Elle ne modifie jamais une
              installation Hermes existante.
            </p>

            <Card className="mt-6">
              <CardSurface>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-destructive">
                  <TriangleAlertIcon className="size-4 shrink-0" aria-hidden />
                  La Console n’a pas encore d’authentification
                </h2>
                <p className="mt-3 text-[0.8125rem] leading-6 text-muted-foreground">
                  Il n’existe ni compte administrateur, ni session : <strong>toutes les pages et
                  toutes les routes API sont accessibles sans identification</strong>. Créer une
                  mission revient à exécuter des commandes sous le compte du runtime Hermes.
                </p>
                <p className="mt-3 text-[0.8125rem] leading-6 text-muted-foreground">
                  N’exposez cette Console ni sur Internet ni sur un réseau local partagé. Servez-la
                  sur <code className="font-mono text-[0.75rem]">127.0.0.1</code>, ou placez une
                  authentification en amont dans un reverse-proxy.
                </p>
              </CardSurface>
            </Card>

            <Card className="mt-4">
              <CardSurface>
                <h2 className="mb-4 text-sm font-semibold">Connexion Hermes</h2>
                <RuntimeConnectionForm />
              </CardSurface>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}

function Step({
  number,
  icon: Icon,
  title,
  children,
}: {
  number: string;
  icon: typeof ServerIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-ai-tertiary text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <span>
        <span className="font-mono text-[0.625rem] font-semibold text-primary">{number}</span>
        <span className="block text-[0.8125rem] font-medium">{title}</span>
        <span className="mt-0.5 block text-[0.6875rem] leading-5 text-muted-foreground">{children}</span>
      </span>
    </li>
  );
}

