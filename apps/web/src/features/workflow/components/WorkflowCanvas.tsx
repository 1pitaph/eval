import {
  memo,
  useCallback,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent
} from "react";
import {
  Background,
  getOutgoers,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useReactFlow,
  type IsValidConnection,
  type NodeProps,
  type XYPosition
} from "@xyflow/react";
import {
  arePortsCompatible,
  getNodeDefinition,
  getPort,
  nodeDefinitions,
  type NodeCategory
} from "@eval/workflow-schema";
import { Badge } from "@eval/ui";
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

type ContextMenuState = {
  flowPosition: XYPosition;
  x: number;
  y: number;
};

const categoryLabels: Record<NodeCategory, string> = {
  input: "Input",
  prompt: "Prompt",
  generation: "Generation",
  artifact: "Artifact",
  eval: "Eval",
  aggregate: "Aggregate",
  decision: "Decision"
};

export function WorkflowCanvas() {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>();
  const canvasTool = useWorkflowStore((state) => state.canvasTool);
  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);
  const addNodeAt = useWorkflowStore((state) => state.addNodeAt);
  const onNodesChange = useWorkflowStore((state) => state.onNodesChange);
  const onEdgesChange = useWorkflowStore((state) => state.onEdgesChange);
  const onConnect = useWorkflowStore((state) => state.onConnect);
  const selectNode = useWorkflowStore((state) => state.selectNode);
  const setViewport = useWorkflowStore((state) => state.setViewport);
  const { getNodes, getEdges, screenToFlowPosition } = useReactFlow<EvalFlowNode>();

  const nodeTypes = useMemo(
    () =>
      Object.fromEntries(
        nodeDefinitions.map((definition) => [definition.type, EvalNode])
      ),
    []
  );

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
  const groupedNodeDefinitions = useMemo(
    () =>
      nodeDefinitions.reduce(
        (groups, definition) => {
          groups[definition.category] = [
            ...(groups[definition.category] ?? []),
            definition
          ];
          return groups;
        },
        {} as Record<NodeCategory, typeof nodeDefinitions>
      ),
    []
  );

  const handlePaneContextMenu = useCallback(
    (event: MouseEvent | ReactMouseEvent<Element>) => {
      event.preventDefault();
      selectNode(undefined);

      const currentTarget = event.currentTarget as Element;
      const bounds = currentTarget.getBoundingClientRect();
      setContextMenu({
        flowPosition: screenToFlowPosition({
          x: event.clientX,
          y: event.clientY
        }),
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top
      });
    },
    [screenToFlowPosition, selectNode]
  );

  return (
    <section className="canvas-shell" aria-label="Workflow canvas">
      <ReactFlow
        colorMode="light"
        defaultEdgeOptions={defaultEdgeOptions}
        edges={edges}
        fitView
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        nodes={nodes}
        onConnect={onConnect}
        onEdgesChange={onEdgesChange}
        onMoveEnd={(_, viewport) => setViewport(viewport)}
        onNodeClick={(_, node) => selectNode(node.id)}
        onNodesChange={onNodesChange}
        onPaneClick={() => {
          selectNode(undefined);
          setContextMenu(undefined);
        }}
        onPaneContextMenu={handlePaneContextMenu}
        panOnDrag={canvasTool === "pan"}
        selectionOnDrag={canvasTool === "select"}
      >
        <Background gap={24} />
        <MiniMap pannable position="bottom-right" zoomable />
        {contextMenu ? (
          <div
            className="canvas-context-menu"
            role="menu"
            style={{
              left: contextMenu.x,
              top: contextMenu.y
            }}
          >
            <div className="canvas-context-menu__title">Add eval node</div>
            {(
              Object.entries(groupedNodeDefinitions) as Array<
                [NodeCategory, typeof nodeDefinitions]
              >
            ).map(([category, definitions]) => (
              <div className="canvas-context-menu__group" key={category}>
                <span>{categoryLabels[category]}</span>
                {definitions.map((definition) => (
                  <button
                    className="canvas-context-menu__item"
                    key={definition.type}
                    onClick={() => {
                      addNodeAt(definition.type, contextMenu.flowPosition);
                      setContextMenu(undefined);
                    }}
                    role="menuitem"
                    type="button"
                  >
                    {definition.title}
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </ReactFlow>
    </section>
  );
}

const EvalNode = memo(function EvalNode({
  data,
  selected,
  type
}: NodeProps<EvalFlowNode>) {
  const definition = getNodeDefinition(type);
  const statusTone = statusToTone(data.status);

  return (
    <div className={`eval-node ${selected ? "eval-node--selected" : ""}`}>
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
