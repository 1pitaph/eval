import {
  getNodeDefinition,
  PromptCaseSchema,
  ReferenceImageSchema,
  type ApiProvider,
  type EvalSpecIssue,
  type EvalSpecManifest,
  type WorkflowDraft
} from "@eval/workflow-schema";

type ModelCostProfile = {
  provider: string;
  estimatedCostPerImageUsd: number;
  estimatedLatencyMs: number;
};

const promptSuiteSizes: Record<string, number> = {
  "golden-image-prompts-v1": 4
};

const defaultMetrics = [
  "vlm_rubric",
  "clip_siglip",
  "ocr",
  "nsfw",
  "blur",
  "aesthetic",
  "cost",
  "latency"
];

const metricCostsUsd: Record<string, number> = {
  vlm_rubric: 0.003,
  clip_siglip: 0.0004,
  ocr: 0.0003,
  nsfw: 0.0002,
  blur: 0.0001,
  aesthetic: 0.0015,
  cost: 0,
  latency: 0
};

const humanVoteCostUsd = 0.04;

export function buildEvalManifest(
  draft: WorkflowDraft,
  generatedAt: string,
  apiProviders: ApiProvider[] = []
): EvalSpecManifest {
  const datasetConfig = getNodeConfig(draft, "dataset.prompt_set");
  const promptTemplateConfig = getNodeConfig(draft, "prompt.template");
  const generationConfig = getNodeConfig(draft, "generation.model_fanout");
  const metricConfig = getNodeConfig(draft, "metric.auto_image");
  const humanConfig = getNodeConfig(draft, "human.pairwise");
  const aggregationConfig = getNodeConfig(draft, "aggregate.model_scores");
  const releaseConfig = getNodeConfig(draft, "decision.release_gate");

  const datasetId = stringConfig(datasetConfig.datasetId, "golden-image-prompts-v1");
  const inlinePrompts = promptCasesConfig(datasetConfig.inlinePrompts);
  const promptMode =
    datasetConfig.mode === "inline" || inlinePrompts.length > 0 ? "inline" : "dataset";
  const sampleLimit = clampInt(numberConfig(datasetConfig.sampleLimit, 4), 1, 10000);
  const promptCount =
    promptMode === "inline"
      ? Math.min(inlinePrompts.length, sampleLimit)
      : Math.min(promptSuiteSizes[datasetId] ?? sampleLimit, sampleLimit);
  const referenceImageCount =
    referenceImagesConfig(datasetConfig.referenceImages).length +
    inlinePrompts.reduce((count, prompt) => count + prompt.referenceImages.length, 0);
  const template = stringConfig(promptTemplateConfig.template, "{{prompt}}");
  const templatePreview = previewString(template, 160);
  const negativePrompt = optionalString(promptTemplateConfig.negativePrompt);
  const rawModels = stringArrayConfig(generationConfig.models, [
    "gpt-image",
    "imagen",
    "flux",
    "sdxl"
  ]);
  const models = rawModels.slice(0, 24);
  const samplesPerPrompt = clampInt(
    numberConfig(generationConfig.samplesPerPrompt, 1),
    1,
    16
  );
  const metrics = normalizeMetrics(metricConfig.metrics);
  const sampleRate = clampNumber(numberConfig(humanConfig.sampleRate, 0), 0, 1);
  const reviewersPerTask = clampInt(
    numberConfig(humanConfig.reviewersPerTask, 1),
    1,
    25
  );
  const blindMode = humanConfig.blindMode !== false;
  const rankingMethod = stringConfig(aggregationConfig.rankingMethod, "elo");
  const baselineRunId = stringConfig(
    releaseConfig.baselineRunId,
    "baseline-current-prod"
  );
  const minHumanWinRate = clampNumber(
    numberConfig(releaseConfig.minHumanWinRate, 0.55),
    0,
    1
  );
  const maxCostIncreasePct = Math.max(
    0,
    numberConfig(releaseConfig.maxCostIncreasePct, 20)
  );
  const safetyMustPass = releaseConfig.safetyMustPass !== false;
  const seedStrategy = stringConfig(generationConfig.seedStrategy, "fixed_by_prompt");

  const providers = models.map((model) => ({
    model,
    ...profileForModel(model, apiProviders),
    samplesPerPrompt
  }));
  const generationJobs = promptCount * providers.length * samplesPerPrompt;
  const metricChecks = generationJobs * metrics.length;
  const humanReviewTasks =
    sampleRate > 0
      ? Math.ceil(promptCount * Math.max(providers.length - 1, 1) * sampleRate)
      : 0;
  const estimatedVotes = humanReviewTasks * reviewersPerTask;
  const estimatedGenerationCostUsd = roundCurrency(
    promptCount *
      samplesPerPrompt *
      providers.reduce(
        (total, provider) => total + provider.estimatedCostPerImageUsd,
        0
      )
  );
  const estimatedMetricCostUsd = roundCurrency(
    generationJobs *
      metrics.reduce((total, metric) => total + (metricCostsUsd[metric] ?? 0.001), 0)
  );
  const estimatedHumanReviewCostUsd = roundCurrency(estimatedVotes * humanVoteCostUsd);
  const estimatedCostUsd = roundCurrency(
    estimatedGenerationCostUsd + estimatedMetricCostUsd + estimatedHumanReviewCostUsd
  );
  const estimatedProviderLatencyMs = Math.max(
    ...providers.map((provider) => provider.estimatedLatencyMs),
    0
  );
  const totalPlannedOperations =
    generationJobs + metricChecks + humanReviewTasks + estimatedVotes;
  const issues = manifestIssues({
    draft,
    estimatedCostUsd,
    generationBudgetUsd: optionalNumber(generationConfig.budgetUsd),
    metricBudgetUsd: optionalNumber(metricConfig.budgetUsd),
    generationJobs,
    metricChecks,
    humanReviewTasks,
    baselineRunId
  });

  return {
    version: "image-eval-manifest/v1",
    configFormat: "eval-studio-json",
    generatedAt,
    input: {
      datasetId,
      promptMode,
      sampleLimit,
      promptCount,
      referenceImageCount,
      template,
      templatePreview,
      ...(negativePrompt ? { negativePrompt } : {})
    },
    providers,
    metrics,
    humanReview: {
      enabled: humanReviewTasks > 0,
      mode: "pairwise",
      blindMode,
      sampleRate,
      reviewersPerTask,
      estimatedTasks: humanReviewTasks,
      estimatedVotes
    },
    aggregation: {
      rankingMethod,
      releaseGate: {
        baselineRunId,
        minHumanWinRate,
        maxCostIncreasePct,
        safetyMustPass
      }
    },
    runtime: {
      maxConcurrency: 4,
      repeat: 1,
      cache: true,
      seedStrategy
    },
    matrix: {
      promptCount,
      modelCount: providers.length,
      samplesPerPrompt,
      generationJobs,
      metricChecks,
      humanReviewTasks,
      totalPlannedOperations,
      estimatedGenerationCostUsd,
      estimatedMetricCostUsd,
      estimatedHumanReviewCostUsd,
      estimatedCostUsd,
      estimatedProviderLatencyMs
    },
    issues,
    exportHints: {
      configAsCode: true,
      ciRunnable: true,
      secretsPolicy:
        "Store provider credentials in secret profiles or environment variables; keep the eval manifest free of raw API keys."
    }
  };
}

