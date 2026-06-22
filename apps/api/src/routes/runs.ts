import type { FastifyInstance } from "fastify";
import { getRun, listApiProviders } from "../lib/store";
import { getArtifactStore } from "../services/artifactStore";
import { compileWorkflow } from "../services/workflowCompiler";
import {
  cancelRun,
  createRunExecution,
  retryRun
} from "../services/localRunOrchestrator";
import { subscribeRunEvents } from "../services/runEvents";

export async function registerRunRoutes(app: FastifyInstance) {
  app.post("/runs", async (request, reply) => {
    const compiled = compileWorkflow(request.body, listApiProviders());
    if (!compiled.ok) {
      return reply.code(422).send(compiled);
    }

    const run = createRunExecution(compiled.spec, compiled.warnings);
    return reply.code(202).send({
      runId: run.id,
      status: run.status,
      warnings: compiled.warnings,
      manifest: run.spec.manifest
    });
  });

  app.post<{ Params: { id: string } }>("/runs/:id/retry", async (request, reply) => {
    const run = retryRun(request.params.id);
    if (!run) {
      return reply.code(404).send({ message: "Run not found" });
    }

    return { run };
  });

  app.post<{ Params: { id: string } }>("/runs/:id/cancel", async (request, reply) => {
    const run = cancelRun(request.params.id);
    if (!run) {
      return reply.code(404).send({ message: "Run not found" });
    }

    return { run };
  });

  app.get<{ Params: { id: string } }>("/runs/:id/events", async (request, reply) => {
    const run = getRun(request.params.id);
    if (!run) {
      return reply.code(404).send({ message: "Run not found" });
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8"
    });
    reply.raw.write(`event: snapshot\ndata: ${JSON.stringify({ run })}\n\n`);

    const heartbeat = setInterval(() => {
      reply.raw.write(": heartbeat\n\n");
    }, 15000);
    const unsubscribe = subscribeRunEvents(request.params.id, ({ event }) => {
      const nextRun = getRun(request.params.id);
      reply.raw.write(
        `event: run-event\ndata: ${JSON.stringify({ event, run: nextRun })}\n\n`
      );
    });

    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.get<{ Params: { id: string; fileName: string } }>(
    "/runs/:id/artifacts/:fileName",
    async (request, reply) => {
      const store = getArtifactStore();
      if (!store) {
        return reply.code(404).send({ message: "Artifact store is not configured" });
      }

      try {
        const artifact = await store.read(request.params.id, request.params.fileName);
        return reply.header("content-type", artifact.contentType).send(artifact.body);
      } catch {
        return reply.code(404).send({ message: "Artifact not found" });
      }
    }
  );

  app.get<{ Params: { id: string } }>(
    "/runs/:id/export.json",
    async (request, reply) => {
      const run = getRun(request.params.id);
      if (!run) {
        return reply.code(404).send({ message: "Run not found" });
      }
      if (!isExportable(run)) {
        return reply.code(409).send({ message: "Run is not ready to export" });
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
      if (!isExportable(run)) {
        return reply.code(409).send({ message: "Run is not ready to export" });
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

  app.get<{ Params: { id: string } }>(
    "/runs/:id/manifest.json",
    async (request, reply) => {
      const run = getRun(request.params.id);
      if (!run) {
        return reply.code(404).send({ message: "Run not found" });
      }
      if (!isExportable(run)) {
        return reply.code(409).send({ message: "Run is not ready to export" });
      }

      return reply
        .header("content-type", "application/json; charset=utf-8")
        .header("content-disposition", `attachment; filename="${run.id}-manifest.json"`)
        .send(run.spec.manifest);
    }
  );

  app.get<{ Params: { id: string } }>("/runs/:id/spec.json", async (request, reply) => {
    const run = getRun(request.params.id);
    if (!run) {
      return reply.code(404).send({ message: "Run not found" });
    }

    return reply
      .header("content-type", "application/json; charset=utf-8")
      .header("content-disposition", `attachment; filename="${run.id}-spec.json"`)
      .send(run.spec);
  });

  app.get<{ Params: { id: string } }>("/runs/:id", async (request, reply) => {
    const run = getRun(request.params.id);
    if (!run) {
      return reply.code(404).send({ message: "Run not found" });
    }

    return run;
  });
}

function isExportable(run: NonNullable<ReturnType<typeof getRun>>) {
  return run.status === "succeeded" || run.status === "waiting_human";
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
