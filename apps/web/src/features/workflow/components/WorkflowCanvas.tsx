import { memo, useCallback, useMemo } from "react";
import {
  Background,
  getOutgoers,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useReactFlow,
  type IsValidConnection,
  type NodeProps
} from "@xyflow/react";
import {
  arePortsCompatible,
  getNodeDefinition,
  getPort,
  nodeDefinitions
} from "@eval/workflow-schema";
import { Badge } from "@eval/ui";
import { getCanvasToolClassName } from "../config/canvasTools";
import {
  type EvalFlowEdge,
  type EvalFlowNode,
  useWorkflowStore
} from "../state/workflowStore";

type ConnectionCandidate = {
  source?: string | null;
  sourceHandle?: string | null;
  target?: string | null;
  targetHandle?: string | null;
};

type WorkflowCanvasVariant = "full" | "pipeline";

const hierarchyLayouts = {
  full: {
    startX: 72,
    startY: 52,
    columnGap: 330,
    rowGap: 154
  },
  pipeline: {
    startX: 44,
    startY: 34,
    columnGap: 228,
    rowGap: 82
  }
};

const fixedViewports = {
  full: {
    x: 24,
    y: 20,
    zoom: 0.82
  },
  pipeline: {
    x: 10,
    y: 18,
    zoom: 0.74
  }
};

export function WorkflowCanvas({
  variant = "full"
}: {
  variant?: WorkflowCanvasVariant;
}) {
  const canvasTool = useWorkflowStore((state) => state.canvasTool);
  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);
  const selectedNodeId = useWorkflowStore((state) => state.selectedNodeId);
  const layoutNodes = useMemo(
    () => layoutHierarchy(nodes, edges, variant, selectedNodeId),
    [edges, nodes, selectedNodeId, variant]
  );
  const onNodesChange = useWorkflowStore((state) => state.onNodesChange);
  const onEdgesChange = useWorkflowStore((state) => state.onEdgesChange);
  const onConnect = useWorkflowStore((state) => state.onConnect);
  const selectNode = useWorkflowStore((state) => state.selectNode);
  const setViewport = useWorkflowStore((state) => state.setViewport);
  const { getNodes, getEdges } = useReactFlow<EvalFlowNode>();

  const isValidConnection: IsValidConnection = useCallback(
    (connection) =>
      hasCompatiblePorts(connection, getNodes()) &&
      !connectionCreatesCycle(connection, getNodes(), getEdges()),
    [getEdges, getNodes]
  );

  const defaultEdgeOptions = useMemo(
    () => ({
      animated: false,
      className: "workflow-edge"
    }),
    []
  );
  const fitViewOptions = useMemo(
    () =>
      variant === "pipeline"
        ? { maxZoom: 0.92, minZoom: 0.45, padding: 0.08 }
        : { maxZoom: 0.82, minZoom: 0.12, padding: 0.18 },
    [variant]
  );

  const updateSelectedNode = useCallback(
    (nodeId: string | undefined) => {
      if (nodeId !== selectedNodeId) {
        selectNode(nodeId);
      }
    },
    [selectNode, selectedNodeId]
  );

  return (
    <section
      className={`canvas-shell canvas-shell--${variant} ${getCanvasToolClassName(canvasTool)}`}
      aria-label="Workflow canvas"
    >
      <ReactFlow
        colorMode="light"
        defaultEdgeOptions={defaultEdgeOptions}
        defaultViewport={fixedViewports[variant]}
        edges={edges}
        fitView
        fitViewOptions={fitViewOptions}
        isValidConnection={isValidConnection}
        nodeTypes={workflowNodeTypes}
        nodes={layoutNodes}
        nodesConnectable={false}
        nodesDraggable={false}
        onConnect={onConnect}
        onEdgesChange={onEdgesChange}
        onMoveEnd={(_, viewport) => setViewport(viewport)}
        onNodeClick={(_, node) => updateSelectedNode(node.id)}
        onNodesChange={onNodesChange}
        onPaneClick={() => {
          updateSelectedNode(undefined);
        }}
        onPaneContextMenu={(event) => event.preventDefault()}
        panOnDrag={variant === "full"}
        selectionOnDrag={false}
        zoomOnDoubleClick={variant === "full"}
        zoomOnPinch={variant === "full"}
        zoomOnScroll={variant === "full"}
      >
        {variant === "full" ? <Background gap={24} /> : null}
        {variant === "full" ? (
          <MiniMap pannable position="bottom-right" zoomable />
        ) : null}
      </ReactFlow>
    </section>
  );
}

