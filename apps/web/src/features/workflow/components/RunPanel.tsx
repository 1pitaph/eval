import { AlertCircle, CheckCircle2, Clock3, FileCode2 } from "lucide-react";
import type { EvalSpecManifest } from "@eval/workflow-schema";
import { Badge, Panel } from "@eval/ui";
import { useWorkflowStore } from "../state/workflowStore";

export function RunPanel() {
  const compileResult = useWorkflowStore((state) => state.compileResult);
  const runResult = useWorkflowStore((state) => state.runResult);
  const manifest =
    compileResult?.ok === true
      ? compileResult.spec.manifest
      : runResult && "run" in runResult
        ? runResult.run.spec.manifest
        : undefined;

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

      {runResult && "run" in runResult ? (
        <div className="run-panel__section">
          <h3>
            <Clock3 aria-hidden="true" size={16} />
            Latest Run
          </h3>
          <div className="run-panel__grid">
            <Metric label="Run ID" value={runResult.run.id.slice(0, 8)} />
            <Metric label="Tasks" value={String(runResult.run.summary.taskCount)} />
            <Metric
              label="Artifacts"
              value={String(runResult.run.summary.artifactCount)}
            />
            <Metric
              label="Est. cost"
              value={`$${runResult.run.summary.estimatedCostUsd.toFixed(2)}`}
            />
          </div>
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
