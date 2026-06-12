import { ReactFlowProvider } from "@xyflow/react";
import { useState } from "react";
import {
  BarChart3,
  Braces,
  CircleDollarSign,
  Expand,
  GitBranch,
  KeyRound,
  Play,
  Settings2,
  Sparkles,
  X
} from "lucide-react";
import { Badge, Button, Dialog, DialogPopup, DialogTitle } from "@eval/ui";
import { InspectorPanel } from "../features/workflow/components/InspectorPanel";
import { ResultsWorkbench } from "../features/workflow/components/ResultsWorkbench";
import { RunPanel } from "../features/workflow/components/RunPanel";
import { WorkflowCanvas } from "../features/workflow/components/WorkflowCanvas";
import { BlindPairwiseReviewer } from "../features/review/components/BlindPairwiseReviewer";
import { ProviderManagementPanel } from "../features/providers/components/ProviderManagementPanel";
import { compileWorkflow, startRun } from "../shared/api/evalApi";
import { useWorkflowStore } from "../features/workflow/state/workflowStore";

export function App() {
  const reviewToken = reviewTokenFromPath(window.location.pathname);
  if (reviewToken) {
    return <BlindPairwiseReviewer token={reviewToken} />;
  }

  return <StudioApp />;
}

function StudioApp() {
  const isCanvasOpen = useWorkflowStore((state) => state.isCanvasOpen);
  const setCanvasOpen = useWorkflowStore((state) => state.setCanvasOpen);
  const toDraft = useWorkflowStore((state) => state.toDraft);
  const setCompileResult = useWorkflowStore((state) => state.setCompileResult);
  const setRunResult = useWorkflowStore((state) => state.setRunResult);
  const [activeSidebarPanel, setActiveSidebarPanel] =
    useState<StudioSidebarPanel>("setup");
  const activePanelMeta = sidebarPanels[activeSidebarPanel];
  const isProviderPanel = activeSidebarPanel === "providers";
  const showWorkflowActions = activeSidebarPanel !== "providers";

  const handleCompile = async () => {
    const result = await compileWorkflow(toDraft());
    setCompileResult(result);
  };

  const handleRun = async () => {
    const result = await startRun(toDraft());
    setRunResult(result);
    if ("run" in result) {
      setActiveSidebarPanel("results");
    }
  };

  return (
    <ReactFlowProvider>
      <div className="app-shell coss-ui-root">
        <div className="studio-layout">
          <StudioSidebar
            activePanel={activeSidebarPanel}
            onPanelChange={setActiveSidebarPanel}
          />

          <main className="studio-main" aria-label="Eval Studio workspace">
            <header className="studio-commandbar">
              <div className="studio-commandbar__title">
                <span>Eval Studio</span>
                <h1>{activePanelMeta.label}</h1>
                <p>{activePanelMeta.subtitle}</p>
              </div>
              <div className="studio-commandbar__meta">
                <Badge tone={activeSidebarPanel === "providers" ? "neutral" : "info"}>
                  {activeSidebarPanel === "providers" ? "Local" : "Draft"}
                </Badge>
                {activeSidebarPanel === "providers" ? (
                  <span>
                    <KeyRound aria-hidden="true" size={16} />
                    Secrets redacted
                  </span>
                ) : (
                  <span>
                    <CircleDollarSign aria-hidden="true" size={16} />
                    Budget-aware
                  </span>
                )}
              </div>
              {showWorkflowActions ? (
                <div className="studio-commandbar__actions">
                  <Button onClick={handleCompile} variant="secondary">
                    <Braces aria-hidden="true" size={16} />
                    Validate
                  </Button>
                  <Button onClick={handleRun} variant="primary">
                    <Play aria-hidden="true" size={16} />
                    Run Eval
                  </Button>
                </div>
              ) : null}
            </header>

            <div
              className={`studio-dashboard ${
                isProviderPanel
                  ? "studio-dashboard--providers"
                  : "studio-dashboard--pipeline"
              }`}
            >
              {isProviderPanel ? (
                <section
                  className="workspace-panel"
                  aria-label={`${activePanelMeta.label} workspace`}
                >
                  <ProviderManagementPanel />
                </section>
              ) : (
                <>
                  <section
                    className="canvas-workbench canvas-workbench--pipeline"
                    aria-label="Workflow pipeline"
                  >
                      <Button
                        className="canvas-workbench__expand"
                        onClick={() => setCanvasOpen(true)}
                        title="Expand workflow canvas"
                        type="button"
                        variant="ghost"
                      >
                        <Expand aria-hidden="true" size={14} />
                        <span className="visually-hidden">Expand</span>
                      </Button>
                    <div className="canvas-workbench__body">
                      <WorkflowCanvas variant="pipeline" />
                    </div>
                  </section>

                  <section
                    className="workspace-panel"
                    aria-label={`${activePanelMeta.label} details`}
                  >
                    {activeSidebarPanel === "results" ? (
                      <ResultsWorkbench />
                    ) : (
                      <InspectorPanel />
                    )}
                  </section>

                  <aside className="studio-side-stack" aria-label="Run status">
                    <RunPanel />
                  </aside>
                </>
              )}
            </div>
          </main>
        </div>

        <Dialog
          open={isCanvasOpen}
          onOpenChange={(open) => setCanvasOpen(open)}
        >
          <DialogPopup
            bottomStickOnMobile={false}
            className="canvas-floating-page"
            showCloseButton={false}
          >
              <header className="canvas-floating-page__header">
                <div>
                  <GitBranch aria-hidden="true" size={18} />
                  <DialogTitle>Workflow Canvas</DialogTitle>
                </div>
                <Button
                  onClick={() => setCanvasOpen(false)}
                  type="button"
                  variant="ghost"
                >
                  <X aria-hidden="true" size={15} />
                  Close
                </Button>
              </header>
              <div className="canvas-floating-page__body">
                <WorkflowCanvas />
              </div>
          </DialogPopup>
        </Dialog>
      </div>
    </ReactFlowProvider>
  );
}

