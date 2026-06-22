import type {
  ApiProvider,
  ApiProviderInput,
  ApiProviderModel,
  ApiProviderPatch,
  EvalRunRecord,
  EvalRunSpec,
  PairwiseVote,
  PairwiseVoteChoice,
  ReviewCampaign,
  ReviewerSession,
  ReviewLink,
  ReviewReasonTag,
  ReviewTaskPayload,
  WorkflowDraft
} from "@eval/workflow-schema";

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
  {
    run: EvalRunRecord;
    warnings: Array<{ code: string; message: string; nodeId?: string }>;
  };

export type StartRunResponse =
  | {
      runId: string;
      status: EvalRunRecord["status"];
      warnings: Array<{ code: string; message: string; nodeId?: string }>;
      manifest: EvalRunSpec["manifest"];
    }
  | CompileResponse;

export type ReviewCampaignWithLinks = ReviewCampaign & {
  links: ReviewLink[];
};

export type CreateReviewCampaignInput = {
  name?: string;
  blindMode?: boolean;
  reviewersPerTask?: number;
  guidelines?: string;
  expiresInDays?: number;
  maxTasks?: number;
};

export type ReviewCampaignResponse = {
  campaign: ReviewCampaignWithLinks;
  tasks: ReviewTaskPayload["task"][];
};

export type ReviewCampaignListResponse = {
  campaigns: ReviewCampaignWithLinks[];
};

export type ReviewLinkResponse = {
  link: ReviewLink;
};

export type ReviewLinkPreview = {
  link: ReviewLink;
  campaign: ReviewCampaign;
  run: {
    id: string;
    name: string;
    createdAt: string;
  };
  taskCount: number;
  completedTaskCount: number;
};

export type ReviewerSessionPayload = {
  session: ReviewerSession;
  campaign: ReviewCampaign;
  run: {
    id: string;
    name: string;
    createdAt: string;
  };
  tasks: ReviewTaskPayload[];
  progress: {
    submittedCount: number;
    taskCount: number;
  };
};

export type SubmitPairwiseVoteInput = {
  taskId: string;
  preferred: PairwiseVoteChoice;
  reasonTags: ReviewReasonTag[];
  comment: string;
  timeSpentMs: number;
};

export type SubmitPairwiseVoteResponse = ReviewerSessionPayload & {
  vote: PairwiseVote;
};

export type AggregateReviewResponse = {
  run: EvalRunRecord;
  campaign: ReviewCampaignWithLinks;
  aggregation: {
    taskCount: number;
    completedTaskCount: number;
    voteCount: number;
    agreementRate: number;
    leftWinCount: number;
    rightWinCount: number;
    tieCount: number;
    bothBadCount: number;
    skipCount: number;
  };
};

export type ApiProviderListResponse = {
  providers: ApiProvider[];
};

export type ApiProviderResponse = {
  provider: ApiProvider;
};

export type ApiProviderModelSyncResponse = {
  addedModelCount: number;
  models: ApiProviderModel[];
  provider: ApiProvider;
  sourceUrl: string;
  totalRemoteModelCount: number;
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  const payload = (await response.json()) as T;
  if (!response.ok) {
    throw new Error(errorMessage(payload, response.status));
  }

  return payload;
}

async function postReviewJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = (await response.json()) as T;
  if (!response.ok) {
    throw new Error(errorMessage(payload, response.status));
  }

  return payload;
}

async function patchJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = (await response.json()) as T;
  if (!response.ok) {
    throw new Error(errorMessage(payload, response.status));
  }

  return payload;
}

async function deleteJson(path: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "DELETE"
  });
  if (!response.ok) {
    let payload: unknown = undefined;
    try {
      payload = await response.json();
    } catch {
      // No response body to parse.
    }
    throw new Error(errorMessage(payload, response.status));
  }
}

function errorMessage(payload: unknown, status: number) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  return `API request failed with ${status}`;
}

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
  return postJson<StartRunResponse>("/runs", draft);
}

export function getRun(runId: string) {
  return getJson<EvalRunRecord>(`/runs/${runId}`);
}

export function retryRun(runId: string) {
  return postReviewJson<RunResponse>(`/runs/${runId}/retry`, {});
}

export function cancelRun(runId: string) {
  return postReviewJson<RunResponse>(`/runs/${runId}/cancel`, {});
}

export function runEventsUrl(runId: string) {
  return `${API_BASE_URL}/runs/${runId}/events`;
}

export function listApiProviders() {
  return getJson<ApiProviderListResponse>("/providers");
}

export function createApiProvider(input: ApiProviderInput) {
  return postReviewJson<ApiProviderResponse>("/providers", input);
}

export function updateApiProvider(id: string, patch: ApiProviderPatch) {
  return patchJson<ApiProviderResponse>(`/providers/${id}`, patch);
}

export function deleteApiProvider(id: string) {
  return deleteJson(`/providers/${id}`);
}

export function testApiProviderConnection(id: string) {
  return postReviewJson<ApiProviderResponse>(`/providers/${id}/test`, {});
}

export function fetchApiProviderModels(id: string) {
  return postReviewJson<ApiProviderModelSyncResponse>(`/providers/${id}/models`, {});
}

export function exportRunUrl(runId: string, format: "csv" | "json") {
  return `${API_BASE_URL}/runs/${runId}/export.${format}`;
}

export function exportRunManifestUrl(runId: string) {
  return `${API_BASE_URL}/runs/${runId}/manifest.json`;
}

export function exportRunSpecUrl(runId: string) {
  return `${API_BASE_URL}/runs/${runId}/spec.json`;
}

export function listReviewCampaigns(runId: string) {
  return getJson<ReviewCampaignListResponse>(`/runs/${runId}/review-campaigns`);
}

export function createReviewCampaign(runId: string, input: CreateReviewCampaignInput) {
  return postReviewJson<ReviewCampaignResponse>(
    `/runs/${runId}/review-campaigns`,
    input
  );
}

export function createReviewLink(
  campaignId: string,
  input: { maxUses?: number; expiresInDays?: number }
) {
  return postReviewJson<ReviewLinkResponse>(
    `/review-campaigns/${campaignId}/links`,
    input
  );
}

export function getReviewLink(token: string) {
  return getJson<ReviewLinkPreview>(`/review-links/${token}`);
}

export function createReviewerSession(token: string, displayName: string) {
  return postReviewJson<ReviewerSessionPayload>(`/review-links/${token}/sessions`, {
    displayName
  });
}

export function getReviewerSessionTasks(sessionId: string) {
  return getJson<ReviewerSessionPayload>(`/reviewer-sessions/${sessionId}/tasks`);
}

export function submitPairwiseVote(sessionId: string, input: SubmitPairwiseVoteInput) {
  return postReviewJson<SubmitPairwiseVoteResponse>(
    `/reviewer-sessions/${sessionId}/votes`,
    input
  );
}

export function aggregateReviewCampaign(runId: string, campaignId: string) {
  return postReviewJson<AggregateReviewResponse>(
    `/runs/${runId}/review-campaigns/${campaignId}/aggregate`,
    {}
  );
}
