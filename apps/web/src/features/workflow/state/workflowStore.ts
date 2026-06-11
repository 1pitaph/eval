import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type Viewport
} from "@xyflow/react";
import { create } from "zustand";
import {
  getNodeDefinition,
  type EvalRunSpec,
  type EvalSpecManifest,
  starterWorkflowDraft,
  type WorkflowDraft,
  type WorkflowNodeData
} from "@eval/workflow-schema";
import type { CanvasTool } from "../config/canvasTools";
import type { CompileResponse, RunResponse } from "../../../shared/api/evalApi";

export type EvalFlowNodeData = WorkflowNodeData & Record<string, unknown>;
export type EvalFlowNode = Node<EvalFlowNodeData, string>;
export type EvalFlowEdge = Edge;

type WorkflowState = {
  canvasTool: CanvasTool;
  compileResult: CompileResponse | undefined;
  description: string | undefined;
  edges: EvalFlowEdge[];
  isCanvasOpen: boolean;
  name: string;
  nodes: EvalFlowNode[];
  runResult: RunResponse | undefined;
  selectedNodeId: string | undefined;
  version: number;
  viewport: Viewport | undefined;
  loadWorkflowDraft: (draft: WorkflowDraft) => void;
  loadWorkflowFromManifest: (manifest: EvalSpecManifest) => void;
  loadWorkflowFromSpec: (spec: EvalRunSpec) => void;
  onConnect: (connection: Connection) => void;
  onEdgesChange: (changes: EdgeChange<EvalFlowEdge>[]) => void;
  onNodesChange: (changes: NodeChange<EvalFlowNode>[]) => void;
  selectNode: (nodeId?: string) => void;
  setCompileResult: (result: CompileResponse) => void;
  setCanvasTool: (tool: CanvasTool) => void;
  setCanvasOpen: (open: boolean) => void;
  setRunResult: (result: RunResponse) => void;
  setViewport: (viewport: Viewport) => void;
  toDraft: () => WorkflowDraft;
  updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void;
};

const initialNodes = starterWorkflowDraft.nodes.map((node) => ({
  ...node,
  data: {
    ...node.data,
    config: node.data.config
  }
})) satisfies EvalFlowNode[];

const initialEdges = flowEdgesFromDraft(starterWorkflowDraft.edges);

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  canvasTool: "select",
  description: starterWorkflowDraft.description,
  edges: initialEdges,
  isCanvasOpen: false,
  name: starterWorkflowDraft.name,
  nodes: initialNodes,
  compileResult: undefined,
  runResult: undefined,
  selectedNodeId: initialNodes[0]?.id,
  version: starterWorkflowDraft.version,
  viewport: undefined,
  loadWorkflowDraft: (draft) => {
    const nodes = draft.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        config: node.data.config
      }
    })) satisfies EvalFlowNode[];

    set({
      compileResult: undefined,
      description: draft.description,
      edges: flowEdgesFromDraft(draft.edges),
      name: draft.name,
      nodes,
      runResult: undefined,
      selectedNodeId: nodes[0]?.id,
      version: draft.version,
      viewport: draft.viewport
    });
  },
  loadWorkflowFromManifest: (manifest) => {
    get().loadWorkflowDraft(draftFromManifest(manifest));
  },
  loadWorkflowFromSpec: (spec) => {
    get().loadWorkflowDraft(draftFromSpec(spec));
  },
  onConnect: (connection) => {
    const id = [
      connection.source,
      connection.sourceHandle,
      connection.target,
      connection.targetHandle
    ]
      .filter(Boolean)
      .join("-");

    set((state) => ({
      edges: addEdge({ ...connection, id }, state.edges)
    }));
  },
  onEdgesChange: (changes) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges)
    }));
  },
  onNodesChange: (changes) => {
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes)
    }));
  },
  selectNode: (nodeId) => {
    set({ selectedNodeId: nodeId });
  },
  setCompileResult: (result) => {
    set({ compileResult: result });
  },
  setCanvasTool: (tool) => {
    set({ canvasTool: tool });
  },
  setCanvasOpen: (open) => {
    set({ isCanvasOpen: open });
  },
  setRunResult: (result) => {
    set({ runResult: result });
  },
  setViewport: (viewport) => {
    set({ viewport });
  },
  toDraft: () => {
    const state = get();

    const nodes = state.nodes.map((node) => {
      const data: WorkflowNodeData = {
        label: String(node.data.label),
        status: node.data.status,
        config: node.data.config
      };

      if (node.data.summary) {
        data.summary = node.data.summary;
      }

      return {
        id: node.id,
        type: node.type ?? "unknown",
        position: node.position,
        data
      };
    });

    const edges = state.edges.map((edge) => {
      const draftEdge = {
        id: edge.id,
        source: edge.source,
        target: edge.target
      } as {
        id: string;
        source: string;
        sourceHandle?: string;
        target: string;
        targetHandle?: string;
      };

      if (edge.sourceHandle) {
        draftEdge.sourceHandle = edge.sourceHandle;
      }

      if (edge.targetHandle) {
        draftEdge.targetHandle = edge.targetHandle;
      }

      return draftEdge;
    });

    const draft: WorkflowDraft = {
      name: state.name,
      description: state.description,
      version: state.version,
      nodes,
      edges
    };

    if (state.viewport) {
      draft.viewport = state.viewport;
    }

    return draft;
  },
  updateNodeConfig: (nodeId, config) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                config
              }
            }
          : node
      )
    }));
  }
}));

