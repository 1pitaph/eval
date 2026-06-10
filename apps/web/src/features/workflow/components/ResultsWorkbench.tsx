import {
  BarChart3,
  Download,
  Eye,
  FileInput,
  GalleryVerticalEnd,
  GitCompareArrows,
  ThumbsDown,
  ThumbsUp,
  Users
} from "lucide-react";
import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  type EvalRunRecord,
  type EvalRunSpec,
  type HumanReview,
  type ImageArtifact,
  type ImageProvider,
  type ImageScore,
  type PairwiseComparison,
  type ReviewVerdict
} from "@eval/workflow-schema";
import { Badge, Button, Panel } from "@eval/ui";
import { exportRunUrl } from "../../../shared/api/evalApi";
import { useWorkflowStore } from "../state/workflowStore";

type WorkbenchTab = "gallery" | "compare" | "pareto" | "human";
type ReviewDraft = Pick<HumanReview, "comment" | "score" | "verdict">;

const qualityMetrics = [
  "vlm_rubric",
  "clip_siglip",
  "ocr",
  "blur",
  "aesthetic"
] as const;

const tabLabels: Record<WorkbenchTab, string> = {
  gallery: "Gallery",
  compare: "Compare",
  pareto: "Pareto",
  human: "Human Review"
};

export function ResultsWorkbench() {
  const runResult = useWorkflowStore((state) => state.runResult);
  const setRunResult = useWorkflowStore((state) => state.setRunResult);
  const run = runResult && "run" in runResult ? runResult.run : undefined;
  const [activeTab, setActiveTab] = useState<WorkbenchTab>("gallery");
  const [selectedModel, setSelectedModel] = useState("all");
  const [onlyApproved, setOnlyApproved] = useState(false);
  const [lightboxArtifactId, setLightboxArtifactId] = useState<string>();
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, ReviewDraft>>({});
  const [pairwiseVotes, setPairwiseVotes] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const artifacts = useMemo(() => {
    if (!run) {
      return [];
    }

    return run.artifacts.filter((artifact) => {
      const review = getReview(run, artifact.id, reviewDrafts);
      return (
        (selectedModel === "all" || artifact.model === selectedModel) &&
        (!onlyApproved || review.verdict === "pass")
      );
    });
  }, [onlyApproved, reviewDrafts, run, selectedModel]);

  const models = useMemo(
    () =>
      run ? Array.from(new Set(run.artifacts.map((artifact) => artifact.model))) : [],
    [run]
  );
  const lightboxArtifact = run?.artifacts.find(
    (artifact) => artifact.id === lightboxArtifactId
  );

  const handleImport = async (file: File) => {
    const text = await file.text();
    const importedRun =
      file.name.toLowerCase().endsWith(".csv") || text.trimStart().startsWith("run_id,")
        ? importPromptfooCsv(text)
        : importPromptfooJson(text);
    setRunResult({ run: importedRun, warnings: [] });
    setActiveTab("gallery");
    setSelectedModel("all");
    setOnlyApproved(false);
  };

  return (
    <Panel
      actions={
        <div className="results-workbench__actions">
          <input
            accept=".json,.csv,application/json,text/csv"
            className="visually-hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleImport(file);
                event.currentTarget.value = "";
              }
            }}
            ref={fileInputRef}
            type="file"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            type="button"
            variant="secondary"
          >
            <FileInput aria-hidden="true" size={14} />
            Import
          </Button>
          {run ? (
            <>
              <a
                className="ui-button ui-button--ghost"
                href={exportRunUrl(run.id, "csv")}
              >
                <Download aria-hidden="true" size={14} />
                CSV
              </a>
              <a
                className="ui-button ui-button--ghost"
                href={exportRunUrl(run.id, "json")}
              >
                <Download aria-hidden="true" size={14} />
                JSON
              </a>
            </>
          ) : null}
        </div>
      }
      className="results-workbench"
      title="Image Eval Results"
    >
      {!run ? (
        <div className="results-empty">
          <GalleryVerticalEnd aria-hidden="true" size={34} />
          <div>
            <h3>No image run yet</h3>
            <p>Run the canvas workflow or import Promptfoo JSON/CSV results.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="results-kpis">
            <Kpi label="Artifacts" value={String(run.summary.artifactCount)} />
            <Kpi label="Approved" value={String(run.summary.approvedArtifactCount)} />
            <Kpi label="Avg quality" value={percent(run.summary.averageQuality)} />
            <Kpi label="Safety pass" value={percent(run.summary.safetyPassRate)} />
            <Kpi
              label="P95 latency"
              value={`${(run.summary.p95LatencyMs / 1000).toFixed(1)}s`}
            />
            <Kpi label="Cost" value={`$${run.summary.estimatedCostUsd.toFixed(2)}`} />
            <div className="decision-chip">
              <Badge tone={decisionTone(run.decision.status)}>
                {run.decision.status}
              </Badge>
              <span>{run.decision.message}</span>
            </div>
          </div>

          <div className="results-toolbar">
            <div className="segmented-control" role="tablist">
              {(["gallery", "compare", "pareto", "human"] as WorkbenchTab[]).map(
                (tab) => (
                  <button
                    aria-selected={activeTab === tab}
                    className={activeTab === tab ? "is-active" : ""}
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    role="tab"
                    type="button"
                  >
                    {tabIcon(tab)}
                    {tabLabels[tab]}
                  </button>
                )
              )}
            </div>
            <div className="results-filters">
              <label>
                Model
                <select
                  value={selectedModel}
                  onChange={(event) => setSelectedModel(event.target.value)}
                >
                  <option value="all">All models</option>
                  {models.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkbox-control">
                <input
                  checked={onlyApproved}
                  onChange={(event) => setOnlyApproved(event.target.checked)}
                  type="checkbox"
                />
                Approved only
              </label>
            </div>
          </div>

          {activeTab === "gallery" ? (
            <GalleryTab
              artifacts={artifacts}
              reviewDrafts={reviewDrafts}
              run={run}
              setLightboxArtifactId={setLightboxArtifactId}
              setReviewDrafts={setReviewDrafts}
            />
          ) : null}

          {activeTab === "compare" ? (
            <CompareTab
              pairwiseVotes={pairwiseVotes}
              run={run}
              setLightboxArtifactId={setLightboxArtifactId}
              setPairwiseVotes={setPairwiseVotes}
            />
          ) : null}

          {activeTab === "pareto" ? <ParetoTab run={run} /> : null}

          {activeTab === "human" ? (
            <HumanReviewTab
              reviewDrafts={reviewDrafts}
              run={run}
              setLightboxArtifactId={setLightboxArtifactId}
              setReviewDrafts={setReviewDrafts}
            />
          ) : null}

          {lightboxArtifact ? (
            <ArtifactLightbox
              artifact={lightboxArtifact}
              onClose={() => setLightboxArtifactId(undefined)}
              reviewDrafts={reviewDrafts}
              run={run}
              setReviewDrafts={setReviewDrafts}
            />
          ) : null}
        </>
      )}
    </Panel>
  );
}

