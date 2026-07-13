import type { ShoplyActionEvent } from "../api/action-events";
import { captureActionEventsQuietly } from "../api/action-events";

export function captureConsumptionEvent(event: ShoplyActionEvent) {
  captureActionEventsQuietly([event]);
}
