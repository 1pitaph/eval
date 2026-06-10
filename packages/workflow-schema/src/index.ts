import { z } from "zod";

export const nodeCategories = [
  "input",
  "prompt",
  "generation",
  "artifact",
  "eval",
  "aggregate",
  "decision"
] as const;

export const portValueTypes = [
  "dataset",
  "prompt",
  "text",
  "image",
  "artifact",
  "score",
  "annotation",
  "report",
  "decision"
] as const;

export const nodeRuntimeKinds = [
  "none",
  "prompt",
  "generation",
  "metric",
  "judge",
  "human_eval",
  "aggregation",
  "report",
  "gate"
] as const;

export type NodeCategory = (typeof nodeCategories)[number];
export type PortValueType = (typeof portValueTypes)[number];
export type NodeRuntimeKind = (typeof nodeRuntimeKinds)[number];

export const PortSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(portValueTypes),
  description: z.string().optional(),
  multiple: z.boolean().default(false)
});

export const NodeDefinitionSchema = z.object({
  type: z.string().min(1),
  version: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(nodeCategories),
  runtime: z.enum(nodeRuntimeKinds),
  inputs: z.array(PortSchema),
  outputs: z.array(PortSchema),
  requiredConfig: z.array(z.string()).default([]),
  configSchema: z.record(z.string(), z.unknown()).default({}),
  costSensitive: z.boolean().default(false)
});

export type Port = z.infer<typeof PortSchema>;
export type EvalNodeDefinition = z.infer<typeof NodeDefinitionSchema>;

