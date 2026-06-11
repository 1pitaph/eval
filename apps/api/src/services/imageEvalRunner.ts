import {
  PromptCaseSchema,
  ReferenceImageSchema,
  type ReferenceImage
} from "@eval/workflow-schema";
import type {
  EvalDecision,
  EvalRunEvent,
  EvalRunRecord,
  EvalRunSpec,
  HumanReview,
  ImageArtifact,
  ImageGenerationJob,
  ImageMetric,
  ImageProvider,
  ImageScore,
  ModelSummary,
  ParetoPoint,
  PairwiseComparison
} from "@eval/workflow-schema";

type PromptFixture = {
  id: string;
  prompt: string;
  expectedText: string;
  referenceImages?: ReferenceImage[];
  tags: string[];
};

type ProviderProfile = {
  provider: ImageProvider;
  label: string;
  colorA: string;
  colorB: string;
  baseCostUsd: number;
  baseLatencyMs: number;
  qualityBias: number;
  safetyBias: number;
};

const promptSuites: Record<string, PromptFixture[]> = {
  "golden-image-prompts-v1": [
    {
      id: "hero-sneaker",
      prompt:
        "A premium running shoe hero image on a clean studio background with readable launch text",
      expectedText: "RUN",
      tags: ["product", "text-rendering", "commerce"]
    },
    {
      id: "cafe-poster",
      prompt:
        "A cozy cafe poster for a summer drink campaign with a visible price tag and warm natural light",
      expectedText: "SUMMER",
      tags: ["poster", "brand", "ocr"]
    },
    {
      id: "app-store-banner",
      prompt:
        "A polished app store banner for an AI photo editor, showing a phone mockup and clear CTA text",
      expectedText: "EDIT",
      tags: ["mobile", "layout", "marketing"]
    },
    {
      id: "beauty-flatlay",
      prompt:
        "A cosmetics flatlay with three products, soft shadows, balanced spacing, and no distorted labels",
      expectedText: "GLOW",
      tags: ["beauty", "object-count", "label-quality"]
    }
  ]
};

const providerProfiles: Record<ImageProvider, ProviderProfile> = {
  openai: {
    provider: "openai",
    label: "GPT Image",
    colorA: "#0f766e",
    colorB: "#99f6e4",
    baseCostUsd: 0.045,
    baseLatencyMs: 4200,
    qualityBias: 0.84,
    safetyBias: 0.97
  },
  "google-imagen": {
    provider: "google-imagen",
    label: "Imagen",
    colorA: "#2563eb",
    colorB: "#bfdbfe",
    baseCostUsd: 0.038,
    baseLatencyMs: 4700,
    qualityBias: 0.81,
    safetyBias: 0.96
  },
  fal: {
    provider: "fal",
    label: "FLUX",
    colorA: "#7c3aed",
    colorB: "#ddd6fe",
    baseCostUsd: 0.024,
    baseLatencyMs: 3100,
    qualityBias: 0.78,
    safetyBias: 0.94
  },
  replicate: {
    provider: "replicate",
    label: "SDXL",
    colorA: "#c2410c",
    colorB: "#fed7aa",
    baseCostUsd: 0.016,
    baseLatencyMs: 5600,
    qualityBias: 0.72,
    safetyBias: 0.93
  },
  imported: {
    provider: "imported",
    label: "Imported",
    colorA: "#475569",
    colorB: "#e2e8f0",
    baseCostUsd: 0,
    baseLatencyMs: 0,
    qualityBias: 0.7,
    safetyBias: 0.95
  }
};

const defaultMetrics: ImageMetric[] = [
  "vlm_rubric",
  "clip_siglip",
  "ocr",
  "nsfw",
  "blur",
  "aesthetic",
  "cost",
  "latency"
];

const defaultPromptSuite = promptSuites["golden-image-prompts-v1"] ?? [];