function draftFromSpec(spec: EvalRunSpec): WorkflowDraft {
  const starterById = new Map(
    starterWorkflowDraft.nodes.map((node) => [node.id, node])
  );
  const starterByType = new Map(
    starterWorkflowDraft.nodes.map((node) => [node.type, node])
  );

  return {
    name: spec.name,
    description: "Imported from an Eval Studio run spec.",
    version: spec.workflowVersion,
    nodes: spec.nodes.map((node, index) => {
      const starter = starterById.get(node.id) ?? starterByType.get(node.type);
      const definition = getNodeDefinition(node.type);

      return {
        id: node.id,
        type: node.type,
        position: starter?.position ?? { x: index * 380, y: 120 },
        data: {
          label: starter?.data.label ?? definition?.title ?? node.type,
          status: "idle",
          config: node.config
        }
      };
    }),
    edges: spec.edges
  };
}

function flowEdgesFromDraft(edges: WorkflowDraft["edges"]): EvalFlowEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceHandle ?? null,
    target: edge.target,
    targetHandle: edge.targetHandle ?? null
  }));
}

function draftFromManifest(manifest: EvalSpecManifest): WorkflowDraft {
  return {
    ...starterWorkflowDraft,
    name: `Imported ${manifest.input.datasetId}`,
    description: "Imported from an image eval manifest.",
    nodes: starterWorkflowDraft.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        config: configFromManifest(node.type, node.data.config, manifest)
      }
    }))
  };
}

function configFromManifest(
  type: string,
  fallback: Record<string, unknown>,
  manifest: EvalSpecManifest
) {
  switch (type) {
    case "dataset.prompt_set":
      return {
        ...fallback,
        inputUiMode: manifest.input.promptMode === "inline" ? "single" : "dataset",
        mode: manifest.input.promptMode,
        datasetId: manifest.input.datasetId,
        sampleLimit: manifest.input.sampleLimit
      };
    case "prompt.template":
      return {
        ...fallback,
        template: manifest.input.template ?? manifest.input.templatePreview,
        ...(manifest.input.negativePrompt
          ? { negativePrompt: manifest.input.negativePrompt }
          : {})
      };
    case "generation.model_fanout":
      return {
        ...fallback,
        models: manifest.providers.map((provider) => provider.model),
        samplesPerPrompt: manifest.matrix.samplesPerPrompt,
        seedStrategy: manifest.runtime.seedStrategy,
        budgetUsd: manifest.matrix.estimatedGenerationCostUsd
      };
    case "metric.auto_image":
      return {
        ...fallback,
        metrics: manifest.metrics,
        budgetUsd: manifest.matrix.estimatedMetricCostUsd
      };
    case "human.pairwise":
      return {
        ...fallback,
        sampleRate: manifest.humanReview.sampleRate,
        reviewersPerTask: manifest.humanReview.reviewersPerTask,
        blindMode: manifest.humanReview.blindMode
      };
    case "aggregate.model_scores":
      return {
        ...fallback,
        rankingMethod: manifest.aggregation.rankingMethod
      };
    case "decision.release_gate":
      return {
        ...fallback,
        ...manifest.aggregation.releaseGate
      };
    default:
      return fallback;
  }
}
