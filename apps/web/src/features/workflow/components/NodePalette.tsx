import { Crosshair, Hand, MousePointer2, ZoomIn, ZoomOut } from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import { Button } from "@eval/ui";
import { getCanvasToolDefinition } from "../config/canvasTools";
import { useWorkflowStore } from "../state/workflowStore";

export function NodePalette() {
  const canvasTool = useWorkflowStore((state) => state.canvasTool);
  const setCanvasTool = useWorkflowStore((state) => state.setCanvasTool);
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const selectTool = getCanvasToolDefinition("select");
  const panTool = getCanvasToolDefinition("pan");

  return (
    <div className="node-palette" aria-label="Canvas tools">
      <Button
        aria-label={selectTool.label}
        className={`node-palette__tool ${
          canvasTool === "select" ? "node-palette__tool--active" : ""
        }`}
        onClick={() => setCanvasTool("select")}
        size="icon"
        title={selectTool.title}
        type="button"
        variant={canvasTool === "select" ? "primary" : "ghost"}
      >
        <MousePointer2 aria-hidden="true" size={18} strokeWidth={2} />
      </Button>

      <Button
        aria-label={panTool.label}
        className={`node-palette__tool ${
          canvasTool === "pan" ? "node-palette__tool--active" : ""
        }`}
        onClick={() => setCanvasTool("pan")}
        size="icon"
        title={panTool.title}
        type="button"
        variant={canvasTool === "pan" ? "primary" : "ghost"}
      >
        <Hand aria-hidden="true" size={18} strokeWidth={2} />
      </Button>

      <div className="node-palette__divider" />

      <div className="node-palette__primary-tools" aria-label="Viewport controls">
        <Button
          aria-label="Zoom in"
          className="node-palette__tool"
          onClick={() => void zoomIn({ duration: 180 })}
          size="icon"
          title="Zoom in"
          type="button"
          variant="ghost"
        >
          <ZoomIn aria-hidden="true" size={18} strokeWidth={2} />
        </Button>

        <Button
          aria-label="Zoom out"
          className="node-palette__tool"
          onClick={() => void zoomOut({ duration: 180 })}
          size="icon"
          title="Zoom out"
          type="button"
          variant="ghost"
        >
          <ZoomOut aria-hidden="true" size={18} strokeWidth={2} />
        </Button>

        <Button
          aria-label="Fit view"
          className="node-palette__tool"
          onClick={() => void fitView({ duration: 240, padding: 0.2 })}
          size="icon"
          title="Fit view"
          type="button"
          variant="ghost"
        >
          <Crosshair aria-hidden="true" size={18} strokeWidth={2} />
        </Button>
      </div>
    </div>
  );
}
