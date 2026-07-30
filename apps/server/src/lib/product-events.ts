import type { RunEvent } from "@console/core/lib/hermes-events";
import type { ProductEventInput, ProductEventType } from "@console/core/modules/runs/types";

/** Convertit les événements normalisés Hermes agent → événements produit persistés. */
export function toProductEvents(events: RunEvent[]): ProductEventInput[] {
  return events.map((event) => ({
    sequence: event.sequence,
    type: toProductEventType(event.type),
    occurredAt: event.occurredAt,
    payload: event.payload,
  }));
}

function toProductEventType(type: RunEvent["type"]): ProductEventType {
  return type;
}