export const nodeDefinitions = [
  {
    type: "dataset.prompt_set",
    version: "1.0.0",
    title: "Prompt Set",
    description: "Versioned business prompts and optional reference assets.",
    category: "input",
    runtime: "none",
    inputs: [],
    outputs: [
      {
        id: "prompts",
        label: "Prompts",
        type: "prompt",
        multiple: true
      }
    ],
    requiredConfig: ["datasetId"],
    configSchema: {
      datasetId: { type: "string", title: "Dataset ID" },
      sampleLimit: { type: "number", title: "Sample limit" }
    },
    costSensitive: false
  },
  {
    type: "prompt.template",
    version: "1.0.0",
    title: "Prompt Template",
    description: "Applies variables, brand instructions, and output constraints.",
    category: "prompt",
    runtime: "prompt",
    inputs: [
      {
        id: "prompts",
        label: "Prompts",
        type: "prompt",
        multiple: true
      }
    ],
    outputs: [
      {
        id: "rendered",
        label: "Rendered Prompts",
        type: "prompt",
        multiple: true
      }
    ],
    requiredConfig: ["template"],
    configSchema: {
      template: { type: "string", title: "Template" },
      negativePrompt: { type: "string", title: "Negative prompt" }
    },
    costSensitive: false
  },
  {
    type: "generation.model_fanout",
    version: "1.0.0",
    title: "Model Fanout",
    description: "Creates a prompt by model matrix for bake-off runs.",
    category: "generation",
    runtime: "generation",
    inputs: [
      {
        id: "prompts",
        label: "Prompts",
        type: "prompt",
        multiple: true
      }
    ],
    outputs: [
      {
        id: "images",
        label: "Generated Images",
        type: "artifact",
        multiple: true
      }
    ],
    requiredConfig: ["models", "samplesPerPrompt"],
    configSchema: {
      models: {
        type: "array",
        title: "Models",
        items: { type: "string" }
      },
      samplesPerPrompt: { type: "number", title: "Samples per prompt" },
      seedStrategy: { type: "string", title: "Seed strategy" }
    },
    costSensitive: true
  },
  {
    type: "artifact.store",
    version: "1.0.0",
    title: "Artifact Store",
    description: "Persists images, thumbnails, raw responses, hashes, and metadata.",
    category: "artifact",
    runtime: "none",
    inputs: [
      {
        id: "artifacts",
        label: "Artifacts",
        type: "artifact",
        multiple: true
      }
    ],
    outputs: [
      {
        id: "stored",
        label: "Stored Artifacts",
        type: "artifact",
        multiple: true
      }
    ],
    requiredConfig: ["bucket"],
    configSchema: {
      bucket: { type: "string", title: "OSS bucket" },
      retentionDays: { type: "number", title: "Retention days" }
    },
    costSensitive: false
  },
  {
    type: "metric.auto_image",
    version: "1.0.0",
    title: "Auto Image Metrics",
    description: "Runs OCR, safety, reward, and visual quality metrics.",
    category: "eval",
    runtime: "metric",
    inputs: [
      {
        id: "artifacts",
        label: "Artifacts",
        type: "artifact",
        multiple: true
      }
    ],
    outputs: [
      {
        id: "scores",
        label: "Scores",
        type: "score",
        multiple: true
      }
    ],
    requiredConfig: ["metrics"],
    configSchema: {
      metrics: {
        type: "array",
        title: "Metrics",
        items: { type: "string" }
      }
    },
    costSensitive: true
  },
  {
    type: "human.pairwise",
    version: "1.0.0",
    title: "Human Pairwise Eval",
    description: "Creates blind A/B or Top-K tasks for Label Studio.",
    category: "eval",
    runtime: "human_eval",
    inputs: [
      {
        id: "artifacts",
        label: "Artifacts",
        type: "artifact",
        multiple: true
      }
    ],
    outputs: [
      {
        id: "annotations",
        label: "Annotations",
        type: "annotation",
        multiple: true
      }
    ],
    requiredConfig: ["sampleRate", "reviewersPerTask"],
    configSchema: {
      sampleRate: { type: "number", title: "Sample rate" },
      reviewersPerTask: { type: "number", title: "Reviewers per task" },
      blindMode: { type: "boolean", title: "Blind mode" }
    },
    costSensitive: false
  },
  {
    type: "aggregate.model_scores",
    version: "1.0.0",
    title: "Model Score Aggregation",
    description: "Aggregates automatic and human scores into model-level rankings.",
    category: "aggregate",
    runtime: "aggregation",
    inputs: [
      {
        id: "scores",
        label: "Scores",
        type: "score",
        multiple: true
      },
      {
        id: "annotations",
        label: "Annotations",
        type: "annotation",
        multiple: true
      }
    ],
    outputs: [
      {
        id: "report",
        label: "Report",
        type: "report",
        multiple: false
      }
    ],
    requiredConfig: ["rankingMethod"],
    configSchema: {
      rankingMethod: {
        type: "string",
        title: "Ranking method",
        enum: ["win_rate", "elo", "bradley_terry"]
      }
    },
    costSensitive: false
  },
  {
    type: "decision.release_gate",
    version: "1.0.0",
    title: "Release Gate",
    description: "Checks quality, cost, latency, and safety thresholds.",
    category: "decision",
    runtime: "gate",
    inputs: [
      {
        id: "report",
        label: "Report",
        type: "report",
        multiple: false
      }
    ],
    outputs: [
      {
        id: "decision",
        label: "Decision",
        type: "decision",
        multiple: false
      }
    ],
    requiredConfig: ["baselineRunId", "maxCostIncreasePct"],
    configSchema: {
      baselineRunId: { type: "string", title: "Baseline run" },
      minHumanWinRate: { type: "number", title: "Min human win rate" },
      maxCostIncreasePct: {
        type: "number",
        title: "Max cost increase percent"
      },
      safetyMustPass: { type: "boolean", title: "Safety must pass" }
    },
    costSensitive: false
  }
] satisfies EvalNodeDefinition[];

export const nodeDefinitionMap = new Map(
  nodeDefinitions.map((definition) => [definition.type, definition])
);

export const NodeStatusSchema = z.enum([
  "idle",
  "queued",
  "running",
  "succeeded",
  "failed",
  "cached",
  "blocked"
]);

export type NodeStatus = z.infer<typeof NodeStatusSchema>;

export const WorkflowNodeDataSchema = z.object({
  label: z.string().min(1),
  config: z.record(z.string(), z.unknown()).default({}),
  status: NodeStatusSchema.default("idle"),
  summary: z.string().optional()
});

export const WorkflowNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  position: z.object({
    x: z.number(),
    y: z.number()
  }),
  data: WorkflowNodeDataSchema
});

export const WorkflowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  sourceHandle: z.string().min(1).optional(),
  target: z.string().min(1),
  targetHandle: z.string().min(1).optional()
});

