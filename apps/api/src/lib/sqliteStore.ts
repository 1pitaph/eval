import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { nanoid } from "nanoid";
import {
  apiProviderCapabilitiesForModelType,
  inferApiProviderModelType,
  inferApiProviderModelVendor,
  type ApiProvider,
  type EvalTaskRecord,
  type EvalRunRecord,
  type PairwiseVote,
  type ReviewCampaign,
  type ReviewerSession,
  type ReviewLink,
  type ReviewTask,
  type WorkflowDraft
} from "@eval/workflow-schema";
import { runImageEvalSpec } from "../services/imageEvalRunner";
import { SecretStorageUnavailableError } from "./secretErrors";
import type { EvalStore } from "./store";

type StoredSqliteApiProvider = ApiProvider & {
  encryptedApiKey?: string;
};

export type SecretCodec = {
  decrypt(value: string): string;
  encrypt(value: string): string;
  isAvailable(): boolean;
  unavailableMessage?: string;
};

export type SqliteStoreOptions = {
  databasePath: string;
  secretCodec?: SecretCodec;
};

export type SqliteEvalStore = EvalStore & {
  close(): void;
};

export function createSqliteStore(options: SqliteStoreOptions): SqliteEvalStore {
  mkdirSync(dirname(options.databasePath), { recursive: true });
  const database = new DatabaseSync(options.databasePath);
  const codec = options.secretCodec;

  initialize(database);
  seedDefaultApiProviders(database);

  const store: SqliteEvalStore = {
    close: () => database.close(),
    saveWorkflow: (draft) => {
      const id = draft.id ?? nanoid();
      const record = { ...draft, id };
      put(database, "workflows", id, record);
      return record;
    },
    getWorkflow: (id) => get<WorkflowDraft & { id: string }>(database, "workflows", id),
    listWorkflows: () => list<WorkflowDraft & { id: string }>(database, "workflows"),
    saveRun: (spec) => {
      const id = nanoid();
      const record = runImageEvalSpec(
        spec,
        id,
        new Date().toISOString(),
        store.listApiProviders()
      );
      put(database, "runs", id, record);
      return record;
    },
    createRun: (run) => {
      put(database, "runs", run.id, run);
      for (const task of run.tasks) {
        put(database, "eval_tasks", task.id, task);
      }
      return withTasks(database, run);
    },
    saveImportedRun: (run) => {
      put(database, "runs", run.id, run);
      for (const task of run.tasks) {
        put(database, "eval_tasks", task.id, task);
      }
      return withTasks(database, run);
    },
    getRun: (id) => {
      const run = get<EvalRunRecord>(database, "runs", id);
      return run ? withTasks(database, run) : undefined;
    },
    updateRun: (run) => {
      put(database, "runs", run.id, run);
      return withTasks(database, run);
    },
    saveEvalTasks: (tasks) => {
      for (const task of tasks) {
        put(database, "eval_tasks", task.id, task);
      }
      return tasks;
    },
    getEvalTask: (id) => get<EvalTaskRecord>(database, "eval_tasks", id),
    listEvalTasks: () => list<EvalTaskRecord>(database, "eval_tasks"),
    listEvalTasksForRun: (runId) =>
      list<EvalTaskRecord>(database, "eval_tasks").filter(
        (task) => task.runId === runId
      ),
    updateEvalTask: (task) => {
      put(database, "eval_tasks", task.id, task);
      return task;
    },
    saveReviewCampaign: (campaign) => {
      put(database, "review_campaigns", campaign.id, campaign);
      return campaign;
    },
    getReviewCampaign: (id) => get<ReviewCampaign>(database, "review_campaigns", id),
    listReviewCampaigns: (runId) =>
      list<ReviewCampaign>(database, "review_campaigns").filter(
        (campaign) => campaign.runId === runId
      ),
    updateReviewCampaign: (campaign) => {
      put(database, "review_campaigns", campaign.id, campaign);
      return campaign;
    },
    saveReviewTasks: (tasks) => {
      for (const task of tasks) {
        put(database, "review_tasks", task.id, task);
      }
      return tasks;
    },
    getReviewTask: (id) => get<ReviewTask>(database, "review_tasks", id),
    listReviewTasks: (campaignId) =>
      list<ReviewTask>(database, "review_tasks").filter(
        (task) => task.campaignId === campaignId
      ),
    updateReviewTask: (task) => {
      put(database, "review_tasks", task.id, task);
      return task;
    },
    saveReviewLink: (link) => {
      put(database, "review_links", link.id, link);
      return link;
    },
    getReviewLink: (id) => get<ReviewLink>(database, "review_links", id),
    getReviewLinkByToken: (token) =>
      list<ReviewLink>(database, "review_links").find((link) => link.token === token),
    listReviewLinks: (campaignId) =>
      list<ReviewLink>(database, "review_links").filter(
        (link) => link.campaignId === campaignId
      ),
    updateReviewLink: (link) => {
      put(database, "review_links", link.id, link);
      return link;
    },
    saveReviewerSession: (session) => {
      put(database, "reviewer_sessions", session.id, session);
      return session;
    },
    getReviewerSession: (id) => get<ReviewerSession>(database, "reviewer_sessions", id),
    updateReviewerSession: (session) => {
      put(database, "reviewer_sessions", session.id, session);
      return session;
    },
    upsertPairwiseVote: (vote) => {
      const existing = list<PairwiseVote>(database, "pairwise_votes").find(
        (candidate) =>
          candidate.sessionId === vote.sessionId && candidate.taskId === vote.taskId
      );
      if (existing) {
        remove(database, "pairwise_votes", existing.id);
      }
      put(database, "pairwise_votes", vote.id, vote);
      return vote;
    },
    listPairwiseVotes: (campaignId) =>
      list<PairwiseVote>(database, "pairwise_votes").filter(
        (vote) => vote.campaignId === campaignId
      ),
    listPairwiseVotesForRun: (runId) =>
      list<PairwiseVote>(database, "pairwise_votes").filter(
        (vote) => vote.runId === runId
      ),
    listPairwiseVotesForSession: (sessionId) =>
      list<PairwiseVote>(database, "pairwise_votes").filter(
        (vote) => vote.sessionId === sessionId
      ),
    listApiProviders: () =>
      list<StoredSqliteApiProvider>(database, "api_providers").map(redactApiProvider),
    getApiProvider: (id) => {
      const provider = get<StoredSqliteApiProvider>(database, "api_providers", id);
      return provider ? redactApiProvider(provider) : undefined;
    },
    getApiProviderSecret: (id) => {
      const provider = get<StoredSqliteApiProvider>(database, "api_providers", id);
      if (!provider) {
        return undefined;
      }

      return {
        provider: redactApiProvider(provider),
        apiKey: decryptApiKey(codec, provider.encryptedApiKey)
      };
    },
    createApiProvider: (input) => {
      const now = new Date().toISOString();
      const encryptedApiKey = encryptApiKey(codec, input.apiKey);
      const record: StoredSqliteApiProvider = {
        id: uniqueProviderId(database, input.label),
        label: input.label.trim(),
        protocol: input.protocol,
        imageProvider: input.imageProvider,
        baseUrl: input.baseUrl.trim(),
        enabled: input.enabled,
        credential: credentialFromApiKey(input.apiKey),
        models: input.models.map(normalizeProviderModel),
        createdAt: now,
        updatedAt: now,
        ...(input.docsUrl ? { docsUrl: input.docsUrl } : {}),
        ...(encryptedApiKey ? { encryptedApiKey } : {})
      };

      put(database, "api_providers", record.id, record);
      return redactApiProvider(record);
    },
    updateApiProvider: (id, patch) => {
      const existing = get<StoredSqliteApiProvider>(database, "api_providers", id);
      if (!existing) {
        return undefined;
      }

      const next: StoredSqliteApiProvider = {
        ...existing,
        ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
        ...(patch.protocol !== undefined ? { protocol: patch.protocol } : {}),
        ...(patch.imageProvider !== undefined
          ? { imageProvider: patch.imageProvider }
          : {}),
        ...(patch.baseUrl !== undefined ? { baseUrl: patch.baseUrl.trim() } : {}),
        ...(patch.docsUrl !== undefined ? { docsUrl: patch.docsUrl } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.models !== undefined
          ? { models: patch.models.map(normalizeProviderModel) }
          : {}),
        updatedAt: new Date().toISOString()
      };

      if (patch.apiKey !== undefined) {
        const encryptedApiKey = encryptApiKey(codec, patch.apiKey);
        next.credential = credentialFromApiKey(patch.apiKey);
        if (encryptedApiKey) {
          next.encryptedApiKey = encryptedApiKey;
        } else {
          delete next.encryptedApiKey;
        }
      }
      if (patch.docsUrl === undefined && existing.docsUrl === undefined) {
        delete next.docsUrl;
      }

      put(database, "api_providers", id, next);
      return redactApiProvider(next);
    },
    deleteApiProvider: (id) => remove(database, "api_providers", id),
    testApiProviderConnection: (id) => {
      const existing = get<StoredSqliteApiProvider>(database, "api_providers", id);
      if (!existing) {
        return undefined;
      }

      const credentialCheck = encryptedApiKeyStatus(codec, existing.encryptedApiKey);
      const hasValidUrl = isValidHttpUrl(existing.baseUrl);
      const isValid = credentialCheck.available && hasValidUrl;
      const next: StoredSqliteApiProvider = {
        ...existing,
        credential: {
          status: isValid ? "valid" : "invalid",
          ...(existing.credential.maskedKey
            ? { maskedKey: existing.credential.maskedKey }
            : {}),
          lastTestedAt: new Date().toISOString(),
          message:
            credentialCheck.message ??
            (isValid
              ? "Connection settings look valid for mock execution."
              : "Add an API key and a valid http(s) base URL before using this provider.")
        },
        updatedAt: new Date().toISOString()
      };

      put(database, "api_providers", id, next);
      return redactApiProvider(next);
    }
  };

  return store;
}

