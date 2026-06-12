import { nanoid } from "nanoid";
import type {
  ApiProvider,
  ApiProviderInput,
  ApiProviderPatch,
  EvalRunRecord,
  EvalRunSpec,
  PairwiseVote,
  ReviewCampaign,
  ReviewerSession,
  ReviewLink,
  ReviewTask,
  WorkflowDraft
} from "@eval/workflow-schema";
import { runImageEvalSpec } from "../services/imageEvalRunner";

type StoredApiProvider = ApiProvider & {
  apiKey?: string;
};

const workflows = new Map<string, WorkflowDraft & { id: string }>();
const runs = new Map<string, EvalRunRecord>();
const reviewCampaigns = new Map<string, ReviewCampaign>();
const reviewTasks = new Map<string, ReviewTask>();
const reviewLinks = new Map<string, ReviewLink>();
const reviewerSessions = new Map<string, ReviewerSession>();
const pairwiseVotes = new Map<string, PairwiseVote>();
const apiProviders = new Map<string, StoredApiProvider>();

seedDefaultApiProviders();

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
  const record = runImageEvalSpec(
    spec,
    id,
    new Date().toISOString(),
    listApiProviders()
  );

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

export function updateRun(run: EvalRunRecord) {
  runs.set(run.id, run);
  return run;
}

export function saveReviewCampaign(campaign: ReviewCampaign) {
  reviewCampaigns.set(campaign.id, campaign);
  return campaign;
}

export function getReviewCampaign(id: string) {
  return reviewCampaigns.get(id);
}

export function listReviewCampaigns(runId: string) {
  return Array.from(reviewCampaigns.values()).filter(
    (campaign) => campaign.runId === runId
  );
}

export function updateReviewCampaign(campaign: ReviewCampaign) {
  reviewCampaigns.set(campaign.id, campaign);
  return campaign;
}

export function saveReviewTasks(tasks: ReviewTask[]) {
  for (const task of tasks) {
    reviewTasks.set(task.id, task);
  }
  return tasks;
}

export function getReviewTask(id: string) {
  return reviewTasks.get(id);
}

export function listReviewTasks(campaignId: string) {
  return Array.from(reviewTasks.values()).filter(
    (task) => task.campaignId === campaignId
  );
}

export function updateReviewTask(task: ReviewTask) {
  reviewTasks.set(task.id, task);
  return task;
}

export function saveReviewLink(link: ReviewLink) {
  reviewLinks.set(link.id, link);
  return link;
}

export function getReviewLink(id: string) {
  return reviewLinks.get(id);
}

export function getReviewLinkByToken(token: string) {
  return Array.from(reviewLinks.values()).find((link) => link.token === token);
}

export function listReviewLinks(campaignId: string) {
  return Array.from(reviewLinks.values()).filter(
    (link) => link.campaignId === campaignId
  );
}

export function updateReviewLink(link: ReviewLink) {
  reviewLinks.set(link.id, link);
  return link;
}

export function saveReviewerSession(session: ReviewerSession) {
  reviewerSessions.set(session.id, session);
  return session;
}

export function getReviewerSession(id: string) {
  return reviewerSessions.get(id);
}

export function updateReviewerSession(session: ReviewerSession) {
  reviewerSessions.set(session.id, session);
  return session;
}

export function upsertPairwiseVote(vote: PairwiseVote) {
  const existing = Array.from(pairwiseVotes.values()).find(
    (candidate) =>
      candidate.sessionId === vote.sessionId && candidate.taskId === vote.taskId
  );
  if (existing) {
    pairwiseVotes.delete(existing.id);
  }
  pairwiseVotes.set(vote.id, vote);
  return vote;
}

export function listPairwiseVotes(campaignId: string) {
  return Array.from(pairwiseVotes.values()).filter(
    (vote) => vote.campaignId === campaignId
  );
}

export function listPairwiseVotesForRun(runId: string) {
  return Array.from(pairwiseVotes.values()).filter((vote) => vote.runId === runId);
}

export function listPairwiseVotesForSession(sessionId: string) {
  return Array.from(pairwiseVotes.values()).filter(
    (vote) => vote.sessionId === sessionId
  );
}

export function listApiProviders(): ApiProvider[] {
  return Array.from(apiProviders.values()).map(redactApiProvider);
}

export function getApiProvider(id: string): ApiProvider | undefined {
  const provider = apiProviders.get(id);
  return provider ? redactApiProvider(provider) : undefined;
}

export function createApiProvider(input: ApiProviderInput): ApiProvider {
  const now = new Date().toISOString();
  const record: StoredApiProvider = {
    id: uniqueProviderId(input.label),
    label: input.label.trim(),
    kind: input.kind,
    baseUrl: input.baseUrl.trim(),
    enabled: input.enabled,
    credential: credentialFromApiKey(input.apiKey),
    models: input.models.map(normalizeProviderModel),
    createdAt: now,
    updatedAt: now,
    ...(input.docsUrl ? { docsUrl: input.docsUrl } : {}),
    ...(input.apiKey ? { apiKey: input.apiKey } : {})
  };

  apiProviders.set(record.id, record);
  return redactApiProvider(record);
}

