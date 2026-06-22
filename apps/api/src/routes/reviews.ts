import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import type {
  EvalRunRecord,
  ImageArtifact,
  PairwiseVote,
  ReviewArtifactPayload,
  ReviewCampaign,
  ReviewTask,
  ReviewTaskPayload
} from "@eval/workflow-schema";
import { env } from "../config/env";
import {
  getReviewerSession,
  getReviewCampaign,
  getReviewLinkByToken,
  getReviewTask,
  getRun,
  listPairwiseVotes,
  listPairwiseVotesForSession,
  listReviewCampaigns,
  listReviewLinks,
  listReviewTasks,
  saveReviewerSession,
  saveReviewLink,
  saveReviewCampaign,
  saveReviewTasks,
  updateReviewerSession,
  updateReviewCampaign,
  updateReviewLink,
  updateReviewTask,
  updateRun,
  upsertPairwiseVote
} from "../lib/store";
import { aggregateCampaignReviews } from "../services/reviewAggregation";
import { resumeRunAfterHumanReview } from "../services/localRunOrchestrator";
import { createReviewCampaignFromRun } from "../services/reviewTaskPlanner";

const createCampaignBodySchema = z.object({
  name: z.string().min(1).optional(),
  blindMode: z.boolean().optional(),
  reviewersPerTask: z.number().int().min(1).max(9).optional(),
  guidelines: z.string().optional(),
  expiresInDays: z.number().int().min(1).max(90).optional(),
  maxTasks: z.number().int().min(1).max(200).optional()
});

const createLinkBodySchema = z.object({
  maxUses: z.number().int().min(1).max(1000).optional(),
  expiresInDays: z.number().int().min(1).max(90).optional()
});

const createSessionBodySchema = z.object({
  displayName: z.string().min(1).max(80).optional()
});

const submitVoteBodySchema = z.object({
  taskId: z.string().min(1),
  preferred: z.enum(["left", "right", "tie", "both_bad", "skip"]),
  reasonTags: z
    .array(
      z.enum([
        "prompt_adherence",
        "aesthetic_quality",
        "text_rendering",
        "composition",
        "visual_artifacts",
        "safety",
        "brand_fit"
      ])
    )
    .default([]),
  comment: z.string().default(""),
  timeSpentMs: z.number().int().min(0).default(0)
});

const aggregateBodySchema = z.object({
  campaignId: z.string().min(1).optional()
});

