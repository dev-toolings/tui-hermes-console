import { Link } from "@/lib/router";
import { AlertTriangleIcon, KeyRoundIcon, LockIcon, ShieldAlertIcon, UserIcon } from "lucide-react";
import { Badge, ButtonLink, Card, CardSurface, SectionHeading } from "@/components/ui/boardui";
import { SettingsContent } from "@/components/settings/settings-content";
import { MobileDevicePairing } from "@/components/settings/mobile-device-pairing";
import type { RuntimeData } from "@/loaders";


export function SettingsSecurityScreen({ data }: { data: RuntimeData }) {
  const { runtime } = data;
  // `hasEncryptionKey()` lisait `process.env` pendant le rendu serveur. Le
  // navigateur n'a pas cet environnement : le serveur répond à sa place.
  const encryptionReady = runtime.encryptionReady;

  return (
    <SettingsContent>
      <SectionHeading
        title="Sécurité"
        description="Secrets, périmètre d’exécution et garde-fous documentés dans le PRD."
      />

      <Card>
        <CardSurface className="space-y-4">
          <SecurityRow
            icon={UserIcon}
            title="Compte administrateur"
            description="Authentification mono-utilisateur, sessions HttpOnly et protection CSRF."
            badge={<Badge tone="success">Actif</Badge>}
          />
          <SecurityRow
            icon={KeyRoundIcon}
            title="Token runtime (API_SERVER_KEY)"
            description="Chiffré AES-256-GCM au repos. Masqué par défaut, modifiable uniquement par un opérateur autorisé."
            badge={
              <Badge tone={runtime.tokenConfigured ? "success" : "warning"}>
                {runtime.tokenConfigured ? "Configuré" : "Manquant"}
              </Badge>
            }
            action={
              <ButtonLink href="/settings/runtime" variant="secondary" className="mt-2 w-fit">
                Gérer la connexion
              </ButtonLink>
            }
          />
          <SecurityRow
            icon={LockIcon}
            title="Chiffrement au repos"
            description="Nécessite APP_ENCRYPTION_KEY sur le serveur de la Console."
            badge={
              <Badge tone={encryptionReady ? "success" : "danger"}>
                {encryptionReady ? "Actif" : "Clé absente"}
              </Badge>
            }
          />
        </CardSurface>
      </Card>

      <MobileDevicePairing />

      <Card>
        <CardSurface>
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-warn-100 text-warn-700">
              <ShieldAlertIcon className="size-4" />
            </span>
            <div className="space-y-3">
              <div>
                <h3 className="text-[0.8125rem] font-medium">Confinement du runtime — exigence</h3>
                <p className="mt-1 text-[0.6875rem] leading-5 text-muted-foreground">
                  Hermes doit tourner en conteneur avec uniquement son volume de config et le volume
                  de travail des missions. L’agent peut exécuter des commandes et modifier des
                  fichiers dans cet espace — ne pas le présenter comme une simple « mission » sans
                  risque.
                </p>
              </div>
              <p className="text-[0.6875rem] leading-5 text-muted-foreground">
                Les demandes d’approbation ne constituent pas une protection sur /v1/runs (fail-open
                mesuré). L’écran d’autorisation est prévu pour le jour où le runtime l’émettra.
              </p>
            </div>
          </div>
        </CardSurface>
      </Card>

      <div className="rounded-xl border border-warn-200 bg-warn-50 p-3 text-[0.75rem] text-warn-800 dark:border-warn-900/40 dark:bg-warn-950/40 dark:text-warn-200">
        <p className="flex items-start gap-2">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          Rotation de clé : si APP_ENCRYPTION_KEY change, ressaisissez le token dans{" "}
          <Link href="/settings/runtime" className="font-medium underline">
            Runtime Hermes
          </Link>
          .
        </p>
      </div>
    </SettingsContent>
  );
}

function SecurityRow({
  icon: Icon,
  title,
  description,
  badge,
  action,
}: {
  icon: typeof UserIcon;
  title: string;
  description: string;
  badge: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-seam pb-4 last:border-0 last:pb-0">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-ai-tertiary text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.8125rem] font-medium">{title}</p>
          {badge}
        </div>
        <p className="mt-1 text-[0.6875rem] leading-5 text-muted-foreground">{description}</p>
        {action}
      </div>
    </div>
  );
}