export function updateApiProvider(
  id: string,
  patch: ApiProviderPatch
): ApiProvider | undefined {
  const existing = apiProviders.get(id);
  if (!existing) {
    return undefined;
  }

  const nextCredential =
    patch.apiKey === undefined
      ? existing.credential
      : credentialFromApiKey(patch.apiKey);
  const next: StoredApiProvider = {
    ...existing,
    ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
    ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
    ...(patch.baseUrl !== undefined ? { baseUrl: patch.baseUrl.trim() } : {}),
    ...(patch.docsUrl !== undefined ? { docsUrl: patch.docsUrl } : {}),
    ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    ...(patch.models !== undefined
      ? { models: patch.models.map(normalizeProviderModel) }
      : {}),
    credential: nextCredential,
    updatedAt: new Date().toISOString()
  };

  if (patch.apiKey !== undefined) {
    if (patch.apiKey) {
      next.apiKey = patch.apiKey;
    } else {
      delete next.apiKey;
    }
  }
  if (patch.docsUrl === undefined && existing.docsUrl === undefined) {
    delete next.docsUrl;
  }

  apiProviders.set(id, next);
  return redactApiProvider(next);
}

export function deleteApiProvider(id: string): boolean {
  return apiProviders.delete(id);
}

export function testApiProviderConnection(id: string): ApiProvider | undefined {
  const existing = apiProviders.get(id);
  if (!existing) {
    return undefined;
  }

  const hasCredential = Boolean(existing.apiKey);
  const hasValidUrl = isValidHttpUrl(existing.baseUrl);
  const next: StoredApiProvider = {
    ...existing,
    credential: {
      status: hasCredential && hasValidUrl ? "valid" : "invalid",
      ...(existing.apiKey ? { maskedKey: maskApiKey(existing.apiKey) } : {}),
      lastTestedAt: new Date().toISOString(),
      message:
        hasCredential && hasValidUrl
          ? "Connection settings look valid for mock execution."
          : "Add an API key and a valid http(s) base URL before using this provider."
    },
    updatedAt: new Date().toISOString()
  };

  apiProviders.set(id, next);
  return redactApiProvider(next);
}

function seedDefaultApiProviders() {
  if (apiProviders.size > 0) {
    return;
  }

  const now = new Date().toISOString();
  const defaults: StoredApiProvider[] = [
    {
      id: "openai",
      label: "OpenAI",
      kind: "openai",
      baseUrl: "https://api.openai.com/v1",
      docsUrl: "https://platform.openai.com/docs",
      enabled: true,
      credential: { status: "not_configured" },
      models: [
        {
          id: "gpt-image",
          name: "GPT Image",
          enabled: true,
          capabilities: ["image-generation"],
          estimatedCostPerImageUsd: 0.045,
          estimatedLatencyMs: 4200
        }
      ],
      createdAt: now,
      updatedAt: now
    },
    {
      id: "google-imagen",
      label: "Google Imagen",
      kind: "google-imagen",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      docsUrl: "https://ai.google.dev/gemini-api/docs/image-generation",
      enabled: true,
      credential: { status: "not_configured" },
      models: [
        {
          id: "imagen",
          name: "Imagen",
          enabled: true,
          capabilities: ["image-generation"],
          estimatedCostPerImageUsd: 0.038,
          estimatedLatencyMs: 4700
        }
      ],
      createdAt: now,
      updatedAt: now
    },
    {
      id: "fal",
      label: "fal.ai",
      kind: "fal",
      baseUrl: "https://fal.run",
      docsUrl: "https://fal.ai/docs",
      enabled: true,
      credential: { status: "not_configured" },
      models: [
        {
          id: "flux",
          name: "FLUX",
          enabled: true,
          capabilities: ["image-generation"],
          estimatedCostPerImageUsd: 0.024,
          estimatedLatencyMs: 3100
        }
      ],
      createdAt: now,
      updatedAt: now
    },
    {
      id: "replicate",
      label: "Replicate",
      kind: "replicate",
      baseUrl: "https://api.replicate.com/v1",
      docsUrl: "https://replicate.com/docs",
      enabled: true,
      credential: { status: "not_configured" },
      models: [
        {
          id: "sdxl",
          name: "SDXL",
          enabled: true,
          capabilities: ["image-generation"],
          estimatedCostPerImageUsd: 0.016,
          estimatedLatencyMs: 5600
        }
      ],
      createdAt: now,
      updatedAt: now
    }
  ];

  for (const provider of defaults) {
    apiProviders.set(provider.id, provider);
  }
}

function redactApiProvider(provider: StoredApiProvider): ApiProvider {
  return {
    id: provider.id,
    label: provider.label,
    kind: provider.kind,
    baseUrl: provider.baseUrl,
    enabled: provider.enabled,
    credential: provider.credential,
    models: provider.models,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
    ...(provider.docsUrl ? { docsUrl: provider.docsUrl } : {})
  };
}

function credentialFromApiKey(apiKey: string | undefined): ApiProvider["credential"] {
  if (!apiKey) {
    return { status: "not_configured" };
  }

  return {
    status: "configured",
    maskedKey: maskApiKey(apiKey)
  };
}

function normalizeProviderModel(
  model: ApiProvider["models"][number]
): ApiProvider["models"][number] {
  return {
    id: model.id.trim(),
    name: model.name.trim(),
    enabled: model.enabled,
    capabilities: model.capabilities,
    estimatedCostPerImageUsd: model.estimatedCostPerImageUsd,
    estimatedLatencyMs: Math.round(model.estimatedLatencyMs)
  };
}

function uniqueProviderId(label: string) {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "provider";
  let id = base;
  let index = 2;

  while (apiProviders.has(id)) {
    id = `${base}-${index}`;
    index += 1;
  }

  return id;
}

function maskApiKey(apiKey: string) {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) {
    return "••••";
  }

  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
