import type { FastifyInstance } from "fastify";
import type { ApiProviderModel } from "@eval/workflow-schema";
import { ApiProviderInputSchema, ApiProviderPatchSchema } from "@eval/workflow-schema";
import {
  createApiProvider,
  deleteApiProvider,
  getApiProvider,
  getApiProviderSecret,
  listApiProviders,
  testApiProviderConnection,
  updateApiProvider
} from "../lib/store";
import { SecretStorageUnavailableError } from "../lib/secretErrors";
import {
  discoverProviderModels,
  ProviderModelDiscoveryError
} from "../services/providerModelDiscovery";

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

    try {
      const provider = createApiProvider(parsed.data);
      return reply.code(201).send({ provider });
    } catch (error) {
      if (error instanceof SecretStorageUnavailableError) {
        return reply.code(409).send({ message: error.message });
      }
      throw error;
    }
  });

  app.patch<{ Params: { id: string } }>("/providers/:id", async (request, reply) => {
    const parsed = ApiProviderPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send({
        message: "Invalid provider patch",
        issues: parsed.error.issues
      });
    }

    let provider;
    try {
      provider = updateApiProvider(request.params.id, parsed.data);
    } catch (error) {
      if (error instanceof SecretStorageUnavailableError) {
        return reply.code(409).send({ message: error.message });
      }
      throw error;
    }
    if (!provider) {
      return reply.code(404).send({ message: "Provider not found" });
    }

    return { provider };
  });

  app.delete<{ Params: { id: string } }>("/providers/:id", async (request, reply) => {
    if (!deleteApiProvider(request.params.id)) {
      return reply.code(404).send({ message: "Provider not found" });
    }

    return reply.code(204).send();
  });

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

  app.post<{ Params: { id: string } }>(
    "/providers/:id/models",
    async (request, reply) => {
      const secret = getApiProviderSecret(request.params.id);
      if (!secret) {
        return reply.code(404).send({ message: "Provider not found" });
      }

      try {
        const discovery = await discoverProviderModels(
          secret.provider,
          secret.apiKey
        );
        const models = mergeProviderModels(secret.provider.models, discovery.models);
        const provider = updateApiProvider(request.params.id, { models });
        if (!provider) {
          return reply.code(404).send({ message: "Provider not found" });
        }

        return {
          addedModelCount: models.length - secret.provider.models.length,
          models: discovery.models,
          provider,
          sourceUrl: discovery.sourceUrl,
          totalRemoteModelCount: discovery.responseModelCount
        };
      } catch (error) {
        if (error instanceof ProviderModelDiscoveryError) {
          return reply.code(statusForModelDiscoveryError(error.code)).send({
            code: error.code,
            message: error.message
          });
        }
        throw error;
      }
    }
  );
}

function mergeProviderModels(
  existingModels: ApiProviderModel[],
  discoveredModels: ApiProviderModel[]
) {
  const seen = new Set(existingModels.map((model) => model.id.toLowerCase()));
  const newModels = discoveredModels
    .filter((model) => {
      const key = model.id.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  return [...existingModels, ...newModels];
}

function statusForModelDiscoveryError(code: string) {
  switch (code) {
    case "provider_base_url_invalid":
      return 422;
    case "provider_credential_missing":
      return 409;
    default:
      return 502;
  }
}
