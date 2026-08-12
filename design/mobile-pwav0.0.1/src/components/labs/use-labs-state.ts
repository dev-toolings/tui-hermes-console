import { useState } from "react";
import { loadLabsState, saveLabsState, type LabsState } from "../../state/labs-store";

/**
 * Local labs slice: hydrated once per mount (pages remount on navigation, like
 * the layout lab), every accepted reduction is written back synchronously.
 */
export function useLabsState() {
  const [state, setState] = useState<LabsState>(loadLabsState);
  const update = (reduce: (current: LabsState) => LabsState) =>
    setState((current) => {
      const next = reduce(current);
      if (next !== current) saveLabsState(next);
      return next;
    });
  return [state, update] as const;
}
