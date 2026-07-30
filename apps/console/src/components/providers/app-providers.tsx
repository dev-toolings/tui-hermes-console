"use client";

import { useEffect, type ReactNode } from "react";
import toast, { Toaster } from "react-hot-toast";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Skip high-frequency chat traffic — everything else /api mutates → toast. */
const SILENT_PATH = /^\/api\/threads\/[^/]+\/messages(?:\/|$)/;

/** Default ToastBar look from https://react-hot-toast.com */
const HOT_TOAST_OPTIONS = {
  duration: 4000,
  style: {
    background: "#fff",
    color: "#363636",
    boxShadow: "0 3px 10px rgba(0, 0, 0, 0.1), 0 3px 3px rgba(0, 0, 0, 0.05)",
    padding: "8px 10px",
    borderRadius: "8px",
    maxWidth: "350px",
    fontSize: "14px",
    lineHeight: "1.3",
  },
  success: {
    duration: 3000,
    iconTheme: {
      primary: "#61d345",
      secondary: "#fff",
    },
  },
  error: {
    duration: 4000,
    iconTheme: {
      primary: "#ff4b4b",
      secondary: "#fff",
    },
  },
} as const;

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <>
      <Toaster
        position="top-center"
        reverseOrder={false}
        gutter={8}
        toastOptions={HOT_TOAST_OPTIONS}
      />
      <MutationToastBridge />
      {children}
    </>
  );
}

function MutationToastBridge() {
  useEffect(() => {
    const nativeFetch = window.fetch;
    const original = nativeFetch.bind(window);

    const intercepted = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const method = resolveMethod(input, init);
      const url = resolveUrl(input);
      const toastable = shouldToast(url, method, init);

      let response: Response;
      try {
        response = await original(input, init);
      } catch (error) {
        if (toastable) {
          toast.error(
            [
              titleFor(method, false),
              error instanceof Error ? error.message : "Réseau indisponible.",
            ]
              .filter(Boolean)
              .join(" — "),
          );
        }
        throw error;
      }

      if (toastable) {
        if (response.ok) {
          toast.success(titleFor(method, true));
        } else {
          toast.error(
            [
              titleFor(method, false),
              `${response.status} ${response.statusText || ""}`.trim(),
            ]
              .filter(Boolean)
              .join(" — "),
          );
        }
      }

      return response;
    };

    window.fetch = intercepted as typeof window.fetch;

    return () => {
      window.fetch = nativeFetch;
    };
  }, []);

  return null;
}

function shouldToast(url: string, method: string, init?: RequestInit): boolean {
  if (!MUTATING.has(method)) return false;
  if (init?.headers && silentHeader(init.headers)) return false;
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin !== window.location.origin) return false;
    if (!parsed.pathname.startsWith("/api/")) return false;
    if (SILENT_PATH.test(parsed.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

function silentHeader(headers: HeadersInit): boolean {
  const value =
    headers instanceof Headers
      ? headers.get("X-Hermes-Toast")
      : Array.isArray(headers)
        ? headers.find(([k]) => k.toLowerCase() === "x-hermes-toast")?.[1]
        : (headers as Record<string, string>)["X-Hermes-Toast"] ??
          (headers as Record<string, string>)["x-hermes-toast"];
  return value === "0" || value === "false";
}

function resolveMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.method.toUpperCase();
  }
  return "GET";
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return String(input);
}

function titleFor(method: string, ok: boolean): string {
  if (!ok) {
    if (method === "DELETE") return "Suppression échouée";
    if (method === "POST") return "Création échouée";
    return "Enregistrement échoué";
  }
  if (method === "DELETE") return "Supprimé";
  if (method === "POST") return "Créé";
  return "Enregistré";
}
