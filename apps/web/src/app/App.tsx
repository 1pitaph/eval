import { ReactFlowProvider } from "@xyflow/react";
import { Braces, CircleDollarSign, GitBranch, Play } from "lucide-react";
import { Badge, Button } from "@eval/ui";
import { InspectorPanel } from "../features/workflow/components/InspectorPanel";
import { NodePalette } from "../features/workflow/components/NodePalette";
import { RunPanel } from "../features/workflow/components/RunPanel";
import { WorkflowCanvas } from "../features/workflow/components/WorkflowCanvas";
import { compileWorkflow, startRun } from "../shared/api/evalApi";
import { useWorkflowStore } from "../features/workflow/state/workflowStore";

export function App() {
  const toDraft = useWorkflowStore((state) => state.toDraft);
  const setCompileResult = useWorkflowStore((state) => state.setCompileResult);
  const setRunResult = useWorkflowStore((state) => state.setRunResult);

  const handleCompile = async () => {
    const result = await compileWorkflow(toDraft());
    setCompileResult(result);
  };

  const handleRun = async () => {
    const result = await startRun(toDraft());
    setRunResult(result);
  };

  return (
    <ReactFlowProvider>
      <div className="app-shell">
        <header className="topbar">
          <div className="topbar__brand">
            <GitBranch aria-hidden="true" size={22} />
            <div>
              <h1>Eval Studio</h1>
              <p>Visual DAGs for image generation evals</p>
            </div>
          </div>
          <div className="topbar__meta">
            <Badge tone="info">Draft</Badge>
            <span className="topbar__metric">
              <CircleDollarSign aria-hidden="true" size={16} />
              Budget-aware
            </span>
          </div>
          <div className="topbar__actions">
            <Button onClick={handleCompile} variant="secondary">
              <Braces aria-hidden="true" size={16} />
              Compile
            </Button>
            <Button onClick={handleRun} variant="primary">
              <Play aria-hidden="true" size={16} />
              Run
            </Button>
          </div>
        </header>

        <main className="studio-grid">
          <section className="canvas-stage" aria-label="Workflow builder">
            <NodePalette />
            <WorkflowCanvas />
          </section>
          <InspectorPanel />
          <RunPanel />
        </main>
      </div>
    </ReactFlowProvider>
  );
}
