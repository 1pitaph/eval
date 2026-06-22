import type {
  ApiProvider,
  EvalRunRecord,
  EvalRunSpec,
  ImageGenerationJob
} from "@eval/workflow-schema";
import { materializeRunArtifacts } from "./artifactStore";
import { runImageEvalSpec } from "./imageEvalRunner";

export type ProviderSecret = {
  apiKey?: string;
  provider: ApiProvider;
};

export type ImageGenerationAdapter = {
  id: string;
  generateRun(input: {
    apiProviders: ApiProvider[];
    createdAt: string;
    id: string;
    providerSecrets: ProviderSecret[];
    spec: EvalRunSpec;
  }): Promise<EvalRunRecord>;
};

export const mockImageGenerationAdapter: ImageGenerationAdapter = {
  id: "mock-local",
  generateRun: async ({ apiProviders, createdAt, id, spec }) =>
    materializeRunArtifacts(
      runImageEvalSpec(spec, id, createdAt, apiProviders, {
        includeMockHumanReviews: false
      })
    )
};

export const openAiImageGenerationAdapter: ImageGenerationAdapter = {
  id: "openai-live",
  generateRun: async ({ apiProviders, createdAt, id, providerSecrets, spec }) => {
    const generated = runImageEvalSpec(spec, id, createdAt, apiProviders, {
      includeMockHumanReviews: false
    });
    const artifacts = [];

    for (const artifact of generated.artifacts) {
      const job = generated.jobs.find((candidate) => candidate.id === artifact.jobId);
      if (!job) {
        artifacts.push(artifact);
        continue;
      }

      const secret = secretForJob(job, providerSecrets);
      if (!secret?.apiKey) {
        throw new AdapterExecutionError(
          "provider_credential_missing",
          `${job.provider} needs a valid API key before generation can start.`,
          false
        );
      }
      if (job.provider !== "openai") {
        throw new AdapterExecutionError(
          "provider_not_supported",
          `The live adapter currently supports OpenAI image providers only; "${job.provider}" is configured for ${job.model}.`,
          false
        );
      }

      const imageUri = await callOpenAiImages({
        apiKey: secret.apiKey,
        baseUrl: secret.provider.baseUrl,
        model: job.model,
        prompt: job.renderedPrompt
      });
      artifacts.push({
        ...artifact,
        uri: imageUri,
        thumbnailUri: imageUri,
        lineage: {
          ...artifact.lineage,
          source: "openai-live-adapter"
        }
      });
    }

    return materializeRunArtifacts({
      ...generated,
      artifacts
    });
  }
};

export function imageGenerationAdapterForEnvironment() {
  return process.env.EVAL_IMAGE_ADAPTER === "openai-live"
    ? openAiImageGenerationAdapter
    : mockImageGenerationAdapter;
}

export function assertProviderSecrets(providerSecrets: ProviderSecret[]) {
  const missing = providerSecrets.filter(
    (secret) =>
      !secret.apiKey ||
      (secret.provider.credential.status !== "configured" &&
        secret.provider.credential.status !== "valid")
  );

  if (missing.length > 0) {
    throw new AdapterExecutionError(
      "provider_credential_missing",
      `${missing.map((secret) => secret.provider.label).join(", ")} ${
        missing.length === 1 ? "needs" : "need"
      } a valid API key before generation can start.`,
      false
    );
  }
}

export class AdapterExecutionError extends Error {
  code: string;
  retryable: boolean;

  constructor(code: string, message: string, retryable = true) {
    super(message);
    this.name = "AdapterExecutionError";
    this.code = code;
    this.retryable = retryable;
  }
}

function secretForJob(job: ImageGenerationJob, providerSecrets: ProviderSecret[]) {
  return providerSecrets.find(
    (secret) =>
      secret.provider.imageProvider === job.provider &&
      secret.provider.models.some((model) => model.id === job.model)
  );
}

async function callOpenAiImages({
  apiKey,
  baseUrl,
  model,
  prompt
}: {
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
}) {
  const endpoint = new URL(
    `${baseUrl.replace(/\/$/, "")}/images/generations`
  ).toString();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: "1024x1024"
    })
  });

  if (!response.ok) {
    throw new AdapterExecutionError(
      `provider_http_${response.status}`,
      `OpenAI image generation failed with HTTP ${response.status}.`,
      response.status === 429 || response.status >= 500
    );
  }

  const payload = (await response.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const image = payload.data?.[0];
  if (image?.b64_json) {
    return `data:image/png;base64,${image.b64_json}`;
  }
  if (image?.url) {
    return image.url;
  }

  throw new AdapterExecutionError(
    "provider_response_invalid",
    "OpenAI image generation response did not include an image.",
    true
  );
}
