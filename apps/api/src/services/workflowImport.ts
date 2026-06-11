import {
  EvalRunSpecSchema,
  EvalSpecManifestSchema,
  WorkflowDraftSchema,
  starterWorkflowDraft,
  type EvalRunSpec,
  type EvalSpecManifest,
  type WorkflowDraft
} from "@eval/workflow-schema";
import { compileWorkflow } from "./workflowCompiler";

export type WorkflowInputResolution =
  | { kind: "spec"; spec: EvalRunSpec }
  | { kind: "draft"; spec: EvalRunSpec }
  | { kind: "manifest"; spec: EvalRunSpec }
  | { kind: "run-export"; spec: EvalRunSpec };

export function resolveEvalSpecFromPayload(payload: unknown): WorkflowInputResolution {
  const spec = EvalRunSpecSchema.safeParse(payload);
  if (spec.success) {
    return { kind: "spec", spec: spec.data };
  }

  if (isRecord(payload)) {
    const nestedSpec = EvalRunSpecSchema.safeParse(payload.spec);
    if (nestedSpec.success) {
      return { kind: "run-export", spec: nestedSpec.data };
    }

    const nestedRunSpec = isRecord(payload.run)
      ? EvalRunSpecSchema.safeParse(payload.run.spec)
      : undefined;
    if (nestedRunSpec?.success) {
      return { kind: "run-export", spec: nestedRunSpec.data };
    }
  }

  const draft = WorkflowDraftSchema.safeParse(payload);
  if (draft.success) {
    return { kind: "draft", spec: compileDraft(draft.data) };
  }

  const manifest = EvalSpecManifestSchema.safeParse(payload);
  if (manifest.success) {
    return {
      kind: "manifest",
      spec: compileDraft(workflowDraftFromManifest(manifest.data))
    };
  }

  throw new Error(
    "Input must be an EvalRunSpec, EvalSpecManifest, WorkflowDraft, or exported run JSON."
  );
}

export function workflowDraftFromManifest(manifest: EvalSpecManifest): WorkflowDraft {
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

function compileDraft(draft: WorkflowDraft): EvalRunSpec {
  const compiled = compileWorkflow(draft);
  if (!compiled.ok) {
    throw new Error(
      `Could not compile workflow input: ${compiled.issues
        .map((issue) => issue.message)
        .join("; ")}`
    );
  }

  return compiled.spec;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
