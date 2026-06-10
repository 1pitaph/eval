import { nanoid } from "nanoid";
import type { EvalRunSpec, WorkflowDraft } from "@eval/workflow-schema";

export type EvalRunStatus = "queued" | "running" | "succeeded" | "failed";

export type EvalRunRecord = {
  id: string;
  createdAt: string;
  spec: EvalRunSpec;
  status: EvalRunStatus;
  summary: {
    artifactCount: number;
    estimatedCostUsd: number;
    taskCount: number;
  };
};

const workflows = new Map<string, WorkflowDraft & { id: string }>();
const runs = new Map<string, EvalRunRecord>();

export function saveWorkflow(draft: WorkflowDraft): WorkflowDraft & { id: string } {
  const id = draft.id ?? nanoid();
  const record = { ...draft, id };
  workflows.set(id, record);
  return record;
}

export function getWorkflow(id: string) {
  return workflows.get(id);
}

export function listWorkflows() {
  return Array.from(workflows.values());
}

export function saveRun(spec: EvalRunSpec): EvalRunRecord {
  const generationNodes = spec.nodes.filter(
    (node) => node.runtime === "generation"
  ).length;
  const metricNodes = spec.nodes.filter((node) => node.runtime === "metric").length;
  const id = nanoid();
  const record: EvalRunRecord = {
    id,
    createdAt: new Date().toISOString(),
    spec,
    status: "queued",
    summary: {
      artifactCount: generationNodes * 100,
      estimatedCostUsd: generationNodes * 12 + metricNodes * 2,
      taskCount: spec.nodes.length + spec.edges.length
    }
  };

  runs.set(id, record);
  return record;
}

export function getRun(id: string) {
  return runs.get(id);
}
