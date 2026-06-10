import type {
  EvalDecision,
  EvalRunRecord,
  HumanReview,
  ImageArtifact,
  ImageScore,
  ModelSummary,
  PairwiseComparison,
  PairwiseVote,
  ReviewCampaign,
  ReviewTask
} from "@eval/workflow-schema";

type TaskVoteStats = {
  task: ReviewTask;
  votes: PairwiseVote[];
  leftVotes: number;
  rightVotes: number;
  tieVotes: number;
  bothBadVotes: number;
  skipVotes: number;
  relevantVotes: number;
  preferredArtifactId: string | undefined;
  agreementRate: number;
};

export type ReviewAggregationResult = {
  campaign: ReviewCampaign;
  tasks: ReviewTask[];
  run: EvalRunRecord;
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

export function aggregateCampaignReviews(
  run: EvalRunRecord,
  campaign: ReviewCampaign,
  tasks: ReviewTask[],
  votes: PairwiseVote[],
  now = new Date().toISOString()
): ReviewAggregationResult {
  const stats = tasks.map((task) => buildTaskVoteStats(task, votes));
  const completedTaskCount = stats.filter(
    (entry) => entry.relevantVotes >= entry.task.requiredVotes
  ).length;
  const agreementRate = roundScore(
    average(
      stats
        .filter((entry) => entry.relevantVotes > 0)
        .map((entry) => entry.agreementRate)
    )
  );
  const updatedCampaign: ReviewCampaign = {
    ...campaign,
    status:
      tasks.length > 0 && completedTaskCount >= tasks.length
        ? "completed"
        : campaign.status === "closed"
          ? "closed"
          : "open",
    taskCount: tasks.length,
    completedTaskCount,
    voteCount: votes.length,
    agreementRate,
    updatedAt: now
  };
  const updatedTasks: ReviewTask[] = stats.map((entry) => {
    const completed = entry.relevantVotes >= entry.task.requiredVotes;
    if (completed) {
      return {
        ...entry.task,
        status: "completed",
        voteCount: entry.votes.length,
        completedAt: entry.task.completedAt ?? now
      };
    }

    const task = withoutCompletedAt(entry.task);
    return {
      ...task,
      status: "pending",
      voteCount: entry.votes.length
    };
  });
  const pairwise = buildAggregatedPairwise(stats);
  const reviews = buildAggregateHumanReviews(run, campaign, votes, now);
  const modelSummaries = buildModelSummaries(
    run.artifacts,
    run.scores,
    reviews,
    pairwise.length > 0 ? pairwise : run.pairwise
  );
  const pareto = buildPareto(modelSummaries);
  const summary = buildSummary(run, reviews, modelSummaries, tasks, votes);
  const decision = buildDecision(run, summary, modelSummaries);
  const updatedRun: EvalRunRecord = {
    ...run,
    summary,
    reviews,
    pairwise: pairwise.length > 0 ? pairwise : run.pairwise,
    modelSummaries,
    pareto,
    decision,
    events: [
      ...run.events,
      {
        id: `event-review-aggregate-${campaign.id}-${Date.now()}`,
        at: now,
        level: "success",
        message: `Aggregated ${votes.length} blind pairwise vote${
          votes.length === 1 ? "" : "s"
        } from ${updatedCampaign.name}.`
      }
    ]
  };

  return {
    campaign: updatedCampaign,
    tasks: updatedTasks,
    run: updatedRun,
    aggregation: {
      taskCount: tasks.length,
      completedTaskCount,
      voteCount: votes.length,
      agreementRate,
      leftWinCount: stats.filter(
        (entry) => entry.preferredArtifactId === entry.task.leftArtifactId
      ).length,
      rightWinCount: stats.filter(
        (entry) => entry.preferredArtifactId === entry.task.rightArtifactId
      ).length,
      tieCount: sum(stats.map((entry) => entry.tieVotes)),
      bothBadCount: sum(stats.map((entry) => entry.bothBadVotes)),
      skipCount: sum(stats.map((entry) => entry.skipVotes))
    }
  };
}

function withoutCompletedAt(task: ReviewTask) {
  const next = { ...task };
  delete next.completedAt;
  return next;
}

function buildTaskVoteStats(task: ReviewTask, votes: PairwiseVote[]): TaskVoteStats {
  const taskVotes = votes.filter((vote) => vote.taskId === task.id);
  const leftVotes = taskVotes.filter((vote) => vote.preferred === "left").length;
  const rightVotes = taskVotes.filter((vote) => vote.preferred === "right").length;
  const tieVotes = taskVotes.filter((vote) => vote.preferred === "tie").length;
  const bothBadVotes = taskVotes.filter((vote) => vote.preferred === "both_bad").length;
  const skipVotes = taskVotes.filter((vote) => vote.preferred === "skip").length;
  const relevantVotes = taskVotes.length - skipVotes;
  const preferredArtifactId =
    leftVotes > rightVotes
      ? task.leftArtifactId
      : rightVotes > leftVotes
        ? task.rightArtifactId
        : undefined;
  const topChoiceCount = Math.max(leftVotes, rightVotes, tieVotes, bothBadVotes);

  return {
    task,
    votes: taskVotes,
    leftVotes,
    rightVotes,
    tieVotes,
    bothBadVotes,
    skipVotes,
    relevantVotes,
    preferredArtifactId,
    agreementRate: relevantVotes > 0 ? topChoiceCount / relevantVotes : 0
  };
}

function buildAggregatedPairwise(stats: TaskVoteStats[]): PairwiseComparison[] {
  return stats
    .filter((entry) => entry.relevantVotes > 0)
    .map((entry) => ({
      id: entry.task.id,
      promptId: entry.task.promptId,
      leftArtifactId: entry.task.leftArtifactId,
      rightArtifactId: entry.task.rightArtifactId,
      preferredArtifactId: entry.preferredArtifactId,
      reason: `Reviewer votes: ${entry.leftVotes} left, ${entry.rightVotes} right, ${entry.tieVotes} tie, ${entry.bothBadVotes} both bad, ${entry.skipVotes} skipped.`,
      voteCount: entry.votes.length,
      tieCount: entry.tieVotes,
      leftWinRate:
        entry.relevantVotes > 0 ? roundScore(entry.leftVotes / entry.relevantVotes) : 0,
      rightWinRate:
        entry.relevantVotes > 0
          ? roundScore(entry.rightVotes / entry.relevantVotes)
          : 0,
      agreementRate: roundScore(entry.agreementRate)
    }));
}

function buildAggregateHumanReviews(
  run: EvalRunRecord,
  campaign: ReviewCampaign,
  votes: PairwiseVote[],
  now: string
): HumanReview[] {
  const artifactCredits = new Map<string, { credit: number; appearances: number }>();
  const touchedArtifactIds = new Set<string>();

  for (const vote of votes) {
    if (vote.preferred === "skip") {
      continue;
    }

    touchedArtifactIds.add(vote.leftArtifactId);
    touchedArtifactIds.add(vote.rightArtifactId);
    addAppearance(artifactCredits, vote.leftArtifactId);
    addAppearance(artifactCredits, vote.rightArtifactId);

    if (vote.preferred === "left") {
      addCredit(artifactCredits, vote.leftArtifactId, 1);
    } else if (vote.preferred === "right") {
      addCredit(artifactCredits, vote.rightArtifactId, 1);
    } else if (vote.preferred === "tie") {
      addCredit(artifactCredits, vote.leftArtifactId, 0.5);
      addCredit(artifactCredits, vote.rightArtifactId, 0.5);
    }
  }

  const existingReviews = run.reviews.filter(
    (review) => !touchedArtifactIds.has(review.artifactId)
  );
  const aggregateReviews = Array.from(artifactCredits.entries()).map(
    ([artifactId, result]): HumanReview => {
      const artifact = run.artifacts.find((candidate) => candidate.id === artifactId);
      const score = roundScore(result.credit / result.appearances);
      return {
        id: `aggregate-${campaign.id}-${artifactId}`,
        artifactId,
        reviewer: `aggregate:${campaign.id}`,
        blind: campaign.blindMode,
        verdict: score >= 0.6 ? "pass" : score <= 0.4 ? "fail" : "needs_review",
        score,
        comment: `Aggregated from ${result.appearances} blind pairwise vote${
          result.appearances === 1 ? "" : "s"
        } in ${campaign.name}.`,
        tags: artifact?.tags ?? [],
        createdAt: now
      };
    }
  );

  return [...existingReviews, ...aggregateReviews];
}

function addAppearance(
  artifactCredits: Map<string, { credit: number; appearances: number }>,
  artifactId: string
) {
  const current = artifactCredits.get(artifactId) ?? { credit: 0, appearances: 0 };
  artifactCredits.set(artifactId, {
    ...current,
    appearances: current.appearances + 1
  });
}

function addCredit(
  artifactCredits: Map<string, { credit: number; appearances: number }>,
  artifactId: string,
  credit: number
) {
  const current = artifactCredits.get(artifactId) ?? { credit: 0, appearances: 0 };
  artifactCredits.set(artifactId, {
    ...current,
    credit: current.credit + credit
  });
}

function buildModelSummaries(
  artifacts: ImageArtifact[],
  scores: ImageScore[],
  reviews: HumanReview[],
  pairwise: PairwiseComparison[]
): ModelSummary[] {
  const models = Array.from(new Set(artifacts.map((artifact) => artifact.model)));
  return models.map((model) => {
    const modelArtifacts = artifacts.filter((artifact) => artifact.model === model);
    const provider = modelArtifacts[0]?.provider ?? "imported";
    const modelArtifactIds = new Set(modelArtifacts.map((artifact) => artifact.id));
    const approvedCount = reviews.filter(
      (review) => review.verdict === "pass" && modelArtifactIds.has(review.artifactId)
    ).length;
    const wins = pairwise.filter(
      (comparison) =>
        comparison.preferredArtifactId &&
        modelArtifactIds.has(comparison.preferredArtifactId)
    ).length;
    const appearances = pairwise.filter(
      (comparison) =>
        modelArtifactIds.has(comparison.leftArtifactId) ||
        modelArtifactIds.has(comparison.rightArtifactId)
    ).length;
    const safetyScores = scores.filter(
      (score) => score.metric === "nsfw" && modelArtifactIds.has(score.artifactId)
    );
    const totalCost = sum(modelArtifacts.map((artifact) => artifact.costUsd));

    return {
      model,
      provider,
      artifactCount: modelArtifacts.length,
      approvedCount,
      averageQuality: roundScore(
        average(
          modelArtifacts.map((artifact) => qualityForArtifact(artifact.id, scores))
        )
      ),
      humanWinRate: roundScore(
        appearances > 0 ? wins / appearances : approvedCount / modelArtifacts.length
      ),
      safetyPassRate: roundScore(
        safetyScores.length > 0
          ? safetyScores.filter((score) => score.pass).length / safetyScores.length
          : 1
      ),
      averageCostUsd: roundCurrency(totalCost / modelArtifacts.length),
      averageLatencyMs: Math.round(
        average(modelArtifacts.map((artifact) => artifact.latencyMs))
      ),
      usableArtifactCostUsd: roundCurrency(totalCost / Math.max(approvedCount, 1))
    };
  });
}

function buildPareto(modelSummaries: ModelSummary[]) {
  return modelSummaries.map((summary) => {
    const dominated = modelSummaries.some((candidate) => {
      if (candidate.model === summary.model) {
        return false;
      }

      const atLeastAsGood =
        candidate.averageQuality >= summary.averageQuality &&
        candidate.averageCostUsd <= summary.averageCostUsd &&
        candidate.averageLatencyMs <= summary.averageLatencyMs;
      const strictlyBetter =
        candidate.averageQuality > summary.averageQuality ||
        candidate.averageCostUsd < summary.averageCostUsd ||
        candidate.averageLatencyMs < summary.averageLatencyMs;

      return atLeastAsGood && strictlyBetter;
    });

    return {
      model: summary.model,
      provider: summary.provider,
      qualityScore: summary.averageQuality,
      costUsd: summary.averageCostUsd,
      latencyMs: summary.averageLatencyMs,
      safetyPassRate: summary.safetyPassRate,
      isParetoOptimal: !dominated
    };
  });
}

function buildSummary(
  run: EvalRunRecord,
  reviews: HumanReview[],
  modelSummaries: ModelSummary[],
  tasks: ReviewTask[],
  votes: PairwiseVote[]
) {
  const best = [...modelSummaries].sort(
    (left, right) => right.averageQuality - left.averageQuality
  )[0];
  const safetyScores = run.scores.filter((score) => score.metric === "nsfw");
  const latencies = run.artifacts
    .map((artifact) => artifact.latencyMs)
    .sort((a, b) => a - b);

  return {
    artifactCount: run.artifacts.length,
    approvedArtifactCount: reviews.filter((review) => review.verdict === "pass").length,
    estimatedCostUsd: roundCurrency(
      sum(run.artifacts.map((artifact) => artifact.costUsd))
    ),
    taskCount:
      run.spec.nodes.length +
      run.spec.edges.length +
      run.artifacts.length +
      run.scores.length +
      tasks.length +
      votes.length,
    averageQuality: roundScore(
      average(
        run.artifacts.map((artifact) => qualityForArtifact(artifact.id, run.scores))
      )
    ),
    safetyPassRate: roundScore(
      safetyScores.length > 0
        ? safetyScores.filter((score) => score.pass).length / safetyScores.length
        : 1
    ),
    p95LatencyMs: percentile(latencies, 0.95),
    bestModel: best?.model ?? "n/a"
  };
}

function buildDecision(
  run: EvalRunRecord,
  summary: ReturnType<typeof buildSummary>,
  modelSummaries: ModelSummary[]
): EvalDecision {
  const releaseConfig =
    run.spec.nodes.find((node) => node.type === "decision.release_gate")?.config ?? {};
  const minHumanWinRate = numberConfig(releaseConfig.minHumanWinRate, 0.55);
  const safetyMustPass = releaseConfig.safetyMustPass !== false;
  const best = [...modelSummaries].sort(
    (left, right) => right.averageQuality - left.averageQuality
  )[0];
  const bestWinRate = best?.humanWinRate ?? 0;
  const gates = [
    {
      label: "Average quality",
      passed: summary.averageQuality >= 0.74,
      actual: percent(summary.averageQuality),
      target: ">= 74%"
    },
    {
      label: "Human win rate",
      passed: bestWinRate >= minHumanWinRate,
      actual: percent(bestWinRate),
      target: `>= ${percent(minHumanWinRate)}`
    },
    {
      label: "Safety pass rate",
      passed: !safetyMustPass || summary.safetyPassRate >= 0.92,
      actual: percent(summary.safetyPassRate),
      target: safetyMustPass ? ">= 92%" : "tracked"
    },
    {
      label: "P95 latency",
      passed: summary.p95LatencyMs <= 6500,
      actual: `${(summary.p95LatencyMs / 1000).toFixed(1)}s`,
      target: "<= 6.5s"
    }
  ];
  const failures = gates.filter((gate) => !gate.passed).length;

  return {
    status: failures === 0 ? "pass" : failures <= 1 ? "warn" : "fail",
    message:
      failures === 0
        ? `${summary.bestModel} is currently the best release candidate after reviewer aggregation.`
        : `${summary.bestModel} leads quality, but ${failures} release gate${
            failures > 1 ? "s" : ""
          } need attention after reviewer aggregation.`,
    gates
  };
}

function qualityForArtifact(artifactId: string, scores: ImageScore[]) {
  return average(
    scores
      .filter(
        (score) =>
          score.artifactId === artifactId &&
          (score.metric === "vlm_rubric" ||
            score.metric === "clip_siglip" ||
            score.metric === "ocr" ||
            score.metric === "blur" ||
            score.metric === "aesthetic")
      )
      .map((score) => score.score)
  );
}

function numberConfig(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function average(values: number[]) {
  return values.length > 0 ? sum(values) / values.length : 0;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) {
    return 0;
  }

  const index = Math.min(
    values.length - 1,
    Math.max(0, Math.ceil(values.length * percentileValue) - 1)
  );
  return values[index] ?? 0;
}

function roundScore(value: number) {
  return Math.round(value * 1000) / 1000;
}

function roundCurrency(value: number) {
  return Math.round(value * 10000) / 10000;
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}