function getNodeConfig(draft: WorkflowDraft, type: string) {
  return draft.nodes.find((node) => node.type === type)?.data.config ?? {};
}

function profileForModel(
  model: string,
  apiProviders: ApiProvider[] = []
): ModelCostProfile {
  const configured = findConfiguredModel(model, apiProviders);
  if (configured) {
    return {
      provider: configured.provider.id,
      estimatedCostPerImageUsd: configured.model.estimatedCostPerImageUsd,
      estimatedLatencyMs: configured.model.estimatedLatencyMs
    };
  }

  const normalized = model.toLowerCase();
  if (normalized.includes("imagen") || normalized.includes("google")) {
    return {
      provider: "google-imagen",
      estimatedCostPerImageUsd: 0.038,
      estimatedLatencyMs: 4700
    };
  }
  if (normalized.includes("flux") || normalized.includes("fal")) {
    return {
      provider: "fal",
      estimatedCostPerImageUsd: 0.024,
      estimatedLatencyMs: 3100
    };
  }
  if (normalized.includes("sdxl") || normalized.includes("replicate")) {
    return {
      provider: "replicate",
      estimatedCostPerImageUsd: 0.016,
      estimatedLatencyMs: 5600
    };
  }

  return {
    provider: "openai",
    estimatedCostPerImageUsd: 0.045,
    estimatedLatencyMs: 4200
  };
}

