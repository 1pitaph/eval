import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileCode2,
  RotateCcw,
  Square
} from "lucide-react";
import type { EvalRunRecord, EvalSpecManifest, EvalTaskRecord } from "@eval/workflow-schema";
import { Badge, Button, Panel } from "@eval/ui";
import { cancelRun, retryRun } from "../../../shared/api/evalApi";
import { useWorkflowStore } from "../state/workflowStore";

export function RunPanel() {
  const compileResult = useWorkflowStore((state) => state.compileResult);
  const runResult = useWorkflowStore((state) => state.runResult);
  const setRunResult = useWorkflowStore((state) => state.setRunResult);
  const run = runResult && "run" in runResult ? runResult.run : undefined;
  const manifest =
    compileResult?.ok === true
      ? compileResult.spec.manifest
      : run
        ? run.spec.manifest
        : undefined;
  const handleRetry = async () => {
    if (!run) {
      return;
    }
    setRunResult(await retryRun(run.id));
  };
  const handleCancel = async () => {
    if (!run) {
      return;
    }
    setRunResult(await cancelRun(run.id));
  };

  return (
    <Panel className="run-panel" title="Run Status">
      {!compileResult && !runResult ? (
        <p className="empty-state">
          Compile or run the workflow to see validation output.
        </p>
      ) : null}

      {compileResult ? (
        <div className="run-panel__section">
          <h3>
            {compileResult.ok ? (
              <CheckCircle2 aria-hidden="true" size={16} />
            ) : (
              <AlertCircle aria-hidden="true" size={16} />
            )}
            Compiler
          </h3>
          {compileResult.ok ? (
            <div className="run-panel__grid">
              <Metric label="Nodes" value={String(compileResult.spec.nodes.length)} />
              <Metric label="Warnings" value={String(compileResult.warnings.length)} />
              <Badge tone="success">valid DAG</Badge>
            </div>
          ) : (
            <ul className="run-panel__issues">
              {compileResult.issues.map((issue) => (
                <li key={`${issue.code}-${issue.message}`}>
                  <strong>{issue.code}</strong>
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {manifest ? <ManifestPreview manifest={manifest} /> : null}

      {run ? (
        <div className="run-panel__section">
          <h3>
            <Clock3 aria-hidden="true" size={16} />
            Latest Run
          </h3>
          <div className="run-panel__grid">
            <Metric label="Run ID" value={run.id.slice(0, 8)} />
            <Metric label="Status" value={run.status} />
            <Metric label="Tasks" value={String(run.summary.taskCount)} />
            <Metric
              label="Artifacts"
              value={String(run.summary.artifactCount)}
            />
            <Metric
              label="Est. cost"
              value={`$${run.summary.estimatedCostUsd.toFixed(2)}`}
            />
          </div>
          <div className="run-panel__actions">
            {run.status === "failed" ? (
              <Button onClick={handleRetry} size="sm" variant="secondary">
                <RotateCcw aria-hidden="true" size={14} />
                Retry
              </Button>
            ) : null}
            {["queued", "running", "waiting_human"].includes(run.status) ? (
              <Button onClick={handleCancel} size="sm" variant="ghost">
                <Square aria-hidden="true" size={14} />
                Cancel
              </Button>
            ) : null}
          </div>
          <TaskTimeline run={run} />
          <RunEvents run={run} />
        </div>
      ) : null}
    </Panel>
  );
}

function ManifestPreview({ manifest }: { manifest: EvalSpecManifest }) {
  const warningCount = manifest.issues.filter(
    (issue) => issue.severity !== "info"
  ).length;

  return (
    <div className="run-panel__section">
      <h3>
        <FileCode2 aria-hidden="true" size={16} />
        Eval Manifest
      </h3>
      <div className="run-panel__grid">
        <Metric label="Prompts" value={String(manifest.matrix.promptCount)} />
        <Metric label="Models" value={String(manifest.matrix.modelCount)} />
        <Metric label="Images" value={String(manifest.matrix.generationJobs)} />
        <Metric label="Metric checks" value={String(manifest.matrix.metricChecks)} />
        <Metric label="Human tasks" value={String(manifest.matrix.humanReviewTasks)} />
        <Metric
          label="Est. cost"
          value={`$${manifest.matrix.estimatedCostUsd.toFixed(2)}`}
        />
      </div>
      <div className="manifest-breakdown">
        <span>Generation ${manifest.matrix.estimatedGenerationCostUsd.toFixed(2)}</span>
        <span>Metrics ${manifest.matrix.estimatedMetricCostUsd.toFixed(2)}</span>
        <span>Review ${manifest.matrix.estimatedHumanReviewCostUsd.toFixed(2)}</span>
      </div>
      <div className="manifest-source">
        <strong>{manifest.input.datasetId}</strong>
        <span>
          {manifest.input.promptCount} prompts x {manifest.providers.length} models x{" "}
          {manifest.matrix.samplesPerPrompt} samples
        </span>
      </div>
      <div className="manifest-chips">
        <Badge tone="info">{manifest.configFormat}</Badge>
        <Badge tone={manifest.humanReview.enabled ? "success" : "neutral"}>
          {manifest.humanReview.enabled ? "human review" : "auto only"}
        </Badge>
        <Badge tone={warningCount > 0 ? "warning" : "success"}>
          {warningCount} warnings
        </Badge>
      </div>
      {manifest.issues.length > 0 ? (
        <ul className="manifest-issues">
          {manifest.issues.slice(0, 3).map((issue) => (
            <li key={`${issue.code}-${issue.nodeId ?? "global"}`}>
              <Badge tone={issueTone(issue.severity)}>{issue.severity}</Badge>
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="run-panel__metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TaskTimeline({ run }: { run: EvalRunRecord }) {
  if (run.tasks.length === 0) {
    return (
      <div className="manifest-issues">
        {run.events.slice(-3).map((event) => (
          <div key={event.id}>
            <Badge tone={eventTone(event.level)}>{event.level}</Badge>
            <span>{event.message}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <ol className="run-timeline">
      {run.tasks
        .slice()
        .sort((left, right) => taskOrder(left) - taskOrder(right))
        .map((task) => (
          <li key={task.id} className="run-timeline__item">
            <div>
              <strong>{taskLabel(task)}</strong>
              <span>
                attempt {task.attempt}/{task.maxAttempts}
              </span>
            </div>
            <Badge tone={taskTone(task.status)}>{task.status}</Badge>
            {task.error ? <p>{task.error.message}</p> : null}
          </li>
        ))}
    </ol>
  );
}

function RunEvents({ run }: { run: EvalRunRecord }) {
  return (
    <div className="manifest-issues">
      {run.events.slice(-4).map((event) => (
        <div key={event.id}>
          <Badge tone={eventTone(event.level)}>{event.level}</Badge>
          <span>{event.message}</span>
        </div>
      ))}
    </div>
  );
}

function taskLabel(task: EvalTaskRecord) {
  switch (task.kind) {
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

function taskOrder(task: EvalTaskRecord) {
  switch (task.kind) {
    case "generation":
      return 1;
    case "metric":
      return 2;
    case "human_review":
      return 3;
    case "aggregation":
      return 4;
    case "release_gate":
      return 5;
  }
}

function taskTone(status: EvalTaskRecord["status"]) {
  switch (status) {
    case "succeeded":
      return "success";
    case "running":
    case "queued":
      return "info";
    case "failed":
      return "danger";
    case "canceled":
      return "neutral";
  }
}

function eventTone(level: EvalRunRecord["events"][number]["level"]) {
  switch (level) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "error":
      return "danger";
    case "info":
      return "info";
  }
}

function issueTone(severity: EvalSpecManifest["issues"][number]["severity"]) {
  switch (severity) {
    case "error":
      return "danger";
    case "warning":
      return "warning";
    case "info":
      return "info";
  }
}
