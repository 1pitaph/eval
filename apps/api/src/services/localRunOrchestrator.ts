import type {
  EvalRunEvent,
  EvalRunRecord,
  EvalTaskError,
  EvalTaskKind,
  EvalTaskRecord
} from "@eval/workflow-schema";
import {
  createRun,
  getApiProviderSecret,
  getRun,
  listApiProviders,
  listEvalTasks,
  listReviewCampaigns,
  saveEvalTasks,
  saveReviewCampaign,
  saveReviewTasks,
  updateEvalTask,
  updateRun
} from "../lib/store";
import {
  AdapterExecutionError,
  assertProviderSecrets,
  imageGenerationAdapterForEnvironment,
  type ProviderSecret
} from "./imageGenerationAdapters";
import { runImageEvalSpec } from "./imageEvalRunner";
import { publishRunEvent } from "./runEvents";
import {
  createPreflightFailureRun,
  createQueuedEvalRun,
  planEvalTasks,
  validateRunPreflight
} from "./runPlanner";
import { createReviewCampaignFromRun } from "./reviewTaskPlanner";

const taskOrder: Record<EvalTaskKind, number> = {
  generation: 1,
  metric: 2,
  human_review: 3,
  aggregation: 4,
  release_gate: 5
};

let started = false;
let processing = false;

export function startLocalRunOrchestrator() {
  if (started) {
    return;
  }

  started = true;
  recoverRunningTasks();
  scheduleRunQueue();
}

export function stopLocalRunOrchestrator() {
  started = false;
}

export function createRunExecution(
  spec: EvalRunRecord["spec"],
  warnings: unknown[]
) {
  const now = new Date().toISOString();
  const preflightIssues = validateRunPreflight(spec, listApiProviders());
  if (preflightIssues.length > 0) {
    const failedRun = createPreflightFailureRun(spec, preflightIssues, now);
    return createRun(failedRun);
  }

  const run = createQueuedEvalRun(spec, warnings, now);
  const tasks = planEvalTasks(spec, run.id, now);
  createRun({ ...run, tasks });
  saveEvalTasks(tasks);
  scheduleRunQueue();
  return getRun(run.id) ?? { ...run, tasks };
}

export function retryRun(runId: string) {
  const run = getRun(runId);
  if (!run) {
    return undefined;
  }

  const now = new Date().toISOString();
  const tasks = run.tasks.map((task) => {
    if (task.status !== "failed" && task.status !== "running") {
      return task;
    }

    const next = {
      ...task,
      status: "queued" as const,
      attempt: 0,
      updatedAt: now
    };
    delete next.error;
    delete next.startedAt;
    delete next.completedAt;
    updateEvalTask(next);
    return next;
  });
  const updated = persistRun({
    ...run,
    status: "queued",
    tasks,
    updatedAt: now,
    decision: {
      status: "warn",
      message: "Run retry queued.",
      gates: []
    }
  });
  appendEvent(updated, {
    id: `event-${run.id}-retry-${Date.now()}`,
    at: now,
    level: "info",
    message: "Retry queued for failed or interrupted tasks."
  });
  scheduleRunQueue();
  return getRun(runId);
}

export function cancelRun(runId: string) {
  const run = getRun(runId);
  if (!run) {
    return undefined;
  }

  const now = new Date().toISOString();
  for (const task of run.tasks) {
    if (task.status === "queued" || task.status === "running") {
      updateEvalTask({
        ...task,
        status: "canceled",
        updatedAt: now,
        completedAt: now
      });
    }
  }

  const updated = persistRun({
    ...run,
    status: "canceled",
    updatedAt: now,
    decision: {
      status: "fail",
      message: "Run canceled.",
      gates: []
    }
  });
  appendEvent(updated, {
    id: `event-${run.id}-cancel-${Date.now()}`,
    at: now,
    level: "warning",
    message: "Run canceled by user."
  });
  return getRun(runId);
}

export function resumeRunAfterHumanReview(runId: string, campaignId: string) {
  const run = getRun(runId);
  if (!run) {
    return undefined;
  }

  const now = new Date().toISOString();
  const humanTask = run.tasks.find(
    (task) =>
      task.kind === "human_review" &&
      task.status === "running" &&
      task.output?.campaignId === campaignId
  );
  if (!humanTask) {
    return run;
  }

  updateEvalTask({
    ...humanTask,
    status: "succeeded",
    output: {
      ...humanTask.output,
      completedBy: "review_aggregation"
    },
    updatedAt: now,
    completedAt: now
  });

  const updated = persistRun({
    ...run,
    status: "running",
    updatedAt: now
  });
  appendEvent(updated, {
    id: `event-${run.id}-human-complete-${Date.now()}`,
    at: now,
    level: "success",
    message: "Human review completed; resuming aggregation.",
    nodeId: humanTask.nodeId
  });
  scheduleRunQueue();
  return getRun(runId);
}

export function scheduleRunQueue() {
  if (!started || processing) {
    return;
  }

  queueMicrotask(() => {
    void processRunQueue().catch((error: unknown) => {
      console.error("[local-run-orchestrator] queue processing failed", error);
      processing = false;
    });
  });
}

