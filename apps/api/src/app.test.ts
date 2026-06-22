import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { starterWorkflowDraft } from "@eval/workflow-schema";
import { createApiApp, desktopAuthCookieName } from "./app";
import { createSqliteStore } from "./lib/sqliteStore";
import { configureStore, resetStoreForTests } from "./lib/store";

const tempDirs: string[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  resetStoreForTests();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { force: true, recursive: true });
    }
  }
});

describe("createApiApp", () => {
  it("serves health and API routes", async () => {
    const app = await createApiApp({ corsOrigin: false });

    const health = await app.inject({ method: "GET", url: "/health" });
    const providers = await app.inject({ method: "GET", url: "/api/providers" });

    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ ok: true, service: "@eval/api" });
    expect(providers.statusCode).toBe(200);
    expect(providers.json()).toHaveProperty("providers");

    await app.close();
  });

  it("requires the desktop auth cookie for API routes", async () => {
    const token = "desktop-test-token";
    const app = await createApiApp({
      corsOrigin: false,
      desktopAuth: { token }
    });

    const unauthorized = await app.inject({ method: "GET", url: "/api/providers" });
    const authorized = await app.inject({
      method: "GET",
      url: "/api/providers",
      headers: {
        cookie: `${desktopAuthCookieName}=${encodeURIComponent(token)}`
      }
    });

    expect(unauthorized.statusCode).toBe(401);
    expect(authorized.statusCode).toBe(200);

    await app.close();
  });

  it("rejects malformed desktop auth cookies as unauthorized", async () => {
    const app = await createApiApp({
      corsOrigin: false,
      desktopAuth: { token: "desktop-test-token" }
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/providers",
      headers: {
        cookie: `${desktopAuthCookieName}=%E0%A4%A`
      }
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it("returns a clear error when desktop secure storage cannot save API keys", async () => {
    const dir = mkdtempSync(join(tmpdir(), "eval-api-app-"));
    tempDirs.push(dir);
    const store = createSqliteStore({
      databasePath: join(dir, "eval.sqlite"),
      secretCodec: {
        decrypt: (value) => value,
        encrypt: (value) => value,
        isAvailable: () => false,
        unavailableMessage: "Secure storage is disabled for this test."
      }
    });
    configureStore(store);
    const app = await createApiApp({ corsOrigin: false });

    const response = await app.inject({
      method: "POST",
      url: "/api/providers",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        label: "Blocked Provider",
        protocol: "openai-responses",
        imageProvider: "openai",
        baseUrl: "https://api.openai.com/v1",
        enabled: true,
        apiKey: "sk-blocked-secret",
        models: []
      })
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      message: "Secure storage is disabled for this test."
    });

    await app.close();
    store.close();
  });

  it("creates a failed run with explicit preflight blockers when providers are missing credentials", async () => {
    const app = await createApiApp({ corsOrigin: false });

    const response = await app.inject({
      method: "POST",
      url: "/api/runs",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify(starterWorkflowDraft)
    });

    expect(response.statusCode).toBe(202);
    const body = response.json() as { runId: string; status: string };
    expect(body.status).toBe("failed");

    const runResponse = await app.inject({
      method: "GET",
      url: `/api/runs/${body.runId}`
    });
    const run = runResponse.json();
    expect(run.status).toBe("failed");
    expect(
      run.events.some((event: { message: string }) =>
        event.message.includes("needs a valid API key")
      )
    ).toBe(true);

    await app.close();
  });

  it("fetches and merges models from a saved OpenAI-compatible provider", async () => {
    const app = await createApiApp({ corsOrigin: false });
    await app.inject({
      method: "PATCH",
      url: "/api/providers/openai-responses",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        apiKey: "sk-test-local",
        baseUrl: "https://gateway.example/v1",
        models: [model("gpt-image", "GPT Image")]
      })
    });
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              { id: "gpt-image", owned_by: "openai", type: "image" },
              { id: "claude-3-5-sonnet", owned_by: "anthropic", type: "text" }
            ]
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200
          }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.inject({
      method: "POST",
      url: "/api/providers/openai-responses/models"
    });

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.example/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test-local"
        }),
        method: "GET"
      })
    );
    expect(response.json()).toMatchObject({
      addedModelCount: 1,
      totalRemoteModelCount: 2,
      provider: {
        models: [
          { id: "gpt-image", name: "GPT Image" },
          {
            id: "claude-3-5-sonnet",
            name: "claude-3-5-sonnet",
            vendor: "Anthropic",
            type: "text",
            capabilities: ["text-generation"]
          }
        ]
      }
    });

    await app.close();
  });

  it("queues a configured run and advances it to the human review gate", async () => {
    const app = await createApiApp({ corsOrigin: false });
    await app.inject({
      method: "PATCH",
      url: "/api/providers/openai-responses",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        apiKey: "sk-test-local",
        models: [
          model("gpt-image", "GPT Image"),
          model("imagen", "Imagen"),
          model("flux", "FLUX"),
          model("sdxl", "SDXL")
        ]
      })
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/runs",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify(starterWorkflowDraft)
    });

    expect(response.statusCode).toBe(202);
    const body = response.json() as { runId: string; status: string };
    expect(body.status).toBe("queued");

    const run = await waitForRun(app, body.runId, (candidate) =>
      ["waiting_human", "succeeded", "failed"].includes(candidate.status)
    );

    expect(run.status).toBe("waiting_human");
    expect(run.artifacts).toHaveLength(8);
    expect(run.scores).toHaveLength(64);
    expect(run.reviews).toHaveLength(0);
    expect(run.tasks.map((task) => [task.kind, task.status])).toEqual([
      ["generation", "succeeded"],
      ["metric", "succeeded"],
      ["human_review", "running"],
      ["aggregation", "queued"],
      ["release_gate", "queued"]
    ]);

    await app.close();
  });
});

function model(id: string, name: string) {
  return {
    id,
    name,
    enabled: true,
    capabilities: ["image-generation"],
    estimatedCostPerImageUsd: 0.01,
    estimatedLatencyMs: 1000
  };
}

async function waitForRun(
  app: Awaited<ReturnType<typeof createApiApp>>,
  runId: string,
  predicate: (run: {
    artifacts: unknown[];
    reviews: unknown[];
    scores: unknown[];
    status: string;
    tasks: Array<{ kind: string; status: string }>;
  }) => boolean
) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await app.inject({
      method: "GET",
      url: `/api/runs/${runId}`
    });
    const run = response.json() as {
      artifacts: unknown[];
      reviews: unknown[];
      scores: unknown[];
      status: string;
      tasks: Array<{ kind: string; status: string }>;
    };
    if (predicate(run)) {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Run ${runId} did not reach the expected state.`);
}
