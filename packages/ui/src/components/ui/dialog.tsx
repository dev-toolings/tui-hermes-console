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
}

const EXIT_MS = 150

export function Dialog({ open, onClose, title, description, children, footer, className }: DialogProps) {
  const [render, setRender] = React.useState(open)
  const [shown, setShown] = React.useState(false)

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

  // escape + body scroll lock while open
  React.useEffect(() => {
    if (!render) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [render, onClose])

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
        role="dialog"
        aria-modal="true"
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
              {title && <h2 className="text-base font-semibold text-foreground">{title}</h2>}
              {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="-mt-1 -mr-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        )}

        {children && <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm text-foreground/80">{children}</div>}

        {footer && <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