export function runImageEvalSpec(
  spec: EvalRunSpec,
  id: string,
  createdAt: string
): EvalRunRecord {
  const datasetConfig = getNodeConfig(spec, "dataset.prompt_set");
  const promptTemplateConfig = getNodeConfig(spec, "prompt.template");
  const generationConfig = getNodeConfig(spec, "generation.model_fanout");
  const metricConfig = getNodeConfig(spec, "metric.auto_image");
  const releaseConfig = getNodeConfig(spec, "decision.release_gate");

  const datasetId = stringConfig(datasetConfig.datasetId, "golden-image-prompts-v1");
  const sampleLimit = numberConfig(datasetConfig.sampleLimit, 4);
  const prompts = resolvePrompts(datasetConfig, datasetId, sampleLimit);
  const template = stringConfig(promptTemplateConfig.template, "{{prompt}}");
  const negativePrompt = stringConfig(
    promptTemplateConfig.negativePrompt,
    "watermark, distorted text, unsafe content"
  );
  const models = stringArrayConfig(generationConfig.models, [
    "gpt-image",
    "imagen",
    "flux",
    "sdxl"
  ]).slice(0, 6);
  const samplesPerPrompt = clamp(
    Math.round(numberConfig(generationConfig.samplesPerPrompt, 2)),
    1,
    4
  );
  const metrics = normalizeMetrics(metricConfig.metrics);
  const generationNodeId =
    spec.nodes.find((node) => node.type === "generation.model_fanout")?.id ??
    "model-fanout";

  const jobs: ImageGenerationJob[] = [];
  const artifacts: ImageArtifact[] = [];
  const scores: ImageScore[] = [];
  const reviews: HumanReview[] = [];
  const reviewerNames = ["Reviewer A", "Reviewer B", "Reviewer C"];

  for (const prompt of prompts) {
    for (const model of models) {
      const provider = providerFromModel(model);
      const profile = providerProfiles[provider];

      for (let sampleIndex = 0; sampleIndex < samplesPerPrompt; sampleIndex += 1) {
        const seed = hashInt(`${prompt.id}:${model}:${sampleIndex}`) % 900000;
        const jobId = `job-${prompt.id}-${model}-${sampleIndex}`;
        const renderedPrompt = renderPrompt(template, prompt.prompt);
        const job: ImageGenerationJob = {
          id: jobId,
          promptId: prompt.id,
          prompt: prompt.prompt,
          renderedPrompt,
          model,
          provider,
          seed,
          sampleIndex,
          params: {
            width: 1024,
            height: 1024,
            negativePrompt,
            ...(prompt.referenceImages?.length
              ? { referenceImages: prompt.referenceImages }
              : {}),
            quality: provider === "openai" ? "high" : "standard",
            seedStrategy: stringConfig(generationConfig.seedStrategy, "fixed_by_prompt")
          },
          tags: prompt.tags
        };
        const costUsd = roundCurrency(
          profile.baseCostUsd * (1 + unit(seed, "cost") * 0.3)
        );
        const latencyMs = Math.round(
          profile.baseLatencyMs * (0.82 + unit(seed, "latency") * 0.5)
        );
        const artifactId = `art-${prompt.id}-${model}-${sampleIndex}`;
        const artifact: ImageArtifact = {
          id: artifactId,
          jobId,
          promptId: prompt.id,
          prompt: prompt.prompt,
          model,
          provider,
          uri: buildMockImageUri(prompt, profile, model, sampleIndex, false),
          thumbnailUri: buildMockImageUri(prompt, profile, model, sampleIndex, true),
          storageUri: `oss://eval-artifacts/runs/${id}/${artifactId}.webp`,
          width: 1024,
          height: 1024,
          seed,
          costUsd,
          latencyMs,
          perceptualHash: `phash_${hashInt(`${artifactId}:phash`).toString(16)}`,
          embeddingKey: `emb_${id}_${artifactId}`,
          createdAt,
          lineage: {
            workflowNodeId: generationNodeId,
            source: "mock-provider-adapter"
          },
          params: job.params,
          tags: prompt.tags
        };
        const artifactScores = scoreArtifact(artifact, prompt, metrics);
        const quality = qualityFor(scoresWithArtifact(artifactScores));
        const reviewer =
          reviewerNames[reviews.length % reviewerNames.length] ?? "Reviewer";
        const humanScore = clamp(quality + (unit(seed, "human") - 0.5) * 0.16, 0, 1);

        jobs.push(job);
        artifacts.push(artifact);
        scores.push(...artifactScores);
        reviews.push({
          id: `review-${artifactId}`,
          artifactId,
          reviewer,
          blind: true,
          verdict:
            humanScore >= 0.76 ? "pass" : humanScore >= 0.64 ? "needs_review" : "fail",
          score: roundScore(humanScore),
          comment: reviewComment(humanScore, artifact, prompt),
          tags: reviewTags(humanScore, artifactScores),
          createdAt
        });
      }
    }
  }

  const pairwise = buildPairwiseComparisons(prompts, artifacts, scores);
  const modelSummaries = buildModelSummaries(artifacts, scores, reviews, pairwise);
  const pareto = buildPareto(modelSummaries);
  const summary = buildSummary(spec, artifacts, scores, reviews, modelSummaries);
  const decision = buildDecision(summary, modelSummaries, releaseConfig);
  const events = buildEvents(createdAt, spec, artifacts.length, metrics.length);

  return {
    id,
    createdAt,
    status: "succeeded",
    spec,
    summary,
    jobs,
    artifacts,
    scores,
    reviews,
    pairwise,
    modelSummaries,
    pareto,
    decision,
    events
  };
}