async function processRunQueue() {
  if (processing) {
    return;
  }

  processing = true;
  try {
    while (started) {
      const task = nextRunnableTask();
      if (!task) {
        break;
      }
      await executeTask(task);
    }
  } finally {
    processing = false;
  }
}

async function executeTask(task: EvalTaskRecord) {
  const run = getRun(task.runId);
  if (!run || run.status === "canceled") {
    return;
  }

  const now = new Date().toISOString();
  const runningTask = updateEvalTask({
    ...task,
    status: "running",
    attempt: task.attempt + 1,
    updatedAt: now,
    startedAt: task.startedAt ?? now
  });
  const runningRun = persistRun({
    ...run,
    status: "running",
    updatedAt: now
  });
  appendEvent(runningRun, {
    id: `event-${run.id}-${task.kind}-start-${Date.now()}`,
    at: now,
    level: "info",
    message: `${taskLabel(task.kind)} started.`,
    nodeId: task.nodeId
  });

  try {
    if (runningTask.kind === "generation") {
      await runGenerationTask(runningRun, runningTask);
    } else if (runningTask.kind === "metric") {
      await runMetricTask(runningRun, runningTask);
    } else if (runningTask.kind === "human_review") {
      await runHumanReviewTask(runningRun, runningTask);
      return;
    } else if (runningTask.kind === "aggregation") {
      await runAggregationTask(runningRun, runningTask);
    } else {
      await runReleaseGateTask(runningRun, runningTask);
    }
  } catch (error) {
    failOrRetryTask(runningRun, runningTask, taskErrorFromUnknown(error));
  }
}

async function runGenerationTask(run: EvalRunRecord, task: EvalTaskRecord) {
  const providerSecrets = providerSecretsForRun(run);
  assertProviderSecrets(providerSecrets);
  const adapter = imageGenerationAdapterForEnvironment();
  const generated = await adapter.generateRun({
    id: run.id,
    spec: run.spec,
    createdAt: run.createdAt,
    apiProviders: listApiProviders(),
    providerSecrets
  });
  const now = new Date().toISOString();
  const updatedRun = persistRun({
    ...run,
    updatedAt: now,
    jobs: generated.jobs,
    artifacts: generated.artifacts,
    summary: {
      ...run.summary,
      artifactCount: generated.artifacts.length,
      estimatedCostUsd: generated.summary.estimatedCostUsd,
      p95LatencyMs: generated.summary.p95LatencyMs
    }
  });
  completeTask(updatedRun, task, {
    artifactCount: generated.artifacts.length,
    adapter: adapter.id
  });
}

async function runMetricTask(run: EvalRunRecord, task: EvalTaskRecord) {
  const evaluated = runImageEvalSpec(run.spec, run.id, run.createdAt, listApiProviders(), {
    includeMockHumanReviews: false
  });
  const now = new Date().toISOString();
  const updatedRun = persistRun({
    ...run,
    updatedAt: now,
    scores: evaluated.scores,
    pairwise: evaluated.pairwise,
    summary: {
      ...evaluated.summary,
      artifactCount: run.artifacts.length,
      approvedArtifactCount: run.reviews.filter(
        (review) => review.verdict === "pass"
      ).length
    }
  });
  completeTask(updatedRun, task, {
    metricCount: evaluated.scores.length
  });
}

async function runHumanReviewTask(run: EvalRunRecord, task: EvalTaskRecord) {
  const existing = listReviewCampaigns(run.id)[0];
  const now = new Date().toISOString();
  const planned = existing
    ? { campaign: existing, tasks: [] }
    : createReviewCampaignFromRun(run, {
        blindMode: run.spec.manifest.humanReview.blindMode,
        reviewersPerTask: run.spec.manifest.humanReview.reviewersPerTask,
        maxTasks: run.spec.manifest.humanReview.estimatedTasks || 24
      });

  if (!existing) {
    saveReviewCampaign(planned.campaign);
    saveReviewTasks(planned.tasks);
  }

  updateEvalTask({
    ...task,
    status: "running",
    output: { campaignId: planned.campaign.id },
    updatedAt: now
  });
  const updated = persistRun({
    ...run,
    status: "waiting_human",
    updatedAt: now
  });
  appendEvent(updated, {
    id: `event-${run.id}-human-wait-${Date.now()}`,
    at: now,
    level: "info",
    message: `Waiting for ${planned.campaign.name} to collect pairwise votes.`,
    nodeId: task.nodeId
  });
}

async function runAggregationTask(run: EvalRunRecord, task: EvalTaskRecord) {
  const evaluated =
    run.reviews.length > 0
      ? run
      : runImageEvalSpec(run.spec, run.id, run.createdAt, listApiProviders(), {
          includeMockHumanReviews: false
        });
  const now = new Date().toISOString();
  const updatedRun = persistRun({
    ...run,
    updatedAt: now,
    modelSummaries: evaluated.modelSummaries,
    pareto: evaluated.pareto,
    decision: evaluated.decision,
    summary: {
      ...evaluated.summary,
      artifactCount: run.artifacts.length,
      approvedArtifactCount: run.reviews.filter(
        (review) => review.verdict === "pass"
      ).length
    }
  });
  completeTask(updatedRun, task, {
    modelCount: updatedRun.modelSummaries.length
  });
}

