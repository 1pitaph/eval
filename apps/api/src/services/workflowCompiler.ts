import {
  arePortsCompatible,
  EvalRunSpecSchema,
  getNodeDefinition,
  getPort,
  WorkflowDraftSchema,
  type EvalRunSpec,
  type WorkflowDraft
} from "@eval/workflow-schema";
import { buildEvalManifest } from "./evalManifest";

export type CompileIssue = {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
};

export type CompileResult =
  | { ok: true; spec: EvalRunSpec; warnings: CompileIssue[] }
  | { ok: false; issues: CompileIssue[] };

export function compileWorkflow(input: unknown): CompileResult {
  const parsed = WorkflowDraftSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        code: "schema_error",
        message: `${issue.path.join(".")}: ${issue.message}`
      }))
    };
  }

  const draft = parsed.data;
  const issues = validateDraft(draft);

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const topologicalOrder = sortTopologically(draft);
  const compiledAt = new Date().toISOString();
  const spec: EvalRunSpec = {
    workflowId: draft.id ?? "unsaved-workflow",
    workflowVersion: draft.version,
    name: draft.name,
    compiledAt,
    manifest: buildEvalManifest(draft, compiledAt),
    topologicalOrder,
    edges: draft.edges,
    nodes: draft.nodes.map((node) => {
      const definition = getNodeDefinition(node.type);
      const upstream = draft.edges
        .filter((edge) => edge.target === node.id)
        .map((edge) => edge.source);
      const downstream = draft.edges
        .filter((edge) => edge.source === node.id)
        .map((edge) => edge.target);

      return {
        id: node.id,
        type: node.type,
        runtime: definition?.runtime ?? "none",
        config: node.data.config,
        upstream,
        downstream
      };
    })
  };

  const specParsed = EvalRunSpecSchema.safeParse(spec);
  if (!specParsed.success) {
    return {
      ok: false,
      issues: specParsed.error.issues.map((issue) => ({
        code: "compiled_spec_error",
        message: `${issue.path.join(".")}: ${issue.message}`
      }))
    };
  }

  return {
    ok: true,
    spec: specParsed.data,
    warnings: findWarnings(draft)
  };
}

function validateDraft(draft: WorkflowDraft): CompileIssue[] {
  const issues: CompileIssue[] = [];
  const nodeIds = new Set<string>();

  for (const node of draft.nodes) {
    if (nodeIds.has(node.id)) {
      issues.push({
        code: "duplicate_node_id",
        message: `Duplicate node id "${node.id}".`,
        nodeId: node.id
      });
    }

    nodeIds.add(node.id);

    const definition = getNodeDefinition(node.type);
    if (!definition) {
      issues.push({
        code: "unknown_node_type",
        message: `Node "${node.id}" uses unknown type "${node.type}".`,
        nodeId: node.id
      });
      continue;
    }

    for (const key of definition.requiredConfig) {
      if (node.data.config[key] === undefined || node.data.config[key] === "") {
        issues.push({
          code: "missing_required_config",
          message: `Node "${node.id}" is missing required config "${key}".`,
          nodeId: node.id
        });
      }
    }
  }

  for (const edge of draft.edges) {
    const source = draft.nodes.find((node) => node.id === edge.source);
    const target = draft.nodes.find((node) => node.id === edge.target);

    if (!source || !target) {
      issues.push({
        code: "dangling_edge",
        message: `Edge "${edge.id}" references a missing node.`,
        edgeId: edge.id
      });
      continue;
    }

    const sourceDefinition = getNodeDefinition(source.type);
    const targetDefinition = getNodeDefinition(target.type);

    if (!sourceDefinition || !targetDefinition) {
      continue;
    }

    const sourcePort = getPort(sourceDefinition, "outputs", edge.sourceHandle);
    const targetPort = getPort(targetDefinition, "inputs", edge.targetHandle);

    if (!sourcePort || !targetPort) {
      issues.push({
        code: "missing_port",
        message: `Edge "${edge.id}" references an unknown handle.`,
        edgeId: edge.id
      });
      continue;
    }

    if (!arePortsCompatible(sourcePort, targetPort)) {
      issues.push({
        code: "incompatible_ports",
        message: `Edge "${edge.id}" connects ${sourcePort.type} to ${targetPort.type}.`,
        edgeId: edge.id
      });
    }
  }

  if (hasCycle(draft)) {
    issues.push({
      code: "cycle_detected",
      message: "Workflow must be a DAG. Remove cyclic connections."
    });
  }

  return issues;
}

function findWarnings(draft: WorkflowDraft): CompileIssue[] {
  const warnings: CompileIssue[] = [];

  for (const node of draft.nodes) {
    const definition = getNodeDefinition(node.type);
    if (definition?.costSensitive && !("budgetUsd" in node.data.config)) {
      warnings.push({
        code: "budget_not_set",
        message: `Cost-sensitive node "${node.id}" has no budgetUsd config.`,
        nodeId: node.id
      });
    }
  }

  return warnings;
}

function sortTopologically(draft: WorkflowDraft): string[] {
  const incoming = new Map(draft.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(draft.nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of draft.edges) {
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)?.push(edge.target);
  }

  const queue = Array.from(incoming.entries())
    .filter(([, count]) => count === 0)
    .map(([id]) => id);
  const result: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    result.push(current);

    for (const next of outgoing.get(current) ?? []) {
      const nextCount = (incoming.get(next) ?? 0) - 1;
      incoming.set(next, nextCount);
      if (nextCount === 0) {
        queue.push(next);
      }
    }
  }

  return result;
}

function hasCycle(draft: WorkflowDraft): boolean {
  return sortTopologically(draft).length !== draft.nodes.length;
}
