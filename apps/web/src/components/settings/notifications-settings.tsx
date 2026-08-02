"use client";

import { useSyncExternalStore, useState } from "react";
import { BellIcon, BellRingIcon, CheckCircle2Icon } from "lucide-react";
import { Card, CardSurface } from "@/components/ui/boardui";
import { Checkbox } from "@/components/ui/checkbox";
import {
  getNotificationPreferences,
  getServerNotificationPreferences,
  setNotificationPreferences,
  subscribeToPreferences,
  type NotificationPreferences,
} from "@/lib/settings/preferences";

export function NotificationsSettings() {
  const prefs = useSyncExternalStore(
    subscribeToPreferences,
    getNotificationPreferences,
    getServerNotificationPreferences,
  );
  const [status, setStatus] = useState<string | null>(null);

  function update<K extends keyof NotificationPreferences>(key: K, value: NotificationPreferences[K]) {
    const next = { ...prefs, [key]: value };
    setNotificationPreferences(next);
    setStatus(null);
  }

  async function requestBrowserPermission() {
    if (!("Notification" in window)) {
      setStatus("Notifications navigateur non supportées sur cet appareil.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      update("browserNotifications", true);
      setStatus("Notifications navigateur activées.");
      return;
    }
    update("browserNotifications", false);
    setStatus("Permission refusée — activez-les dans les réglages du navigateur.");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardSurface className="space-y-4">
          <div>
            <h3 className="text-[0.8125rem] font-medium">Alertes de mission</h3>
            <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
              Préférences locales. Les notifications in-app arrivent en Phase 3 ; ces réglages
              préparent le comportement.
            </p>
          </div>

          <ToggleRow
            label="Mission terminée"
            description="Quand une exécution passe en completed."
            checked={prefs.onComplete}
            onChange={(checked) => update("onComplete", checked)}
          />
          <ToggleRow
            label="Mission échouée"
            description="Quand une exécution passe en failed."
            checked={prefs.onFailed}
            onChange={(checked) => update("onFailed", checked)}
          />
          <ToggleRow
            label="Demande d’autorisation"
            description="Quand une mission passe en awaiting_approval."
            checked={prefs.onApproval}
            onChange={(checked) => update("onApproval", checked)}
          />
        </CardSurface>
      </Card>

      <Card>
        <CardSurface className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-info-soft text-info-700">
              <BellRingIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-[0.8125rem] font-medium">Notifications navigateur</h3>
              <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                Permet d’être alerté même si l’onglet Hermes Console n’est pas au premier plan.
              </p>
            </div>
          </div>

          <ToggleRow
            label="Activer les notifications système"
            description="Nécessite l’autorisation du navigateur."
            checked={prefs.browserNotifications}
            onChange={(checked) => {
              if (checked) void requestBrowserPermission();
              else update("browserNotifications", false);
            }}
          />

          {status ? (
            <p className="flex items-center gap-2 text-[0.75rem] text-muted-foreground">
              <CheckCircle2Icon className="size-4 shrink-0" />
              {status}
            </p>
          ) : null}

          <div className="rounded-xl bg-surface-sunken p-3 text-[0.6875rem] text-muted-foreground">
            <p className="flex items-start gap-2">
              <BellIcon className="mt-0.5 size-3.5 shrink-0" />
              Les alertes temps réel seront branchées sur le flux SSE des missions (Phase 3). Les
              préférences sont déjà enregistrées localement.
            </p>
          </div>
        </CardSurface>
      </Card>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-input bg-card p-3">
      <span>
        <span className="block text-[0.8125rem] font-medium">{label}</span>
        <span className="mt-0.5 block text-[0.6875rem] text-muted-foreground">{description}</span>
      </span>
      <Checkbox
        className="mt-1"
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
      />
    </label>
  );
}