async function runReleaseGateTask(run: EvalRunRecord, task: EvalTaskRecord) {
  const now = new Date().toISOString();
  const updatedRun = persistRun({
    ...run,
    status: "succeeded",
    updatedAt: now
  });
  completeTask(updatedRun, task, {
    decision: updatedRun.decision.status
  });
}

function completeTask(
  run: EvalRunRecord,
  task: EvalTaskRecord,
  output: Record<string, unknown>
) {
  const now = new Date().toISOString();
  updateEvalTask({
    ...task,
    status: "succeeded",
    output,
    updatedAt: now,
    completedAt: now
  });
  appendEvent(getRun(run.id) ?? run, {
    id: `event-${run.id}-${task.kind}-complete-${Date.now()}`,
    at: now,
    level: "success",
    message: `${taskLabel(task.kind)} completed.`,
    nodeId: task.nodeId
  });
}

function failOrRetryTask(
  run: EvalRunRecord,
  task: EvalTaskRecord,
  error: EvalTaskError
) {
  const now = new Date().toISOString();
  const shouldRetry = error.retryable && task.attempt < task.maxAttempts;
  updateEvalTask({
    ...task,
    status: shouldRetry ? "queued" : "failed",
    error,
    updatedAt: now,
    ...(shouldRetry ? {} : { completedAt: now })
  });
  const updatedRun = persistRun({
    ...run,
    status: shouldRetry ? "running" : "failed",
    updatedAt: now,
    ...(shouldRetry
      ? {}
      : {
          decision: {
            status: "fail" as const,
            message: error.message,
            gates: [
              {
                label: error.code,
                passed: false,
                actual: "failed",
                target: error.message
              }
            ]
          }
        })
  });
  appendEvent(updatedRun, {
    id: `event-${run.id}-${task.kind}-failed-${Date.now()}`,
    at: now,
    level: shouldRetry ? "warning" : "error",
    message: shouldRetry
      ? `${taskLabel(task.kind)} failed and will retry: ${error.message}`
      : `${taskLabel(task.kind)} failed: ${error.message}`,
    nodeId: task.nodeId
  });
}

function nextRunnableTask() {
  const tasks = listEvalTasks()
    .filter((task) => task.status === "queued")
    .sort((left, right) => {
      const orderDelta = taskOrder[left.kind] - taskOrder[right.kind];
      return orderDelta === 0 ? left.createdAt.localeCompare(right.createdAt) : orderDelta;
    });

  return tasks.find((task) => {
    const run = getRun(task.runId);
    if (
      !run ||
      run.status === "failed" ||
      run.status === "canceled" ||
      run.status === "succeeded" ||
      run.status === "waiting_human"
    ) {
      return false;
    }

    const runTasks = run.tasks;
    return runTasks
      .filter((candidate) => taskOrder[candidate.kind] < taskOrder[task.kind])
      .every((candidate) => candidate.status === "succeeded");
  });
}

function recoverRunningTasks() {
  const now = new Date().toISOString();
  for (const task of listEvalTasks()) {
    if (task.status !== "running" || task.kind === "human_review") {
      continue;
    }
    updateEvalTask({
      ...task,
      status: "queued",
      updatedAt: now
    });
  }
}

function providerSecretsForRun(run: EvalRunRecord): ProviderSecret[] {
  const providers = listApiProviders();
  const secrets: ProviderSecret[] = [];
  for (const manifestProvider of run.spec.manifest.providers) {
    const provider = providers.find(
      (candidate) =>
        candidate.id === manifestProvider.provider ||
        candidate.imageProvider === manifestProvider.provider
    );
    if (!provider) {
      continue;
    }
    const secret = getApiProviderSecret(provider.id);
    secrets.push({
      provider,
      ...(secret?.apiKey ? { apiKey: secret.apiKey } : {})
    });
  }
  return secrets;
}

function persistRun(run: EvalRunRecord) {
  return updateRun({
    ...run,
    tasks: run.tasks
  });
}

function appendEvent(run: EvalRunRecord, event: EvalRunEvent) {
  const updated = updateRun({
    ...run,
    updatedAt: event.at,
    events: [...run.events, event]
  });
  publishRunEvent(run.id, event);
  return updated;
}

function taskErrorFromUnknown(error: unknown): EvalTaskError {
  if (error instanceof AdapterExecutionError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable
    };
  }
  if (error instanceof Error) {
    return {
      code: "task_execution_failed",
      message: error.message,
      retryable: true
    };
  }
  return {
    code: "task_execution_failed",
    message: "Task execution failed.",
    retryable: true
  };
}

function taskLabel(kind: EvalTaskKind) {
  switch (kind) {
    case "generation":
      return "Generation";
    case "metric":
      return "Automatic metrics";
    case "human_review":
      return "Human review";
    case "aggregation":
      return "Aggregation";
    case "release_gate":
      return "Release gate";
  }
}