function GalleryTab({
  artifacts,
  reviewDrafts,
  run,
  setLightboxArtifactId,
  setReviewDrafts
}: {
  artifacts: ImageArtifact[];
  reviewDrafts: Record<string, ReviewDraft>;
  run: EvalRunRecord;
  setLightboxArtifactId: (artifactId: string) => void;
  setReviewDrafts: Dispatch<SetStateAction<Record<string, ReviewDraft>>>;
}) {
  return (
    <div className="artifact-grid">
      {artifacts.map((artifact) => (
        <article className="artifact-card" key={artifact.id}>
          <button
            className="artifact-card__image-button"
            onClick={() => setLightboxArtifactId(artifact.id)}
            type="button"
          >
            <img
              alt={`${artifact.model} result for ${artifact.promptId}`}
              src={artifact.thumbnailUri}
            />
          </button>
          <div className="artifact-card__body">
            <div className="artifact-card__title">
              <strong>{artifact.model}</strong>
              <Badge tone={providerTone(artifact.provider)}>{artifact.provider}</Badge>
            </div>
            <p>{artifact.prompt}</p>
            <div className="score-strip">
              <ScorePill label="Q" value={qualityForArtifact(run, artifact.id)} />
              <ScorePill label="Safe" value={scoreValue(run, artifact.id, "nsfw")} />
              <span>${artifact.costUsd.toFixed(3)}</span>
              <span>{(artifact.latencyMs / 1000).toFixed(1)}s</span>
            </div>
            <ReviewControl
              artifactId={artifact.id}
              review={getReview(run, artifact.id, reviewDrafts)}
              setReviewDrafts={setReviewDrafts}
            />
          </div>
        </article>
      ))}
    </div>
  );
}

