"use client";

import { useEffect, type ReactNode } from "react";
import toast, { Toaster } from "react-hot-toast";
import { TooltipProvider } from "@boardui/ui";
import {
  HERMES_TOAST_HEADER,
  mutationToastTitle,
  parseMutationToastIntent,
  type MutationToastIntent,
} from "@/lib/mutation-toast";
import { HermesUpdateWatcher } from "@/components/updates/hermes-update-watcher";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Skip high-frequency chat traffic even if a caller accidentally annotates it. */
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
    /*
      Racine Radix des tooltips : le rail replié en icônes rend un `Tooltip`
      par entrée (`SidebarMenuButton tooltip=…`), et Radix exige un Provider
      au-dessus. À l'échelle de l'app plutôt que du shell, pour couvrir aussi
      les surfaces immersives.
    */
    <TooltipProvider>
      <Toaster
        position="top-center"
        reverseOrder={false}
        gutter={8}
        toastOptions={HOT_TOAST_OPTIONS}
      />
      <MutationToastBridge />
      <HermesUpdateWatcher />
      {children}
    </TooltipProvider>
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
              mutationToastTitle(toastable, false),
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
          toast.success(mutationToastTitle(toastable, true));
        } else {
          toast.error(
            [
              mutationToastTitle(toastable, false),
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

function shouldToast(
  url: string,
  method: string,
  init?: RequestInit,
): Exclude<MutationToastIntent, "silent"> | null {
  if (!MUTATING.has(method)) return null;
  const intent = parseMutationToastIntent(readToastHeader(init?.headers));
  if (!intent || intent === "silent") return null;
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin !== window.location.origin) return null;
    if (!parsed.pathname.startsWith("/api/")) return null;
    if (SILENT_PATH.test(parsed.pathname)) return null;
    return intent;
  } catch {
    return null;
  }
}

function readToastHeader(headers: HeadersInit | undefined): string | null {
  if (!headers) return null;
  if (headers instanceof Headers) return headers.get(HERMES_TOAST_HEADER);
  if (Array.isArray(headers)) {
    return (
      headers.find(([name]) => name.toLowerCase() === HERMES_TOAST_HEADER.toLowerCase())?.[1] ??
      null
    );
  }
  const entry = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === HERMES_TOAST_HEADER.toLowerCase(),
  );
  return entry?.[1] ?? null;
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