function initialize(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS eval_kv (
      namespace TEXT NOT NULL,
      id TEXT NOT NULL,
      json TEXT NOT NULL,
      PRIMARY KEY (namespace, id)
    );

    CREATE TABLE IF NOT EXISTS eval_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    PRAGMA user_version = 1;
  `);
  database
    .prepare(
      "INSERT OR REPLACE INTO eval_meta (key, value) VALUES ('schema_version', '1')"
    )
    .run();
}

function metaValue(database: DatabaseSync, key: string): string | undefined {
  const row = database.prepare("SELECT value FROM eval_meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

function putMeta(database: DatabaseSync, key: string, value: string) {
  database
    .prepare("INSERT OR REPLACE INTO eval_meta (key, value) VALUES (?, ?)")
    .run(key, value);
}

function get<T>(database: DatabaseSync, namespace: string, id: string): T | undefined {
  const row = database
    .prepare("SELECT json FROM eval_kv WHERE namespace = ? AND id = ?")
    .get(namespace, id) as { json: string } | undefined;
  return row ? (JSON.parse(row.json) as T) : undefined;
}

function list<T>(database: DatabaseSync, namespace: string): T[] {
  return (
    database
      .prepare("SELECT json FROM eval_kv WHERE namespace = ? ORDER BY id")
      .all(namespace) as Array<{ json: string }>
  ).map((row) => JSON.parse(row.json) as T);
}

function put<T extends { id: string }>(
  database: DatabaseSync,
  namespace: string,
  id: string,
  value: T
) {
  database
    .prepare("INSERT OR REPLACE INTO eval_kv (namespace, id, json) VALUES (?, ?, ?)")
    .run(namespace, id, JSON.stringify(value));
}

function remove(database: DatabaseSync, namespace: string, id: string) {
  const result = database
    .prepare("DELETE FROM eval_kv WHERE namespace = ? AND id = ?")
    .run(namespace, id);
  return result.changes > 0;
}

function withTasks(database: DatabaseSync, run: EvalRunRecord): EvalRunRecord {
  return {
    ...run,
    tasks: list<EvalTaskRecord>(database, "eval_tasks").filter(
      (task) => task.runId === run.id
    )
  };
}

function seedDefaultApiProviders(database: DatabaseSync) {
  const providers = list<StoredSqliteApiProvider>(database, "api_providers");
  const defaultsSeeded = metaValue(database, "default_api_providers_seeded") === "true";
  if (providers.length > 0) {
    putMeta(database, "default_api_providers_seeded", "true");
    return;
  }
  if (defaultsSeeded) {
    return;
  }

  const now = new Date().toISOString();
  const defaults: StoredSqliteApiProvider[] = [
    {
      id: "openai-responses",
      label: "OpenAI Responses",
      protocol: "openai-responses",
      imageProvider: "openai",
      baseUrl: "https://api.openai.com/v1",
      docsUrl: "https://platform.openai.com/docs",
      enabled: true,
      credential: { status: "not_configured" },
      models: [
        {
          id: "gpt-image",
          name: "GPT Image",
          enabled: true,
          vendor: "OpenAI",
          type: "image",
          capabilities: ["image-generation"],
          estimatedCostPerImageUsd: 0.045,
          estimatedLatencyMs: 4200
        }
      ],
      createdAt: now,
      updatedAt: now
    },
    {
      id: "openai-chat-completions",
      label: "OpenAI Chat Completions",
      protocol: "openai-chat-completions",
      imageProvider: "openai",
      baseUrl: "https://api.openai.com/v1",
      docsUrl: "https://platform.openai.com/docs/api-reference/chat/create",
      enabled: false,
      credential: { status: "not_configured" },
      models: [],
      createdAt: now,
      updatedAt: now
    },
    {
      id: "anthropic-messages",
      label: "Anthropic Messages",
      protocol: "anthropic-messages",
      imageProvider: "custom",
      baseUrl: "https://api.anthropic.com/v1",
      docsUrl: "https://docs.anthropic.com/en/api/messages",
      enabled: false,
      credential: { status: "not_configured" },
      models: [],
      createdAt: now,
      updatedAt: now
    }
  ];

  for (const provider of defaults) {
    put(database, "api_providers", provider.id, provider);
  }
  putMeta(database, "default_api_providers_seeded", "true");
}

function encryptApiKey(codec: SecretCodec | undefined, apiKey: string | undefined) {
  const trimmed = apiKey?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (!codec?.isAvailable()) {
    throw new SecretStorageUnavailableError(codec?.unavailableMessage);
  }

  return codec.encrypt(trimmed);
}

function decryptApiKey(
  codec: SecretCodec | undefined,
  encryptedApiKey: string | undefined
) {
  if (!encryptedApiKey || !codec?.isAvailable()) {
    return undefined;
  }

  try {
    return codec.decrypt(encryptedApiKey);
  } catch {
    return undefined;
  }
}

function encryptedApiKeyStatus(
  codec: SecretCodec | undefined,
  encryptedApiKey: string | undefined
) {
  if (!encryptedApiKey) {
    return { available: false };
  }
  if (!codec?.isAvailable()) {
    return {
      available: false,
      message:
        codec?.unavailableMessage ??
        "Secure credential storage is unavailable. Re-enter the API key before using this provider."
    };
  }

  try {
    return { available: codec.decrypt(encryptedApiKey).trim().length > 0 };
  } catch {
    return {
      available: false,
      message:
        "Stored API key could not be decrypted. Re-enter the API key before using this provider."
    };
  }
}

function credentialFromApiKey(apiKey: string | undefined): ApiProvider["credential"] {
  const trimmed = apiKey?.trim();
  if (!trimmed) {
    return { status: "not_configured" };
  }

  return {
    status: "configured",
    maskedKey: maskApiKey(trimmed)
  };
}

function redactApiProvider(provider: StoredSqliteApiProvider): ApiProvider {
  return {
    id: provider.id,
    label: provider.label,
    protocol: provider.protocol,
    imageProvider: provider.imageProvider,
    baseUrl: provider.baseUrl,
    enabled: provider.enabled,
    credential: provider.credential,
    models: provider.models.map(normalizeProviderModel),
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
    ...(provider.docsUrl ? { docsUrl: provider.docsUrl } : {})
  };
}

function normalizeProviderModel(
  model: ApiProvider["models"][number]
): ApiProvider["models"][number] {
  const type = inferApiProviderModelType(
    model.id,
    model.name,
    (model as Partial<ApiProvider["models"][number]>).type
  );
  return {
    id: model.id.trim(),
    name: model.name.trim(),
    enabled: model.enabled,
    vendor: inferApiProviderModelVendor(
      model.id,
      model.name,
      (model as Partial<ApiProvider["models"][number]>).vendor
    ),
    type,
    capabilities:
      model.capabilities?.length > 0
        ? model.capabilities
        : apiProviderCapabilitiesForModelType(type),
    estimatedCostPerImageUsd: model.estimatedCostPerImageUsd,
    estimatedLatencyMs: Math.round(model.estimatedLatencyMs)
  };
}

function uniqueProviderId(database: DatabaseSync, label: string) {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "provider";
  let id = base;
  let index = 2;

  while (get<StoredSqliteApiProvider>(database, "api_providers", id)) {
    id = `${base}-${index}`;
    index += 1;
  }

  return id;
}

function maskApiKey(apiKey: string) {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) {
    return "****";
  }

  return `${trimmed.slice(0, 4)}****${trimmed.slice(-4)}`;
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
