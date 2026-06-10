import { Check, Clipboard, Link2, RefreshCcw, Send, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { EvalRunRecord } from "@eval/workflow-schema";
import { Badge, Button } from "@eval/ui";
import {
  aggregateReviewCampaign,
  createReviewCampaign,
  createReviewLink,
  listReviewCampaigns,
  type ReviewCampaignWithLinks
} from "../../../shared/api/evalApi";

type CampaignDraft = {
  name: string;
  reviewersPerTask: number;
  maxTasks: number;
  maxUses: number;
  expiresInDays: number;
};

export function ReviewCampaignPanel({
  run,
  setRunResult
}: {
  run: EvalRunRecord;
  setRunResult: (result: { run: EvalRunRecord; warnings: [] }) => void;
}) {
  const [campaigns, setCampaigns] = useState<ReviewCampaignWithLinks[]>([]);
  const [draft, setDraft] = useState<CampaignDraft>(() => defaultDraft(run));
  const [isCreating, setIsCreating] = useState(false);
  const [aggregatingId, setAggregatingId] = useState<string>();
  const [statusMessage, setStatusMessage] = useState<string>();
  const [latestLink, setLatestLink] = useState<string>();
  const [copiedLink, setCopiedLink] = useState<string>();

  const importedRun = run.id.startsWith("imported-");
  const latestCampaign = useMemo(() => campaigns[0], [campaigns]);

  const refreshCampaigns = async () => {
    const response = await listReviewCampaigns(run.id);
    setCampaigns(
      [...response.campaigns].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt)
      )
    );
  };

  useEffect(() => {
    if (importedRun) {
      return;
    }

    let cancelled = false;

    async function loadCampaigns() {
      try {
        const response = await listReviewCampaigns(run.id);
        if (!cancelled) {
          setCampaigns(
            [...response.campaigns].sort((left, right) =>
              right.updatedAt.localeCompare(left.updatedAt)
            )
          );
        }
      } catch (error) {
        if (!cancelled) {
          setStatusMessage(
            error instanceof Error ? error.message : "Could not load campaigns."
          );
        }
      }
    }

    void loadCampaigns();
    return () => {
      cancelled = true;
    };
  }, [importedRun, run.id]);

  const handleCreateCampaign = async () => {
    setIsCreating(true);
    setStatusMessage(undefined);
    try {
      const response = await createReviewCampaign(run.id, {
        name: draft.name,
        reviewersPerTask: draft.reviewersPerTask,
        maxTasks: draft.maxTasks,
        expiresInDays: draft.expiresInDays,
        blindMode: true
      });
      const linkResponse = await createReviewLink(response.campaign.id, {
        maxUses: draft.maxUses,
        expiresInDays: draft.expiresInDays
      });
      setLatestLink(linkResponse.link.url);
      setStatusMessage(`Created ${response.campaign.taskCount} blind voting tasks.`);
      await refreshCampaigns();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Campaign failed.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(url);
      window.setTimeout(() => setCopiedLink(undefined), 1400);
    } catch {
      setStatusMessage("Clipboard access failed; select the link field to copy.");
    }
  };

  const handleAggregate = async (campaignId: string) => {
    setAggregatingId(campaignId);
    setStatusMessage(undefined);
    try {
      const response = await aggregateReviewCampaign(run.id, campaignId);
      setRunResult({ run: response.run, warnings: [] });
      setStatusMessage(
        `Aggregated ${response.aggregation.voteCount} votes at ${percent(
          response.aggregation.agreementRate
        )} agreement.`
      );
      await refreshCampaigns();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Aggregation failed.");
    } finally {
      setAggregatingId(undefined);
    }
  };

  if (importedRun) {
    return (
      <section className="review-campaign-panel">
        <div className="review-campaign-panel__heading">
          <Users aria-hidden="true" size={16} />
          <div>
            <strong>Team voting</strong>
            <span>Run a canvas eval before distributing blind review links.</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="review-campaign-panel">
      <div className="review-campaign-panel__heading">
        <Users aria-hidden="true" size={16} />
        <div>
          <strong>Team voting</strong>
          <span>
            Distribute blind pairwise tasks, then aggregate votes into this run.
          </span>
        </div>
      </div>

      <div className="review-campaign-panel__form">
        <label>
          Campaign
          <input
            onChange={(event) =>
              setDraft((state) => ({ ...state, name: event.target.value }))
            }
            value={draft.name}
          />
        </label>
        <label>
          Votes/task
          <input
            min="1"
            max="9"
            onChange={(event) =>
              setDraft((state) => ({
                ...state,
                reviewersPerTask: Number(event.target.value)
              }))
            }
            type="number"
            value={draft.reviewersPerTask}
          />
        </label>
        <label>
          Tasks
          <input
            min="1"
            max="200"
            onChange={(event) =>
              setDraft((state) => ({ ...state, maxTasks: Number(event.target.value) }))
            }
            type="number"
            value={draft.maxTasks}
          />
        </label>
        <label>
          Link uses
          <input
            min="1"
            max="1000"
            onChange={(event) =>
              setDraft((state) => ({ ...state, maxUses: Number(event.target.value) }))
            }
            type="number"
            value={draft.maxUses}
          />
        </label>
        <Button
          disabled={isCreating}
          onClick={handleCreateCampaign}
          variant="secondary"
        >
          <Send aria-hidden="true" size={14} />
          {isCreating ? "Creating" : "Create link"}
        </Button>
      </div>

      {latestLink ? (
        <div className="review-link-banner">
          <Link2 aria-hidden="true" size={15} />
          <input readOnly value={latestLink} />
          <Button onClick={() => handleCopy(latestLink)} type="button" variant="ghost">
            {copiedLink === latestLink ? (
              <Check aria-hidden="true" size={14} />
            ) : (
              <Clipboard aria-hidden="true" size={14} />
            )}
            {copiedLink === latestLink ? "Copied" : "Copy"}
          </Button>
        </div>
      ) : null}

      {statusMessage ? (
        <p className="review-campaign-panel__status">{statusMessage}</p>
      ) : null}

      {latestCampaign ? (
        <div className="review-campaign-list">
          {campaigns.slice(0, 3).map((campaign) => {
            const link = campaign.links[0];
            return (
              <article className="review-campaign-row" key={campaign.id}>
                <div>
                  <strong>{campaign.name}</strong>
                  <span>
                    {campaign.completedTaskCount}/{campaign.taskCount} tasks,{" "}
                    {campaign.voteCount} votes, {percent(campaign.agreementRate)}{" "}
                    agreement
                  </span>
                </div>
                <Badge tone={campaign.status === "completed" ? "success" : "info"}>
                  {campaign.status}
                </Badge>
                {link ? (
                  <Button
                    onClick={() => handleCopy(link.url)}
                    type="button"
                    variant="ghost"
                  >
                    <Clipboard aria-hidden="true" size={14} />
                    {copiedLink === link.url ? "Copied" : "Link"}
                  </Button>
                ) : null}
                <Button
                  disabled={aggregatingId === campaign.id}
                  onClick={() => handleAggregate(campaign.id)}
                  type="button"
                  variant="secondary"
                >
                  <RefreshCcw aria-hidden="true" size={14} />
                  {aggregatingId === campaign.id ? "Aggregating" : "Aggregate"}
                </Button>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function defaultDraft(run: EvalRunRecord): CampaignDraft {
  return {
    name: `${run.spec.name} blind vote`,
    reviewersPerTask: 3,
    maxTasks: 24,
    maxUses: 50,
    expiresInDays: 14
  };
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}
