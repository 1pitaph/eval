import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { starterWorkflowDraft } from "@eval/workflow-schema";
import { createQueuedEvalRun, planEvalTasks } from "../services/runPlanner";
import { compileWorkflow } from "../services/workflowCompiler";
import { createSqliteStore, type SecretCodec } from "./sqliteStore";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { force: true, recursive: true });
    }
  }
});

describe("createSqliteStore", () => {
  it("persists workflows and provider metadata across restarts", () => {
    const { databasePath, secretCodec } = sqliteFixture();
    const store = createSqliteStore({ databasePath, secretCodec });

    const workflow = store.saveWorkflow(starterWorkflowDraft);
    const provider = store.createApiProvider({
      label: "Desktop Secret Provider",
      protocol: "openai-responses",
      imageProvider: "openai",
      baseUrl: "https://api.openai.com/v1",
      enabled: true,
      apiKey: "sk-test-secret-123456",
      models: [
        {
          id: "desktop-image",
          name: "Desktop Image",
          enabled: true,
          capabilities: ["image-generation"],
          estimatedCostPerImageUsd: 0.02,
          estimatedLatencyMs: 3000
        }
      ]
    });

    expect(provider.credential).toMatchObject({
      maskedKey: "sk-t****3456",
      status: "configured"
    });
    expect(JSON.stringify(provider)).not.toContain("apiKey");
    expect(JSON.stringify(provider)).not.toContain("encryptedApiKey");
    store.close();

    const reopened = createSqliteStore({ databasePath, secretCodec });
    expect(reopened.getWorkflow(workflow.id)?.name).toBe(starterWorkflowDraft.name);
    const persistedProvider = reopened.getApiProvider(provider.id);
    expect(persistedProvider?.credential).toMatchObject({
      maskedKey: "sk-t****3456",
      status: "configured"
    });
    expect(JSON.stringify(persistedProvider)).not.toContain("apiKey");
    expect(JSON.stringify(persistedProvider)).not.toContain("encryptedApiKey");
    expect(readFileSync(databasePath).toString("utf8")).not.toContain(
      "sk-test-secret-123456"
    );
    reopened.close();
  });

  it("persists provider deletion without re-seeding defaults on restart", () => {
    const { databasePath, secretCodec } = sqliteFixture();
    const store = createSqliteStore({ databasePath, secretCodec });

    for (const provider of store.listApiProviders()) {
      expect(store.deleteApiProvider(provider.id)).toBe(true);
    }
    expect(store.listApiProviders()).toHaveLength(0);
    store.close();

    const reopened = createSqliteStore({ databasePath, secretCodec });
    expect(reopened.listApiProviders()).toHaveLength(0);
    reopened.close();
  });

  it("updates, clears, and redacts provider API keys", () => {
    const { databasePath, secretCodec } = sqliteFixture();
    const store = createSqliteStore({ databasePath, secretCodec });
    const provider = store.createApiProvider({
      label: "Patchable Provider",
      protocol: "openai-responses",
      imageProvider: "openai",
      baseUrl: "https://api.openai.com/v1",
      enabled: true,
      models: []
    });

    const configured = store.updateApiProvider(provider.id, {
      apiKey: "sk-new-secret-abcdef"
    });
    expect(configured?.credential).toMatchObject({
      maskedKey: "sk-n****cdef",
      status: "configured"
    });
    expect(JSON.stringify(configured)).not.toContain("encryptedApiKey");
    expect(readFileSync(databasePath).toString("utf8")).not.toContain(
      "sk-new-secret-abcdef"
    );

    const cleared = store.updateApiProvider(provider.id, { apiKey: "" });
    expect(cleared?.credential).toMatchObject({ status: "not_configured" });
    expect(cleared?.credential).not.toHaveProperty("maskedKey");
    store.close();
  });

  it("marks stored credentials invalid when secure storage becomes unavailable", () => {
    const { databasePath, secretCodec, secretState } = sqliteFixture();
    const store = createSqliteStore({ databasePath, secretCodec });
    const provider = store.createApiProvider({
      label: "Unavailable Later Provider",
      protocol: "openai-responses",
      imageProvider: "openai",
      baseUrl: "https://api.openai.com/v1",
      enabled: true,
      apiKey: "sk-later-secret",
      models: []
    });
    store.close();

    secretState.available = false;
    const reopened = createSqliteStore({ databasePath, secretCodec });
    const tested = reopened.testApiProviderConnection(provider.id);
    expect(tested?.credential).toMatchObject({
      status: "invalid",
      message: "Test secure storage unavailable."
    });
    reopened.close();
  });

  it("rejects API key persistence when secure storage is unavailable", () => {
    const { databasePath } = sqliteFixture();
    const store = createSqliteStore({
      databasePath,
      secretCodec: {
        decrypt: (value) => value,
        encrypt: (value) => value,
        isAvailable: () => false,
        unavailableMessage: "Test secure storage unavailable."
      }
    });

    expect(() =>
      store.createApiProvider({
        label: "Blocked Secret Provider",
        protocol: "openai-responses",
        imageProvider: "openai",
        baseUrl: "https://api.openai.com/v1",
        enabled: true,
        apiKey: "sk-blocked-secret",
        models: []
      })
    ).toThrow("Test secure storage unavailable.");
    store.close();
  });

  it("persists queued eval runs and tasks across restarts", () => {
    const { databasePath, secretCodec } = sqliteFixture();
    const store = createSqliteStore({ databasePath, secretCodec });
    const compiled = compileWorkflow(starterWorkflowDraft, store.listApiProviders());
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) {
      throw new Error("Starter workflow did not compile.");
    }

    const now = "2026-06-17T00:00:00.000Z";
    const run = createQueuedEvalRun(compiled.spec, [], now, "run-sqlite-test");
    const tasks = planEvalTasks(compiled.spec, run.id, now);
    store.createRun({ ...run, tasks });
    store.close();

    const reopened = createSqliteStore({ databasePath, secretCodec });
    const persisted = reopened.getRun(run.id);
    expect(persisted?.status).toBe("queued");
    expect(persisted?.tasks.map((task) => task.kind)).toEqual([
      "generation",
      "metric",
      "human_review",
      "aggregation",
      "release_gate"
    ]);

    const generation = persisted?.tasks[0];
    if (!generation) {
      throw new Error("Generation task missing.");
    }
    reopened.updateEvalTask({
      ...generation,
      status: "running",
      attempt: 1,
      updatedAt: now,
      startedAt: now
    });
    expect(reopened.getRun(run.id)?.tasks[0]?.status).toBe("running");
    reopened.close();
  });
});

function sqliteFixture() {
  const dir = mkdtempSync(join(tmpdir(), "eval-sqlite-store-"));
  tempDirs.push(dir);
  const secretState = { available: true };
  const secretCodec: SecretCodec = {
    decrypt: (value) => Buffer.from(value, "base64").toString("utf8"),
    encrypt: (value) => Buffer.from(`encrypted:${value}`, "utf8").toString("base64"),
    isAvailable: () => secretState.available,
    unavailableMessage: "Test secure storage unavailable."
  };

  return {
    databasePath: join(dir, "eval.sqlite"),
    secretCodec,
    secretState
  };
}
