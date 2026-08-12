import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";

const DEFAULT_DELAY_MS = 500;
/** Past this, the finger is scrolling the timeline, not holding a message. */
const DEFAULT_MOVE_TOLERANCE_PX = 10;

type LongPressOptions = {
  delay?: number;
  moveTolerance?: number;
  /**
   * Arm the timer even when the press starts on a button. Required whenever the
   * pressable surface *is* a button — `closest("button")` matches the element
   * itself, so the default would make the gesture unreachable. The caller then
   * owns suppressing the click that follows the press.
   */
  allowOnButtons?: boolean;
};

/**
 * Touch has no hover, so the actions need a gesture of their own. Only `touch`
 * pointers arm the timer: a mouse keeps its click and context menu untouched.
 * By default, presses that start on a button are ignored so the reaction chips
 * and the reply link keep their own tap, and the context menu is suppressed for
 * the whole press so Android does not stack its own menu on top of the sheet.
 */
export function useLongPress(
  onLongPress: (() => void) | undefined,
  {
    delay = DEFAULT_DELAY_MS,
    moveTolerance = DEFAULT_MOVE_TOLERANCE_PX,
    allowOnButtons = false,
  }: LongPressOptions = {},
) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  if (!onLongPress) return {};

  return {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType !== "touch") return;
      if (!allowOnButtons && (event.target as HTMLElement).closest("button"))
        return;
      cancel();
      fired.current = false;
      origin.current = { x: event.clientX, y: event.clientY };
      timer.current = window.setTimeout(() => {
        timer.current = null;
        fired.current = true;
        navigator.vibrate?.(10);
        onLongPress();
      }, delay);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const start = origin.current;
      if (!start || timer.current === null) return;
      if (
        Math.abs(event.clientX - start.x) > moveTolerance ||
        Math.abs(event.clientY - start.y) > moveTolerance
      ) {
        cancel();
      }
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu: (event: ReactMouseEvent<HTMLElement>) => {
      if (origin.current) event.preventDefault();
    },
    /* A hold on a button still ends in a click. Stopping it here, in the capture
       phase, is what keeps a long press from also activating the row it opened
       the menu on — the target's own handler never runs. */
    onClickCapture: (event: ReactMouseEvent<HTMLElement>) => {
      if (!fired.current) return;
      fired.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
