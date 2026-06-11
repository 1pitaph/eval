import { useState } from "react";
import { Save } from "lucide-react";
import {
  Badge,
  Button,
  CheckboxControl,
  Panel,
  SelectControl,
  TextArea,
  TextInput
} from "@eval/ui";
import { getNodeDefinition } from "@eval/workflow-schema";
import { type EvalFlowNode, useWorkflowStore } from "../state/workflowStore";

type ConfigFieldMeta = {
  type?: string;
  title?: string;
  enum?: string[];
  items?: { type?: string };
};

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
  const [formConfig, setFormConfig] = useState<Record<string, unknown>>(
    () => node.data.config ?? {}
  );
  const [jsonDraft, setJsonDraft] = useState(() =>
    JSON.stringify(node.data.config ?? {}, null, 2)
  );

  if (!definition) {
    return null;
  }

  const handleSave = () => {
    try {
      const parsed = parseJsonObject(jsonDraft);
      setFormConfig(parsed);
      updateNodeConfig(node.id, parsed);
      setError(undefined);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Invalid JSON.");
    }
  };

  const updateField = (key: string, value: unknown) => {
    const next = { ...formConfig };
    if (value === undefined || value === "") {
      delete next[key];
    } else {
      next[key] = value;
    }

    setFormConfig(next);
    setJsonDraft(JSON.stringify(next, null, 2));
    setError(undefined);
  };

  const fields = Object.entries(definition.configSchema);
  const requiredKeys = new Set(definition.requiredConfig);

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

      {fields.length > 0 ? (
        <div className="config-form">
          {fields.map(([key, rawMeta]) => (
            <ConfigField
              isRequired={requiredKeys.has(key)}
              key={key}
              meta={fieldMeta(rawMeta)}
              name={key}
              onChange={updateField}
              value={formConfig[key]}
            />
          ))}
        </div>
      ) : null}

      <label className="json-editor json-editor--compact">
        Advanced JSON
        <TextArea
          spellCheck={false}
          value={jsonDraft}
          onChange={(event) => {
            setJsonDraft(event.target.value);
            setError(undefined);
          }}
        />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
    </Panel>
  );
}

function ConfigField({
  isRequired,
  meta,
  name,
  onChange,
  value
}: {
  isRequired: boolean;
  meta: ConfigFieldMeta;
  name: string;
  onChange: (key: string, value: unknown) => void;
  value: unknown;
}) {
  const label = meta.title ?? titleFromKey(name);

  if (meta.enum && meta.enum.length > 0) {
    return (
      <label className="config-field">
        <FieldLabel isRequired={isRequired} label={label} />
        <SelectControl
          value={typeof value === "string" ? value : ""}
          onValueChange={(nextValue) => onChange(name, nextValue)}
          options={meta.enum.map((option) => ({
            label: option,
            value: option
          }))}
        />
      </label>
    );
  }

  switch (meta.type) {
    case "number":
      return (
        <label className="config-field">
          <FieldLabel isRequired={isRequired} label={label} />
          <TextInput
            inputMode="decimal"
            onChange={(event) =>
              onChange(
                name,
                event.target.value === "" ? undefined : Number(event.target.value)
              )
            }
            type="number"
            value={typeof value === "number" && Number.isFinite(value) ? value : ""}
          />
        </label>
      );
    case "boolean":
      return (
        <div className="config-field config-field--checkbox">
          <CheckboxControl
            checked={value === true}
            onCheckedChange={(checked) => onChange(name, checked)}
          />
          <FieldLabel isRequired={isRequired} label={label} />
        </div>
      );
    case "array":
      return (
        <label className="config-field">
          <FieldLabel isRequired={isRequired} label={label} />
          <TextArea
            onChange={(event) => onChange(name, parseArrayInput(event.target.value))}
            rows={4}
            value={arrayInputValue(value)}
          />
        </label>
      );
    default:
      return (
        <label className="config-field">
          <FieldLabel isRequired={isRequired} label={label} />
          {isLongTextField(name, value) ? (
            <TextArea
              onChange={(event) => onChange(name, event.target.value)}
              rows={5}
              value={typeof value === "string" ? value : ""}
            />
          ) : (
            <TextInput
              onChange={(event) => onChange(name, event.target.value)}
              type="text"
              value={typeof value === "string" ? value : ""}
            />
          )}
        </label>
      );
  }
}

function FieldLabel({ isRequired, label }: { isRequired: boolean; label: string }) {
  return (
    <span className="config-field__label">
      {label}
      {isRequired ? <Badge tone="info">required</Badge> : null}
    </span>
  );
}

function fieldMeta(value: unknown): ConfigFieldMeta {
  if (!isRecord(value)) {
    return {};
  }

  const meta: ConfigFieldMeta = {};
  if (typeof value.type === "string") {
    meta.type = value.type;
  }
  if (typeof value.title === "string") {
    meta.title = value.title;
  }
  if (Array.isArray(value.enum)) {
    meta.enum = value.enum.filter(
      (candidate): candidate is string => typeof candidate === "string"
    );
  }
  if (isRecord(value.items) && typeof value.items.type === "string") {
    meta.items = { type: value.items.type };
  }

  return meta;
}

function parseJsonObject(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Config JSON must be an object.");
  }

  return parsed;
}

function parseArrayInput(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function arrayInputValue(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item)).join("\n")
    : typeof value === "string"
      ? value
      : "";
}

function isLongTextField(name: string, value: unknown) {
  const normalized = name.toLowerCase();
  return (
    normalized.includes("template") ||
    normalized.includes("prompt") ||
    normalized.includes("guideline") ||
    (typeof value === "string" && value.includes("\n"))
  );
}

function titleFromKey(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
