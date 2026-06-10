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

  app.get<{ Params: { id: string } }>("/runs/:id", async (request, reply) => {
    const run = getRun(request.params.id);
    if (!run) {
      return reply.code(404).send({ message: "Run not found" });
    }

    return run;
  });
}