function findConfiguredModel(model: string, apiProviders: ApiProvider[]) {
  const normalized = model.toLowerCase();

  for (const provider of apiProviders) {
    if (!provider.enabled) {
      continue;
    }

    const match = provider.models.find(
      (candidate) =>
        candidate.enabled &&
        candidate.capabilities.includes("image-generation") &&
        (candidate.id.toLowerCase() === normalized ||
          candidate.name.toLowerCase() === normalized)
    );
    if (match) {
      return { provider, model: match };
    }
  }

  return undefined;
}

function manifestIssues({
  draft,
  estimatedCostUsd,
  generationBudgetUsd,
  metricBudgetUsd,
  generationJobs,
  metricChecks,
  humanReviewTasks,
  baselineRunId
}: {
  draft: WorkflowDraft;
  estimatedCostUsd: number;
  generationBudgetUsd: number | undefined;
  metricBudgetUsd: number | undefined;
  generationJobs: number;
  metricChecks: number;
  humanReviewTasks: number;
  baselineRunId: string;
}): EvalSpecIssue[] {
  const issues: EvalSpecIssue[] = [];

  for (const node of draft.nodes) {
    const definition = getNodeDefinition(node.type);
    if (
      definition?.costSensitive &&
      optionalNumber(node.data.config.budgetUsd) === undefined
    ) {
      issues.push({
        severity: "warning",
        code: "budget_not_set",
        message: `${definition.title} is cost-sensitive and has no budgetUsd guardrail.`,
        nodeId: node.id
      });
    }
  }

  const configuredBudget = (generationBudgetUsd ?? 0) + (metricBudgetUsd ?? 0);
  if (configuredBudget > 0 && estimatedCostUsd > configuredBudget) {
    issues.push({
      severity: "warning",
      code: "estimated_cost_over_budget",
      message: `Estimated run cost $${estimatedCostUsd.toFixed(2)} exceeds configured generation + metric budget $${configuredBudget.toFixed(2)}.`
    });
  }

  if (generationJobs === 0) {
    issues.push({
      severity: "error",
      code: "empty_generation_matrix",
      message: "The generation matrix has no jobs. Add prompts, models, or samples."
    });
  }

  if (metricChecks === 0) {
    issues.push({
      severity: "warning",
      code: "no_metric_checks",
      message: "No automatic image metrics are configured."
    });
  }

  if (humanReviewTasks === 0) {
    issues.push({
      severity: "info",
      code: "human_review_disabled",
      message: "Pairwise human review is disabled because sampleRate is 0."
    });
  }

  if (baselineRunId === "baseline-current-prod") {
    issues.push({
      severity: "info",
      code: "default_baseline",
      message: "Release gate is using the starter baseline id."
    });
  }

  return issues;
}

function stringConfig(value: unknown, fallback: string) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberConfig(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function promptCasesConfig(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((candidate) => PromptCaseSchema.safeParse(candidate))
    .filter((result) => result.success)
    .map((result) => result.data);
}

function referenceImagesConfig(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((candidate) => ReferenceImageSchema.safeParse(candidate))
    .filter((result) => result.success)
    .map((result) => result.data);
}

function stringArrayConfig(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const values = value.filter(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.length > 0
  );
  return values.length > 0 ? values : fallback;
}

function normalizeMetrics(value: unknown) {
  return Array.from(
    new Set(
      stringArrayConfig(value, defaultMetrics)
        .map((metric) => {
          switch (metric) {
            case "imagereward":
            case "pickscore":
              return "aesthetic";
            case "safety":
              return "nsfw";
            default:
              return metric;
          }
        })
        .filter((metric) => defaultMetrics.includes(metric))
    )
  );
}

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function previewString(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 1)}...` : value;
}

function roundCurrency(value: number) {
  return Math.round(value * 10000) / 10000;
}