export async function registerReviewRoutes(app: FastifyInstance) {
  app.post<{ Params: { runId: string } }>(
    "/runs/:runId/review-campaigns",
    async (request, reply) => {
      const run = getRun(request.params.runId);
      if (!run) {
        return reply.code(404).send({ message: "Run not found" });
      }

      const parsed = createCampaignBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply
          .code(422)
          .send({ message: "Invalid campaign", issues: parsed.error.issues });
      }

      const expiresAt = parsed.data.expiresInDays
        ? addDays(new Date(), parsed.data.expiresInDays).toISOString()
        : undefined;
      const { campaign, tasks } = createReviewCampaignFromRun(run, {
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        ...(typeof parsed.data.blindMode === "boolean"
          ? { blindMode: parsed.data.blindMode }
          : {}),
        ...(parsed.data.reviewersPerTask
          ? { reviewersPerTask: parsed.data.reviewersPerTask }
          : {}),
        ...(parsed.data.guidelines ? { guidelines: parsed.data.guidelines } : {}),
        ...(parsed.data.maxTasks ? { maxTasks: parsed.data.maxTasks } : {}),
        ...(expiresAt ? { expiresAt } : {})
      });

      saveReviewCampaign(campaign);
      saveReviewTasks(tasks);

      return reply.code(201).send({
        campaign: campaignWithLinks(campaign),
        tasks
      });
    }
  );

  app.get<{ Params: { runId: string } }>(
    "/runs/:runId/review-campaigns",
    async (request, reply) => {
      const run = getRun(request.params.runId);
      if (!run) {
        return reply.code(404).send({ message: "Run not found" });
      }

      return {
        campaigns: listReviewCampaigns(run.id).map(campaignWithLinks)
      };
    }
  );

  app.post<{ Params: { campaignId: string } }>(
    "/review-campaigns/:campaignId/links",
    async (request, reply) => {
      const campaign = getReviewCampaign(request.params.campaignId);
      if (!campaign) {
        return reply.code(404).send({ message: "Campaign not found" });
      }

      const parsed = createLinkBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply
          .code(422)
          .send({ message: "Invalid link", issues: parsed.error.issues });
      }

      const token = nanoid(18);
      const now = new Date();
      const expiresAt = parsed.data.expiresInDays
        ? addDays(now, parsed.data.expiresInDays).toISOString()
        : campaign.expiresAt;
      const link = saveReviewLink({
        id: nanoid(),
        runId: campaign.runId,
        campaignId: campaign.id,
        token,
        url: `${requestOrigin(request)}/review/${token}`,
        scope: "campaign",
        useCount: 0,
        createdAt: now.toISOString(),
        ...(parsed.data.maxUses ? { maxUses: parsed.data.maxUses } : {}),
        ...(expiresAt ? { expiresAt } : {})
      });

      return reply.code(201).send({ link });
    }
  );

  app.get<{ Params: { token: string } }>(
    "/review-links/:token",
    async (request, reply) => {
      const resolved = resolveReviewLink(request.params.token);
      if ("error" in resolved) {
        return reply.code(resolved.status).send({ message: resolved.error });
      }

      return buildReviewLinkPayload(resolved.run, resolved.campaign, resolved.link);
    }
  );

  app.post<{ Params: { token: string } }>(
    "/review-links/:token/sessions",
    async (request, reply) => {
      const resolved = resolveReviewLink(request.params.token);
      if ("error" in resolved) {
        return reply.code(resolved.status).send({ message: resolved.error });
      }

      const parsed = createSessionBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply
          .code(422)
          .send({ message: "Invalid session", issues: parsed.error.issues });
      }

      if (resolved.link.maxUses && resolved.link.useCount >= resolved.link.maxUses) {
        return reply
          .code(403)
          .send({ message: "Review link has reached its use limit" });
      }

      const now = new Date().toISOString();
      const session = saveReviewerSession({
        id: nanoid(),
        runId: resolved.run.id,
        campaignId: resolved.campaign.id,
        reviewLinkId: resolved.link.id,
        displayName: parsed.data.displayName?.trim() || "Reviewer",
        status: "active",
        startedAt: now
      });

      updateReviewLink({
        ...resolved.link,
        useCount: resolved.link.useCount + 1
      });

      return reply.code(201).send({
        session,
        ...buildReviewerSessionPayload(session.id)
      });
    }
  );

  app.get<{ Params: { sessionId: string } }>(
    "/reviewer-sessions/:sessionId/tasks",
    async (request, reply) => {
      const payload = buildReviewerSessionPayload(request.params.sessionId);
      if (!payload) {
        return reply.code(404).send({ message: "Reviewer session not found" });
      }

      return payload;
    }
  );

  app.post<{ Params: { sessionId: string } }>(
    "/reviewer-sessions/:sessionId/votes",
    async (request, reply) =>
      submitSessionVote(request.params.sessionId, request.body, reply)
  );

  app.post<{ Params: { sessionId: string; taskId: string } }>(
    "/reviewer-sessions/:sessionId/tasks/:taskId/vote",
    async (request, reply) =>
      submitSessionVote(
        request.params.sessionId,
        {
          ...(typeof request.body === "object" && request.body ? request.body : {}),
          taskId: request.params.taskId
        },
        reply
      )
  );

  app.post<{ Params: { runId: string; campaignId: string } }>(
    "/runs/:runId/review-campaigns/:campaignId/aggregate",
    async (request, reply) =>
      aggregateRunCampaign(request.params.runId, request.params.campaignId, reply)
  );

  app.post<{ Params: { runId: string } }>(
    "/runs/:runId/aggregate-reviews",
    async (request, reply) => {
      const parsed = aggregateBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply
          .code(422)
          .send({ message: "Invalid aggregate request", issues: parsed.error.issues });
      }
      const campaignId =
        parsed.data.campaignId ??
        listReviewCampaigns(request.params.runId).sort((left, right) =>
          right.updatedAt.localeCompare(left.updatedAt)
        )[0]?.id;

      if (!campaignId) {
        return reply.code(404).send({ message: "Campaign not found" });
      }

      return aggregateRunCampaign(request.params.runId, campaignId, reply);
    }
  );

  app.post<{ Params: { campaignId: string } }>(
    "/review-campaigns/:campaignId/close",
    async (request, reply) => {
      const campaign = getReviewCampaign(request.params.campaignId);
      if (!campaign) {
        return reply.code(404).send({ message: "Campaign not found" });
      }

      return {
        campaign: updateReviewCampaign({
          ...campaign,
          status: "closed",
          updatedAt: new Date().toISOString()
        })
      };
    }
  );
}