function getNodeConfig(spec: EvalRunSpec, type: string) {
  return spec.nodes.find((node) => node.type === type)?.config ?? {};
}

function resolvePrompts(
  datasetConfig: Record<string, unknown>,
  datasetId: string,
  sampleLimit: number
): PromptFixture[] {
  const inlinePrompts = promptCasesConfig(datasetConfig.inlinePrompts);
  const sharedReferenceImages = referenceImagesConfig(datasetConfig.referenceImages);
  const limit = clamp(Math.round(sampleLimit), 1, 200);

  if (datasetConfig.mode === "inline" || inlinePrompts.length > 0) {
    const prompts = inlinePrompts.length > 0 ? inlinePrompts : defaultPromptSuite;
    return prompts.slice(0, limit).map((prompt, index) => ({
      id: prompt.id || `inline-prompt-${index + 1}`,
      prompt: prompt.prompt,
      expectedText: prompt.expectedText ?? "",
      referenceImages: [
        ...sharedReferenceImages,
        ...(prompt.referenceImages ?? [])
      ].slice(0, 12),
      tags: prompt.tags.length > 0 ? prompt.tags : ["inline"]
    }));
  }

  return (promptSuites[datasetId] ?? defaultPromptSuite).slice(0, clamp(limit, 1, 8));
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

function stringConfig(value: unknown, fallback: string) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function numberConfig(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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

function normalizeMetrics(value: unknown): ImageMetric[] {
  const rawMetrics = stringArrayConfig(value, defaultMetrics);
  const mapped = rawMetrics
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
    .filter((metric): metric is ImageMetric =>
      defaultMetrics.includes(metric as ImageMetric)
    );

  return Array.from(new Set(mapped.length > 0 ? mapped : defaultMetrics));
}

function providerFromModel(model: string): ImageProvider {
  const normalized = model.toLowerCase();
  if (normalized.includes("imagen") || normalized.includes("google")) {
    return "google-imagen";
  }
  if (normalized.includes("flux") || normalized.includes("fal")) {
    return "fal";
  }
  if (normalized.includes("sdxl") || normalized.includes("replicate")) {
    return "replicate";
  }
  return "openai";
}

function renderPrompt(template: string, prompt: string) {
  return template.replaceAll("{{prompt}}", prompt);
}

function scoreArtifact(
  artifact: ImageArtifact,
  prompt: PromptFixture,
  metrics: ImageMetric[]
): ImageScore[] {
  const profile = providerProfiles[artifact.provider];
  const baseQuality = clamp(
    profile.qualityBias + (unit(artifact.seed, "quality") - 0.5) * 0.22,
    0,
    1
  );
  const safety = clamp(
    profile.safetyBias + (unit(artifact.seed, "safety") - 0.5) * 0.08,
    0,
    1
  );
  const metricScores: Record<ImageMetric, number> = {
    vlm_rubric: clamp(baseQuality + (unit(artifact.seed, "vlm") - 0.5) * 0.1, 0, 1),
    clip_siglip: clamp(baseQuality + (unit(artifact.seed, "clip") - 0.5) * 0.12, 0, 1),
    ocr: clamp(
      baseQuality -
        (prompt.tags.includes("ocr") ? 0.02 : 0) +
        (unit(artifact.seed, "ocr") - 0.5) * 0.18,
      0,
      1
    ),
    nsfw: safety,
    blur: clamp(baseQuality + (unit(artifact.seed, "blur") - 0.5) * 0.16, 0, 1),
    aesthetic: clamp(
      baseQuality + (unit(artifact.seed, "aesthetic") - 0.5) * 0.14,
      0,
      1
    ),
    cost: clamp(1 - artifact.costUsd / 0.08, 0, 1),
    latency: clamp(1 - artifact.latencyMs / 9000, 0, 1)
  };

  return metrics.map((metric) => {
    const score = roundScore(metricScores[metric]);
    return {
      id: `score-${artifact.id}-${metric}`,
      artifactId: artifact.id,
      metric,
      score,
      pass: metricPasses(metric, score, artifact),
      reason: metricReason(metric, score, artifact, prompt),
      evidence: metricEvidence(metric, artifact, prompt)
    };
  });
}

function metricPasses(metric: ImageMetric, score: number, artifact: ImageArtifact) {
  switch (metric) {
    case "cost":
      return artifact.costUsd <= 0.055;
    case "latency":
      return artifact.latencyMs <= 6500;
    case "nsfw":
      return score >= 0.94;
    case "ocr":
      return score >= 0.68;
    default:
      return score >= 0.72;
  }
}

function metricReason(
  metric: ImageMetric,
  score: number,
  artifact: ImageArtifact,
  prompt: PromptFixture
) {
  switch (metric) {
    case "vlm_rubric":
      return `VLM judge estimated prompt adherence at ${percent(score)} for ${artifact.model}.`;
    case "clip_siglip":
      return `CLIP/SigLIP alignment against the rendered prompt is ${percent(score)}.`;
    case "ocr":
      return `OCR check looks for "${prompt.expectedText}" and scored ${percent(score)}.`;
    case "nsfw":
      return `Safety classifier confidence for brand-safe output is ${percent(score)}.`;
    case "blur":
      return `Sharpness and artifact detector scored ${percent(score)}.`;
    case "aesthetic":
      return `Aesthetic reward model scored composition and polish at ${percent(score)}.`;
    case "cost":
      return `Generation cost was $${artifact.costUsd.toFixed(3)} for this image.`;
    case "latency":
      return `Provider latency was ${(artifact.latencyMs / 1000).toFixed(1)}s.`;
  }
}

function metricEvidence(
  metric: ImageMetric,
  artifact: ImageArtifact,
  prompt: PromptFixture
) {
  switch (metric) {
    case "ocr":
      return {
        expectedText: prompt.expectedText,
        detectedText: `${prompt.expectedText} ${artifact.provider.toUpperCase()}`
      };
    case "nsfw":
      return { policy: "brand-safe-commercial", blockedCategories: [] };
    case "cost":
      return { costUsd: artifact.costUsd, budgetPerImageUsd: 0.055 };
    case "latency":
      return { latencyMs: artifact.latencyMs, targetMs: 6500 };
    default:
      return { promptId: artifact.promptId, perceptualHash: artifact.perceptualHash };
  }
}

function buildPairwiseComparisons(
  prompts: PromptFixture[],
  artifacts: ImageArtifact[],
  scores: ImageScore[]
): PairwiseComparison[] {
  return prompts.flatMap((prompt) => {
    const promptArtifacts = artifacts.filter(
      (artifact) => artifact.promptId === prompt.id
    );
    const byModel = new Map<string, ImageArtifact>();
    for (const artifact of promptArtifacts) {
      const current = byModel.get(artifact.model);
      if (
        !current ||
        qualityForArtifact(artifact.id, scores) > qualityForArtifact(current.id, scores)
      ) {
        byModel.set(artifact.model, artifact);
      }
    }

    const candidates = Array.from(byModel.values()).sort((left, right) =>
      left.model.localeCompare(right.model)
    );
    const [left, right] = candidates;
    if (!left || !right) {
      return [];
    }

    const leftQuality = qualityForArtifact(left.id, scores);
    const rightQuality = qualityForArtifact(right.id, scores);
    const preferredArtifactId = leftQuality >= rightQuality ? left.id : right.id;

    return [
      {
        id: `pairwise-${prompt.id}`,
        promptId: prompt.id,
        leftArtifactId: left.id,
        rightArtifactId: right.id,
        preferredArtifactId,
        reason: "Seeded blind comparison uses the higher combined auto-quality score."
      }
    ];
  });
}

function buildModelSummaries(
  artifacts: ImageArtifact[],
  scores: ImageScore[],
  reviews: HumanReview[],
  pairwise: PairwiseComparison[]
): ModelSummary[] {
  const models = Array.from(new Set(artifacts.map((artifact) => artifact.model)));
  return models.map((model) => {
    const modelArtifacts = artifacts.filter((artifact) => artifact.model === model);
    const provider = modelArtifacts[0]?.provider ?? "imported";
    const reviewMap = new Map(reviews.map((review) => [review.artifactId, review]));
    const approvedCount = modelArtifacts.filter(
      (artifact) => reviewMap.get(artifact.id)?.verdict === "pass"
    ).length;
    const wins = pairwise.filter((comparison) => {
      const preferred = artifacts.find(
        (artifact) => artifact.id === comparison.preferredArtifactId
      );
      return preferred?.model === model;
    }).length;
    const appearances = pairwise.filter((comparison) =>
      [comparison.leftArtifactId, comparison.rightArtifactId].some((artifactId) =>
        modelArtifacts.some((artifact) => artifact.id === artifactId)
      )
    ).length;
    const safetyScores = scores.filter(
      (score) =>
        score.metric === "nsfw" &&
        modelArtifacts.some((artifact) => artifact.id === score.artifactId)
    );
    const totalCost = sum(modelArtifacts.map((artifact) => artifact.costUsd));

    return {
      model,
      provider,
      artifactCount: modelArtifacts.length,
      approvedCount,
      averageQuality: roundScore(
        average(
          modelArtifacts.map((artifact) => qualityForArtifact(artifact.id, scores))
        )
      ),
      humanWinRate: roundScore(
        appearances > 0 ? wins / appearances : approvedCount / modelArtifacts.length
      ),
      safetyPassRate: roundScore(
        safetyScores.length > 0
          ? safetyScores.filter((score) => score.pass).length / safetyScores.length
          : 1
      ),
      averageCostUsd: roundCurrency(totalCost / modelArtifacts.length),
      averageLatencyMs: Math.round(
        average(modelArtifacts.map((artifact) => artifact.latencyMs))
      ),
      usableArtifactCostUsd: roundCurrency(totalCost / Math.max(approvedCount, 1))
    };
  });
}

function buildPareto(modelSummaries: ModelSummary[]): ParetoPoint[] {
  return modelSummaries.map((summary) => {
    const dominated = modelSummaries.some((candidate) => {
      if (candidate.model === summary.model) {
        return false;
      }

      const atLeastAsGood =
        candidate.averageQuality >= summary.averageQuality &&
        candidate.averageCostUsd <= summary.averageCostUsd &&
        candidate.averageLatencyMs <= summary.averageLatencyMs;
      const strictlyBetter =
        candidate.averageQuality > summary.averageQuality ||
        candidate.averageCostUsd < summary.averageCostUsd ||
        candidate.averageLatencyMs < summary.averageLatencyMs;

      return atLeastAsGood && strictlyBetter;
    });

    return {
      model: summary.model,
      provider: summary.provider,
      qualityScore: summary.averageQuality,
      costUsd: summary.averageCostUsd,
      latencyMs: summary.averageLatencyMs,
      safetyPassRate: summary.safetyPassRate,
      isParetoOptimal: !dominated
    };
  });
}

function buildSummary(
  spec: EvalRunSpec,
  artifacts: ImageArtifact[],
  scores: ImageScore[],
  reviews: HumanReview[],
  modelSummaries: ModelSummary[]
) {
  const best = [...modelSummaries].sort(
    (left, right) => right.averageQuality - left.averageQuality
  )[0];
  const safetyScores = scores.filter((score) => score.metric === "nsfw");
  const latencies = artifacts
    .map((artifact) => artifact.latencyMs)
    .sort((a, b) => a - b);

  return {
    artifactCount: artifacts.length,
    approvedArtifactCount: reviews.filter((review) => review.verdict === "pass").length,
    estimatedCostUsd: roundCurrency(
      Math.max(
        sum(artifacts.map((artifact) => artifact.costUsd)),
        spec.manifest.matrix.estimatedCostUsd
      )
    ),
    taskCount: spec.manifest.matrix.totalPlannedOperations,
    averageQuality: roundScore(
      average(artifacts.map((artifact) => qualityForArtifact(artifact.id, scores)))
    ),
    safetyPassRate: roundScore(
      safetyScores.filter((score) => score.pass).length / safetyScores.length
    ),
    p95LatencyMs: percentile(latencies, 0.95),
    bestModel: best?.model ?? "n/a"
  };
}

function buildDecision(
  summary: ReturnType<typeof buildSummary>,
  modelSummaries: ModelSummary[],
  releaseConfig: Record<string, unknown>
): EvalDecision {
  const minHumanWinRate = numberConfig(releaseConfig.minHumanWinRate, 0.55);
  const safetyMustPass = releaseConfig.safetyMustPass !== false;
  const best = [...modelSummaries].sort(
    (left, right) => right.averageQuality - left.averageQuality
  )[0];
  const bestWinRate = best?.humanWinRate ?? 0;
  const gates = [
    {
      label: "Average quality",
      passed: summary.averageQuality >= 0.74,
      actual: percent(summary.averageQuality),
      target: ">= 74%"
    },
    {
      label: "Human win rate",
      passed: bestWinRate >= minHumanWinRate,
      actual: percent(bestWinRate),
      target: `>= ${percent(minHumanWinRate)}`
    },
    {
      label: "Safety pass rate",
      passed: !safetyMustPass || summary.safetyPassRate >= 0.92,
      actual: percent(summary.safetyPassRate),
      target: safetyMustPass ? ">= 92%" : "tracked"
    },
    {
      label: "P95 latency",
      passed: summary.p95LatencyMs <= 6500,
      actual: `${(summary.p95LatencyMs / 1000).toFixed(1)}s`,
      target: "<= 6.5s"
    }
  ];
  const failures = gates.filter((gate) => !gate.passed).length;

  return {
    status: failures === 0 ? "pass" : failures <= 1 ? "warn" : "fail",
    message:
      failures === 0
        ? `${summary.bestModel} is currently the best release candidate for this suite.`
        : `${summary.bestModel} leads quality, but ${failures} release gate${
            failures > 1 ? "s" : ""
          } need attention.`,
    gates
  };
}

function buildEvents(
  createdAt: string,
  spec: EvalRunSpec,
  artifactCount: number,
  metricCount: number
): EvalRunEvent[] {
  const eventBase = Date.parse(createdAt);
  const at = (offsetMs: number) => new Date(eventBase + offsetMs).toISOString();
  return [
    {
      id: "event-compile",
      at: at(0),
      level: "success",
      message: `Compiled ${spec.nodes.length} nodes into an executable image eval DAG.`
    },
    {
      id: "event-generate",
      at: at(1200),
      level: "success",
      message: `Generated and stored ${artifactCount} image artifacts.`,
      nodeId: spec.nodes.find((node) => node.type === "generation.model_fanout")?.id
    },
    {
      id: "event-metrics",
      at: at(2400),
      level: "success",
      message: `Ran ${metricCount} automatic metrics per artifact.`,
      nodeId: spec.nodes.find((node) => node.type === "metric.auto_image")?.id
    },
    {
      id: "event-human",
      at: at(3600),
      level: "info",
      message: "Seeded blind human-review tasks and pairwise comparisons.",
      nodeId: spec.nodes.find((node) => node.type === "human.pairwise")?.id
    }
  ];
}

function scoresWithArtifact(scores: ImageScore[]) {
  return scores.filter(
    (score) =>
      score.metric === "vlm_rubric" ||
      score.metric === "clip_siglip" ||
      score.metric === "ocr" ||
      score.metric === "blur" ||
      score.metric === "aesthetic"
  );
}

function qualityForArtifact(artifactId: string, scores: ImageScore[]) {
  return qualityFor(
    scoresWithArtifact(scores.filter((score) => score.artifactId === artifactId))
  );
}

function qualityFor(scores: ImageScore[]) {
  if (scores.length === 0) {
    return 0;
  }
  return roundScore(average(scores.map((score) => score.score)));
}

function reviewComment(score: number, artifact: ImageArtifact, prompt: PromptFixture) {
  if (score >= 0.82) {
    return `Strong candidate for ${prompt.id}; ${artifact.model} kept the layout polished.`;
  }
  if (score >= 0.7) {
    return "Usable after review; check text rendering and small product details.";
  }
  return "Not release-ready; visible quality or prompt-adherence issues remain.";
}

function reviewTags(score: number, scores: ImageScore[]) {
  const tags: string[] = scores
    .filter((metricScore) => !metricScore.pass)
    .map((metricScore) => metricScore.metric);

  if (score < 0.7) {
    tags.push("needs-redesign");
  }

  return Array.from(new Set(tags)).slice(0, 4);
}

function buildMockImageUri(
  prompt: PromptFixture,
  profile: ProviderProfile,
  model: string,
  sampleIndex: number,
  thumbnail: boolean
) {
  const width = thumbnail ? 320 : 1024;
  const height = thumbnail ? 320 : 1024;
  const hash = hashInt(`${prompt.id}:${model}:${sampleIndex}:image`);
  const accentX = 160 + (hash % 620);
  const accentY = 180 + ((hash >> 3) % 580);
  const label = profile.label.toUpperCase();
  const shortPrompt = prompt.id.replaceAll("-", " ").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${profile.colorB}"/>
      <stop offset="0.62" stop-color="#ffffff"/>
      <stop offset="1" stop-color="${profile.colorA}"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="20" stdDeviation="24" flood-color="#0f172a" flood-opacity="0.18"/>
    </filter>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <circle cx="${accentX}" cy="${accentY}" r="210" fill="${profile.colorA}" opacity="0.16"/>
  <rect x="166" y="238" width="692" height="500" rx="46" fill="#ffffff" opacity="0.9" filter="url(#shadow)"/>
  <rect x="226" y="312" width="572" height="250" rx="34" fill="${profile.colorA}" opacity="0.9"/>
  <circle cx="332" cy="648" r="54" fill="${profile.colorA}" opacity="0.32"/>
  <rect x="414" y="616" width="286" height="62" rx="31" fill="#0f172a" opacity="0.82"/>
  <text x="512" y="445" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="58" font-weight="800" fill="#ffffff">${label}</text>
  <text x="512" y="512" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="700" fill="#ffffff" opacity="0.9">SAMPLE ${sampleIndex + 1}</text>
  <text x="512" y="846" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="36" font-weight="800" fill="#172026">${shortPrompt}</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function hashInt(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unit(seed: number, salt: string) {
  return (hashInt(`${seed}:${salt}`) % 1000) / 1000;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundScore(value: number) {
  return Math.round(value * 1000) / 1000;
}

function roundCurrency(value: number) {
  return Math.round(value * 10000) / 10000;
}

function average(values: number[]) {
  return values.length > 0 ? sum(values) / values.length : 0;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) {
    return 0;
  }

  const index = Math.min(
    values.length - 1,
    Math.max(0, Math.ceil(values.length * percentileValue) - 1)
  );
  return values[index] ?? 0;
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}
