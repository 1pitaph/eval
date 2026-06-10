import { useState } from "react";
import { Save } from "lucide-react";
import { Button, Panel } from "@eval/ui";
import { getNodeDefinition } from "@eval/workflow-schema";
import { type EvalFlowNode, useWorkflowStore } from "../state/workflowStore";

export function InspectorPanel() {
  const selectedNodeId = useWorkflowStore((state) => state.selectedNodeId);
  const node = useWorkflowStore((state) =>
    state.nodes.find((candidate) => candidate.id === selectedNodeId)
  );
  const definition = node?.type ? getNodeDefinition(node.type) : undefined;

  if (!node || !definition) {
    return (
      <Panel className="inspector-panel" title="Inspector">
        <p className="empty-state">Select a node to edit its configuration.</p>
      </Panel>
    );
  }

  return <InspectorEditor key={node.id} node={node} />;
}

function InspectorEditor({ node }: { node: EvalFlowNode }) {
  const updateNodeConfig = useWorkflowStore((state) => state.updateNodeConfig);
  const definition = getNodeDefinition(node.type ?? "");
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState(() =>
    JSON.stringify(node.data.config ?? {}, null, 2)
  );

  if (!definition) {
    return null;
  }

  const handleSave = () => {
    try {
      const parsed = JSON.parse(draft) as Record<string, unknown>;
      updateNodeConfig(node.id, parsed);
      setError(undefined);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Invalid JSON.");
    }
  };

  return (
    <Panel
      actions={
        <Button onClick={handleSave} variant="secondary">
          <Save aria-hidden="true" size={14} />
          Save
        </Button>
      }
      className="inspector-panel"
      title="Inspector"
    >
      <div className="inspector-panel__heading">
        <h3>{definition.title}</h3>
        <p>{definition.description}</p>
      </div>
      <div className="inspector-panel__ports">
        <div>
          <strong>Inputs</strong>
          <span>{definition.inputs.map((port) => port.type).join(", ") || "none"}</span>
        </div>
        <div>
          <strong>Outputs</strong>
          <span>
            {definition.outputs.map((port) => port.type).join(", ") || "none"}
          </span>
        </div>
      </div>
      <label className="json-editor">
        Config JSON
        <textarea
          spellCheck={false}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(undefined);
          }}
        />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
    </Panel>
  );
}
