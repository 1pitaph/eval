import type { FastifyInstance } from "fastify";
import { getRun, saveRun } from "../lib/inMemoryStore";
import { compileWorkflow } from "../services/workflowCompiler";

export async function registerRunRoutes(app: FastifyInstance) {
  app.post("/runs", async (request, reply) => {
    const compiled = compileWorkflow(request.body);
    if (!compiled.ok) {
      return reply.code(422).send(compiled);
    }

    const run = saveRun(compiled.spec);
    return reply.code(202).send({ run, warnings: compiled.warnings });
  });

  app.get<{ Params: { id: string } }>(
    "/runs/:id/export.json",
    async (request, reply) => {
      const run = getRun(request.params.id);
      if (!run) {
        return reply.code(404).send({ message: "Run not found" });
      }

      return reply
        .header("content-type", "application/json; charset=utf-8")
        .header(
          "content-disposition",
          `attachment; filename="${run.id}-image-eval.json"`
        )
        .send(run);
    }
  );

  app.get<{ Params: { id: string } }>(
    "/runs/:id/export.csv",
    async (request, reply) => {
      const run = getRun(request.params.id);
      if (!run) {
        return reply.code(404).send({ message: "Run not found" });
      }

      return reply
        .header("content-type", "text/csv; charset=utf-8")
        .header(
          "content-disposition",
          `attachment; filename="${run.id}-image-eval.csv"`
        )
        .send(toArtifactCsv(run));
    }
  );

  app.get<{ Params: { id: string } }>("/runs/:id", async (request, reply) => {
    const run = getRun(request.params.id);
    if (!run) {
      return reply.code(404).send({ message: "Run not found" });
    }

    return run;
  });
}

function toArtifactCsv(run: NonNullable<ReturnType<typeof getRun>>) {
  const headers = [
    "run_id",
    "artifact_id",
    "prompt_id",
    "model",
    "provider",
    "seed",
    "cost_usd",
    "latency_ms",
    "quality",
    "safety",
    "human_verdict",
    "human_score",
    "storage_uri"
  ];

  const rows = run.artifacts.map((artifact) => {
    const review = run.reviews.find(
      (candidate) => candidate.artifactId === artifact.id
    );
    const quality = average(
      run.scores
        .filter(
          (score) =>
            score.artifactId === artifact.id &&
            ["vlm_rubric", "clip_siglip", "ocr", "blur", "aesthetic"].includes(
              score.metric
            )
        )
        .map((score) => score.score)
    );
    const safety = run.scores.find(
      (score) => score.artifactId === artifact.id && score.metric === "nsfw"
    );

    return [
      run.id,
      artifact.id,
      artifact.promptId,
      artifact.model,
      artifact.provider,
      artifact.seed,
      artifact.costUsd,
      artifact.latencyMs,
      quality.toFixed(3),
      safety?.score.toFixed(3) ?? "",
      review?.verdict ?? "",
      review?.score.toFixed(3) ?? "",
      artifact.storageUri
    ];
  });

  return [headers, ...rows]
    .map((row) => row.map((value) => csvCell(String(value))).join(","))
    .join("\n");
}

function csvCell(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}