type StudioSidebarPanel = "setup" | "results" | "providers";

const sidebarPanels = {
  setup: {
    icon: Settings2,
    label: "Setup",
    subtitle: "Prompts, assets, models, and run budget"
  },
  results: {
    icon: BarChart3,
    label: "Eval Results",
    subtitle: "Artifacts, comparisons, exports, and human review"
  },
  providers: {
    icon: KeyRound,
    label: "API Providers",
    subtitle: "Provider credentials, base URLs, and model availability"
  }
} satisfies Record<
  StudioSidebarPanel,
  {
    icon: typeof Settings2;
    label: string;
    subtitle: string;
  }
>;

function StudioSidebar({
  activePanel,
  onPanelChange
}: {
  activePanel: StudioSidebarPanel;
  onPanelChange: (panel: StudioSidebarPanel) => void;
}) {
  return (
    <aside aria-label="Eval workspace sidebar" className="studio-sidebar">
      <div className="studio-sidebar__logo" aria-label="Eval Studio">
        <span>
          <Sparkles aria-hidden="true" size={18} />
        </span>
        <strong>Eval Studio</strong>
      </div>

      <nav className="studio-sidebar__nav" aria-label="Sidebar panels">
        {(Object.keys(sidebarPanels) as StudioSidebarPanel[]).map((panel) => {
          const panelMeta = sidebarPanels[panel];
          const Icon = panelMeta.icon;

          return (
            <Button
              aria-current={activePanel === panel ? "page" : undefined}
              className={`studio-sidebar__link ${
                activePanel === panel ? "is-active" : ""
              }`}
              key={panel}
              onClick={() => onPanelChange(panel)}
              size="sm"
              title={panelMeta.label}
              type="button"
              variant={activePanel === panel ? "primary" : "ghost"}
            >
              <Icon aria-hidden="true" size={19} />
              <span>{panelMeta.label}</span>
            </Button>
          );
        })}
      </nav>
    </aside>
  );
}

function reviewTokenFromPath(pathname: string) {
  const match = /^\/review\/([^/]+)$/.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}