export const WorkflowDraftSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  version: z.number().int().positive().default(1),
  nodes: z.array(WorkflowNodeSchema).min(1),
  edges: z.array(WorkflowEdgeSchema),
  viewport: z
    .object({
      x: z.number(),
      y: z.number(),
      zoom: z.number()
    })
    .optional()
});

export const EvalRunSpecNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  runtime: z.enum(nodeRuntimeKinds),
  config: z.record(z.string(), z.unknown()),
  upstream: z.array(z.string()),
  downstream: z.array(z.string())
});

export const EvalRunSpecSchema = z.object({
  workflowId: z.string().min(1),
  workflowVersion: z.number().int().positive(),
  name: z.string().min(1),
  compiledAt: z.string().datetime(),
  topologicalOrder: z.array(z.string()),
  nodes: z.array(EvalRunSpecNodeSchema),
  edges: z.array(WorkflowEdgeSchema)
});

export type WorkflowNodeData = z.infer<typeof WorkflowNodeDataSchema>;
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;
export type WorkflowDraft = z.infer<typeof WorkflowDraftSchema>;
export type EvalRunSpecNode = z.infer<typeof EvalRunSpecNodeSchema>;
export type EvalRunSpec = z.infer<typeof EvalRunSpecSchema>;

export const ImageProviderSchema = z.enum([
  "openai",
  "google-imagen",
  "fal",
  "replicate",
  "imported"
]);

export const ImageMetricSchema = z.enum([
  "vlm_rubric",
  "clip_siglip",
  "ocr",
  "nsfw",
  "blur",
  "aesthetic",
  "cost",
  "latency"
]);

export const ReviewVerdictSchema = z.enum(["pass", "fail", "needs_review"]);

export const EvalRunStatusSchema = z.enum(["queued", "running", "succeeded", "failed"]);

export const ImageGenerationJobSchema = z.object({
  id: z.string().min(1),
  promptId: z.string().min(1),
  prompt: z.string().min(1),
  renderedPrompt: z.string().min(1),
  model: z.string().min(1),
  provider: ImageProviderSchema,
  seed: z.number().int(),
  sampleIndex: z.number().int().nonnegative(),
  params: z.record(z.string(), z.unknown()).default({}),
  tags: z.array(z.string()).default([])
});

export const ImageArtifactSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  promptId: z.string().min(1),
  prompt: z.string().min(1),
  model: z.string().min(1),
  provider: ImageProviderSchema,
  uri: z.string().min(1),
  thumbnailUri: z.string().min(1),
  storageUri: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  seed: z.number().int(),
  costUsd: z.number().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  perceptualHash: z.string().min(1),
  embeddingKey: z.string().min(1),
  createdAt: z.string().datetime(),
  lineage: z.object({
    workflowNodeId: z.string().min(1),
    source: z.string().min(1)
  }),
  params: z.record(z.string(), z.unknown()).default({}),
  tags: z.array(z.string()).default([])
});

export const ImageScoreSchema = z.object({
  id: z.string().min(1),
  artifactId: z.string().min(1),
  metric: ImageMetricSchema,
  score: z.number(),
  pass: z.boolean(),
  reason: z.string().min(1),
  evidence: z.record(z.string(), z.unknown()).default({})
});

export const HumanReviewSchema = z.object({
  id: z.string().min(1),
  artifactId: z.string().min(1),
  reviewer: z.string().min(1),
  blind: z.boolean(),
  verdict: ReviewVerdictSchema,
  score: z.number().min(0).max(1),
  comment: z.string(),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().datetime()
});

export const PairwiseComparisonSchema = z.object({
  id: z.string().min(1),
  promptId: z.string().min(1),
  leftArtifactId: z.string().min(1),
  rightArtifactId: z.string().min(1),
  preferredArtifactId: z.string().min(1).optional(),
  reason: z.string().optional(),
  voteCount: z.number().int().nonnegative().optional(),
  tieCount: z.number().int().nonnegative().optional(),
  leftWinRate: z.number().min(0).max(1).optional(),
  rightWinRate: z.number().min(0).max(1).optional(),
  agreementRate: z.number().min(0).max(1).optional()
});

export const ReviewCampaignModeSchema = z.enum(["pairwise"]);

export const ReviewCampaignStatusSchema = z.enum([
  "draft",
  "open",
  "closed",
  "completed"
]);

export const ReviewTaskKindSchema = z.enum(["pairwise_vote"]);

