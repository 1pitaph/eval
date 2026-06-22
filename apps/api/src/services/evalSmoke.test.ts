import { describe, expect, it } from "vitest";
import { starterWorkflowDraft } from "@eval/workflow-schema";
import { runImageEvalSpec } from "./imageEvalRunner";
import { compileWorkflow } from "./workflowCompiler";

describe("eval smoke workflow", () => {
  it("compiles the starter workflow into a CI-runnable manifest", () => {
    const compiled = compileWorkflow(starterWorkflowDraft);

    expect(compiled.ok).toBe(true);
    if (!compiled.ok) {
      throw new Error(compiled.issues.map((issue) => issue.message).join("; "));
    }

    expect(compiled.warnings).toEqual([]);
    expect(compiled.spec.manifest.version).toBe("image-eval-manifest/v1");
    expect(compiled.spec.manifest.exportHints.ciRunnable).toBe(true);
    expect(compiled.spec.manifest.matrix.generationJobs).toBe(8);
    expect(compiled.spec.topologicalOrder).toEqual([
      "prompt-set",
      "prompt-template",
      "model-fanout",
      "artifact-store",
      "auto-metrics",
      "human-eval",
      "aggregate",
      "release-gate"
    ]);
  });

  it("runs the compiled starter workflow with deterministic mock outputs", () => {
    const compiled = compileWorkflow(starterWorkflowDraft);

    expect(compiled.ok).toBe(true);
    if (!compiled.ok) {
      throw new Error(compiled.issues.map((issue) => issue.message).join("; "));
    }

    const run = runImageEvalSpec(compiled.spec, "test-run", "2026-06-12T00:00:00.000Z");

    expect(run.status).toBe("succeeded");
    expect(run.artifacts).toHaveLength(8);
    expect(run.scores).toHaveLength(64);
    expect(run.reviews).toHaveLength(8);
    expect(run.summary).toMatchObject({
      artifactCount: 8,
      taskCount: 76,
      estimatedCostUsd: 0.41,
      bestModel: "flux"
    });
    expect(run.decision.status).toBe("warn");
  });
});
