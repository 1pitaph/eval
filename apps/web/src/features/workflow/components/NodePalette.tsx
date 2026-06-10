import { Plus } from "lucide-react";
import { Button } from "@eval/ui";
import { nodeDefinitions } from "@eval/workflow-schema";
import { useWorkflowStore } from "../state/workflowStore";

export function NodePalette() {
  const addNode = useWorkflowStore((state) => state.addNode);
  const grouped = nodeDefinitions.reduce(
    (groups, definition) => {
      groups[definition.category] = [
        ...(groups[definition.category] ?? []),
        definition
      ];
      return groups;
    },
    {} as Record<string, (typeof nodeDefinitions)[number][]>
  );

  return (
    <div className="node-palette" aria-label="Node library">
      <div className="node-palette__title">Node Library</div>
      <div className="node-palette__groups">
        {Object.entries(grouped).map(([category, definitions]) => (
          <div className="node-palette__group" key={category}>
            <span className="node-palette__category">{category}</span>
            <div className="node-palette__items">
              {definitions?.map((definition) => (
                <Button
                  className="node-palette__item"
                  key={definition.type}
                  onClick={() => addNode(definition.type)}
                  title={`Add ${definition.title}`}
                  variant="ghost"
                >
                  <Plus aria-hidden="true" size={14} />
                  <span>{definition.title}</span>
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
