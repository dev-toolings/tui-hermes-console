"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import {
  BellIcon,
  CircleCheckIcon,
  CircleXIcon,
  InfoIcon,
  TriangleAlertIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"
import { cn } from "../../lib/utils"

/* -------------------------------------------------------------------------- */
/*                                   types                                     */
/* -------------------------------------------------------------------------- */

export type ToastVariant = "success" | "error" | "warning" | "info" | "default" | "loading"
/* where a toast anchors on screen — defaults to bottom-right, per-toast override */
export type ToastPosition = "bottom-right" | "top-center"
type ToastAction = { label: string; onClick?: () => void }
export type ToastInput = {
  title: string
  description?: string
  variant?: ToastVariant
  duration?: number
  /* on-screen anchor — omit for the default bottom-right */
  position?: ToastPosition
  action?: ToastAction
}
type ToastItem = ToastInput & { id: number; duration: number; closing: boolean }

export type PromiseOpts<T> = {
  loading: string
  success: string | ((data: T) => string)
  error: string | ((err: unknown) => string)
  description?: string
}

type Ctx = {
  toast: (t: ToastInput) => number
  dismiss: (id: number) => void
  promise: <T>(p: Promise<T>, opts: PromiseOpts<T>) => Promise<T>
}
const ToastCtx = React.createContext<Ctx | null>(null)

export function useToast() {
  const c = React.useContext(ToastCtx)
  if (!c) throw new Error("useToast must be used within <ToastProvider>")
  return c
}

/* per-variant chip + progress-bar colors (boardui semantic tokens) */
const VARIANT: Record<ToastVariant, { Icon: LucideIcon; chip: string; bar: string }> = {
  success: { Icon: CircleCheckIcon, chip: "bg-pos-100 text-pos-700", bar: "bg-[#84cc16]" },
  error: { Icon: CircleXIcon, chip: "bg-neg-100 text-neg-700", bar: "bg-neg-700" },
  warning: { Icon: TriangleAlertIcon, chip: "bg-warn-100 text-warn-700", bar: "bg-[#f0b100]" },
  info: { Icon: InfoIcon, chip: "bg-info-100 text-info-700", bar: "bg-brand-500" },
  default: { Icon: BellIcon, chip: "bg-muted text-muted-foreground", bar: "bg-muted-foreground" },
  loading: { Icon: BellIcon, chip: "bg-muted text-muted-foreground", bar: "bg-muted-foreground" },
}

/* sonner's exact 12-bar radial spinner (see globals.css for the .sonner-loader rules) */
function SonnerSpinner() {
  return (
    <div className="sonner-loader" role="status" aria-label="Loading">
      <div className="sonner-spinner">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="sonner-bar"
            style={{ transform: `rotate(${i * 30}deg) translate(146%)`, animationDelay: `${(i * 0.1 - 1.2).toFixed(1)}s` }}
          />
        ))}
      </div>
    </div>
  )
}

const MAX_VISIBLE = 4
const EXIT_MS = 220

/* -------------------------------------------------------------------------- */
/*                                  provider                                   */
/* -------------------------------------------------------------------------- */

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([])
  const idRef = React.useRef(0)

  const remove = React.useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id))
  }, [])

  const dismiss = React.useCallback(
    (id: number) => {
      setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, closing: true } : t)))
      window.setTimeout(() => remove(id), EXIT_MS)
    },
    [remove]
  )

  const update = React.useCallback((id: number, patch: Partial<ToastItem>) => {
    setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }, [])

  const push = React.useCallback((item: ToastItem) => {
    setToasts((ts) => {
      const next = [...ts, item]
      return next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next
    })
  }, [])

  const toast = React.useCallback(
    (t: ToastInput) => {
      const id = ++idRef.current
      push({ ...t, id, closing: false, duration: t.duration ?? 4000 })
      return id
    },
    [push]
  )

  /* sonner-style: shows a loading toast, then morphs the same toast into success/error */
  const promise = React.useCallback(
    <T,>(p: Promise<T>, opts: PromiseOpts<T>) => {
      const id = ++idRef.current
      push({ id, closing: false, variant: "loading", duration: Infinity, title: opts.loading, description: opts.description })
      p.then(
        (data) =>
          update(id, {
            variant: "success",
            title: typeof opts.success === "function" ? opts.success(data) : opts.success,
            duration: 4000,
          }),
        (err) =>
          update(id, {
            variant: "error",
            title: typeof opts.error === "function" ? opts.error(err) : opts.error,
            duration: 4000,
          })
      )
      return p
    },
    [push, update]
  )

  return (
    <ToastCtx.Provider value={{ toast, dismiss, promise }}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastCtx.Provider>
  )
}