function layoutHierarchy(
  nodes: EvalFlowNode[],
  edges: EvalFlowEdge[],
  variant: WorkflowCanvasVariant,
  selectedNodeId: string | undefined
) {
  const hierarchyLayout = hierarchyLayouts[variant];
  const nodeIndex = new Map(nodes.map((node, index) => [node.id, index]));
  const depthByNodeId = new Map<string, number>();
  const incomingCount = new Map(nodes.map((node) => [node.id, 0]));

  for (const edge of edges) {
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
  }

  for (const node of nodes) {
    if ((incomingCount.get(node.id) ?? 0) === 0) {
      depthByNodeId.set(node.id, 0);
    }
  }

  for (let pass = 0; pass < nodes.length; pass += 1) {
    for (const edge of edges) {
      const sourceDepth = depthByNodeId.get(edge.source);
      if (sourceDepth === undefined) {
        continue;
      }

      const nextDepth = sourceDepth + 1;
      const currentTargetDepth = depthByNodeId.get(edge.target) ?? 0;
      if (nextDepth > currentTargetDepth) {
        depthByNodeId.set(edge.target, nextDepth);
      }
    }
  }

  const groupedNodes = nodes.reduce(
    (groups, node) => {
      const depth = depthByNodeId.get(node.id) ?? 0;
      groups[depth] = [...(groups[depth] ?? []), node];
      return groups;
    },
    {} as Record<number, EvalFlowNode[]>
  );
  const orderedGroups = Object.fromEntries(
    Object.entries(groupedNodes).map(([depth, group]) => [
      depth,
      [...group].sort(
        (left, right) => (nodeIndex.get(left.id) ?? 0) - (nodeIndex.get(right.id) ?? 0)
      )
    ])
  ) as Record<number, EvalFlowNode[]>;

  return nodes.map((node) => {
    const depth = depthByNodeId.get(node.id) ?? 0;
    const siblings = orderedGroups[depth] ?? [];
    const siblingIndex = siblings.findIndex((candidate) => candidate.id === node.id);

    return {
      ...node,
      data: {
        ...node.data,
        isSelected: node.id === selectedNodeId
      },
      draggable: false,
      position: {
        x: hierarchyLayout.startX + depth * hierarchyLayout.columnGap,
        y: hierarchyLayout.startY + Math.max(0, siblingIndex) * hierarchyLayout.rowGap
      }
    };
  });
}

const EvalNode = memo(function EvalNode({
  data,
  selected,
  type
}: NodeProps<EvalFlowNode>) {
  const definition = getNodeDefinition(type);
  const statusTone = statusToTone(data.status);
  const isSelected = selected || data.isSelected === true;

  return (
    <div className={`eval-node ${isSelected ? "eval-node--selected" : ""}`}>
      {definition?.inputs.map((input, index) => (
        <Handle
          className="eval-node__handle eval-node__handle--input"
          id={input.id}
          key={input.id}
          position={Position.Left}
          style={{ top: handleTop(index, definition.inputs.length) }}
          type="target"
        />
      ))}

      <div className="eval-node__header">
        <span>{data.label}</span>
        <Badge tone={statusTone}>{data.status}</Badge>
      </div>
      <p>{definition?.description ?? "Unknown workflow node."}</p>
      <dl className="eval-node__meta">
        <div>
          <dt>Runtime</dt>
          <dd>{definition?.runtime ?? "none"}</dd>
        </div>
        <div>
          <dt>Cost</dt>
          <dd>{definition?.costSensitive ? "tracked" : "none"}</dd>
        </div>
      </dl>

      {definition?.outputs.map((output, index) => (
        <Handle
          className="eval-node__handle eval-node__handle--output"
          id={output.id}
          key={output.id}
          position={Position.Right}
          style={{ top: handleTop(index, definition.outputs.length) }}
          type="source"
        />
      ))}
    </div>
  );
});

const workflowNodeTypes = Object.fromEntries(
  nodeDefinitions.map((definition) => [definition.type, EvalNode])
);

function handleTop(index: number, count: number) {
  return `${((index + 1) / (count + 1)) * 100}%`;
}

function statusToTone(status: string) {
  switch (status) {
    case "succeeded":
    case "cached":
      return "success";
    case "running":
    case "queued":
      return "info";
    case "failed":
    case "blocked":
      return "danger";
    default:
      return "neutral";
  }
}

function hasCompatiblePorts(connection: ConnectionCandidate, nodes: EvalFlowNode[]) {
  if (!connection.source || !connection.target) {
    return false;
  }

  const source = nodes.find((node) => node.id === connection.source);
  const target = nodes.find((node) => node.id === connection.target);
  const sourceDefinition = getNodeDefinition(source?.type ?? "");
  const targetDefinition = getNodeDefinition(target?.type ?? "");

  if (!sourceDefinition || !targetDefinition) {
    return false;
  }

  const sourcePort = getPort(
    sourceDefinition,
    "outputs",
    connection.sourceHandle ?? undefined
  );
  const targetPort = getPort(
    targetDefinition,
    "inputs",
    connection.targetHandle ?? undefined
  );

  return Boolean(
    sourcePort && targetPort && arePortsCompatible(sourcePort, targetPort)
  );
}

function connectionCreatesCycle(
  connection: ConnectionCandidate,
  nodes: EvalFlowNode[],
  edges: EvalFlowEdge[]
) {
  const target = nodes.find((node) => node.id === connection.target);
  const source = nodes.find((node) => node.id === connection.source);

  if (!target || !source) {
    return false;
  }

  const visited = new Set<string>();
  const hasPathToSource = (node: EvalFlowNode): boolean => {
    if (visited.has(node.id)) {
      return false;
    }

    visited.add(node.id);
    return getOutgoers(node, nodes, edges).some(
      (outgoer) => outgoer.id === source.id || hasPathToSource(outgoer)
    );
  };

  return hasPathToSource(target);
}
