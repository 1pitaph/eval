import { nanoid } from "nanoid";
import type {
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

const workflows = new Map<string, WorkflowDraft & { id: string }>();
const runs = new Map<string, EvalRunRecord>();
const reviewCampaigns = new Map<string, ReviewCampaign>();
const reviewTasks = new Map<string, ReviewTask>();
const reviewLinks = new Map<string, ReviewLink>();
const reviewerSessions = new Map<string, ReviewerSession>();
const pairwiseVotes = new Map<string, PairwiseVote>();

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
