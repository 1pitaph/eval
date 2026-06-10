import { AlertCircle, CheckCircle2, Clock3 } from "lucide-react";
import { Badge, Panel } from "@eval/ui";
import { useWorkflowStore } from "../state/workflowStore";

export function RunPanel() {
  const compileResult = useWorkflowStore((state) => state.compileResult);
  const runResult = useWorkflowStore((state) => state.runResult);

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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="run-panel__metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