/* -------------------------------------------------------------------------- */
/*                                  viewport                                   */
/* -------------------------------------------------------------------------- */

/* viewport anchor per position — default bottom-right, opt-in top-center */
const VIEWPORT: Record<ToastPosition, string> = {
  "bottom-right": "inset-x-0 bottom-0 items-center pb-[max(1rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:right-0 sm:items-end",
  "top-center": "inset-x-0 top-0 items-center pt-[max(1rem,env(safe-area-inset-top))]",
}

function Toaster({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  // client-only guard (portal target exists only in the browser) — no setState-in-effect
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
  if (!mounted) return null

  const groups: Record<ToastPosition, ToastItem[]> = { "bottom-right": [], "top-center": [] }
  for (const t of toasts) groups[t.position ?? "bottom-right"].push(t)

  return createPortal(
    <>
      {(Object.keys(groups) as ToastPosition[]).map((pos) =>
        groups[pos].length === 0 ? null : (
          <div
            key={pos}
            aria-live="polite"
            aria-relevant="additions"
            className={cn("pointer-events-none fixed z-[120] flex flex-col items-center gap-2 p-4", VIEWPORT[pos])}
          >
            {groups[pos].map((t) => (
              <ToastRow key={t.id} t={t} pos={pos} onDismiss={onDismiss} />
            ))}
          </div>
        )
      )}
    </>,
    document.body
  )
}

function ToastRow({ t, pos, onDismiss }: { t: ToastItem; pos: ToastPosition; onDismiss: (id: number) => void }) {
  const v = VARIANT[t.variant ?? "default"]
  const { Icon } = v
  const anim =
    pos === "top-center"
      ? t.closing
        ? "animate-out fade-out slide-out-to-top-4"
        : "animate-in fade-in slide-in-from-top-4"
      : t.closing
        ? "animate-out fade-out slide-out-to-bottom-4 sm:slide-out-to-right-full"
        : "animate-in fade-in slide-in-from-bottom-4 sm:slide-in-from-right-full"
  return (
    <div
      role="status"
      className={cn(
        "group pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-elevated)]",
        "duration-300 ease-out",
        anim
      )}
    >
      <div className={cn("flex gap-3", t.description || t.action ? "items-start" : "items-center")}>
        <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full transition-colors duration-200", v.chip)}>
          {t.variant === "loading" ? <SonnerSpinner /> : <Icon className="size-4" />}
        </span>
        <div className={cn("min-w-0 flex-1", (t.description || t.action) && "pt-0.5")}>
          <p className="text-sm font-medium text-foreground">{t.title}</p>
          {t.description && <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{t.description}</p>}
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action?.onClick?.()
                onDismiss(t.id)
              }}
              className="mt-2 inline-flex h-8 items-center rounded-lg border border-border bg-card px-2.5 text-[13px] font-medium text-foreground shadow-[var(--shadow-xs)] transition-colors hover:bg-accent active:bg-muted"
            >
              {t.action.label}
            </button>
          )}
        </div>
        {t.variant !== "loading" && (
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss notification"
            className={cn(
              "-mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground/80",
              (t.description || t.action) && "-mt-1"
            )}
          >
            <XIcon className="size-4" />
          </button>
        )}
      </div>

      {/* auto-dismiss: progress bar drains over `duration`, pauses on hover, then closes.
          loading toasts have no timer — they run until the promise settles. */}
      {!t.closing && t.variant !== "loading" && (
        <span
          onAnimationEnd={(e) => {
            if (e.animationName === "toast-progress") onDismiss(t.id)
          }}
          style={{ animationDuration: `${t.duration}ms` }}
          className={cn(
            "absolute inset-x-0 bottom-0 h-0.5 origin-left [animation-fill-mode:forwards] [animation-name:toast-progress] [animation-timing-function:linear] group-hover:[animation-play-state:paused]",
            v.bar
          )}
        />
      )}
    </div>
  )
}
