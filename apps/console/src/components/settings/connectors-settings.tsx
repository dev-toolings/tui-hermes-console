"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircleIcon, PlugIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/boardui";
import { SettingsContent } from "@/components/settings/settings-content";
import { Badge, Card, CardSurface, SectionHeading } from "@/components/ui/boardui";
import { CONNECTOR_PRESETS, type ConnectorPublicDto } from "@console/core/modules/connectors/types";
import type { ConnectorType } from "@console/core/types/domain";

const ORDER: ConnectorType[] = ["gmail_imap", "outlook_imap", "pro_imap"];

export function ConnectorsSettings() {
  const [connectors, setConnectors] = useState<ConnectorPublicDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/connectors", { cache: "no-store" });
    const body = (await response.json()) as {
      connectors?: ConnectorPublicDto[];
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(body.error?.message ?? "Impossible de charger les connecteurs.");
    }
    setConnectors(body.connectors ?? []);
  }, []);

  useEffect(() => {
    void refresh()
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Erreur."))
      .finally(() => setLoading(false));
  }, [refresh]);

  return (
    <SettingsContent>
      <SectionHeading
        title="Connecteurs"
        description="Secrets typés chiffrés côté Console. Pas d’éditeur .env libre — configurez Gmail, Outlook ou un IMAP pro, puis testez la connexion."
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="grid gap-4">
        {ORDER.map((type) => (
          <ConnectorCard
            key={type}
            type={type}
            connector={connectors.find((item) => item.type === type) ?? null}
            loading={loading}
            onChange={() => void refresh().catch(() => undefined)}
          />
        ))}
      </div>
    </SettingsContent>
  );
}

function ConnectorCard({
  type,
  connector,
  loading,
  onChange,
}: {
  type: ConnectorType;
  connector: ConnectorPublicDto | null;
  loading: boolean;
  onChange: () => void;
}) {
  const preset = CONNECTOR_PRESETS[type];
  const [email, setEmail] = useState(connector?.email ?? "");
  const [imapHost, setImapHost] = useState(connector?.imapHost ?? preset.imapHost);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!connector) return;
    setEmail(connector.email);
    setImapHost(connector.imapHost);
  }, [connector]);

  const statusBadge = !connector?.passwordConfigured ? (
    <Badge tone="warning">Non configuré</Badge>
  ) : connector.lastTestStatus === "healthy" ? (
    <Badge tone="success">Test OK</Badge>
  ) : connector.lastTestStatus === "failed" ? (
    <Badge tone="danger">Test échoué</Badge>
  ) : (
    <Badge tone="info">Configuré</Badge>
  );

  return (
    <Card>
      <CardSurface className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <PlugIcon className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">{preset.label}</h2>
          </div>
          {loading ? <Badge tone="neutral">…</Badge> : statusBadge}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-[0.8125rem]">
            <span className="font-medium">Adresse e-mail</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={`${input} mt-1.5`}
              placeholder="agent@gmail.com"
              autoComplete="username"
            />
          </label>
          <label className="block text-[0.8125rem]">
            <span className="font-medium">Serveur IMAP</span>
            <input
              type="text"
              value={imapHost}
              onChange={(event) => setImapHost(event.target.value)}
              className={`${input} mt-1.5`}
              placeholder={preset.imapHost || "mail.example.com"}
            />
          </label>
        </div>

        <label className="block text-[0.8125rem]">
          <span className="font-medium">
            Mot de passe / app password{connector?.passwordConfigured ? " (laisser vide pour conserver)" : ""}
          </span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={`${input} mt-1.5`}
            autoComplete="new-password"
          />
        </label>

        {message ? <p className="text-[0.8125rem] text-muted-foreground">{message}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            disabled={saving || !email.trim() || (!password && !connector?.passwordConfigured)}
            onClick={async () => {
              setSaving(true);
              setMessage(null);
              try {
                const response = await fetch(`/api/connectors/${type}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    email,
                    imapHost,
                    password: password || undefined,
                  }),
                });
                const body = (await response.json()) as { error?: { message?: string } };
                if (!response.ok) throw new Error(body.error?.message ?? "Échec de l’enregistrement.");
                setPassword("");
                setMessage("Connecteur enregistré.");
                onChange();
              } catch (reason) {
                setMessage(reason instanceof Error ? reason.message : "Erreur.");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
            Enregistrer
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={testing || !connector?.passwordConfigured}
            onClick={async () => {
              setTesting(true);
              setMessage(null);
              try {
                const response = await fetch(`/api/connectors/${type}/test`, { method: "POST" });
                const body = (await response.json()) as { error?: { message?: string } };
                if (!response.ok) throw new Error(body.error?.message ?? "Test IMAP échoué.");
                setMessage("Connexion IMAP validée.");
                onChange();
              } catch (reason) {
                setMessage(reason instanceof Error ? reason.message : "Test échoué.");
              } finally {
                setTesting(false);
              }
            }}
          >
            {testing ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
            Tester IMAP
          </Button>
          {connector?.passwordConfigured ? (
            <Button
              type="button"
              variant="ghost"
              onClick={async () => {
                if (!window.confirm("Supprimer ce connecteur ?")) return;
                const response = await fetch(`/api/connectors/${type}`, { method: "DELETE" });
                if (!response.ok) {
                  const body = (await response.json()) as { error?: { message?: string } };
                  setMessage(body.error?.message ?? "Suppression impossible.");
                  return;
                }
                setPassword("");
                setMessage("Connecteur supprimé.");
                onChange();
              }}
            >
              <Trash2Icon className="size-4" />
              Supprimer
            </Button>
          ) : null}
        </div>
      </CardSurface>
    </Card>
  );
}

const input =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-board-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";