function CompareTab({
  pairwiseVotes,
  run,
  setLightboxArtifactId,
  setPairwiseVotes
}: {
  pairwiseVotes: Record<string, string>;
  run: EvalRunRecord;
  setLightboxArtifactId: (artifactId: string) => void;
  setPairwiseVotes: Dispatch<SetStateAction<Record<string, string>>>;
}) {
  const [selectedPairwiseId, setSelectedPairwiseId] = useState(
    run.pairwise[0]?.id ?? ""
  );
  const comparison =
    run.pairwise.find((candidate) => candidate.id === selectedPairwiseId) ??
    run.pairwise[0];

  if (!comparison) {
    return <p className="empty-state">No pairwise tasks were generated.</p>;
  }

  const left = run.artifacts.find(
    (artifact) => artifact.id === comparison.leftArtifactId
  );
  const right = run.artifacts.find(
    (artifact) => artifact.id === comparison.rightArtifactId
  );

  if (!left || !right) {
    return <p className="empty-state">The selected pairwise task is incomplete.</p>;
  }

  const vote = pairwiseVotes[comparison.id] ?? comparison.preferredArtifactId ?? "";

  return (
    <div className="compare-tab">
      <label className="compare-tab__selector">
        Prompt task
        <select
          value={comparison.id}
          onChange={(event) => setSelectedPairwiseId(event.target.value)}
        >
          {run.pairwise.map((task) => (
            <option key={task.id} value={task.id}>
              {task.promptId}
            </option>
          ))}
        </select>
      </label>
      <div className="compare-grid">
        <CompareArtifact
          artifact={left}
          isPreferred={vote === left.id}
          run={run}
          setLightboxArtifactId={setLightboxArtifactId}
        />
        <CompareArtifact
          artifact={right}
          isPreferred={vote === right.id}
          run={run}
          setLightboxArtifactId={setLightboxArtifactId}
        />
      </div>
      <div className="pairwise-vote-bar">
        <Button
          onClick={() =>
            setPairwiseVotes((state) => ({ ...state, [comparison.id]: left.id }))
          }
          variant={vote === left.id ? "primary" : "secondary"}
        >
          <ThumbsUp aria-hidden="true" size={14} />
          Prefer left
        </Button>
        <Button
          onClick={() =>
            setPairwiseVotes((state) => ({ ...state, [comparison.id]: right.id }))
          }
          variant={vote === right.id ? "primary" : "secondary"}
        >
          <ThumbsUp aria-hidden="true" size={14} />
          Prefer right
        </Button>
        <Button
          onClick={() =>
            setPairwiseVotes((state) => ({ ...state, [comparison.id]: "tie" }))
          }
          variant={vote === "tie" ? "primary" : "ghost"}
        >
          Tie / needs arbitration
        </Button>
      </div>
    </div>
  );
}

function CompareArtifact({
  artifact,
  isPreferred,
  run,
  setLightboxArtifactId
}: {
  artifact: ImageArtifact;
  isPreferred: boolean;
  run: EvalRunRecord;
  setLightboxArtifactId: (artifactId: string) => void;
}) {
  return (
    <article className={`compare-artifact ${isPreferred ? "is-preferred" : ""}`}>
      <button onClick={() => setLightboxArtifactId(artifact.id)} type="button">
        <img alt={`${artifact.model} comparison result`} src={artifact.uri} />
      </button>
      <div>
        <strong>{artifact.model}</strong>
        <span>{artifact.provider}</span>
      </div>
      <div className="score-strip">
        <ScorePill label="Q" value={qualityForArtifact(run, artifact.id)} />
        <ScorePill label="OCR" value={scoreValue(run, artifact.id, "ocr")} />
        <span>${artifact.costUsd.toFixed(3)}</span>
      </div>
    </article>
  );
}

