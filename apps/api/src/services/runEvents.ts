import { EventEmitter } from "node:events";
import type { EvalRunEvent } from "@eval/workflow-schema";

type RunEventPayload = {
  event: EvalRunEvent;
  runId: string;
};

const bus = new EventEmitter();

export function publishRunEvent(runId: string, event: EvalRunEvent) {
  bus.emit(runId, { event, runId } satisfies RunEventPayload);
}

export function subscribeRunEvents(
  runId: string,
  listener: (payload: RunEventPayload) => void
) {
  bus.on(runId, listener);
  return () => {
    bus.off(runId, listener);
  };
}
