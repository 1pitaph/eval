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
          `${job.model} needs a valid API key before generation can start.`,
          false
        );
      }
      if (!isOpenAiImageCompatible(secret.provider)) {
        throw new AdapterExecutionError(
          "provider_not_supported",
          `${secret.provider.label} is not configured as an OpenAI-compatible image provider for ${job.model}.`,
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
          source: "openai-compatible-live-adapter"
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
  const normalizedModel = job.model.toLowerCase();
  return providerSecrets.find(
    (secret) =>
      secret.provider.models.some(
        (model) => {
          const normalizedId = model.id.toLowerCase();
          const normalizedName = model.name.toLowerCase();
          return (
            model.enabled &&
            model.capabilities.includes("image-generation") &&
            (normalizedId === normalizedModel || normalizedName === normalizedModel)
          );
        }
      )
  );
}

function isOpenAiImageCompatible(provider: ApiProvider) {
  return (
    provider.protocol === "openai-responses" &&
    (provider.imageProvider === "openai" || provider.imageProvider === "custom")
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
    const details = await safeResponseText(response);
    throw new AdapterExecutionError(
      `provider_http_${response.status}`,
      `Image generation failed with HTTP ${response.status}${
        details ? `: ${details}` : "."
      }`,
      response.status === 429 || response.status >= 500
    );
  }

  const payload = (await response.json()) as {
    data?: Array<{ b64_json?: string; image?: string; url?: string }>;
    output?: Array<{ result?: string; type?: string }>;
    url?: string;
  };
  const image = payload.data?.[0];
  if (image?.b64_json) {
    return `data:image/png;base64,${image.b64_json}`;
  }
  if (image?.image) {
    return normalizeImagePayload(image.image);
  }
  if (image?.url) {
    return image.url;
  }
  if (payload.url) {
    return payload.url;
  }
  const outputImage = payload.output?.find(
    (candidate) => candidate.type === "image" && candidate.result
  );
  if (outputImage?.result) {
    return normalizeImagePayload(outputImage.result);
  }

  throw new AdapterExecutionError(
    "provider_response_invalid",
    "Image generation response did not include an image URL or base64 image.",
    true
  );
}

function normalizeImagePayload(value: string) {
  if (
    value.startsWith("data:") ||
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("blob:")
  ) {
    return value;
  }

  return `data:image/png;base64,${value}`;
}

async function safeResponseText(response: Response) {
  try {
    const text = await response.text();
    return text.trim().slice(0, 240);
  } catch {
    return "";
  }
}