function ParetoTab({ run }: { run: EvalRunRecord }) {
  const maxCost = Math.max(...run.pareto.map((point) => point.costUsd), 0.01);
  const maxLatency = Math.max(...run.pareto.map((point) => point.latencyMs), 1);

  return (
    <div className="pareto-tab">
      <div className="pareto-chart" aria-label="Quality cost latency Pareto chart">
        {run.pareto.map((point) => (
          <div
            className={`pareto-point ${point.isParetoOptimal ? "is-optimal" : ""}`}
            key={point.model}
            style={{
              left: `${(point.costUsd / maxCost) * 86 + 6}%`,
              bottom: `${point.qualityScore * 82 + 8}%`,
              width: `${Math.max(18, (point.latencyMs / maxLatency) * 34)}px`,
              height: `${Math.max(18, (point.latencyMs / maxLatency) * 34)}px`
            }}
            title={`${point.model}: ${percent(point.qualityScore)} quality, $${point.costUsd.toFixed(3)}, ${(point.latencyMs / 1000).toFixed(1)}s`}
          >
            <span>{point.model}</span>
          </div>
        ))}
        <span className="pareto-axis pareto-axis--x">Cost per image</span>
        <span className="pareto-axis pareto-axis--y">Quality</span>
      </div>
      <div className="model-summary-table">
        {run.modelSummaries.map((summary) => (
          <div className="model-summary-row" key={summary.model}>
            <strong>{summary.model}</strong>
            <span>{percent(summary.averageQuality)}</span>
            <span>${summary.usableArtifactCostUsd.toFixed(3)} / approved</span>
            <span>{(summary.averageLatencyMs / 1000).toFixed(1)}s avg</span>
            <Badge tone={summary.safetyPassRate >= 0.94 ? "success" : "warning"}>
              {percent(summary.safetyPassRate)} safe
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function HumanReviewTab({
  reviewDrafts,
  run,
  setLightboxArtifactId,
  setReviewDrafts
}: {
  reviewDrafts: Record<string, ReviewDraft>;
  run: EvalRunRecord;
  setLightboxArtifactId: (artifactId: string) => void;
  setReviewDrafts: Dispatch<SetStateAction<Record<string, ReviewDraft>>>;
}) {
  return (
    <div className="human-review-table">
      {run.artifacts.map((artifact) => {
        const review = getReview(run, artifact.id, reviewDrafts);
        return (
          <div className="human-review-row" key={artifact.id}>
            <button onClick={() => setLightboxArtifactId(artifact.id)} type="button">
              <img
                alt={`${artifact.model} review thumbnail`}
                src={artifact.thumbnailUri}
              />
            </button>
            <div>
              <strong>{artifact.model}</strong>
              <span>{artifact.promptId}</span>
            </div>
            <Badge tone={reviewTone(review.verdict)}>{review.verdict}</Badge>
            <span>{percent(review.score)}</span>
            <p>{review.comment}</p>
            <ReviewControl
              artifactId={artifact.id}
              compact
              review={review}
              setReviewDrafts={setReviewDrafts}
            />
          </div>
        );
      })}
    </div>
  );
}

function ArtifactLightbox({
  artifact,
  onClose,
  reviewDrafts,
  run,
  setReviewDrafts
}: {
  artifact: ImageArtifact;
  onClose: () => void;
  reviewDrafts: Record<string, ReviewDraft>;
  run: EvalRunRecord;
  setReviewDrafts: Dispatch<SetStateAction<Record<string, ReviewDraft>>>;
}) {
  const scores = run.scores.filter((score) => score.artifactId === artifact.id);
  return (
    <div className="lightbox-backdrop" role="presentation" onClick={onClose}>
      <dialog
        className="artifact-lightbox"
        onClick={(event) => event.stopPropagation()}
        open
      >
        <button className="lightbox-close" onClick={onClose} type="button">
          Close
        </button>
        <img alt={`${artifact.model} full result`} src={artifact.uri} />
        <div className="artifact-lightbox__details">
          <div>
            <h3>{artifact.model}</h3>
            <p>{artifact.prompt}</p>
            <dl>
              <div>
                <dt>Storage</dt>
                <dd>{artifact.storageUri}</dd>
              </div>
              <div>
                <dt>Seed</dt>
                <dd>{artifact.seed}</dd>
              </div>
              <div>
                <dt>Hash</dt>
                <dd>{artifact.perceptualHash}</dd>
              </div>
            </dl>
          </div>
          <div className="metric-list">
            {scores.map((score) => (
              <div key={score.id}>
                <strong>{score.metric}</strong>
                <span>{percent(score.score)}</span>
                <Badge tone={score.pass ? "success" : "warning"}>
                  {score.pass ? "pass" : "review"}
                </Badge>
                <p>{score.reason}</p>
              </div>
            ))}
          </div>
          <ReviewControl
            artifactId={artifact.id}
            review={getReview(run, artifact.id, reviewDrafts)}
            setReviewDrafts={setReviewDrafts}
          />
        </div>
      </dialog>
    </div>
  );
}

function ReviewControl({
  artifactId,
  compact = false,
  review,
  setReviewDrafts
}: {
  artifactId: string;
  compact?: boolean;
  review: ReviewDraft;
  setReviewDrafts: Dispatch<SetStateAction<Record<string, ReviewDraft>>>;
}) {
  const update = (patch: Partial<ReviewDraft>) => {
    setReviewDrafts((state) => ({
      ...state,
      [artifactId]: {
        ...review,
        ...patch
      }
    }));
  };

  return (
    <div className={`review-control ${compact ? "review-control--compact" : ""}`}>
      <div className="review-control__buttons">
        <button
          className={review.verdict === "pass" ? "is-selected" : ""}
          onClick={() =>
            update({ verdict: "pass", score: Math.max(review.score, 0.82) })
          }
          type="button"
        >
          <ThumbsUp aria-hidden="true" size={13} />
          Pass
        </button>
        <button
          className={review.verdict === "needs_review" ? "is-selected" : ""}
          onClick={() => update({ verdict: "needs_review", score: 0.68 })}
          type="button"
        >
          <Eye aria-hidden="true" size={13} />
          Review
        </button>
        <button
          className={review.verdict === "fail" ? "is-selected" : ""}
          onClick={() =>
            update({ verdict: "fail", score: Math.min(review.score, 0.45) })
          }
          type="button"
        >
          <ThumbsDown aria-hidden="true" size={13} />
          Fail
        </button>
      </div>
      {!compact ? (
        <>
          <label>
            Score {percent(review.score)}
            <input
              max="1"
              min="0"
              onChange={(event) => update({ score: Number(event.target.value) })}
              step="0.01"
              type="range"
              value={review.score}
            />
          </label>
          <textarea
            onChange={(event) => update({ comment: event.target.value })}
            placeholder="Review comment"
            value={review.comment}
          />
        </>
      ) : null}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="results-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ScorePill({ label, value }: { label: string; value: number }) {
  return (
    <span className={value >= 0.74 ? "score-pill score-pill--good" : "score-pill"}>
      {label} {percent(value)}
    </span>
  );
}

function tabIcon(tab: WorkbenchTab) {
  switch (tab) {
    case "gallery":
      return <GalleryVerticalEnd aria-hidden="true" size={14} />;
    case "compare":
      return <GitCompareArrows aria-hidden="true" size={14} />;
    case "pareto":
      return <BarChart3 aria-hidden="true" size={14} />;
    case "human":
      return <Users aria-hidden="true" size={14} />;
  }
}

function getReview(
  run: EvalRunRecord,
  artifactId: string,
  reviewDrafts: Record<string, ReviewDraft>
): ReviewDraft {
  const existing = run.reviews.find((review) => review.artifactId === artifactId);
  return (
    reviewDrafts[artifactId] ?? {
      verdict: existing?.verdict ?? "needs_review",
      score: existing?.score ?? 0.5,
      comment: existing?.comment ?? ""
    }
  );
}

function qualityForArtifact(run: EvalRunRecord, artifactId: string) {
  const values = run.scores
    .filter(
      (score) =>
        score.artifactId === artifactId &&
        qualityMetrics.includes(score.metric as (typeof qualityMetrics)[number])
    )
    .map((score) => score.score);
  return values.length > 0
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

function scoreValue(
  run: EvalRunRecord,
  artifactId: string,
  metric: ImageScore["metric"]
) {
  return (
    run.scores.find(
      (score) => score.artifactId === artifactId && score.metric === metric
    )?.score ?? 0
  );
}

function decisionTone(status: EvalRunRecord["decision"]["status"]) {
  switch (status) {
    case "pass":
      return "success";
    case "warn":
      return "warning";
    case "fail":
      return "danger";
  }
}

function reviewTone(verdict: ReviewVerdict) {
  switch (verdict) {
    case "pass":
      return "success";
    case "needs_review":
      return "warning";
    case "fail":
      return "danger";
  }
}

function providerTone(provider: ImageProvider) {
  return provider === "openai" || provider === "google-imagen" ? "info" : "neutral";
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function importPromptfooJson(text: string): EvalRunRecord {
  const payload = JSON.parse(text) as unknown;
  if (isRunPayload(payload)) {
    return payload;
  }
  if (isRunResponsePayload(payload)) {
    return payload.run;
  }

  const rows = extractPromptfooRows(payload);
  return buildImportedRun(rows);
}

function importPromptfooCsv(text: string): EvalRunRecord {
  const [headerRow, ...rows] = parseCsv(text.trim());
  const headers = headerRow ?? [];
  const records = rows
    .filter((row) => row.length > 0)
    .map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))
    );

  return buildImportedRun(records);
}

function isRunPayload(payload: unknown): payload is EvalRunRecord {
  return (
    typeof payload === "object" &&
    payload !== null &&
    Array.isArray((payload as { artifacts?: unknown }).artifacts) &&
    Array.isArray((payload as { scores?: unknown }).scores)
  );
}

function isRunResponsePayload(payload: unknown): payload is { run: EvalRunRecord } {
  return (
    typeof payload === "object" &&
    payload !== null &&
    isRunPayload((payload as { run?: unknown }).run)
  );
}

function extractPromptfooRows(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }
  if (isRecord(payload)) {
    const nestedResults = isRecord(payload.results)
      ? payload.results.results
      : undefined;
    const candidates = [payload.results, nestedResults, payload.table, payload.outputs];
    const rows = candidates.find(Array.isArray);
    if (Array.isArray(rows)) {
      return rows.filter(isRecord);
    }
  }

  throw new Error("Could not find Promptfoo results in the selected JSON file.");
}

function buildImportedRun(rows: Array<Record<string, unknown>>): EvalRunRecord {
  const createdAt = new Date().toISOString();
  const runId = `imported-${Date.now()}`;
  const spec = importedSpec(createdAt);
  const artifacts = rows.slice(0, 200).map((row, index): ImageArtifact => {
    const provider = normalizeProvider(readString(row, ["provider", "providerId"]));
    const model = readString(row, ["model", "modelName", "provider"]) || provider;
    const prompt =
      readString(row, ["prompt", "input", "vars.prompt"]) || "Imported prompt";
    const promptId =
      readString(row, ["prompt_id", "promptId", "testCase"]) || `prompt-${index + 1}`;
    const output =
      readString(row, [
        "output",
        "response.output",
        "response.images.0",
        "image",
        "url"
      ]) || importedImageUri(provider, model, promptId);
    const cost = readNumber(row, ["cost", "costUsd", "cost_usd", "response.cost"], 0);
    const latency = readNumber(
      row,
      ["latencyMs", "latency_ms", "response.latencyMs"],
      0
    );

    return {
      id: `imported-art-${index + 1}`,
      jobId: `imported-job-${index + 1}`,
      promptId,
      prompt,
      model,
      provider,
      uri: output,
      thumbnailUri: output,
      storageUri: output.startsWith("data:")
        ? `imported://${runId}/${index + 1}`
        : output,
      width: 1024,
      height: 1024,
      seed: index,
      costUsd: cost,
      latencyMs: latency,
      perceptualHash: `imported_${index + 1}`,
      embeddingKey: `imported_${runId}_${index + 1}`,
      createdAt,
      lineage: {
        workflowNodeId: "promptfoo-import",
        source: "promptfoo-import"
      },
      params: {},
      tags: ["imported"]
    };
  });
  const scores = artifacts.flatMap((artifact, index) => {
    const row = rows[index] ?? {};
    const score = clamp(
      readNumber(row, ["score", "quality", "metrics.score"], 0.72),
      0,
      1
    );
    const pass = readBoolean(row, ["pass", "success"], score >= 0.7);
    return [
      importedScore(
        artifact.id,
        "vlm_rubric",
        score,
        pass,
        "Imported Promptfoo score."
      ),
      importedScore(
        artifact.id,
        "nsfw",
        pass ? 0.96 : 0.82,
        pass,
        "Imported safety proxy."
      ),
      importedScore(
        artifact.id,
        "cost",
        artifact.costUsd > 0 ? clamp(1 - artifact.costUsd / 0.08, 0, 1) : 1,
        artifact.costUsd <= 0.055,
        "Imported cost."
      ),
      importedScore(
        artifact.id,
        "latency",
        artifact.latencyMs > 0 ? clamp(1 - artifact.latencyMs / 9000, 0, 1) : 1,
        artifact.latencyMs <= 6500,
        "Imported latency."
      )
    ];
  });
  const reviews = artifacts.map((artifact): HumanReview => {
    const quality = qualityForScores(scores, artifact.id);
    return {
      id: `imported-review-${artifact.id}`,
      artifactId: artifact.id,
      reviewer: "Imported",
      blind: false,
      verdict: quality >= 0.7 ? "pass" : "needs_review",
      score: quality,
      comment: "Imported from Promptfoo or CSV.",
      tags: ["imported"],
      createdAt
    };
  });
  const pairwise = buildImportedPairwise(artifacts, scores);
  const modelSummaries = buildImportedModelSummaries(
    artifacts,
    scores,
    reviews,
    pairwise
  );
  const pareto = modelSummaries.map((summary) => ({
    model: summary.model,
    provider: summary.provider,
    qualityScore: summary.averageQuality,
    costUsd: summary.averageCostUsd,
    latencyMs: summary.averageLatencyMs,
    safetyPassRate: summary.safetyPassRate,
    isParetoOptimal: true
  }));
  const approvedArtifactCount = reviews.filter(
    (review) => review.verdict === "pass"
  ).length;
  const averageQuality = average(
    artifacts.map((artifact) => qualityForScores(scores, artifact.id))
  );
  const safetyPassRate = ratio(
    scores.filter((score) => score.metric === "nsfw" && score.pass).length,
    scores.filter((score) => score.metric === "nsfw").length
  );
  const bestModel =
    [...modelSummaries].sort(
      (left, right) => right.averageQuality - left.averageQuality
    )[0]?.model ?? "imported";

  return {
    id: runId,
    createdAt,
    status: "succeeded",
    spec,
    summary: {
      artifactCount: artifacts.length,
      approvedArtifactCount,
      estimatedCostUsd: sum(artifacts.map((artifact) => artifact.costUsd)),
      taskCount: rows.length,
      averageQuality,
      safetyPassRate,
      p95LatencyMs: percentile(
        artifacts.map((artifact) => artifact.latencyMs),
        0.95
      ),
      bestModel
    },
    jobs: [],
    artifacts,
    scores,
    reviews,
    pairwise,
    modelSummaries,
    pareto,
    decision: {
      status: safetyPassRate >= 0.92 && averageQuality >= 0.7 ? "pass" : "warn",
      message: `Imported ${artifacts.length} Promptfoo rows into the image eval workbench.`,
      gates: [
        {
          label: "Imported quality",
          passed: averageQuality >= 0.7,
          actual: percent(averageQuality),
          target: ">= 70%"
        },
        {
          label: "Imported safety",
          passed: safetyPassRate >= 0.92,
          actual: percent(safetyPassRate),
          target: ">= 92%"
        }
      ]
    },
    events: [
      {
        id: "imported",
        at: createdAt,
        level: "success",
        message: `Imported ${artifacts.length} rows into an image-native eval run.`
      }
    ]
  };
}

function importedSpec(compiledAt: string): EvalRunSpec {
  return {
    workflowId: "promptfoo-import",
    workflowVersion: 1,
    name: "Promptfoo import",
    compiledAt,
    topologicalOrder: [],
    nodes: [],
    edges: []
  };
}

function importedScore(
  artifactId: string,
  metric: ImageScore["metric"],
  score: number,
  pass: boolean,
  reason: string
): ImageScore {
  return {
    id: `imported-score-${artifactId}-${metric}`,
    artifactId,
    metric,
    score,
    pass,
    reason,
    evidence: {}
  };
}

function buildImportedPairwise(
  artifacts: ImageArtifact[],
  scores: ImageScore[]
): PairwiseComparison[] {
  const promptIds = Array.from(new Set(artifacts.map((artifact) => artifact.promptId)));
  return promptIds.flatMap((promptId) => {
    const candidates = artifacts.filter((artifact) => artifact.promptId === promptId);
    const [left, right] = candidates;
    if (!left || !right) {
      return [];
    }
    return [
      {
        id: `imported-pairwise-${promptId}`,
        promptId,
        leftArtifactId: left.id,
        rightArtifactId: right.id,
        preferredArtifactId:
          qualityForScores(scores, left.id) >= qualityForScores(scores, right.id)
            ? left.id
            : right.id,
        reason: "Imported pairwise task generated from top rows."
      }
    ];
  });
}

function buildImportedModelSummaries(
  artifacts: ImageArtifact[],
  scores: ImageScore[],
  reviews: HumanReview[],
  pairwise: PairwiseComparison[]
) {
  const models = Array.from(new Set(artifacts.map((artifact) => artifact.model)));
  return models.map((model) => {
    const modelArtifacts = artifacts.filter((artifact) => artifact.model === model);
    const totalCost = sum(modelArtifacts.map((artifact) => artifact.costUsd));
    const wins = pairwise.filter((task) =>
      modelArtifacts.some((artifact) => artifact.id === task.preferredArtifactId)
    ).length;
    const appearances = pairwise.filter((task) =>
      modelArtifacts.some(
        (artifact) =>
          artifact.id === task.leftArtifactId || artifact.id === task.rightArtifactId
      )
    ).length;
    const approvedCount = reviews.filter(
      (review) =>
        review.verdict === "pass" &&
        modelArtifacts.some((artifact) => artifact.id === review.artifactId)
    ).length;
    const safetyScores = scores.filter(
      (score) =>
        score.metric === "nsfw" &&
        modelArtifacts.some((artifact) => artifact.id === score.artifactId)
    );

    return {
      model,
      provider: modelArtifacts[0]?.provider ?? "imported",
      artifactCount: modelArtifacts.length,
      approvedCount,
      averageQuality: average(
        modelArtifacts.map((artifact) => qualityForScores(scores, artifact.id))
      ),
      humanWinRate:
        appearances > 0
          ? wins / appearances
          : ratio(approvedCount, modelArtifacts.length),
      safetyPassRate: ratio(
        safetyScores.filter((score) => score.pass).length,
        safetyScores.length
      ),
      averageCostUsd: ratio(totalCost, modelArtifacts.length),
      averageLatencyMs: average(modelArtifacts.map((artifact) => artifact.latencyMs)),
      usableArtifactCostUsd: ratio(totalCost, Math.max(approvedCount, 1))
    };
  });
}

function readString(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = readPath(row, key);
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
    if (typeof value === "number") {
      return String(value);
    }
  }
  return "";
}

function readNumber(row: Record<string, unknown>, keys: string[], fallback: number) {
  const value = readString(row, keys);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBoolean(row: Record<string, unknown>, keys: string[], fallback: boolean) {
  const value = readString(row, keys).toLowerCase();
  if (["true", "pass", "passed", "1", "yes"].includes(value)) {
    return true;
  }
  if (["false", "fail", "failed", "0", "no"].includes(value)) {
    return false;
  }
  return fallback;
}

function readPath(row: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => {
    if (Array.isArray(current)) {
      return current[Number(part)];
    }
    if (isRecord(current)) {
      return current[part];
    }
    return undefined;
  }, row);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeProvider(value: string): ImageProvider {
  const normalized = value.toLowerCase();
  if (normalized.includes("google") || normalized.includes("imagen")) {
    return "google-imagen";
  }
  if (normalized.includes("fal") || normalized.includes("flux")) {
    return "fal";
  }
  if (normalized.includes("replicate") || normalized.includes("sdxl")) {
    return "replicate";
  }
  if (normalized.includes("openai") || normalized.includes("gpt")) {
    return "openai";
  }
  return "imported";
}

function importedImageUri(provider: ImageProvider, model: string, promptId: string) {
  const label = `${model || provider}`.toUpperCase().slice(0, 18);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <rect width="1024" height="1024" fill="#f8fafc"/>
    <rect x="168" y="232" width="688" height="560" rx="48" fill="#ffffff" stroke="#cbd5e1"/>
    <circle cx="350" cy="420" r="116" fill="#dbeafe"/>
    <rect x="462" y="354" width="248" height="132" rx="28" fill="#0f766e"/>
    <text x="512" y="610" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="52" font-weight="800" fill="#172026">${label}</text>
    <text x="512" y="690" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="700" fill="#64748b">${promptId}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character ?? "";
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function qualityForScores(scores: ImageScore[], artifactId: string) {
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

function average(values: number[]) {
  return ratio(sum(values), values.length);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * percentileValue) - 1
  );
  return sorted[index] ?? 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
