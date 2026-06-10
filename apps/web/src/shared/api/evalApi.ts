import type { EvalRunRecord, EvalRunSpec, WorkflowDraft } from "@eval/workflow-schema";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

export type CompileResponse =
  | {
      ok: true;
      spec: EvalRunSpec;
      warnings: Array<{ code: string; message: string; nodeId?: string }>;
    }
  | {
      ok: false;
      issues: Array<{ code: string; message: string; nodeId?: string }>;
    };

export type RunResponse =
  | {
      run: EvalRunRecord;
      warnings: Array<{ code: string; message: string; nodeId?: string }>;
    }
  | CompileResponse;

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = (await response.json()) as T;
  if (!response.ok && response.status >= 500) {
    throw new Error(`API request failed with ${response.status}`);
  }

  return payload;
}

export function compileWorkflow(draft: WorkflowDraft) {
  return postJson<CompileResponse>("/workflows/compile", draft);
}

export function startRun(draft: WorkflowDraft) {
  return postJson<RunResponse>("/runs", draft);
}

export function exportRunUrl(runId: string, format: "csv" | "json") {
  return `${API_BASE_URL}/runs/${runId}/export.${format}`;
}
