import type { FastifyInstance } from "fastify";
import { nodeDefinitions, starterWorkflowDraft } from "@eval/workflow-schema";
import { getWorkflow, listWorkflows, saveWorkflow } from "../lib/inMemoryStore";
import { compileWorkflow } from "../services/workflowCompiler";

export async function registerWorkflowRoutes(app: FastifyInstance) {
  app.get("/node-catalog", async () => ({ nodes: nodeDefinitions }));

  app.get("/workflows/starter", async () => starterWorkflowDraft);

  app.get("/workflows", async () => ({ workflows: listWorkflows() }));

  app.get<{ Params: { id: string } }>("/workflows/:id", async (request, reply) => {
    const workflow = getWorkflow(request.params.id);
    if (!workflow) {
      return reply.code(404).send({ message: "Workflow not found" });
    }

    return workflow;
  });

  app.post("/workflows", async (request, reply) => {
    const compiled = compileWorkflow(request.body);
    if (!compiled.ok) {
      return reply.code(422).send(compiled);
    }

    const workflow = saveWorkflow(request.body as never);
    return reply.code(201).send({ workflow, compiled });
  });

  app.post("/workflows/compile", async (request, reply) => {
    const compiled = compileWorkflow(request.body);
    return reply.code(compiled.ok ? 200 : 422).send(compiled);
  });
}
