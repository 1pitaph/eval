import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleSlash,
  LoaderCircle,
  Minus,
  SkipForward,
  X
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { PairwiseVoteChoice, ReviewReasonTag } from "@eval/workflow-schema";
import { Badge, Button, TextArea, TextInput } from "@eval/ui";
import {
  createReviewerSession,
  getReviewerSessionTasks,
  getReviewLink,
  submitPairwiseVote,
  type ReviewerSessionPayload,
  type ReviewLinkPreview
} from "../../../shared/api/evalApi";

const reasonTagOptions: Array<{ value: ReviewReasonTag; label: string }> = [
  { value: "prompt_adherence", label: "Prompt fit" },
  { value: "aesthetic_quality", label: "Aesthetic" },
  { value: "text_rendering", label: "Text" },
  { value: "composition", label: "Composition" },
  { value: "visual_artifacts", label: "Artifacts" },
  { value: "safety", label: "Safety" },
  { value: "brand_fit", label: "Brand fit" }
];

export function BlindPairwiseReviewer({ token }: { token: string }) {
  const [preview, setPreview] = useState<ReviewLinkPreview>();
  const [payload, setPayload] = useState<ReviewerSessionPayload>();
  const [displayName, setDisplayName] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [choice, setChoice] = useState<PairwiseVoteChoice | "">("");
  const [reasonTags, setReasonTags] = useState<ReviewReasonTag[]>([]);
  const [comment, setComment] = useState("");
  const [taskStartedAt, setTaskStartedAt] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const sessionStorageKey = `eval-review-session:${token}`;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(undefined);
      try {
        const linkPreview = await getReviewLink(token);
        if (cancelled) {
          return;
        }
        setPreview(linkPreview);

        const savedSessionId = window.localStorage.getItem(sessionStorageKey);
        if (savedSessionId) {
          const restored = await getReviewerSessionTasks(savedSessionId);
          if (!cancelled) {
            setPayload(restored);
            setActiveIndex(firstOpenTaskIndex(restored, 0));
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : "Review link failed."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionStorageKey, token]);

  const currentTask = payload?.tasks[activeIndex];
  const completed =
    payload && payload.progress.taskCount > 0
      ? payload.progress.submittedCount >= payload.progress.taskCount
      : false;
  const progress = payload
    ? `${payload.progress.submittedCount}/${payload.progress.taskCount}`
    : preview
      ? `0/${preview.taskCount}`
      : "0/0";

  const prompt = currentTask?.task.prompt ?? preview?.run.name ?? "Image review";
  const selectedLabel = useMemo(() => {
    switch (choice) {
      case "left":
        return "Image A";
      case "right":
        return "Image B";
      case "tie":
        return "Tie";
      case "both_bad":
        return "Both bad";
      case "skip":
        return "Skip";
      default:
        return "No vote";
    }
  }, [choice]);

  const activateTask = (index: number) => {
    setActiveIndex(index);
    setTaskStartedAt(Date.now());
    setChoice("");
    setReasonTags([]);
    setComment("");
  };

  const startSession = async () => {
    setSubmitting(true);
    setError(undefined);
    try {
      const next = await createReviewerSession(token, displayName.trim() || "Reviewer");
      window.localStorage.setItem(sessionStorageKey, next.session.id);
      setPayload(next);
      activateTask(firstOpenTaskIndex(next, 0));
    } catch (sessionError) {
      setError(
        sessionError instanceof Error ? sessionError.message : "Could not start review."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const submitVote = async () => {
    if (!payload || !currentTask || !choice) {
      return;
    }

    setSubmitting(true);
    setError(undefined);
    try {
      const next = await submitPairwiseVote(payload.session.id, {
        taskId: currentTask.task.id,
        preferred: choice,
        reasonTags,
        comment,
        timeSpentMs: Date.now() - taskStartedAt
      });
      setPayload(next);
      activateTask(firstOpenTaskIndex(next, activeIndex + 1));
    } catch (voteError) {
      setError(voteError instanceof Error ? voteError.message : "Vote failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleReasonTag = (tag: ReviewReasonTag) => {
    setReasonTags((state) =>
      state.includes(tag)
        ? state.filter((candidate) => candidate !== tag)
        : [...state, tag]
    );
  };

  if (loading) {
    return (
      <main className="blind-review-shell">
        <div className="blind-review-loading">
          <LoaderCircle aria-hidden="true" size={22} />
          <span>Loading review link</span>
        </div>
      </main>
    );
  }

  if (error && !preview && !payload) {
    return (
      <main className="blind-review-shell">
        <section className="blind-review-start">
          <CircleSlash aria-hidden="true" size={28} />
          <h1>Review link unavailable</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  if (!payload) {
    return (
      <main className="blind-review-shell">
        <section className="blind-review-start">
          <Badge tone="info">Blind image eval</Badge>
          <h1>{preview?.campaign.name ?? "Image review"}</h1>
          <p>
            {preview?.taskCount ?? 0} pairwise voting tasks from {preview?.run.name}.
          </p>
          <label>
            Display name
            <TextInput
              autoFocus
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Reviewer"
              value={displayName}
            />
          </label>
          {error ? <p className="blind-review-error">{error}</p> : null}
          <Button disabled={submitting} onClick={startSession} variant="primary">
            <Check aria-hidden="true" size={16} />
            {submitting ? "Starting" : "Start review"}
          </Button>
        </section>
      </main>
    );
  }

  if (completed || !currentTask) {
    return (
      <main className="blind-review-shell">
        <section className="blind-review-start">
          <Badge tone="success">Completed</Badge>
          <h1>Review submitted</h1>
          <p>{payload.progress.submittedCount} votes are saved for aggregation.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="blind-review-shell">
      <header className="blind-review-topbar">
        <div>
          <strong>{payload.campaign.name}</strong>
          <span>{payload.run.name}</span>
        </div>
        <Badge tone="info">{progress}</Badge>
      </header>

      <section className="blind-review-task">
        <div className="blind-review-prompt">
          <span>Prompt</span>
          <h1>{prompt}</h1>
        </div>

        <div className="blind-review-grid">
          <BlindImageChoice
            imageLabel="Image A"
            isSelected={choice === "left"}
            onSelect={() => setChoice("left")}
            src={currentTask.leftArtifact.uri}
          />
          <BlindImageChoice
            imageLabel="Image B"
            isSelected={choice === "right"}
            onSelect={() => setChoice("right")}
            src={currentTask.rightArtifact.uri}
          />
        </div>

        <div className="blind-vote-panel">
          <div className="blind-vote-options" role="group" aria-label="Vote options">
            <VoteButton
              active={choice === "left"}
              icon={<ArrowLeft aria-hidden="true" size={15} />}
              label="Image A"
              onClick={() => setChoice("left")}
            />
            <VoteButton
              active={choice === "right"}
              icon={<ArrowRight aria-hidden="true" size={15} />}
              label="Image B"
              onClick={() => setChoice("right")}
            />
            <VoteButton
              active={choice === "tie"}
              icon={<Minus aria-hidden="true" size={15} />}
              label="Tie"
              onClick={() => setChoice("tie")}
            />
            <VoteButton
              active={choice === "both_bad"}
              icon={<X aria-hidden="true" size={15} />}
              label="Both bad"
              onClick={() => setChoice("both_bad")}
            />
            <VoteButton
              active={choice === "skip"}
              icon={<SkipForward aria-hidden="true" size={15} />}
              label="Skip"
              onClick={() => setChoice("skip")}
            />
          </div>

          <div className="blind-reason-tags">
            {reasonTagOptions.map((tag) => (
              <Button
                className={reasonTags.includes(tag.value) ? "is-selected" : ""}
                key={tag.value}
                onClick={() => toggleReasonTag(tag.value)}
                size="sm"
                type="button"
                variant={reasonTags.includes(tag.value) ? "primary" : "ghost"}
              >
                {tag.label}
              </Button>
            ))}
          </div>

          <TextArea
            onChange={(event) => setComment(event.target.value)}
            placeholder="Optional note"
            value={comment}
          />

          {error ? <p className="blind-review-error">{error}</p> : null}

          <div className="blind-submit-row">
            <span>{selectedLabel}</span>
            <Button
              disabled={!choice || submitting}
              onClick={submitVote}
              variant="primary"
            >
              <Check aria-hidden="true" size={16} />
              {submitting ? "Saving" : "Submit vote"}
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}

function BlindImageChoice({
  imageLabel,
  isSelected,
  onSelect,
  src
}: {
  imageLabel: string;
  isSelected: boolean;
  onSelect: () => void;
  src: string;
}) {
  return (
    <button
      className={`blind-image-choice ${isSelected ? "is-selected" : ""}`}
      onClick={onSelect}
      type="button"
    >
      <span>{imageLabel}</span>
      <img alt={`${imageLabel} candidate`} src={src} />
    </button>
  );
}

function VoteButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      className={active ? "is-selected" : ""}
      onClick={onClick}
      size="sm"
      type="button"
      variant={active ? "primary" : "ghost"}
    >
      {icon}
      {label}
    </Button>
  );
}

function firstOpenTaskIndex(payload: ReviewerSessionPayload, fromIndex: number) {
  const afterCurrent = payload.tasks.findIndex(
    (task, index) => index >= fromIndex && !task.submittedVote
  );
  if (afterCurrent >= 0) {
    return afterCurrent;
  }

  const firstOpen = payload.tasks.findIndex((task) => !task.submittedVote);
  return firstOpen >= 0 ? firstOpen : payload.tasks.length;
}
