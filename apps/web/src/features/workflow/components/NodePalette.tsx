import { Crosshair, Hand, MousePointer2, ZoomIn, ZoomOut } from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import { useWorkflowStore } from "../state/workflowStore";

export function NodePalette() {
  const canvasTool = useWorkflowStore((state) => state.canvasTool);
  const setCanvasTool = useWorkflowStore((state) => state.setCanvasTool);
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  return (
    <div className="node-palette" aria-label="Canvas tools">
      <button
        aria-label="Select"
        className={`node-palette__tool ${
          canvasTool === "select" ? "node-palette__tool--active" : ""
        }`}
        onClick={() => setCanvasTool("select")}
        title="Select"
        type="button"
      >
        <MousePointer2 aria-hidden="true" size={18} strokeWidth={2} />
      </button>

      <button
        aria-label="Pan"
        className={`node-palette__tool ${
          canvasTool === "pan" ? "node-palette__tool--active" : ""
        }`}
        onClick={() => setCanvasTool("pan")}
        title="Pan"
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
