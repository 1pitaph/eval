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
  edges: EvalFlowEdge[];
  nodes: EvalFlowNode[];
  runResult: RunResponse | undefined;
  selectedNodeId: string | undefined;
  viewport: Viewport | undefined;
  addNode: (type: string) => void;
  addNodeAt: (type: string, position?: { x: number; y: number }) => void;
  onConnect: (connection: Connection) => void;
  onEdgesChange: (changes: EdgeChange<EvalFlowEdge>[]) => void;
  onNodesChange: (changes: NodeChange<EvalFlowNode>[]) => void;
  selectNode: (nodeId?: string) => void;
  setCompileResult: (result: CompileResponse) => void;
  setCanvasTool: (tool: CanvasTool) => void;
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

const initialEdges = starterWorkflowDraft.edges satisfies EvalFlowEdge[];

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  canvasTool: "select",
  edges: initialEdges,
  nodes: initialNodes,
  compileResult: undefined,
  runResult: undefined,
  selectedNodeId: initialNodes[0]?.id,
  viewport: undefined,
  addNode: (type) => {
    get().addNodeAt(type);
  },
  addNodeAt: (type, position) => {
    const definition = getNodeDefinition(type);
    if (!definition) {
      return;
    }

    const index = get().nodes.length;
    const id = `${type}-${Date.now()}`;
    const node: EvalFlowNode = {
      id,
      type,
      position: {
        x: position?.x ?? 120 + (index % 4) * 280,
        y: position?.y ?? 120 + Math.floor(index / 4) * 180
      },
      data: {
        label: definition.title,
        config: {},
        status: "idle"
      }
    };

    set((state) => ({
      nodes: [...state.nodes, node],
      selectedNodeId: id
    }));
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
      name: starterWorkflowDraft.name,
      description: starterWorkflowDraft.description,
      version: starterWorkflowDraft.version,
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