function submitSessionVote(sessionId: string, body: unknown, reply: FastifyReply) {
  const session = getReviewerSession(sessionId);
  if (!session) {
    return reply.code(404).send({ message: "Reviewer session not found" });
  }

  const parsed = submitVoteBodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return reply
      .code(422)
      .send({ message: "Invalid vote", issues: parsed.error.issues });
  }

  const campaign = getReviewCampaign(session.campaignId);
  const task = getReviewTask(parsed.data.taskId);
  if (!campaign || !task || task.campaignId !== session.campaignId) {
    return reply.code(404).send({ message: "Review task not found" });
  }
  if (campaign.status !== "open") {
    return reply.code(409).send({ message: "Campaign is not accepting votes" });
  }

  const preferredArtifact = preferredArtifactId(task, parsed.data.preferred);
  const vote = upsertPairwiseVote({
    id: nanoid(),
    runId: session.runId,
    campaignId: session.campaignId,
    taskId: task.id,
    sessionId: session.id,
    leftArtifactId: task.leftArtifactId,
    rightArtifactId: task.rightArtifactId,
    preferred: parsed.data.preferred,
    reasonTags: parsed.data.reasonTags,
    comment: parsed.data.comment,
    timeSpentMs: parsed.data.timeSpentMs,
    createdAt: new Date().toISOString(),
    ...(preferredArtifact ? { preferredArtifactId: preferredArtifact } : {})
  });
  const refreshed = refreshCampaignProgress(campaign.id);
  const payload = buildReviewerSessionPayload(session.id);

  return {
    vote,
    campaign: refreshed ?? campaign,
    ...(payload ?? {})
  };
}

function aggregateRunCampaign(runId: string, campaignId: string, reply: FastifyReply) {
  const run = getRun(runId);
  const campaign = getReviewCampaign(campaignId);

  if (!run || !campaign || campaign.runId !== runId) {
    return reply.code(404).send({ message: "Run or campaign not found" });
  }

  const result = aggregateCampaignReviews(
    run,
    campaign,
    listReviewTasks(campaign.id),
    listPairwiseVotes(campaign.id)
  );
  updateReviewCampaign(result.campaign);
  for (const task of result.tasks) {
    updateReviewTask(task);
  }
  updateRun(result.run);
  const resumedRun = resumeRunAfterHumanReview(runId, campaign.id) ?? result.run;

  return {
    run: resumedRun,
    campaign: campaignWithLinks(result.campaign),
    aggregation: result.aggregation
  };
}

function resolveReviewLink(token: string):
  | {
      link: NonNullable<ReturnType<typeof getReviewLinkByToken>>;
      campaign: ReviewCampaign;
      run: EvalRunRecord;
    }
  | { error: string; status: 403 | 404 } {
  const link = getReviewLinkByToken(token);
  if (!link) {
    return { error: "Review link not found", status: 404 };
  }

  const campaign = getReviewCampaign(link.campaignId);
  const run = getRun(link.runId);
  if (!campaign || !run) {
    return { error: "Review campaign not found", status: 404 };
  }
  if (link.expiresAt && Date.parse(link.expiresAt) < Date.now()) {
    return { error: "Review link has expired", status: 403 };
  }
  if (campaign.expiresAt && Date.parse(campaign.expiresAt) < Date.now()) {
    return { error: "Review campaign has expired", status: 403 };
  }
  if (campaign.status !== "open") {
    return { error: "Review campaign is not open", status: 403 };
  }

  return { link, campaign, run };
}

function buildReviewLinkPayload(
  run: EvalRunRecord,
  campaign: ReviewCampaign,
  link: NonNullable<ReturnType<typeof getReviewLinkByToken>>
) {
  const tasks = listReviewTasks(campaign.id);
  return {
    link,
    campaign,
    run: {
      id: run.id,
      name: run.spec.name,
      createdAt: run.createdAt
    },
    taskCount: tasks.length,
    completedTaskCount: tasks.filter((task) => task.status === "completed").length
  };
}

function buildReviewerSessionPayload(sessionId: string) {
  const session = getReviewerSession(sessionId);
  if (!session) {
    return undefined;
  }

  const campaign = getReviewCampaign(session.campaignId);
  const run = getRun(session.runId);
  if (!campaign || !run) {
    return undefined;
  }

  const submittedVotes = new Map(
    listPairwiseVotesForSession(session.id).map((vote) => [vote.taskId, vote])
  );
  const tasks = listReviewTasks(campaign.id)
    .sort((left, right) => left.orderSeed - right.orderSeed)
    .map((task) => taskPayload(run, campaign, task, submittedVotes.get(task.id)))
    .filter((payload): payload is ReviewTaskPayload => Boolean(payload));
  const completed = tasks.every((task) => Boolean(task.submittedVote));
  const nextSession =
    completed && session.status !== "completed"
      ? updateReviewerSession({
          ...session,
          status: "completed",
          completedAt: new Date().toISOString()
        })
      : session;

  return {
    session: nextSession,
    campaign,
    run: {
      id: run.id,
      name: run.spec.name,
      createdAt: run.createdAt
    },
    tasks,
    progress: {
      submittedCount: tasks.filter((task) => Boolean(task.submittedVote)).length,
      taskCount: tasks.length
    }
  };
}

