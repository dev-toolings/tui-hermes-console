"use client";

import { useEffect } from "react";
import { ArrowUpRightIcon, DownloadIcon } from "lucide-react";
import { fetchHermesRuntimeUpdateState, startHermesRuntimeUpdate } from "@/lib/api";
import { getNotificationPreferences } from "@/lib/settings/preferences";
import { toast } from "@/components/ui/toast";
import {
  publishHermesUpdateState,
  publishHermesUpdateUnavailable,
} from "@/components/updates/hermes-update-store";

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const SEEN_RELEASE_KEY = "hermes-update-seen-release";
const AUTO_ATTEMPT_KEY = "hermes-update-auto-attempt";

export function HermesUpdateWatcher() {
  useEffect(() => {
    let disposed = false;
    let checking = false;
    let events: EventSource | null = null;
    let currentPlan: Awaited<ReturnType<typeof fetchHermesRuntimeUpdateState>>["plan"] | null = null;

    const watchOperation = (operationId: string) => {
      events?.close();
      events = new EventSource(`/api/runtime/update/${encodeURIComponent(operationId)}/events`);
      events.addEventListener("update", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as { operation: Awaited<ReturnType<typeof startHermesRuntimeUpdate>> };
        if (disposed) return;
        if (currentPlan) publishHermesUpdateState(currentPlan, payload.operation);
        if (["succeeded", "rolled_back", "failed", "recovery_required"].includes(payload.operation.status)) {
          events?.close();
          events = null;
          if (window.location.pathname !== "/updates") {
            if (payload.operation.status === "succeeded") toast.success("Hermes est à jour et le runtime est sain.");
            else toast.error(payload.operation.error?.message ?? payload.operation.message);
          }
          void check();
        }
      });
    };

    const check = async () => {
      if (checking || disposed) return;
      checking = true;
      try {
        const { plan, activeOperation } = await fetchHermesRuntimeUpdateState();
        if (disposed) return;
        currentPlan = plan;
        publishHermesUpdateState(plan, activeOperation);
        if (activeOperation && !["succeeded", "rolled_back", "failed", "recovery_required"].includes(activeOperation.status)) {
          watchOperation(activeOperation.id);
        }
        if (!plan.latestTag) return;
        const prefs = getNotificationPreferences();
        const seen = window.localStorage.getItem(SEEN_RELEASE_KEY);

        if (!plan.available) {
          window.localStorage.setItem(SEEN_RELEASE_KEY, plan.latestTag);
          return;
        }

        if (prefs.autoUpdateHermes && plan.supported) {
          const attempted = window.sessionStorage.getItem(AUTO_ATTEMPT_KEY);
          if (attempted !== plan.latestTag) {
            window.sessionStorage.setItem(AUTO_ATTEMPT_KEY, plan.latestTag);
            try {
              const operation = await startHermesRuntimeUpdate({
                expectedConfigRevision: plan.configRevision,
                targetTag: plan.latestTag,
                trigger: "automatic",
              });
              window.localStorage.setItem(SEEN_RELEASE_KEY, plan.latestTag);
              publishHermesUpdateState(plan, operation);
              watchOperation(operation.id);
              return;
            } catch (error) {
              window.sessionStorage.removeItem(AUTO_ATTEMPT_KEY);
              toast.error(error instanceof Error ? error.message : "La mise à jour Hermes a échoué.");
            }
          }
        }

        if (!prefs.onHermesUpdate || seen === plan.latestTag) return;
        window.localStorage.setItem(SEEN_RELEASE_KEY, plan.latestTag);
        notifyInApp(plan.latestVersion ?? plan.latestTag);
        if (
          prefs.browserNotifications &&
          "Notification" in window &&
          Notification.permission === "granted" &&
          document.hidden
        ) {
          new Notification("Nouvelle version Hermes", {
            body: `${plan.latestVersion ?? plan.latestTag} est disponible dans Hermes Console.`,
          });
        }
      } catch {
        publishHermesUpdateUnavailable();
        // Une session sans droits installation-admin ne doit pas recevoir une erreur globale.
      } finally {
        checking = false;
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      events?.close();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}

function notifyInApp(version: string) {
  toast.custom(
    (item) => (
      <div className="flex w-[min(26rem,calc(100vw-2rem))] items-start gap-3 rounded-xl border border-seam bg-card p-3 text-foreground shadow-board-elevated">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info-700">
          <DownloadIcon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Nouvelle version Hermes</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">La version {version} est disponible.</p>
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            onClick={() => {
              toast.dismiss(item.id);
              window.location.assign("/updates");
            }}
          >
            Voir et mettre à jour
            <ArrowUpRightIcon className="size-3" aria-hidden="true" />
          </button>
        </div>
      </div>
    ),
    { duration: 10_000, id: `hermes-update-${version}` },
  );
}
