import { nanoid } from "nanoid";
import type {
  ApiProvider,
  EvalDecision,
  EvalRunEvent,
  EvalRunRecord,
  EvalRunSpec,
  EvalRunSummary,
  EvalTaskKind,
  EvalTaskRecord
} from "@eval/workflow-schema";

export type RunPreflightIssue = {
  code: string;
  message: string;
  nodeId?: string;
};

export function validateRunPreflight(
  spec: EvalRunSpec,
  apiProviders: ApiProvider[]
): RunPreflightIssue[] {
  const issues: RunPreflightIssue[] = [];
  const generationNodeId = nodeIdFor(spec, "generation.model_fanout");

  for (const manifestProvider of spec.manifest.providers) {
    const provider = findProvider(manifestProvider.provider, apiProviders);
    if (!provider) {
      issues.push({
        code: "provider_missing",
        message: `No enabled provider is configured for "${manifestProvider.provider}" (${manifestProvider.model}).`,
        nodeId: generationNodeId
      });
      continue;
    }

    if (!provider.enabled) {
      issues.push({
        code: "provider_disabled",
        message: `${provider.label} is disabled.`,
        nodeId: generationNodeId
      });
    }

    if (!isValidHttpUrl(provider.baseUrl)) {
      issues.push({
        code: "provider_base_url_invalid",
        message: `${provider.label} has an invalid base URL.`,
        nodeId: generationNodeId
      });
    }

    if (!providerHasModel(provider, manifestProvider.model)) {
      issues.push({
        code: "provider_model_missing",
        message: `${provider.label} does not expose enabled image model "${manifestProvider.model}".`,
        nodeId: generationNodeId
      });
    }

    if (
      provider.credential.status === "not_configured" ||
      provider.credential.status === "invalid"
    ) {
      issues.push({
        code: "provider_credential_missing",
        message:
          provider.credential.message ??
          `${provider.label} needs a valid API key before this eval can run.`,
        nodeId: generationNodeId
      });
    }
  }

  return dedupeIssues(issues);
}

export function createQueuedEvalRun(
  spec: EvalRunSpec,
  warnings: unknown[],
  now = new Date().toISOString(),
  id = nanoid()
): EvalRunRecord {
  return {
    id,
    createdAt: now,
    updatedAt: now,
    status: "queued",
    spec,
    summary: emptySummary(spec),
    tasks: [],
    jobs: [],
    artifacts: [],
    scores: [],
    reviews: [],
    pairwise: [],
    modelSummaries: [],
    pareto: [],
    decision: pendingDecision("Run is queued."),
    events: [
      {
        id: `event-${id}-compiled`,
        at: now,
        level: "success",
        message: `Compiled ${spec.nodes.length} nodes into an executable eval run.`
      },
      {
        id: `event-${id}-queued`,
        at: now,
        level: warnings.length > 0 ? "warning" : "info",
        message:
          warnings.length > 0
            ? `Run queued with ${warnings.length} compiler warning${
                warnings.length === 1 ? "" : "s"
              }.`
            : "Run queued for local desktop execution."
      }
    ]
  };
}

export function createPreflightFailureRun(
  spec: EvalRunSpec,
  issues: RunPreflightIssue[],
  now = new Date().toISOString(),
  id = nanoid()
): EvalRunRecord {
  return {
    id,
    createdAt: now,
    updatedAt: now,
    status: "failed",
    spec,
    summary: emptySummary(spec),
    tasks: [],
    jobs: [],
    artifacts: [],
    scores: [],
    reviews: [],
    pairwise: [],
    modelSummaries: [],
    pareto: [],
    decision: {
      status: "fail",
      message: "Run blocked by provider preflight checks.",
      gates: issues.map((issue) => ({
        label: issue.code,
        passed: false,
        actual: "blocked",
        target: issue.message
      }))
    },
    events: [
      {
        id: `event-${id}-preflight`,
        at: now,
        level: "error",
        message: `Run blocked by ${issues.length} provider preflight issue${
          issues.length === 1 ? "" : "s"
        }.`
      },
      ...issues.map(
        (issue, index): EvalRunEvent => ({
          id: `event-${id}-preflight-${index + 1}`,
          at: now,
          level: "error",
          message: issue.message,
          ...(issue.nodeId ? { nodeId: issue.nodeId } : {})
        })
      )
    ]
  };
}

export function planEvalTasks(
  spec: EvalRunSpec,
  runId: string,
  now = new Date().toISOString()
): EvalTaskRecord[] {
  const planned: Array<{ kind: EvalTaskKind; nodeType: string; maxAttempts?: number }> = [
    { kind: "generation", nodeType: "generation.model_fanout", maxAttempts: 3 },
    { kind: "metric", nodeType: "metric.auto_image", maxAttempts: 2 },
    ...(spec.manifest.humanReview.enabled
      ? [{ kind: "human_review" as const, nodeType: "human.pairwise", maxAttempts: 1 }]
      : []),
    { kind: "aggregation", nodeType: "aggregate.model_scores", maxAttempts: 2 },
    { kind: "release_gate", nodeType: "decision.release_gate", maxAttempts: 1 }
  ];

  return planned.map((task, index) => ({
    id: `${runId}-${index + 1}-${task.kind}`,
    runId,
    nodeId: nodeIdFor(spec, task.nodeType),
    kind: task.kind,
    status: "queued",
    attempt: 0,
    maxAttempts: task.maxAttempts ?? 2,
    input: { nodeType: task.nodeType },
    createdAt: now,
    updatedAt: now
  }));
}

export function emptySummary(spec: EvalRunSpec): EvalRunSummary {
  return {
    artifactCount: 0,
    approvedArtifactCount: 0,
    estimatedCostUsd: spec.manifest.matrix.estimatedCostUsd,
    taskCount: spec.manifest.matrix.totalPlannedOperations,
    averageQuality: 0,
    safetyPassRate: 0,
    p95LatencyMs: 0,
    bestModel: "n/a"
  };
}

function pendingDecision(message: string): EvalDecision {
  return {
    status: "warn",
    message,
    gates: []
  };
}

function nodeIdFor(spec: EvalRunSpec, type: string) {
  return spec.nodes.find((node) => node.type === type)?.id ?? type;
}

function findProvider(providerId: string, apiProviders: ApiProvider[]) {
  return apiProviders.find(
    (provider) => provider.id === providerId || provider.imageProvider === providerId
  );
}

function providerHasModel(provider: ApiProvider, modelId: string) {
  const normalized = modelId.toLowerCase();
  return provider.models.some(
    (model) =>
      model.enabled &&
      model.capabilities.includes("image-generation") &&
      (model.id.toLowerCase() === normalized ||
        model.name.toLowerCase() === normalized)
  );
}

function dedupeIssues(issues: RunPreflightIssue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.message}:${issue.nodeId ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