function taskPayload(
  run: EvalRunRecord,
  campaign: ReviewCampaign,
  task: ReviewTask,
  submittedVote?: PairwiseVote
): ReviewTaskPayload | undefined {
  const left = run.artifacts.find((artifact) => artifact.id === task.leftArtifactId);
  const right = run.artifacts.find((artifact) => artifact.id === task.rightArtifactId);
  if (!left || !right) {
    return undefined;
  }

  return {
    task,
    leftArtifact: artifactPayload(left, campaign.blindMode),
    rightArtifact: artifactPayload(right, campaign.blindMode),
    submittedVote
  };
}

function artifactPayload(
  artifact: ImageArtifact,
  blindMode: boolean
): ReviewArtifactPayload {
  return {
    id: artifact.id,
    promptId: artifact.promptId,
    prompt: artifact.prompt,
    uri: blindMode ? redactMockImageLabels(artifact.uri) : artifact.uri,
    thumbnailUri: blindMode
      ? redactMockImageLabels(artifact.thumbnailUri)
      : artifact.thumbnailUri,
    width: artifact.width,
    height: artifact.height,
    tags: artifact.tags,
    ...(blindMode ? {} : { model: artifact.model, provider: artifact.provider })
  };
}

function redactMockImageLabels(uri: string) {
  if (!uri.startsWith("data:image/svg+xml")) {
    return uri;
  }

  const [prefix, encodedSvg] = uri.split(",", 2);
  if (!prefix || !encodedSvg) {
    return uri;
  }

  try {
    const svg = decodeURIComponent(encodedSvg)
      .replace(
        />\s*(GPT IMAGE|IMAGEN|FLUX|SDXL|IMPORTED)\s*<\/text>/gi,
        ">CANDIDATE</text>"
      )
      .replace(/>\s*SAMPLE\s+\d+\s*<\/text>/gi, ">SAMPLE</text>");
    return `${prefix},${encodeURIComponent(svg)}`;
  } catch {
    return uri;
  }
}

function refreshCampaignProgress(campaignId: string) {
  const campaign = getReviewCampaign(campaignId);
  if (!campaign) {
    return undefined;
  }

  const tasks = listReviewTasks(campaignId);
  const votes = listPairwiseVotes(campaignId);
  const refreshedTasks = tasks.map((task) => {
    const taskVotes = votes.filter(
      (vote) => vote.taskId === task.id && vote.preferred !== "skip"
    );
    const shouldComplete = taskVotes.length >= task.requiredVotes;
    if (shouldComplete) {
      return updateReviewTask({
        ...task,
        voteCount: votes.filter((vote) => vote.taskId === task.id).length,
        status: "completed",
        completedAt: task.completedAt ?? new Date().toISOString()
      });
    }

    const pendingTask = withoutCompletedAt(task);
    return updateReviewTask({
      ...pendingTask,
      voteCount: votes.filter((vote) => vote.taskId === task.id).length,
      status: "pending"
    });
  });
  const completedTaskCount = refreshedTasks.filter(
    (task) => task.status === "completed"
  ).length;
  const agreementRate = roundScore(
    average(
      refreshedTasks.map((task) => {
        const taskVotes = votes.filter(
          (vote) => vote.taskId === task.id && vote.preferred !== "skip"
        );
        if (taskVotes.length === 0) {
          return 0;
        }
        const counts = [
          taskVotes.filter((vote) => vote.preferred === "left").length,
          taskVotes.filter((vote) => vote.preferred === "right").length,
          taskVotes.filter((vote) => vote.preferred === "tie").length,
          taskVotes.filter((vote) => vote.preferred === "both_bad").length
        ];
        return Math.max(...counts) / taskVotes.length;
      })
    )
  );

  return updateReviewCampaign({
    ...campaign,
    status:
      refreshedTasks.length > 0 && completedTaskCount === refreshedTasks.length
        ? "completed"
        : campaign.status,
    completedTaskCount,
    voteCount: votes.length,
    agreementRate,
    updatedAt: new Date().toISOString()
  });
}

function campaignWithLinks(campaign: ReviewCampaign) {
  return {
    ...campaign,
    links: listReviewLinks(campaign.id)
  };
}

function preferredArtifactId(task: ReviewTask, preferred: PairwiseVote["preferred"]) {
  if (preferred === "left") {
    return task.leftArtifactId;
  }
  if (preferred === "right") {
    return task.rightArtifactId;
  }
  return undefined;
}

function withoutCompletedAt(task: ReviewTask) {
  const next = { ...task };
  delete next.completedAt;
  return next;
}

function requestOrigin(request: FastifyRequest) {
  const origin = request.headers.origin;
  if (typeof origin === "string" && origin.length > 0) {
    return origin;
  }

  return env.corsOrigin;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function average(values: number[]) {
  return values.length > 0
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

function roundScore(value: number) {
  return Math.round(value * 1000) / 1000;
}
