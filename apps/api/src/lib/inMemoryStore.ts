import { nanoid } from "nanoid";
import type { EvalRunRecord, EvalRunSpec, WorkflowDraft } from "@eval/workflow-schema";
import { runImageEvalSpec } from "../services/imageEvalRunner";

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
  const id = nanoid();
  const record = runImageEvalSpec(spec, id, new Date().toISOString());

  runs.set(id, record);
  return record;
}

export function saveImportedRun(run: EvalRunRecord) {
  runs.set(run.id, run);
  return run;
}

export function getRun(id: string) {
  return runs.get(id);
}
