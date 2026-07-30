"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getRuntimePublicClient,
  subscribeRuntimePublic,
  type RuntimePublicDto,
} from "@/lib/runtime/public-client";

export type RuntimePublicStatus = RuntimePublicDto;

export type RuntimeStatusView = {
  loading: boolean;
  configured: boolean;
  healthy: boolean;
  title: string;
  detail: string;
  /** Tailwind class for the status dot */
  dotClass: string;
};

function toView(runtime: RuntimePublicStatus | null, loading: boolean): RuntimeStatusView {
  if (loading && !runtime) {
    return {
      loading: true,
      configured: false,
      healthy: false,
      title: "Runtime…",
      detail: "Vérification",
      dotClass: "bg-muted-foreground",
    };
  }

  if (!runtime || !runtime.configured) {
    return {
      loading: false,
      configured: false,
      healthy: false,
      title: "Runtime à configurer",
      detail: "Local, VPS ou distant",
      dotClass: "bg-warning",
    };
  }

  if (runtime.lastHealthStatus === "healthy") {
    const version = runtime.detectedVersion ? ` · ${runtime.detectedVersion}` : "";
    return {
      loading: false,
      configured: true,
      healthy: true,
      title: `Connecté${version}`,
      detail: runtime.baseUrl ?? "Runtime Hermes",
      dotClass: "bg-pos-700",
    };
  }

  if (runtime.lastHealthStatus === "unreachable") {
    return {
      loading: false,
      configured: true,
      healthy: false,
      title: "Runtime injoignable",
      detail: runtime.baseUrl ?? "Vérifiez Hermes",
      dotClass: "bg-destructive",
    };
  }

  if (runtime.lastHealthStatus === "unauthorized") {
    return {
      loading: false,
      configured: true,
      healthy: false,
      title: "Token invalide",
      detail: runtime.baseUrl ?? "Ressaisissez le token",
      dotClass: "bg-destructive",
    };
  }

  return {
    loading: false,
    configured: true,
    healthy: false,
    title: runtime.source === "env" ? "Configuré (env)" : "Configuré",
    detail: runtime.baseUrl ?? "Testez la connexion",
    dotClass: "bg-info-700",
  };
}

export function useRuntimeStatus() {
  const [runtime, setRuntime] = useState<RuntimePublicStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (force = false) => {
    try {
      const next = await getRuntimePublicClient(force ? { refresh: true } : undefined);
      setRuntime(next);
    } catch {
      // Garde l’état précédent ; la page runtime reste la source d’action.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onRefresh = () => void refresh(true);
    return subscribeRuntimePublic(onRefresh);
  }, [refresh]);

  return { ...toView(runtime, loading), refresh: () => refresh(true), runtime };
}