export const ReviewTaskStatusSchema = z.enum(["pending", "completed"]);

export const ReviewLinkScopeSchema = z.enum(["campaign"]);

export const ReviewerSessionStatusSchema = z.enum(["active", "completed"]);

export const PairwiseVoteChoiceSchema = z.enum([
  "left",
  "right",
  "tie",
  "both_bad",
  "skip"
]);

export const ReviewReasonTagSchema = z.enum([
  "prompt_adherence",
  "aesthetic_quality",
  "text_rendering",
  "composition",
  "visual_artifacts",
  "safety",
  "brand_fit"
]);

export const ReviewCampaignSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  name: z.string().min(1),
  mode: ReviewCampaignModeSchema,
  status: ReviewCampaignStatusSchema,
  blindMode: z.boolean(),
  reviewersPerTask: z.number().int().positive(),
  guidelines: z.string().optional(),
  reasonTags: z.array(ReviewReasonTagSchema),
  taskCount: z.number().int().nonnegative(),
  completedTaskCount: z.number().int().nonnegative(),
  voteCount: z.number().int().nonnegative(),
  agreementRate: z.number().min(0).max(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional()
});

export const ReviewTaskSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  campaignId: z.string().min(1),
  kind: ReviewTaskKindSchema,
  status: ReviewTaskStatusSchema,
  promptId: z.string().min(1),
  prompt: z.string().min(1),
  leftArtifactId: z.string().min(1),
  rightArtifactId: z.string().min(1),
  voteCount: z.number().int().nonnegative(),
  requiredVotes: z.number().int().positive(),
  orderSeed: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional()
});

export const ReviewLinkSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  campaignId: z.string().min(1),
  token: z.string().min(8),
  url: z.string().min(1),
  scope: ReviewLinkScopeSchema,
  maxUses: z.number().int().positive().optional(),
  useCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional()
});

export const ReviewerSessionSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  campaignId: z.string().min(1),
  reviewLinkId: z.string().min(1),
  displayName: z.string().min(1),
  status: ReviewerSessionStatusSchema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional()
});

export const PairwiseVoteSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  campaignId: z.string().min(1),
  taskId: z.string().min(1),
  sessionId: z.string().min(1),
  leftArtifactId: z.string().min(1),
  rightArtifactId: z.string().min(1),
  preferred: PairwiseVoteChoiceSchema,
  preferredArtifactId: z.string().min(1).optional(),
  reasonTags: z.array(ReviewReasonTagSchema),
  comment: z.string(),
  timeSpentMs: z.number().int().nonnegative(),
  createdAt: z.string().datetime()
});

export const ReviewArtifactPayloadSchema = z.object({
  id: z.string().min(1),
  promptId: z.string().min(1),
  prompt: z.string().min(1),
  uri: z.string().min(1),
  thumbnailUri: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  model: z.string().min(1).optional(),
  provider: ImageProviderSchema.optional(),
  tags: z.array(z.string()).default([])
});

export const ReviewTaskPayloadSchema = z.object({
  task: ReviewTaskSchema,
  leftArtifact: ReviewArtifactPayloadSchema,
  rightArtifact: ReviewArtifactPayloadSchema,
  submittedVote: PairwiseVoteSchema.optional()
});

export const ModelSummarySchema = z.object({
  model: z.string().min(1),
  provider: ImageProviderSchema,
  artifactCount: z.number().int().nonnegative(),
  approvedCount: z.number().int().nonnegative(),
  averageQuality: z.number(),
  humanWinRate: z.number(),
  safetyPassRate: z.number(),
  averageCostUsd: z.number().nonnegative(),
  averageLatencyMs: z.number().nonnegative(),
  usableArtifactCostUsd: z.number().nonnegative()
});

export const ParetoPointSchema = z.object({
  model: z.string().min(1),
  provider: ImageProviderSchema,
  qualityScore: z.number(),
  costUsd: z.number().nonnegative(),
  latencyMs: z.number().nonnegative(),
  safetyPassRate: z.number(),
  isParetoOptimal: z.boolean()
});

export const EvalGateSchema = z.object({
  label: z.string().min(1),
  passed: z.boolean(),
  actual: z.string().min(1),
  target: z.string().min(1)
});

