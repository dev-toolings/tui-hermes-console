"use client";

import { useRef, type PointerEvent } from "react";
import { cn } from "@/lib/cn";

const MIN_WIDTH = 320;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 380;
const PANEL_GAP = 12;

export const RESULT_PANEL_WIDTH = {
  default: DEFAULT_WIDTH,
  min: MIN_WIDTH,
  max: MAX_WIDTH,
  gap: PANEL_GAP,
} as const;

export function clampResultPanelWidth(width: number, containerWidth?: number) {
  const max = containerWidth
    ? Math.min(MAX_WIDTH, Math.floor(containerWidth * 0.45))
    : MAX_WIDTH;
  return Math.min(max, Math.max(MIN_WIDTH, Math.round(width)));
}

export function PanelResizeHandle({
  onResize,
  onResizeStart,
  onResizeEnd,
  className,
}: {
  onResize: (delta: number) => void;
  onResizeStart?: () => void;
  onResizeEnd?: () => void;
  className?: string;
}) {
  const dragging = useRef(false);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    onResizeStart?.();
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    onResize(-event.movementX);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    onResizeEnd?.();
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionner les panneaux"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={cn(
        "group/drag absolute inset-y-0 -right-2.5 z-10 hidden w-5 cursor-col-resize touch-none justify-center xl:flex",
        className,
      )}
    >
      <span
        aria-hidden
        className="absolute top-1/2 flex h-[25px] w-[15px] -translate-y-1/2 items-center justify-center gap-0.5 rounded-[4px] border border-ai-separator bg-ai-primary shadow-board-xs opacity-0 transition-opacity duration-150 ease group-hover/drag:opacity-100 group-active/drag:opacity-100"
      >
        <span className="h-[13px] w-px bg-ai-icon-quaternary" />
        <span className="h-[13px] w-px bg-ai-icon-quaternary" />
        <span className="h-[13px] w-px bg-ai-icon-quaternary" />
      </span>
    </div>
  );
}
