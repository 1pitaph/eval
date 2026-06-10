export const canvasToolIds = ["select", "pan"] as const;

export type CanvasTool = (typeof canvasToolIds)[number];

export type CanvasToolDefinition = {
  id: CanvasTool;
  label: string;
  title: string;
  canvasClassName: string;
};

export const canvasToolDefinitions = {
  select: {
    id: "select",
    label: "Select",
    title: "Select and edit nodes",
    canvasClassName: "canvas-shell--tool-select"
  },
  pan: {
    id: "pan",
    label: "Pan",
    title: "Pan around the canvas",
    canvasClassName: "canvas-shell--tool-pan"
  }
} satisfies Record<CanvasTool, CanvasToolDefinition>;

export function getCanvasToolDefinition(tool: CanvasTool) {
  return canvasToolDefinitions[tool];
}

export function getCanvasToolClassName(tool: CanvasTool) {
  return getCanvasToolDefinition(tool).canvasClassName;
}
