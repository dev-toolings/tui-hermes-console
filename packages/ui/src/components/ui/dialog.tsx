"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { XIcon } from "lucide-react"
import { cn } from "../../lib/utils"

type DialogProps = {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  className?: string
  showClose?: boolean
  role?: "dialog" | "alertdialog"
  closeLabel?: string
}

const EXIT_MS = 150
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",")

export function Dialog({ open, onClose, title, description, children, footer, className, showClose = true, role = "dialog", closeLabel = "Close dialog" }: DialogProps) {
  const [render, setRender] = React.useState(open)
  const [shown, setShown] = React.useState(false)
  const titleId = React.useId()
  const descriptionId = React.useId()
  const dialogRef = React.useRef<HTMLDivElement>(null)
  const previousFocusRef = React.useRef<HTMLElement | null>(null)
  const onCloseRef = React.useRef(onClose)

  React.useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // enter / exit lifecycle: mount → next frame fade/scale in; on close, fade out then unmount.
  React.useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount before the enter transition
      setRender(true)
      const id = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(id)
    }
    setShown(false)
    const t = window.setTimeout(() => setRender(false), EXIT_MS)
    return () => window.clearTimeout(t)
  }, [open])

  // Focus ownership, keyboard containment and body scroll lock while mounted.
  React.useEffect(() => {
    if (!render) return

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const focusFrame = requestAnimationFrame(() => {
      const dialog = dialogRef.current
      if (!dialog) return
      const preferred = dialog.querySelector<HTMLElement>("[data-dialog-autofocus]")
      const firstFocusable = dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      ;(preferred ?? firstFocusable ?? dialog).focus()
    })

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== "Tab") return

      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((element) => element.getClientRects().length > 0)

      if (focusable.length === 0) {
        e.preventDefault()
        dialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !dialog.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      cancelAnimationFrame(focusFrame)
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
      const previousFocus = previousFocusRef.current
      previousFocusRef.current = null
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [render])

  if (!render) return null

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 transition-opacity duration-150",
        shown ? "opacity-100" : "opacity-0"
      )}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role={role}
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex max-h-[calc(100dvh-4rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-elevated)] transition duration-150 ease-out",
          shown ? "scale-100 opacity-100" : "scale-95 opacity-0",
          className
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              {title && <h2 id={titleId} className="text-base font-semibold text-foreground">{title}</h2>}
              {description && <p id={descriptionId} className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
            </div>
            {showClose ? (
              <button
                type="button"
                onClick={onClose}
                aria-label={closeLabel}
                className="-mt-1 -mr-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <XIcon className="size-4" />
              </button>
            ) : null}
          </div>
        )}

        {children && <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-4 text-sm text-foreground/80">{children}</div>}

        {footer && <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
