import {
  apiProviderCapabilitiesForModelType,
  inferApiProviderModelType,
  inferApiProviderModelVendor,
  type ApiProvider,
  type ApiProviderModel
} from "@eval/workflow-schema";

type DiscoveredModel = {
  id: string;
  name: string;
  type?: string;
  vendor?: string;
};

export type ProviderModelDiscoveryResult = {
  models: ApiProviderModel[];
  responseModelCount: number;
  sourceUrl: string;
};

export class ProviderModelDiscoveryError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ProviderModelDiscoveryError";
  }
}

export async function discoverProviderModels(
  provider: ApiProvider,
  apiKey: string | undefined
): Promise<ProviderModelDiscoveryResult> {
  const trimmedApiKey = apiKey?.trim();
  if (!trimmedApiKey) {
    throw new ProviderModelDiscoveryError(
      "provider_credential_missing",
      "Save an API key before fetching models."
    );
  }

  const sourceUrl = modelListUrl(provider.baseUrl);
  let response: Response;
  try {
    response = await fetch(sourceUrl, {
      headers: modelListHeaders(provider, trimmedApiKey),
      method: "GET"
    });
  } catch {
    throw new ProviderModelDiscoveryError(
      "provider_model_fetch_failed",
      "Could not reach the provider models endpoint."
    );
  }

  if (!response.ok) {
    const detail = await responseErrorDetail(response);
    throw new ProviderModelDiscoveryError(
      "provider_model_fetch_failed",
      `Model discovery failed with HTTP ${response.status}${
        detail ? `: ${detail}` : "."
      }`
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderModelDiscoveryError(
      "provider_model_response_invalid",
      "The provider models endpoint did not return JSON."
    );
  }

  const discoveredModels = extractDiscoveredModels(payload);
  if (discoveredModels.length === 0) {
    throw new ProviderModelDiscoveryError(
      "provider_model_response_empty",
      "The provider models endpoint did not return any model IDs."
    );
  }

  return {
    models: discoveredModels.map((model) => {
      const type = inferApiProviderModelType(model.id, model.name, model.type);
      return {
        id: model.id,
        name: model.name,
        enabled: true,
        vendor: inferApiProviderModelVendor(model.id, model.name, model.vendor),
        type,
        capabilities: apiProviderCapabilitiesForModelType(type),
        estimatedCostPerImageUsd: 0.03,
        estimatedLatencyMs: 4000
      };
    }),
    responseModelCount: discoveredModels.length,
    sourceUrl
  };
}

function modelListUrl(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new ProviderModelDiscoveryError(
      "provider_base_url_invalid",
      "Base URL is required before fetching models."
    );
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ProviderModelDiscoveryError(
      "provider_base_url_invalid",
      "Base URL must be a valid http(s) URL before fetching models."
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ProviderModelDiscoveryError(
      "provider_base_url_invalid",
      "Base URL must use http or https before fetching models."
    );
  }

  if (url.pathname.endsWith("/models")) {
    return url.toString();
  }

  url.pathname = `${url.pathname.replace(/\/+$/, "")}/models`;
  return url.toString();
}

function modelListHeaders(provider: ApiProvider, apiKey: string) {
  const headers: Record<string, string> = {
    Accept: "application/json"
  };

  if (provider.protocol === "anthropic-messages") {
    headers["anthropic-version"] = "2023-06-01";
    headers["x-api-key"] = apiKey;
    return headers;
  }

  headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

function extractDiscoveredModels(payload: unknown): DiscoveredModel[] {
  const rawModels = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.data)
      ? payload.data
      : [];
  const seen = new Set<string>();
  const models: DiscoveredModel[] = [];

  for (const rawModel of rawModels) {
    const model = discoveredModelFromRaw(rawModel);
    if (!model) {
      continue;
    }

    const dedupeKey = model.id.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    models.push(model);
  }

  return models;
}

function discoveredModelFromRaw(rawModel: unknown): DiscoveredModel | undefined {
  if (typeof rawModel === "string") {
    const id = rawModel.trim();
    return id ? { id, name: id } : undefined;
  }

  if (!isRecord(rawModel)) {
    return undefined;
  }

  const id =
    stringField(rawModel, "id") ??
    stringField(rawModel, "model") ??
    stringField(rawModel, "name");
  if (!id) {
    return undefined;
  }

  const type = stringField(rawModel, "type");
  const vendor =
    stringField(rawModel, "owned_by") ??
    stringField(rawModel, "owner") ??
    stringField(rawModel, "provider") ??
    stringField(rawModel, "vendor");

  return {
    id,
    name:
      stringField(rawModel, "display_name") ??
      stringField(rawModel, "displayName") ??
      stringField(rawModel, "name") ??
      id,
    ...(type ? { type } : {}),
    ...(vendor ? { vendor } : {})
  };
}

async function responseErrorDetail(response: Response) {
  try {
    const text = await response.text();
    return text.replace(/\s+/g, " ").trim().slice(0, 240);
  } catch {
    return "";
  }
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
