import { Crosshair, Hand, MousePointer2, ZoomIn, ZoomOut } from "lucide-react";
import { useReactFlow } from "@xyflow/react";
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
      <button
        aria-label={selectTool.label}
        className={`node-palette__tool ${
          canvasTool === "select" ? "node-palette__tool--active" : ""
        }`}
        onClick={() => setCanvasTool("select")}
        title={selectTool.title}
        type="button"
      >
        <MousePointer2 aria-hidden="true" size={18} strokeWidth={2} />
      </button>

      <button
        aria-label={panTool.label}
        className={`node-palette__tool ${
          canvasTool === "pan" ? "node-palette__tool--active" : ""
        }`}
        onClick={() => setCanvasTool("pan")}
        title={panTool.title}
        type="button"
      >
        <Hand aria-hidden="true" size={18} strokeWidth={2} />
      </button>

      <div className="node-palette__divider" />

      <div className="node-palette__primary-tools" aria-label="Viewport controls">
        <button
          aria-label="Zoom in"
          className="node-palette__tool"
          onClick={() => void zoomIn({ duration: 180 })}
          title="Zoom in"
          type="button"
        >
          <ZoomIn aria-hidden="true" size={18} strokeWidth={2} />
        </button>

        <button
          aria-label="Zoom out"
          className="node-palette__tool"
          onClick={() => void zoomOut({ duration: 180 })}
          title="Zoom out"
          type="button"
        >
          <ZoomOut aria-hidden="true" size={18} strokeWidth={2} />
        </button>

        <button
          aria-label="Fit view"
          className="node-palette__tool"
          onClick={() => void fitView({ duration: 240, padding: 0.2 })}
          title="Fit view"
          type="button"
        >
          <Crosshair aria-hidden="true" size={18} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
