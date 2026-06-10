import { nanoid } from "nanoid";
import type {
  EvalRunRecord,
  ImageArtifact,
  ReviewCampaign,
  ReviewReasonTag,
  ReviewTask
} from "@eval/workflow-schema";

const defaultReasonTags: ReviewReasonTag[] = [
  "prompt_adherence",
  "aesthetic_quality",
  "text_rendering",
  "composition",
  "visual_artifacts",
  "safety",
  "brand_fit"
];

export type CreateReviewCampaignOptions = {
  name?: string | undefined;
  blindMode?: boolean | undefined;
  reviewersPerTask?: number | undefined;
  guidelines?: string | undefined;
  expiresAt?: string | undefined;
  maxTasks?: number | undefined;
};

export function createReviewCampaignFromRun(
  run: EvalRunRecord,
  options: CreateReviewCampaignOptions,
  now = new Date().toISOString()
) {
  const reviewersPerTask = clampInt(options.reviewersPerTask, 1, 9, 3);
  const maxTasks = clampInt(options.maxTasks, 1, 200, 24);
  const campaign: ReviewCampaign = {
    id: nanoid(),
    runId: run.id,
    name: options.name?.trim() || `${run.spec.name} blind image vote`,
    mode: "pairwise",
    status: "open",
    blindMode: options.blindMode ?? true,
    reviewersPerTask,
    guidelines:
      options.guidelines?.trim() ||
      "Choose the image that best satisfies the prompt for a production release.",
    reasonTags: defaultReasonTags,
    taskCount: 0,
    completedTaskCount: 0,
    voteCount: 0,
    agreementRate: 0,
    createdAt: now,
    updatedAt: now,
    ...(options.expiresAt ? { expiresAt: options.expiresAt } : {})
  };
  const tasks = buildPairwiseReviewTasks(run, campaign, maxTasks, now);

  return {
    campaign: {
      ...campaign,
      taskCount: tasks.length
    },
    tasks
  };
}

function buildPairwiseReviewTasks(
  run: EvalRunRecord,
  campaign: ReviewCampaign,
  maxTasks: number,
  now: string
) {
  const tasks = buildBestModelPairTasks(run, campaign, now);
  const fallbackTasks =
    tasks.length > 0 ? tasks : buildSeededPairwiseTasks(run, campaign, now);

  return fallbackTasks
    .sort((left, right) => left.orderSeed - right.orderSeed)
    .slice(0, maxTasks);
}

function buildBestModelPairTasks(
  run: EvalRunRecord,
  campaign: ReviewCampaign,
  now: string
): ReviewTask[] {
  const promptIds = Array.from(
    new Set(run.artifacts.map((artifact) => artifact.promptId))
  );

  return promptIds.flatMap((promptId) => {
    const promptArtifacts = run.artifacts.filter(
      (artifact) => artifact.promptId === promptId
    );
    const bestByModel = new Map<string, ImageArtifact>();

    for (const artifact of promptArtifacts) {
      const current = bestByModel.get(artifact.model);
      if (
        !current ||
        qualityForArtifact(run, artifact.id) > qualityForArtifact(run, current.id)
      ) {
        bestByModel.set(artifact.model, artifact);
      }
    }

    const candidates = Array.from(bestByModel.values()).sort((left, right) =>
      left.model.localeCompare(right.model)
    );
    const pairs: ReviewTask[] = [];

    for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < candidates.length;
        rightIndex += 1
      ) {
        const left = candidates[leftIndex];
        const right = candidates[rightIndex];
        if (!left || !right) {
          continue;
        }
        pairs.push(toReviewTask(run, campaign, promptId, left, right, now));
      }
    }

    return pairs;
  });
}

function buildSeededPairwiseTasks(
  run: EvalRunRecord,
  campaign: ReviewCampaign,
  now: string
): ReviewTask[] {
  return run.pairwise.flatMap((comparison) => {
    const left = run.artifacts.find(
      (artifact) => artifact.id === comparison.leftArtifactId
    );
    const right = run.artifacts.find(
      (artifact) => artifact.id === comparison.rightArtifactId
    );
    if (!left || !right) {
      return [];
    }

    return [toReviewTask(run, campaign, comparison.promptId, left, right, now)];
  });
}

function toReviewTask(
  run: EvalRunRecord,
  campaign: ReviewCampaign,
  promptId: string,
  left: ImageArtifact,
  right: ImageArtifact,
  now: string
): ReviewTask {
  return {
    id: `task-${campaign.id}-${left.id}-${right.id}`,
    runId: run.id,
    campaignId: campaign.id,
    kind: "pairwise_vote",
    status: "pending",
    promptId,
    prompt: left.prompt || right.prompt,
    leftArtifactId: left.id,
    rightArtifactId: right.id,
    voteCount: 0,
    requiredVotes: campaign.reviewersPerTask,
    orderSeed: hashInt(`${run.id}:${campaign.id}:${promptId}:${left.id}:${right.id}`),
    createdAt: now
  };
}

function qualityForArtifact(run: EvalRunRecord, artifactId: string) {
  const metrics = new Set(["vlm_rubric", "clip_siglip", "ocr", "blur", "aesthetic"]);
  const values = run.scores
    .filter((score) => score.artifactId === artifactId && metrics.has(score.metric))
    .map((score) => score.score);

  return values.length > 0
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function hashInt(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