export const EvalDecisionSchema = z.object({
  status: z.enum(["pass", "warn", "fail"]),
  message: z.string().min(1),
  gates: z.array(EvalGateSchema)
});

export const EvalRunEventSchema = z.object({
  id: z.string().min(1),
  at: z.string().datetime(),
  level: z.enum(["info", "success", "warning", "error"]),
  message: z.string().min(1),
  nodeId: z.string().optional()
});

export const EvalRunSummarySchema = z.object({
  artifactCount: z.number().int().nonnegative(),
  approvedArtifactCount: z.number().int().nonnegative(),
  estimatedCostUsd: z.number().nonnegative(),
  taskCount: z.number().int().nonnegative(),
  averageQuality: z.number(),
  safetyPassRate: z.number(),
  p95LatencyMs: z.number().nonnegative(),
  bestModel: z.string().min(1)
});

export const EvalRunRecordSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  status: EvalRunStatusSchema,
  spec: EvalRunSpecSchema,
  summary: EvalRunSummarySchema,
  jobs: z.array(ImageGenerationJobSchema),
  artifacts: z.array(ImageArtifactSchema),
  scores: z.array(ImageScoreSchema),
  reviews: z.array(HumanReviewSchema),
  pairwise: z.array(PairwiseComparisonSchema),
  modelSummaries: z.array(ModelSummarySchema),
  pareto: z.array(ParetoPointSchema),
  decision: EvalDecisionSchema,
  events: z.array(EvalRunEventSchema)
});

export type ImageProvider = z.infer<typeof ImageProviderSchema>;
export type ImageMetric = z.infer<typeof ImageMetricSchema>;
export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>;
export type EvalRunStatus = z.infer<typeof EvalRunStatusSchema>;
export type ImageGenerationJob = z.infer<typeof ImageGenerationJobSchema>;
export type ImageArtifact = z.infer<typeof ImageArtifactSchema>;
export type ImageScore = z.infer<typeof ImageScoreSchema>;
export type HumanReview = z.infer<typeof HumanReviewSchema>;
export type PairwiseComparison = z.infer<typeof PairwiseComparisonSchema>;
export type ReviewCampaignMode = z.infer<typeof ReviewCampaignModeSchema>;
export type ReviewCampaignStatus = z.infer<typeof ReviewCampaignStatusSchema>;
export type ReviewTaskKind = z.infer<typeof ReviewTaskKindSchema>;
export type ReviewTaskStatus = z.infer<typeof ReviewTaskStatusSchema>;
export type ReviewLinkScope = z.infer<typeof ReviewLinkScopeSchema>;
export type ReviewerSessionStatus = z.infer<typeof ReviewerSessionStatusSchema>;
export type PairwiseVoteChoice = z.infer<typeof PairwiseVoteChoiceSchema>;
export type ReviewReasonTag = z.infer<typeof ReviewReasonTagSchema>;
export type ReviewCampaign = z.infer<typeof ReviewCampaignSchema>;
export type ReviewTask = z.infer<typeof ReviewTaskSchema>;
export type ReviewLink = z.infer<typeof ReviewLinkSchema>;
export type ReviewerSession = z.infer<typeof ReviewerSessionSchema>;
export type PairwiseVote = z.infer<typeof PairwiseVoteSchema>;
export type ReviewArtifactPayload = z.infer<typeof ReviewArtifactPayloadSchema>;
export type ReviewTaskPayload = z.infer<typeof ReviewTaskPayloadSchema>;
export type ModelSummary = z.infer<typeof ModelSummarySchema>;
export type ParetoPoint = z.infer<typeof ParetoPointSchema>;
export type EvalDecision = z.infer<typeof EvalDecisionSchema>;
export type EvalRunEvent = z.infer<typeof EvalRunEventSchema>;
export type EvalRunSummary = z.infer<typeof EvalRunSummarySchema>;
export type EvalRunRecord = z.infer<typeof EvalRunRecordSchema>;

export function getNodeDefinition(type: string): EvalNodeDefinition | undefined {
  return nodeDefinitionMap.get(type);
}

export function getPort(
  definition: EvalNodeDefinition,
  direction: "inputs" | "outputs",
  portId: string | undefined
): Port | undefined {
  const ports = definition[direction];
  if (!portId && ports.length === 1) {
    return ports[0];
  }

  return ports.find((port) => port.id === portId);
}

