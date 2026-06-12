import type { FastifyInstance } from "fastify";
import {
  ApiProviderInputSchema,
  ApiProviderPatchSchema
} from "@eval/workflow-schema";
import {
  createApiProvider,
  deleteApiProvider,
  getApiProvider,
  listApiProviders,
  testApiProviderConnection,
  updateApiProvider
} from "../lib/inMemoryStore";

export async function registerProviderRoutes(app: FastifyInstance) {
  app.get("/providers", async () => ({ providers: listApiProviders() }));

  app.get<{ Params: { id: string } }>("/providers/:id", async (request, reply) => {
    const provider = getApiProvider(request.params.id);
    if (!provider) {
      return reply.code(404).send({ message: "Provider not found" });
    }

    return { provider };
  });

  app.post("/providers", async (request, reply) => {
    const parsed = ApiProviderInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send({
        message: "Invalid provider payload",
        issues: parsed.error.issues
      });
    }

    const provider = createApiProvider(parsed.data);
    return reply.code(201).send({ provider });
  });

  app.patch<{ Params: { id: string } }>(
    "/providers/:id",
    async (request, reply) => {
      const parsed = ApiProviderPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(422).send({
          message: "Invalid provider patch",
          issues: parsed.error.issues
        });
      }

      const provider = updateApiProvider(request.params.id, parsed.data);
      if (!provider) {
        return reply.code(404).send({ message: "Provider not found" });
      }

      return { provider };
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/providers/:id",
    async (request, reply) => {
      if (!deleteApiProvider(request.params.id)) {
        return reply.code(404).send({ message: "Provider not found" });
      }

      return reply.code(204).send();
    }
  );

  app.post<{ Params: { id: string } }>(
    "/providers/:id/test",
    async (request, reply) => {
      const provider = testApiProviderConnection(request.params.id);
      if (!provider) {
        return reply.code(404).send({ message: "Provider not found" });
      }

      return { provider };
    }
  );
}