export function arePortsCompatible(source: Port, target: Port): boolean {
  return source.type === target.type;
}

export const starterWorkflowDraft = {
  name: "Image generation bake-off",
  description: "Compare image models with automatic metrics and human review.",
  version: 1,
  nodes: [
    {
      id: "prompt-set",
      type: "dataset.prompt_set",
      position: { x: 0, y: 120 },
      data: {
        label: "Prompt Set",
        status: "idle",
        config: {
          datasetId: "golden-image-prompts-v1",
          sampleLimit: 200
        }
      }
    },
    {
      id: "prompt-template",
      type: "prompt.template",
      position: { x: 280, y: 120 },
      data: {
        label: "Prompt Template",
        status: "idle",
        config: {
          template: "{{prompt}}\nStyle: commercial-ready, brand-safe, no watermark."
        }
      }
    },
    {
      id: "model-fanout",
      type: "generation.model_fanout",
      position: { x: 580, y: 120 },
      data: {
        label: "Model Fanout",
        status: "idle",
        config: {
          models: ["gpt-image", "imagen", "flux", "sdxl"],
          samplesPerPrompt: 2,
          seedStrategy: "fixed_by_prompt",
          budgetUsd: 50
        }
      }
    },
    {
      id: "artifact-store",
      type: "artifact.store",
      position: { x: 900, y: 120 },
      data: {
        label: "Artifact Store",
        status: "idle",
        config: {
          bucket: "oss://eval-artifacts",
          retentionDays: 90
        }
      }
    },
    {
      id: "auto-metrics",
      type: "metric.auto_image",
      position: { x: 1220, y: 40 },
      data: {
        label: "Auto Metrics",
        status: "idle",
        config: {
          metrics: [
            "vlm_rubric",
            "clip_siglip",
            "ocr",
            "nsfw",
            "blur",
            "aesthetic",
            "cost",
            "latency"
          ],
          budgetUsd: 12
        }
      }
    },
    {
      id: "human-eval",
      type: "human.pairwise",
      position: { x: 1220, y: 220 },
      data: {
        label: "Human Eval",
        status: "idle",
        config: {
          sampleRate: 0.2,
          reviewersPerTask: 3,
          blindMode: true
        }
      }
    },
    {
      id: "aggregate",
      type: "aggregate.model_scores",
      position: { x: 1540, y: 120 },
      data: {
        label: "Aggregate",
        status: "idle",
        config: {
          rankingMethod: "elo"
        }
      }
    },
    {
      id: "release-gate",
      type: "decision.release_gate",
      position: { x: 1840, y: 120 },
      data: {
        label: "Release Gate",
        status: "idle",
        config: {
          baselineRunId: "baseline-current-prod",
          minHumanWinRate: 0.55,
          maxCostIncreasePct: 20,
          safetyMustPass: true
        }
      }
    }
  ],
  edges: [
    {
      id: "prompt-set-to-template",
      source: "prompt-set",
      sourceHandle: "prompts",
      target: "prompt-template",
      targetHandle: "prompts"
    },
    {
      id: "template-to-fanout",
      source: "prompt-template",
      sourceHandle: "rendered",
      target: "model-fanout",
      targetHandle: "prompts"
    },
    {
      id: "fanout-to-store",
      source: "model-fanout",
      sourceHandle: "images",
      target: "artifact-store",
      targetHandle: "artifacts"
    },
    {
      id: "store-to-metrics",
      source: "artifact-store",
      sourceHandle: "stored",
      target: "auto-metrics",
      targetHandle: "artifacts"
    },
    {
      id: "store-to-human",
      source: "artifact-store",
      sourceHandle: "stored",
      target: "human-eval",
      targetHandle: "artifacts"
    },
    {
      id: "metrics-to-aggregate",
      source: "auto-metrics",
      sourceHandle: "scores",
      target: "aggregate",
      targetHandle: "scores"
    },
    {
      id: "human-to-aggregate",
      source: "human-eval",
      sourceHandle: "annotations",
      target: "aggregate",
      targetHandle: "annotations"
    },
    {
      id: "aggregate-to-gate",
      source: "aggregate",
      sourceHandle: "report",
      target: "release-gate",
      targetHandle: "report"
    }
  ]
} satisfies WorkflowDraft;
