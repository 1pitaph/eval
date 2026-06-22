import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BadgeCheck,
  Braces,
  CheckCircle2,
  CircleDollarSign,
  Database,
  FileJson,
  Gauge,
  GitBranch,
  HardDrive,
  ImagePlus,
  Layers3,
  ListChecks,
  MessageSquareText,
  Network,
  Save,
  ShieldCheck,
  Sparkles,
  Table2,
  Trash2,
  WandSparkles,
  XCircle
} from "lucide-react";
import {
  Badge,
  Button,
  CheckboxControl,
  Panel,
  SelectControl,
  TextArea,
  TextInput
} from "@eval/ui";
import {
  getNodeDefinition,
  type ApiProvider,
  type EvalNodeDefinition,
  type EvalRunRecord,
  type ImageMetric,
  type PromptCase,
  type ReferenceImage
} from "@eval/workflow-schema";
import { listApiProviders } from "../../../shared/api/evalApi";
import {
  type EvalFlowEdge,
  type EvalFlowNode,
  useWorkflowStore
} from "../state/workflowStore";

type ConfigPatch = Record<string, unknown>;
type InputMode = "single" | "batch" | "dataset";
type AssetRole = ReferenceImage["role"];

type ConfigFieldMeta = {
  type?: string;
  title?: string;
  enum?: string[];
  items?: { type?: string };
};

type AvailableModel = {
  id: string;
  name: string;
  providerLabel: string;
  estimatedCostPerImageUsd: number;
  estimatedLatencyMs: number;
};

type DerivedPlan = {
  promptCases: PromptCase[];
  promptCount: number;
  referenceImages: ReferenceImage[];
  referenceImageCount: number;
  inputMode: InputMode;
  template: string;
  negativePrompt: string;
  variables: string[];
  models: string[];
  samplesPerPrompt: number;
  seedStrategy: string;
  generationBudgetUsd: number;
  imageCount: number;
  metrics: ImageMetric[];
  metricBudgetUsd: number;
  metricChecks: number;
  sampleRate: number;
  reviewersPerTask: number;
  humanTasks: number;
  estimatedVotes: number;
  rankingMethod: string;
  releaseGate: {
    baselineRunId: string;
    minHumanWinRate: number;
    maxCostIncreasePct: number;
    safetyMustPass: boolean;
  };
  estimatedCostUsd: number;
};

type InspectorStatData = {
  label: string;
  tone?: "success" | "warning" | "danger" | undefined;
  value: string;
};

const defaultPrompt =
  "A premium running shoe hero image on a clean studio background with readable launch text";

const fallbackAvailableModels: AvailableModel[] = [
  {
    id: "gpt-image",
    name: "GPT Image",
    providerLabel: "OpenAI",
    estimatedCostPerImageUsd: 0.045,
    estimatedLatencyMs: 4200
  },
  {
    id: "imagen",
    name: "Imagen",
    providerLabel: "Google Imagen",
    estimatedCostPerImageUsd: 0.038,
    estimatedLatencyMs: 4700
  },
  {
    id: "flux",
    name: "FLUX",
    providerLabel: "fal.ai",
    estimatedCostPerImageUsd: 0.024,
    estimatedLatencyMs: 3100
  },
  {
    id: "sdxl",
    name: "SDXL",
    providerLabel: "Replicate",
    estimatedCostPerImageUsd: 0.016,
    estimatedLatencyMs: 5600
  }
];

const knownMetrics: Array<{
  id: ImageMetric;
  label: string;
  group: string;
  threshold: string;
}> = [
  {
    id: "vlm_rubric",
    label: "VLM rubric",
    group: "Prompt fit",
    threshold: ">= 72%"
  },
  {
    id: "clip_siglip",
    label: "CLIP/SigLIP",
    group: "Alignment",
    threshold: ">= 72%"
  },
  { id: "ocr", label: "OCR text", group: "Text", threshold: ">= 68%" },
  { id: "nsfw", label: "Safety", group: "Policy", threshold: ">= 94%" },
  { id: "blur", label: "Sharpness", group: "Quality", threshold: ">= 72%" },
  {
    id: "aesthetic",
    label: "Aesthetic",
    group: "Quality",
    threshold: ">= 72%"
  },
  { id: "cost", label: "Cost", group: "Ops", threshold: "<= $0.055" },
  { id: "latency", label: "Latency", group: "Ops", threshold: "<= 6.5s" }
];

const reasonTags = [
  "prompt_adherence",
  "aesthetic_quality",
  "text_rendering",
  "composition",
  "visual_artifacts",
  "safety",
  "brand_fit"
];

const sampleDatasetPrompts = [
  "Hero sneaker",
  "Cafe poster",
  "App store banner",
  "Beauty flatlay"
];

export function InspectorPanel() {
  const selectedNodeId = useWorkflowStore((state) => state.selectedNodeId);
  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);
  const runResult = useWorkflowStore((state) => state.runResult);
  const node = nodes.find((candidate) => candidate.id === selectedNodeId);
  const definition = node?.type ? getNodeDefinition(node.type) : undefined;
  const run = runResult && "run" in runResult ? runResult.run : undefined;
  const plan = useMemo(() => derivePlan(nodes), [nodes]);

  if (!node || !definition) {
    return (
      <Panel className="inspector-panel inspector-panel--visual" title="Inspector">
        <p className="empty-state">Select a node to edit its configuration.</p>
      </Panel>
    );
  }

  return (
    <NodeInspector
      definition={definition}
      edges={edges}
      key={node.id}
      node={node}
      nodes={nodes}
      plan={plan}
      run={run}
    />
  );
}

function NodeInspector({
  definition,
  edges,
  node,
  nodes,
  plan,
  run
}: {
  definition: EvalNodeDefinition;
  edges: EvalFlowEdge[];
  node: EvalFlowNode;
  nodes: EvalFlowNode[];
  plan: DerivedPlan;
  run: EvalRunRecord | undefined;
}) {
  const updateNodeConfig = useWorkflowStore((state) => state.updateNodeConfig);
  const config = node.data.config ?? {};
  const patchConfig = (patch: ConfigPatch) => {
    updateNodeConfig(node.id, mergeConfig(config, patch));
  };
  const replaceConfig = (nextConfig: ConfigPatch) => {
    updateNodeConfig(node.id, nextConfig);
  };
  const stats = nodeStats(node, plan, run);

  return (
    <Panel className="inspector-panel inspector-panel--visual" title="Inspector">
      <div className="node-inspector">
        <header className="node-inspector__hero">
          <div className="node-inspector__icon">{nodeIcon(node.type ?? "")}</div>
          <div>
            <span className="node-inspector__eyebrow">
              {definition.runtime.replace("_", " ")}
            </span>
            <h3>{definition.title}</h3>
            <p>{definition.description}</p>
          </div>
          <Badge tone={statusTone(String(node.data.status ?? "idle"))}>
            {String(node.data.status ?? "idle")}
          </Badge>
        </header>

        <ConnectionStrip
          definition={definition}
          edges={edges}
          node={node}
          nodes={nodes}
          plan={plan}
        />

        <div className="inspector-stat-grid">
          {stats.map((stat) => (
            <InspectorStat
              key={stat.label}
              label={stat.label}
              value={stat.value}
              tone={stat.tone}
            />
          ))}
        </div>

        <NodeEditor
          config={config}
          node={node}
          onPatch={patchConfig}
          plan={plan}
          run={run}
        />

        <AdvancedJson
          config={config}
          key={JSON.stringify(config)}
          onApply={replaceConfig}
        />
      </div>
    </Panel>
  );
}

function NodeEditor({
  config,
  node,
  onPatch,
  plan,
  run
}: {
  config: Record<string, unknown>;
  node: EvalFlowNode;
  onPatch: (patch: ConfigPatch) => void;
  plan: DerivedPlan;
  run: EvalRunRecord | undefined;
}) {
  switch (node.type) {
    case "dataset.prompt_set":
      return <PromptSetEditor config={config} onPatch={onPatch} plan={plan} />;
    case "prompt.template":
      return <PromptTemplateEditor config={config} onPatch={onPatch} plan={plan} />;
    case "generation.model_fanout":
      return <ModelFanoutEditor config={config} onPatch={onPatch} plan={plan} />;
    case "artifact.store":
      return <ArtifactStoreEditor config={config} onPatch={onPatch} run={run} />;
    case "metric.auto_image":
      return (
        <AutoMetricsEditor config={config} onPatch={onPatch} plan={plan} run={run} />
      );
    case "human.pairwise":
      return (
        <HumanEvalEditor config={config} onPatch={onPatch} plan={plan} run={run} />
      );
    case "aggregate.model_scores":
      return <AggregateEditor config={config} onPatch={onPatch} run={run} />;
    case "decision.release_gate":
      return (
        <ReleaseGateEditor config={config} onPatch={onPatch} plan={plan} run={run} />
      );
    default:
      return <GenericConfigEditor config={config} node={node} onPatch={onPatch} />;
  }
}

function PromptSetEditor({
  config,
  onPatch,
  plan
}: {
  config: Record<string, unknown>;
  onPatch: (patch: ConfigPatch) => void;
  plan: DerivedPlan;
}) {
  const promptCases = plan.promptCases;
  const referenceImages = plan.referenceImages;
  const inputMode = plan.inputMode;
  const datasetId = stringConfig(config.datasetId, "golden-image-prompts-v1");
  const sampleLimit = numberConfig(config.sampleLimit, 4);

  const setInputMode = (mode: InputMode) => {
    if (mode === "dataset") {
      onPatch({
        inputUiMode: "dataset",
        mode: "dataset",
        datasetId:
          datasetId === "inline-run-input" ? "golden-image-prompts-v1" : datasetId,
        sampleLimit: Math.max(sampleLimit, 1)
      });
      return;
    }

    const prompts =
      mode === "single"
        ? [promptCases[0] ?? toPromptCase(defaultPrompt, 1, "single")]
        : promptCases.length > 1
          ? promptCases
          : [promptCases[0] ?? toPromptCase(defaultPrompt, 1, "batch")];

    onPatch({
      inputUiMode: mode,
      mode: "inline",
      datasetId: "inline-run-input",
      sampleLimit: Math.max(prompts.length, 1),
      inlinePrompts: prompts.map((prompt, index) => ({
        ...prompt,
        id: prompt.id || `prompt-${index + 1}`,
        tags: prompt.tags.length > 0 ? prompt.tags : [mode]
      }))
    });
  };

  const updatePrompt = (index: number, patch: Partial<PromptCase>) => {
    const nextPrompts = promptCases.map((prompt, promptIndex) =>
      promptIndex === index ? cleanPromptCase({ ...prompt, ...patch }) : prompt
    );
    onPatch({
      inputUiMode: nextPrompts.length > 1 ? "batch" : "single",
      mode: "inline",
      datasetId: "inline-run-input",
      sampleLimit: Math.max(nextPrompts.length, 1),
      inlinePrompts: nextPrompts
    });
  };

  const addPrompt = () => {
    const nextIndex = promptCases.length + 1;
    onPatch({
      inputUiMode: "batch",
      mode: "inline",
      datasetId: "inline-run-input",
      sampleLimit: nextIndex,
      inlinePrompts: [
        ...promptCases,
        toPromptCase(`New evaluation prompt ${nextIndex}`, nextIndex, "batch")
      ]
    });
  };

  const duplicatePrompt = (index: number) => {
    const prompt = promptCases[index];
    if (!prompt) {
      return;
    }

    const nextPrompts = [
      ...promptCases.slice(0, index + 1),
      {
        ...prompt,
        id: `prompt-${promptCases.length + 1}`,
        prompt: `${prompt.prompt}`
      },
      ...promptCases.slice(index + 1)
    ].map((candidate, promptIndex) => ({
      ...candidate,
      id: candidate.id || `prompt-${promptIndex + 1}`
    }));

    onPatch({
      inputUiMode: "batch",
      mode: "inline",
      datasetId: "inline-run-input",
      sampleLimit: nextPrompts.length,
      inlinePrompts: nextPrompts
    });
  };

  const removePrompt = (index: number) => {
    const nextPrompts = promptCases.filter((_, promptIndex) => promptIndex !== index);
    const fallback =
      nextPrompts.length > 0 ? nextPrompts : [toPromptCase(defaultPrompt, 1)];
    onPatch({
      inputUiMode: fallback.length > 1 ? "batch" : "single",
      mode: "inline",
      datasetId: "inline-run-input",
      sampleLimit: fallback.length,
      inlinePrompts: fallback
    });
  };

  const handleAssetUpload = async (
    role: AssetRole,
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    const uri = await readFileAsDataUrl(file);
    const dimensions = await readImageDimensions(uri);
    const asset: ReferenceImage = {
      id: `${role}-${file.name}-${file.size}-${file.lastModified}`,
      uri,
      thumbnailUri: uri,
      mimeType: file.type || "image/*",
      source: "upload",
      role,
      label: file.name,
      ...(dimensions ? dimensions : {})
    };

    onPatch({
      referenceImages: [
        ...referenceImages.filter((image) => image.role !== role),
        asset
      ]
    });
  };

  const removeAsset = (role: AssetRole) => {
    onPatch({
      referenceImages: referenceImages.filter((image) => image.role !== role)
    });
  };

  return (
    <div className="inspector-node-editor">
      <InspectorSection
        icon={<Database aria-hidden="true" size={16} />}
        meta={`${plan.promptCount} prompts in flow`}
        title="Source"
      >
        <SegmentedControl
          options={[
            { id: "single", label: "Single", icon: <ListChecks size={13} /> },
            { id: "batch", label: "Batch", icon: <Table2 size={13} /> },
            { id: "dataset", label: "Dataset", icon: <Database size={13} /> }
          ]}
          value={inputMode}
          onChange={(mode) => setInputMode(mode as InputMode)}
        />

        {inputMode === "dataset" ? (
          <div className="inspector-two-column">
            <label className="visual-field">
              <span>Dataset</span>
              <SelectControl
                onValueChange={(value) => onPatch({ datasetId: value })}
                options={[
                  {
                    label: "golden-image-prompts-v1",
                    value: "golden-image-prompts-v1"
                  }
                ]}
                value={datasetId}
              />
            </label>
            <label className="visual-field">
              <span>Sample limit</span>
              <TextInput
                min="1"
                onChange={(event) =>
                  onPatch({ sampleLimit: positiveNumber(event.target.value, 1) })
                }
                type="number"
                value={sampleLimit}
              />
            </label>
          </div>
        ) : null}

        {inputMode === "single" ? (
          <PromptCard
            index={0}
            onChange={updatePrompt}
            prompt={promptCases[0] ?? toPromptCase(defaultPrompt, 1)}
            single
          />
        ) : null}

        {inputMode === "batch" ? (
          <div className="prompt-card-list">
            {promptCases.map((prompt, index) => (
              <PromptCard
                index={index}
                key={prompt.id || index}
                onChange={updatePrompt}
                onDuplicate={() => duplicatePrompt(index)}
                onRemove={() => removePrompt(index)}
                prompt={prompt}
              />
            ))}
            <Button onClick={addPrompt} type="button" variant="secondary">
              <ListChecks aria-hidden="true" size={14} />
              Add prompt
            </Button>
          </div>
        ) : null}
      </InspectorSection>

      <InspectorSection
        icon={<ImagePlus aria-hidden="true" size={16} />}
        meta={`${plan.referenceImageCount} attached`}
        title="Reference Assets"
      >
        <div className="asset-slot-grid">
          {(["reference", "style", "mask"] as AssetRole[]).map((role) => (
            <AssetSlot
              asset={referenceImages.find((image) => image.role === role)}
              key={role}
              onRemove={() => removeAsset(role)}
              onUpload={(event) => void handleAssetUpload(role, event)}
              role={role}
            />
          ))}
        </div>
      </InspectorSection>

      <InspectorSection
        icon={<ArrowRight aria-hidden="true" size={16} />}
        meta="Prompt stream"
        title="Output Preview"
      >
        <div className="prompt-preview-list">
          {(inputMode === "dataset"
            ? sampleDatasetPrompts
            : promptCases.map((p) => p.prompt)
          )
            .slice(0, 4)
            .map((prompt, index) => (
              <div className="prompt-preview-row" key={`${prompt}-${index}`}>
                <span>{index + 1}</span>
                <p>{prompt}</p>
              </div>
            ))}
        </div>
      </InspectorSection>
    </div>
  );
}

function PromptTemplateEditor({
  config,
  onPatch,
  plan
}: {
  config: Record<string, unknown>;
  onPatch: (patch: ConfigPatch) => void;
  plan: DerivedPlan;
}) {
  const [selectedPromptIndex, setSelectedPromptIndex] = useState(0);
  const template = stringConfig(config.template, plan.template);
  const negativePrompt = stringConfig(config.negativePrompt, plan.negativePrompt);
  const prompt =
    plan.promptCases[selectedPromptIndex] ??
    plan.promptCases[0] ??
    toPromptCase(defaultPrompt, 1);
  const renderedPreview = renderPrompt(template, prompt.prompt);
  const variables = variablesFromTemplate(template);

  return (
    <div className="inspector-node-editor">
      <InspectorSection
        icon={<WandSparkles aria-hidden="true" size={16} />}
        meta={`${variables.length || 1} variable`}
        title="Template"
      >
        <label className="visual-field">
          <span>Template body</span>
          <TextArea
            className="template-textarea"
            onChange={(event) => onPatch({ template: event.target.value })}
            value={template}
          />
        </label>
        <div className="variable-chip-row variable-chip-row--visual">
          {(variables.length > 0 ? variables : ["prompt"]).map((variable) => (
            <span key={variable}>{`{{${variable}}}`}</span>
          ))}
        </div>
        <label className="visual-field">
          <span>Negative prompt</span>
          <TextInput
            onChange={(event) => onPatch({ negativePrompt: event.target.value })}
            value={negativePrompt}
          />
        </label>
      </InspectorSection>

      <InspectorSection
        icon={<Sparkles aria-hidden="true" size={16} />}
        meta={prompt.id}
        title="Rendered Preview"
      >
        <div className="inspector-two-column inspector-two-column--tight">
          <label className="visual-field">
            <span>Sample prompt</span>
            <SelectControl
              onValueChange={(value) => setSelectedPromptIndex(Number(value))}
              options={plan.promptCases.slice(0, 12).map((candidate, index) => ({
                label: candidate.id || `Prompt ${index + 1}`,
                value: String(index)
              }))}
              value={String(Math.min(selectedPromptIndex, plan.promptCases.length - 1))}
            />
          </label>
          <div className="inspector-microcopy">
            <strong>{prompt.expectedText ? "Expected text" : "Tags"}</strong>
            <span>{prompt.expectedText || prompt.tags.join(", ") || "none"}</span>
          </div>
        </div>
        <div className="rendered-preview rendered-preview--visual">
          <strong>Rendered output</strong>
          <p>{renderedPreview}</p>
        </div>
      </InspectorSection>
    </div>
  );
}

function ModelFanoutEditor({
  config,
  onPatch,
  plan
}: {
  config: Record<string, unknown>;
  onPatch: (patch: ConfigPatch) => void;
  plan: DerivedPlan;
}) {
  const providersQuery = useQuery({
    queryKey: ["api-providers"],
    queryFn: listApiProviders
  });
  const [customModel, setCustomModel] = useState("");
  const availableModels = useMemo(
    () => modelsFromProviders(providersQuery.data?.providers),
    [providersQuery.data?.providers]
  );
  const selectedModels = stringArrayConfig(config.models, plan.models);
  const visibleModels = mergeAvailableModels(availableModels, selectedModels);
  const samplesPerPrompt = numberConfig(config.samplesPerPrompt, plan.samplesPerPrompt);
  const seedStrategy = stringConfig(config.seedStrategy, plan.seedStrategy);
  const budgetUsd = numberConfig(config.budgetUsd, plan.generationBudgetUsd);
  const estimatedCost = estimateGenerationCost(
    plan.promptCount,
    selectedModels,
    samplesPerPrompt,
    visibleModels
  );
  const imageCount = plan.promptCount * selectedModels.length * samplesPerPrompt;
  const overBudget = budgetUsd > 0 && estimatedCost > budgetUsd;

  const toggleModel = (model: string) => {
    const nextModels = selectedModels.includes(model)
      ? selectedModels.filter((candidate) => candidate !== model)
      : [...selectedModels, model];
    onPatch({ models: nextModels.length > 0 ? nextModels : [model] });
  };

  const addCustomModel = () => {
    const normalized = customModel.trim();
    if (!normalized || selectedModels.includes(normalized)) {
      return;
    }
    onPatch({ models: [...selectedModels, normalized] });
    setCustomModel("");
  };

  return (
    <div className="inspector-node-editor">
      <InspectorSection
        icon={<Network aria-hidden="true" size={16} />}
        meta={`${imageCount} images`}
        title="Generation Matrix"
      >
        <div className="matrix-formula">
          <MetricToken label="Prompts" value={plan.promptCount} />
          <span>x</span>
          <MetricToken label="Models" value={selectedModels.length} />
          <span>x</span>
          <MetricToken label="Samples" value={samplesPerPrompt} />
          <ArrowRight aria-hidden="true" size={16} />
          <MetricToken label="Images" value={imageCount} strong />
        </div>
        <div className="model-choice-grid model-choice-grid--visual">
          {visibleModels.map((model) => (
            <div
              className={`model-choice model-choice--visual ${
                selectedModels.includes(model.id) ? "is-selected" : ""
              }`}
              key={model.id}
            >
              <CheckboxControl
                checked={selectedModels.includes(model.id)}
                onCheckedChange={() => toggleModel(model.id)}
              />
              <span>
                <strong>{model.name}</strong>
                <small>
                  {model.providerLabel} · ${model.estimatedCostPerImageUsd.toFixed(3)}
                </small>
              </span>
            </div>
          ))}
        </div>
        <div className="custom-model-row">
          <TextInput
            onChange={(event) => setCustomModel(event.target.value)}
            placeholder="custom-model-id"
            value={customModel}
          />
          <Button onClick={addCustomModel} type="button" variant="secondary">
            Add model
          </Button>
        </div>
      </InspectorSection>

      <InspectorSection
        icon={<CircleDollarSign aria-hidden="true" size={16} />}
        meta={overBudget ? "Over budget" : "Within budget"}
        title="Run Controls"
      >
        <div className="inspector-three-column">
          <label className="visual-field">
            <span>Samples</span>
            <TextInput
              min="1"
              max="16"
              onChange={(event) =>
                onPatch({ samplesPerPrompt: positiveNumber(event.target.value, 1) })
              }
              type="number"
              value={samplesPerPrompt}
            />
          </label>
          <label className="visual-field">
            <span>Seed</span>
            <SelectControl
              onValueChange={(value) => onPatch({ seedStrategy: value })}
              options={[
                { label: "Fixed by prompt", value: "fixed_by_prompt" },
                { label: "Random", value: "random" },
                { label: "Manual", value: "manual" }
              ]}
              value={seedStrategy}
            />
          </label>
          <label className="visual-field">
            <span>Budget</span>
            <TextInput
              min="0"
              onChange={(event) =>
                onPatch({ budgetUsd: nonNegativeNumber(event.target.value, 0) })
              }
              type="number"
              value={budgetUsd}
            />
          </label>
        </div>
        <div className={`budget-meter ${overBudget ? "budget-meter--warning" : ""}`}>
          <span style={{ width: `${meterWidth(estimatedCost, budgetUsd)}` }} />
        </div>
        <div className="inspector-inline-facts">
          <span>Estimated generation cost ${estimatedCost.toFixed(2)}</span>
          <span>
            Slowest provider {maxLatency(visibleModels, selectedModels) / 1000}s
          </span>
        </div>
      </InspectorSection>
    </div>
  );
}

function ArtifactStoreEditor({
  config,
  onPatch,
  run
}: {
  config: Record<string, unknown>;
  onPatch: (patch: ConfigPatch) => void;
  run: EvalRunRecord | undefined;
}) {
  const bucket = stringConfig(config.bucket, "oss://eval-artifacts");
  const retentionDays = numberConfig(config.retentionDays, 90);

  return (
    <div className="inspector-node-editor">
      <InspectorSection
        icon={<HardDrive aria-hidden="true" size={16} />}
        meta={`${retentionDays} days`}
        title="Storage Policy"
      >
        <div className="inspector-two-column">
          <label className="visual-field">
            <span>Bucket</span>
            <TextInput
              onChange={(event) => onPatch({ bucket: event.target.value })}
              value={bucket}
            />
          </label>
          <label className="visual-field">
            <span>Retention</span>
            <TextInput
              min="1"
              onChange={(event) =>
                onPatch({ retentionDays: positiveNumber(event.target.value, 1) })
              }
              type="number"
              value={retentionDays}
            />
          </label>
        </div>
        <div className="path-preview">
          <strong>Path pattern</strong>
          <code>{`${bucket.replace(/\/$/, "")}/runs/{runId}/{artifactId}.webp`}</code>
        </div>
        <div className="metadata-chip-grid">
          {["image", "thumbnail", "raw response", "hash", "embedding", "lineage"].map(
            (item) => (
              <span key={item}>{item}</span>
            )
          )}
        </div>
      </InspectorSection>

      <InspectorSection
        icon={<Layers3 aria-hidden="true" size={16} />}
        meta={run ? `${run.artifacts.length} stored` : "No run yet"}
        title="Stored Artifacts"
      >
        {run ? (
          <div className="artifact-preview-grid">
            {run.artifacts.slice(0, 6).map((artifact) => (
              <div className="artifact-preview" key={artifact.id}>
                <img alt={artifact.id} src={artifact.thumbnailUri} />
                <span>{artifact.model}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyEvidence text="Run this workflow to see stored image artifacts here." />
        )}
      </InspectorSection>
    </div>
  );
}

function AutoMetricsEditor({
  config,
  onPatch,
  plan,
  run
}: {
  config: Record<string, unknown>;
  onPatch: (patch: ConfigPatch) => void;
  plan: DerivedPlan;
  run: EvalRunRecord | undefined;
}) {
  const selectedMetrics = normalizeMetrics(config.metrics);
  const budgetUsd = numberConfig(config.budgetUsd, plan.metricBudgetUsd);
  const checks = plan.imageCount * selectedMetrics.length;
  const groups = Array.from(new Set(knownMetrics.map((metric) => metric.group)));
  const passRate = run
    ? run.scores.filter((score) => score.pass).length / Math.max(run.scores.length, 1)
    : undefined;

  const toggleMetric = (metric: ImageMetric) => {
    const nextMetrics = selectedMetrics.includes(metric)
      ? selectedMetrics.filter((candidate) => candidate !== metric)
      : [...selectedMetrics, metric];
    onPatch({ metrics: nextMetrics.length > 0 ? nextMetrics : [metric] });
  };

  return (
    <div className="inspector-node-editor">
      <InspectorSection
        icon={<Gauge aria-hidden="true" size={16} />}
        meta={`${checks} checks`}
        title="Metric Suite"
      >
        <div className="metric-group-list">
          {groups.map((group) => (
            <div className="metric-group" key={group}>
              <strong>{group}</strong>
              <div>
                {knownMetrics
                  .filter((metric) => metric.group === group)
                  .map((metric) => (
                    <label className="metric-toggle" key={metric.id}>
                      <CheckboxControl
                        checked={selectedMetrics.includes(metric.id)}
                        onCheckedChange={() => toggleMetric(metric.id)}
                      />
                      <span>
                        <b>{metric.label}</b>
                        <small>{metric.threshold}</small>
                      </span>
                    </label>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </InspectorSection>

      <InspectorSection
        icon={<CircleDollarSign aria-hidden="true" size={16} />}
        meta={run ? `${percent(passRate ?? 0)} pass` : "$ estimate"}
        title="Coverage"
      >
        <div className="inspector-three-column">
          <InspectorStat label="Images" value={String(plan.imageCount)} />
          <InspectorStat label="Metrics" value={String(selectedMetrics.length)} />
          <InspectorStat label="Checks" value={String(checks)} />
        </div>
        <label className="visual-field">
          <span>Metric budget</span>
          <TextInput
            min="0"
            onChange={(event) =>
              onPatch({ budgetUsd: nonNegativeNumber(event.target.value, 0) })
            }
            type="number"
            value={budgetUsd}
          />
        </label>
      </InspectorSection>
    </div>
  );
}

function HumanEvalEditor({
  config,
  onPatch,
  plan,
  run
}: {
  config: Record<string, unknown>;
  onPatch: (patch: ConfigPatch) => void;
  plan: DerivedPlan;
  run: EvalRunRecord | undefined;
}) {
  const sampleRate = numberConfig(config.sampleRate, plan.sampleRate);
  const reviewersPerTask = numberConfig(config.reviewersPerTask, plan.reviewersPerTask);
  const blindMode = config.blindMode !== false;
  const selectedReasonTags = stringArrayConfig(config.reasonTags, [
    "prompt_adherence",
    "aesthetic_quality",
    "text_rendering"
  ]);
  const humanTasks =
    sampleRate > 0
      ? Math.ceil(plan.promptCount * Math.max(plan.models.length - 1, 1) * sampleRate)
      : 0;
  const votes = humanTasks * reviewersPerTask;

  const toggleReasonTag = (tag: string) => {
    const nextTags = selectedReasonTags.includes(tag)
      ? selectedReasonTags.filter((candidate) => candidate !== tag)
      : [...selectedReasonTags, tag];
    onPatch({ reasonTags: nextTags });
  };

  return (
    <div className="inspector-node-editor">
      <InspectorSection
        icon={<MessageSquareText aria-hidden="true" size={16} />}
        meta={`${votes} votes`}
        title="Sampling Plan"
      >
        <div className="review-rate-row">
          {[0, 0.2, 0.5, 1].map((rate) => (
            <Button
              className={sampleRate === rate ? "is-active" : ""}
              key={rate}
              onClick={() => onPatch({ sampleRate: rate })}
              type="button"
              variant={sampleRate === rate ? "primary" : "ghost"}
            >
              {percent(rate)}
            </Button>
          ))}
        </div>
        <div className="inspector-three-column">
          <label className="visual-field">
            <span>Sample rate</span>
            <TextInput
              max="1"
              min="0"
              onChange={(event) =>
                onPatch({ sampleRate: clampNumberInput(event.target.value, 0, 1) })
              }
              step="0.05"
              type="number"
              value={sampleRate}
            />
          </label>
          <label className="visual-field">
            <span>Reviewers</span>
            <TextInput
              min="1"
              onChange={(event) =>
                onPatch({ reviewersPerTask: positiveNumber(event.target.value, 1) })
              }
              type="number"
              value={reviewersPerTask}
            />
          </label>
          <div className="visual-toggle">
            <CheckboxControl
              checked={blindMode}
              onCheckedChange={(checked) => onPatch({ blindMode: checked })}
            />
            <span>Blind mode</span>
          </div>
        </div>
        <div className="inspector-stat-grid inspector-stat-grid--nested">
          <InspectorStat label="Tasks" value={String(humanTasks)} />
          <InspectorStat label="Votes" value={String(votes)} />
          <InspectorStat
            label="Pairs"
            value={String(Math.max(plan.models.length - 1, 0))}
          />
        </div>
      </InspectorSection>

      <InspectorSection
        icon={<ListChecks aria-hidden="true" size={16} />}
        meta={`${selectedReasonTags.length} tags`}
        title="Review Rubric"
      >
        <div className="reason-tag-grid">
          {reasonTags.map((tag) => (
            <button
              className={selectedReasonTags.includes(tag) ? "is-selected" : ""}
              key={tag}
              onClick={() => toggleReasonTag(tag)}
              type="button"
            >
              {titleFromKey(tag)}
            </button>
          ))}
        </div>
        <label className="visual-field">
          <span>Guidelines</span>
          <TextArea
            onChange={(event) => onPatch({ guidelines: event.target.value })}
            rows={4}
            value={stringConfig(config.guidelines, "")}
          />
        </label>
      </InspectorSection>

      <InspectorSection
        icon={<BadgeCheck aria-hidden="true" size={16} />}
        meta={run ? `${run.reviews.length} reviews` : "No run yet"}
        title="Reviewer Evidence"
      >
        {run ? (
          <div className="inspector-inline-facts">
            <span>{run.pairwise.length} pairwise tasks seeded</span>
            <span>
              {run.reviews.filter((review) => review.verdict === "pass").length} pass
            </span>
          </div>
        ) : (
          <EmptyEvidence text="Run this workflow to seed blind pairwise review evidence." />
        )}
      </InspectorSection>
    </div>
  );
}

function AggregateEditor({
  config,
  onPatch,
  run
}: {
  config: Record<string, unknown>;
  onPatch: (patch: ConfigPatch) => void;
  run: EvalRunRecord | undefined;
}) {
  const rankingMethod = stringConfig(config.rankingMethod, "elo");

  return (
    <div className="inspector-node-editor">
      <InspectorSection
        icon={<GitBranch aria-hidden="true" size={16} />}
        meta={rankingLabel(rankingMethod)}
        title="Ranking Method"
      >
        <div className="ranking-card-grid">
          {[
            {
              id: "elo",
              label: "Elo",
              detail: "Stable head-to-head ranking"
            },
            {
              id: "win_rate",
              label: "Win rate",
              detail: "Direct share of pairwise wins"
            },
            {
              id: "bradley_terry",
              label: "Bradley-Terry",
              detail: "Probabilistic preference model"
            }
          ].map((method) => (
            <button
              className={rankingMethod === method.id ? "is-selected" : ""}
              key={method.id}
              onClick={() => onPatch({ rankingMethod: method.id })}
              type="button"
            >
              <strong>{method.label}</strong>
              <span>{method.detail}</span>
            </button>
          ))}
        </div>
      </InspectorSection>

      <InspectorSection
        icon={<Table2 aria-hidden="true" size={16} />}
        meta={run ? `${run.modelSummaries.length} models` : "Awaiting run"}
        title="Model Summary"
      >
        {run ? (
          <div className="model-summary-table">
            <div className="model-summary-table__head">
              <span>Model</span>
              <span>Quality</span>
              <span>Win</span>
              <span>Cost</span>
            </div>
            {run.modelSummaries.map((summary) => (
              <div className="model-summary-table__row" key={summary.model}>
                <strong>{summary.model}</strong>
                <span>{percent(summary.averageQuality)}</span>
                <span>{percent(summary.humanWinRate)}</span>
                <span>${summary.averageCostUsd.toFixed(3)}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyEvidence text="Run this workflow to see aggregate model rankings." />
        )}
      </InspectorSection>
    </div>
  );
}

function ReleaseGateEditor({
  config,
  onPatch,
  plan,
  run
}: {
  config: Record<string, unknown>;
  onPatch: (patch: ConfigPatch) => void;
  plan: DerivedPlan;
  run: EvalRunRecord | undefined;
}) {
  const baselineRunId = stringConfig(
    config.baselineRunId,
    plan.releaseGate.baselineRunId
  );
  const minHumanWinRate = numberConfig(
    config.minHumanWinRate,
    plan.releaseGate.minHumanWinRate
  );
  const maxCostIncreasePct = numberConfig(
    config.maxCostIncreasePct,
    plan.releaseGate.maxCostIncreasePct
  );
  const safetyMustPass = config.safetyMustPass !== false;
  const gates = run?.decision.gates ?? [
    {
      label: "Average quality",
      passed: true,
      actual: "tracked",
      target: ">= 74%"
    },
    {
      label: "Human win rate",
      passed: true,
      actual: "planned",
      target: `>= ${percent(minHumanWinRate)}`
    },
    {
      label: "Safety pass rate",
      passed: safetyMustPass,
      actual: safetyMustPass ? "required" : "tracked",
      target: safetyMustPass ? ">= 92%" : "tracked"
    },
    {
      label: "P95 latency",
      passed: true,
      actual: "tracked",
      target: "<= 6.5s"
    }
  ];

  return (
    <div className="inspector-node-editor">
      <InspectorSection
        icon={<ShieldCheck aria-hidden="true" size={16} />}
        meta={run?.decision.status ?? "planned"}
        title="Gate Thresholds"
      >
        <label className="visual-field">
          <span>Baseline run</span>
          <TextInput
            onChange={(event) => onPatch({ baselineRunId: event.target.value })}
            value={baselineRunId}
          />
        </label>
        <div className="inspector-three-column">
          <label className="visual-field">
            <span>Human win</span>
            <TextInput
              max="1"
              min="0"
              onChange={(event) =>
                onPatch({
                  minHumanWinRate: clampNumberInput(event.target.value, 0, 1)
                })
              }
              step="0.01"
              type="number"
              value={minHumanWinRate}
            />
          </label>
          <label className="visual-field">
            <span>Cost delta %</span>
            <TextInput
              min="0"
              onChange={(event) =>
                onPatch({
                  maxCostIncreasePct: nonNegativeNumber(event.target.value, 0)
                })
              }
              type="number"
              value={maxCostIncreasePct}
            />
          </label>
          <div className="visual-toggle">
            <CheckboxControl
              checked={safetyMustPass}
              onCheckedChange={(checked) => onPatch({ safetyMustPass: checked })}
            />
            <span>Safety required</span>
          </div>
        </div>
      </InspectorSection>

      <InspectorSection
        icon={<CheckCircle2 aria-hidden="true" size={16} />}
        meta={run ? run.decision.message : "Gate preview"}
        title="Decision Evidence"
      >
        <div className="gate-list">
          {gates.map((gate) => (
            <div
              className={`gate-row ${gate.passed ? "gate-row--pass" : "gate-row--fail"}`}
              key={gate.label}
            >
              {gate.passed ? (
                <CheckCircle2 aria-hidden="true" size={16} />
              ) : (
                <XCircle aria-hidden="true" size={16} />
              )}
              <span>
                <strong>{gate.label}</strong>
                <small>
                  {gate.actual} / {gate.target}
                </small>
              </span>
            </div>
          ))}
        </div>
      </InspectorSection>
    </div>
  );
}

function GenericConfigEditor({
  config,
  node,
  onPatch
}: {
  config: Record<string, unknown>;
  node: EvalFlowNode;
  onPatch: (patch: ConfigPatch) => void;
}) {
  const definition = getNodeDefinition(node.type ?? "");
  if (!definition) {
    return null;
  }

  const fields = Object.entries(definition.configSchema);
  const requiredKeys = new Set(definition.requiredConfig);

  return (
    <InspectorSection
      icon={<SlidersIcon />}
      meta={`${fields.length} fields`}
      title="Configuration"
    >
      {fields.length > 0 ? (
        <div className="config-form config-form--visual">
          {fields.map(([key, rawMeta]) => (
            <ConfigField
              isRequired={requiredKeys.has(key)}
              key={key}
              meta={fieldMeta(rawMeta)}
              name={key}
              onChange={(field, value) => onPatch({ [field]: value })}
              value={config[key]}
            />
          ))}
        </div>
      ) : (
        <EmptyEvidence text="This node has no editable configuration fields." />
      )}
    </InspectorSection>
  );
}

function AdvancedJson({
  config,
  onApply
}: {
  config: Record<string, unknown>;
  onApply: (config: ConfigPatch) => void;
}) {
  const [error, setError] = useState<string>();
  const [jsonDraft, setJsonDraft] = useState(() => JSON.stringify(config, null, 2));

  const applyJson = () => {
    try {
      onApply(parseJsonObject(jsonDraft));
      setError(undefined);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Invalid JSON.");
    }
  };

  return (
    <details className="advanced-json">
      <summary>
        <span>
          <FileJson aria-hidden="true" size={15} />
          Advanced JSON
        </span>
        <Braces aria-hidden="true" size={14} />
      </summary>
      <TextArea
        spellCheck={false}
        value={jsonDraft}
        onChange={(event) => {
          setJsonDraft(event.target.value);
          setError(undefined);
        }}
      />
      <div className="advanced-json__actions">
        <Button onClick={applyJson} type="button" variant="secondary">
          <Save aria-hidden="true" size={14} />
          Apply JSON
        </Button>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
    </details>
  );
}

function InspectorSection({
  children,
  icon,
  meta,
  title
}: {
  children: ReactNode;
  icon: ReactNode;
  meta?: string;
  title: string;
}) {
  return (
    <section className="inspector-section">
      <header className="inspector-section__header">
        <div>
          {icon}
          <h4>{title}</h4>
        </div>
        {meta ? <span>{meta}</span> : null}
      </header>
      {children}
    </section>
  );
}

function ConnectionStrip({
  definition,
  edges,
  node,
  nodes,
  plan
}: {
  definition: EvalNodeDefinition;
  edges: EvalFlowEdge[];
  node: EvalFlowNode;
  nodes: EvalFlowNode[];
  plan: DerivedPlan;
}) {
  const incoming = edges.filter((edge) => edge.target === node.id);
  const outgoing = edges.filter((edge) => edge.source === node.id);
  const sourceLabels = incoming
    .map((edge) => nodes.find((candidate) => candidate.id === edge.source)?.data.label)
    .filter((label): label is string => typeof label === "string");
  const targetLabels = outgoing
    .map((edge) => nodes.find((candidate) => candidate.id === edge.target)?.data.label)
    .filter((label): label is string => typeof label === "string");

  return (
    <div className="inspector-flow-strip">
      <FlowEndpoint
        detail={definition.inputs.map((port) => port.label).join(", ") || "None"}
        label="Input"
        value={sourceLabels.join(", ") || "Start"}
      />
      <ArrowRight aria-hidden="true" size={16} />
      <FlowEndpoint
        detail={definition.outputs.map((port) => port.label).join(", ") || "None"}
        label="This node"
        value={outputSummary(node.type ?? "", plan)}
      />
      <ArrowRight aria-hidden="true" size={16} />
      <FlowEndpoint
        detail={
          outgoing.map((edge) => edge.sourceHandle ?? "output").join(", ") || "Done"
        }
        label="Next"
        value={targetLabels.join(", ") || "End"}
      />
    </div>
  );
}

function FlowEndpoint({
  detail,
  label,
  value
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flow-endpoint">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function InspectorStat({
  label,
  tone,
  value
}: {
  label: string;
  tone?: "success" | "warning" | "danger" | undefined;
  value: string;
}) {
  return (
    <div className={`inspector-stat ${tone ? `inspector-stat--${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SegmentedControl({
  onChange,
  options,
  value
}: {
  onChange: (value: string) => void;
  options: Array<{ id: string; icon: ReactNode; label: string }>;
  value: string;
}) {
  return (
    <div className="segmented-control segmented-control--visual" role="tablist">
      {options.map((option) => (
        <Button
          aria-selected={value === option.id}
          className={value === option.id ? "is-active" : ""}
          key={option.id}
          onClick={() => onChange(option.id)}
          size="sm"
          type="button"
          variant={value === option.id ? "primary" : "ghost"}
        >
          {option.icon}
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function PromptCard({
  index,
  onChange,
  onDuplicate,
  onRemove,
  prompt,
  single = false
}: {
  index: number;
  onChange: (index: number, patch: Partial<PromptCase>) => void;
  onDuplicate?: () => void;
  onRemove?: () => void;
  prompt: PromptCase;
  single?: boolean;
}) {
  return (
    <article className="prompt-card">
      <header>
        <span>Prompt {index + 1}</span>
        {!single ? (
          <div>
            <Button onClick={onDuplicate} size="sm" type="button" variant="ghost">
              Duplicate
            </Button>
            <Button onClick={onRemove} size="sm" type="button" variant="ghost">
              <Trash2 aria-hidden="true" size={13} />
              Remove
            </Button>
          </div>
        ) : null}
      </header>
      <label className="visual-field">
        <span>Prompt</span>
        <TextArea
          onChange={(event) => onChange(index, { prompt: event.target.value })}
          value={prompt.prompt}
        />
      </label>
      <div className="inspector-two-column inspector-two-column--tight">
        <label className="visual-field">
          <span>Expected text</span>
          <TextInput
            onChange={(event) =>
              onChange(index, {
                ...(event.target.value ? { expectedText: event.target.value } : {})
              })
            }
            placeholder="optional"
            value={prompt.expectedText ?? ""}
          />
        </label>
        <label className="visual-field">
          <span>Tags</span>
          <TextInput
            onChange={(event) =>
              onChange(index, {
                tags: event.target.value
                  .split(",")
                  .map((tag) => tag.trim())
                  .filter(Boolean)
              })
            }
            placeholder="commerce, text"
            value={prompt.tags.join(", ")}
          />
        </label>
      </div>
    </article>
  );
}

function AssetSlot({
  asset,
  onRemove,
  onUpload,
  role
}: {
  asset: ReferenceImage | undefined;
  onRemove: () => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  role: AssetRole;
}) {
  return (
    <div className="asset-slot asset-slot--visual">
      <div className="asset-slot__header">
        <strong>{roleLabel(role)}</strong>
        {asset ? (
          <Button onClick={onRemove} size="sm" type="button" variant="ghost">
            Remove
          </Button>
        ) : null}
      </div>
      {asset ? (
        <img alt={`${roleLabel(role)} image`} src={asset.thumbnailUri ?? asset.uri} />
      ) : (
        <label className="asset-slot__empty">
          <ImagePlus aria-hidden="true" size={18} />
          <span>Add image</span>
          <input accept="image/*" onChange={onUpload} type="file" />
        </label>
      )}
    </div>
  );
}

function MetricToken({
  label,
  strong,
  value
}: {
  label: string;
  strong?: boolean;
  value: number;
}) {
  return (
    <div className={`metric-token ${strong ? "metric-token--strong" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyEvidence({ text }: { text: string }) {
  return <p className="empty-evidence">{text}</p>;
}

function SlidersIcon() {
  return <Gauge aria-hidden="true" size={16} />;
}

function ConfigField({
  isRequired,
  meta,
  name,
  onChange,
  value
}: {
  isRequired: boolean;
  meta: ConfigFieldMeta;
  name: string;
  onChange: (key: string, value: unknown) => void;
  value: unknown;
}) {
  const label = meta.title ?? titleFromKey(name);

  if (meta.enum && meta.enum.length > 0) {
    return (
      <label className="config-field">
        <FieldLabel isRequired={isRequired} label={label} />
        <SelectControl
          value={typeof value === "string" ? value : ""}
          onValueChange={(nextValue) => onChange(name, nextValue)}
          options={meta.enum.map((option) => ({
            label: option,
            value: option
          }))}
        />
      </label>
    );
  }

  switch (meta.type) {
    case "number":
      return (
        <label className="config-field">
          <FieldLabel isRequired={isRequired} label={label} />
          <TextInput
            inputMode="decimal"
            onChange={(event) =>
              onChange(
                name,
                event.target.value === "" ? undefined : Number(event.target.value)
              )
            }
            type="number"
            value={typeof value === "number" && Number.isFinite(value) ? value : ""}
          />
        </label>
      );
    case "boolean":
      return (
        <div className="config-field config-field--checkbox">
          <CheckboxControl
            checked={value === true}
            onCheckedChange={(checked) => onChange(name, checked)}
          />
          <FieldLabel isRequired={isRequired} label={label} />
        </div>
      );
    case "array":
      if (meta.items?.type === "object") {
        return (
          <label className="config-field">
            <FieldLabel isRequired={isRequired} label={label} />
            <TextArea
              onChange={(event) => onChange(name, parseJsonArray(event.target.value))}
              rows={5}
              value={JSON.stringify(Array.isArray(value) ? value : [], null, 2)}
            />
          </label>
        );
      }
      return (
        <label className="config-field">
          <FieldLabel isRequired={isRequired} label={label} />
          <TextArea
            onChange={(event) => onChange(name, parseArrayInput(event.target.value))}
            rows={4}
            value={arrayInputValue(value)}
          />
        </label>
      );
    default:
      return (
        <label className="config-field">
          <FieldLabel isRequired={isRequired} label={label} />
          {isLongTextField(name, value) ? (
            <TextArea
              onChange={(event) => onChange(name, event.target.value)}
              rows={5}
              value={typeof value === "string" ? value : ""}
            />
          ) : (
            <TextInput
              onChange={(event) => onChange(name, event.target.value)}
              type="text"
              value={typeof value === "string" ? value : ""}
            />
          )}
        </label>
      );
  }
}

function FieldLabel({ isRequired, label }: { isRequired: boolean; label: string }) {
  return (
    <span className="config-field__label">
      {label}
      {isRequired ? <Badge tone="info">required</Badge> : null}
    </span>
  );
}

function derivePlan(nodes: EvalFlowNode[]): DerivedPlan {
  const datasetConfig = nodeConfig(nodes, "dataset.prompt_set");
  const templateConfig = nodeConfig(nodes, "prompt.template");
  const generationConfig = nodeConfig(nodes, "generation.model_fanout");
  const metricConfig = nodeConfig(nodes, "metric.auto_image");
  const humanConfig = nodeConfig(nodes, "human.pairwise");
  const aggregationConfig = nodeConfig(nodes, "aggregate.model_scores");
  const releaseConfig = nodeConfig(nodes, "decision.release_gate");
  const promptCases = promptCasesFromConfig(datasetConfig.inlinePrompts);
  const inputMode = inputModeFromConfig(datasetConfig, promptCases);
  const sampleLimit = numberConfig(datasetConfig.sampleLimit, 4);
  const promptCount =
    inputMode === "dataset"
      ? Math.min(Math.max(sampleLimit, 1), 4)
      : promptCases.length;
  const referenceImages = referenceImagesFromConfig(datasetConfig.referenceImages);
  const referenceImageCount =
    referenceImages.length +
    promptCases.reduce((count, prompt) => count + prompt.referenceImages.length, 0);
  const template = stringConfig(
    templateConfig.template,
    "{{prompt}}\nDirection: commercial-ready, brand-safe, no watermark."
  );
  const negativePrompt = stringConfig(
    templateConfig.negativePrompt,
    "watermark, distorted text, unsafe content"
  );
  const models = stringArrayConfig(generationConfig.models, [
    "gpt-image",
    "imagen",
    "flux",
    "sdxl"
  ]);
  const samplesPerPrompt = numberConfig(generationConfig.samplesPerPrompt, 2);
  const seedStrategy = stringConfig(generationConfig.seedStrategy, "fixed_by_prompt");
  const generationBudgetUsd = numberConfig(generationConfig.budgetUsd, 50);
  const imageCount = promptCount * models.length * samplesPerPrompt;
  const metrics = normalizeMetrics(metricConfig.metrics);
  const metricBudgetUsd = numberConfig(metricConfig.budgetUsd, 12);
  const metricChecks = imageCount * metrics.length;
  const sampleRate = numberConfig(humanConfig.sampleRate, 0.2);
  const reviewersPerTask = numberConfig(humanConfig.reviewersPerTask, 3);
  const humanTasks =
    sampleRate > 0
      ? Math.ceil(promptCount * Math.max(models.length - 1, 1) * sampleRate)
      : 0;
  const estimatedVotes = humanTasks * reviewersPerTask;
  const estimatedGenerationCostUsd = estimateGenerationCost(
    promptCount,
    models,
    samplesPerPrompt,
    fallbackAvailableModels
  );
  const estimatedMetricCostUsd = imageCount * metrics.length * 0.001;

  return {
    promptCases,
    promptCount,
    referenceImages,
    referenceImageCount,
    inputMode,
    template,
    negativePrompt,
    variables: variablesFromTemplate(template),
    models,
    samplesPerPrompt,
    seedStrategy,
    generationBudgetUsd,
    imageCount,
    metrics,
    metricBudgetUsd,
    metricChecks,
    sampleRate,
    reviewersPerTask,
    humanTasks,
    estimatedVotes,
    rankingMethod: stringConfig(aggregationConfig.rankingMethod, "elo"),
    releaseGate: {
      baselineRunId: stringConfig(releaseConfig.baselineRunId, "baseline-current-prod"),
      minHumanWinRate: numberConfig(releaseConfig.minHumanWinRate, 0.55),
      maxCostIncreasePct: numberConfig(releaseConfig.maxCostIncreasePct, 20),
      safetyMustPass: releaseConfig.safetyMustPass !== false
    },
    estimatedCostUsd:
      Math.round((estimatedGenerationCostUsd + estimatedMetricCostUsd) * 100) / 100
  };
}

function nodeStats(
  node: EvalFlowNode,
  plan: DerivedPlan,
  run: EvalRunRecord | undefined
): InspectorStatData[] {
  switch (node.type) {
    case "dataset.prompt_set":
      return [
        { label: "Prompts", value: String(plan.promptCount) },
        { label: "Refs", value: String(plan.referenceImageCount) },
        { label: "Mode", value: titleFromKey(plan.inputMode) }
      ];
    case "prompt.template":
      return [
        { label: "Variables", value: String(Math.max(plan.variables.length, 1)) },
        { label: "Prompts", value: String(plan.promptCount) },
        { label: "Negative", value: plan.negativePrompt ? "On" : "Off" }
      ];
    case "generation.model_fanout":
      return [
        { label: "Models", value: String(plan.models.length) },
        { label: "Images", value: String(plan.imageCount) },
        {
          label: "Budget",
          value: `$${plan.generationBudgetUsd.toFixed(0)}`,
          tone: plan.estimatedCostUsd > plan.generationBudgetUsd ? "warning" : undefined
        }
      ];
    case "artifact.store":
      return [
        {
          label: "Artifacts",
          value: run ? String(run.artifacts.length) : String(plan.imageCount)
        },
        { label: "Lineage", value: "On" },
        { label: "Hashes", value: "On" }
      ];
    case "metric.auto_image":
      return [
        { label: "Metrics", value: String(plan.metrics.length) },
        { label: "Checks", value: String(plan.metricChecks) },
        { label: "Budget", value: `$${plan.metricBudgetUsd.toFixed(0)}` }
      ];
    case "human.pairwise":
      return [
        { label: "Tasks", value: String(plan.humanTasks) },
        { label: "Votes", value: String(plan.estimatedVotes) },
        { label: "Blind", value: "On" }
      ];
    case "aggregate.model_scores":
      return [
        { label: "Method", value: rankingLabel(plan.rankingMethod) },
        {
          label: "Models",
          value: run ? String(run.modelSummaries.length) : String(plan.models.length)
        },
        { label: "Inputs", value: "2" }
      ];
    case "decision.release_gate":
      return [
        { label: "Status", value: run?.decision.status ?? "Planned" },
        { label: "Win target", value: percent(plan.releaseGate.minHumanWinRate) },
        {
          label: "Safety",
          value: plan.releaseGate.safetyMustPass ? "Required" : "Tracked"
        }
      ];
    default:
      return [
        {
          label: "Runtime",
          value: getNodeDefinition(node.type ?? "")?.runtime ?? "none"
        },
        { label: "Status", value: String(node.data.status ?? "idle") },
        { label: "Config", value: String(Object.keys(node.data.config ?? {}).length) }
      ];
  }
}

function outputSummary(type: string, plan: DerivedPlan) {
  switch (type) {
    case "dataset.prompt_set":
      return `${plan.promptCount} prompt${plan.promptCount === 1 ? "" : "s"}`;
    case "prompt.template":
      return `${plan.promptCount} rendered`;
    case "generation.model_fanout":
      return `${plan.imageCount} images`;
    case "artifact.store":
      return `${plan.imageCount} stored`;
    case "metric.auto_image":
      return `${plan.metricChecks} scores`;
    case "human.pairwise":
      return `${plan.humanTasks} tasks`;
    case "aggregate.model_scores":
      return `${plan.models.length} model report`;
    case "decision.release_gate":
      return "release decision";
    default:
      return "configured";
  }
}

function nodeIcon(type: string) {
  switch (type) {
    case "dataset.prompt_set":
      return <Database aria-hidden="true" size={18} />;
    case "prompt.template":
      return <WandSparkles aria-hidden="true" size={18} />;
    case "generation.model_fanout":
      return <Network aria-hidden="true" size={18} />;
    case "artifact.store":
      return <HardDrive aria-hidden="true" size={18} />;
    case "metric.auto_image":
      return <Gauge aria-hidden="true" size={18} />;
    case "human.pairwise":
      return <MessageSquareText aria-hidden="true" size={18} />;
    case "aggregate.model_scores":
      return <GitBranch aria-hidden="true" size={18} />;
    case "decision.release_gate":
      return <ShieldCheck aria-hidden="true" size={18} />;
    default:
      return <SlidersIcon />;
  }
}

function nodeConfig(nodes: EvalFlowNode[], type: string) {
  return nodes.find((node) => node.type === type)?.data.config ?? {};
}

function fieldMeta(value: unknown): ConfigFieldMeta {
  if (!isRecord(value)) {
    return {};
  }

  const meta: ConfigFieldMeta = {};
  if (typeof value.type === "string") {
    meta.type = value.type;
  }
  if (typeof value.title === "string") {
    meta.title = value.title;
  }
  if (Array.isArray(value.enum)) {
    meta.enum = value.enum.filter(
      (candidate): candidate is string => typeof candidate === "string"
    );
  }
  if (isRecord(value.items) && typeof value.items.type === "string") {
    meta.items = { type: value.items.type };
  }

  return meta;
}

function mergeConfig(config: Record<string, unknown>, patch: ConfigPatch) {
  const next = { ...config };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === "") {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  return next;
}

function promptCasesFromConfig(value: unknown): PromptCase[] {
  if (!Array.isArray(value)) {
    return [toPromptCase(defaultPrompt, 1)];
  }

  const prompts = value.filter(isRecord).map((prompt, index) =>
    cleanPromptCase({
      id: typeof prompt.id === "string" ? prompt.id : `prompt-${index + 1}`,
      prompt: typeof prompt.prompt === "string" ? prompt.prompt : defaultPrompt,
      tags: Array.isArray(prompt.tags)
        ? prompt.tags.filter((tag): tag is string => typeof tag === "string")
        : [],
      referenceImages: referenceImagesFromConfig(prompt.referenceImages),
      ...(typeof prompt.expectedText === "string"
        ? { expectedText: prompt.expectedText }
        : {})
    })
  );

  return prompts.length > 0 ? prompts : [toPromptCase(defaultPrompt, 1)];
}

function cleanPromptCase(prompt: PromptCase): PromptCase {
  return {
    id: prompt.id,
    prompt: prompt.prompt.trim() || defaultPrompt,
    tags: prompt.tags,
    referenceImages: prompt.referenceImages,
    ...(prompt.expectedText ? { expectedText: prompt.expectedText } : {})
  };
}

function referenceImagesFromConfig(value: unknown): ReferenceImage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (candidate): candidate is ReferenceImage =>
      typeof candidate === "object" &&
      candidate !== null &&
      "id" in candidate &&
      "uri" in candidate &&
      typeof candidate.id === "string" &&
      typeof candidate.uri === "string"
  );
}

function inputModeFromConfig(
  config: Record<string, unknown>,
  prompts: PromptCase[]
): InputMode {
  if (config.inputUiMode === "single" || config.inputUiMode === "batch") {
    return config.inputUiMode;
  }
  if (config.inputUiMode === "dataset") {
    return "dataset";
  }
  if (config.mode !== "inline" && config.datasetId && !config.inlinePrompts) {
    return "dataset";
  }
  return prompts.length > 1 ? "batch" : "single";
}

function toPromptCase(prompt: string, index: number, tag = "single"): PromptCase {
  return {
    id: `prompt-${index}`,
    prompt: prompt.trim() || defaultPrompt,
    tags: [tag],
    referenceImages: []
  };
}

function variablesFromTemplate(template: string) {
  return Array.from(template.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g))
    .map((match) => match[1])
    .filter((variable): variable is string => Boolean(variable));
}

function renderPrompt(template: string, prompt: string) {
  return template.replaceAll("{{prompt}}", prompt);
}

function modelsFromProviders(providers: ApiProvider[] | undefined): AvailableModel[] {
  const seen = new Set<string>();
  const models: AvailableModel[] = [];

  if (providers) {
    for (const provider of providers) {
      if (!provider.enabled) {
        continue;
      }

      for (const model of provider.models) {
        if (
          !model.enabled ||
          !model.capabilities.includes("image-generation") ||
          seen.has(model.id)
        ) {
          continue;
        }

        seen.add(model.id);
        models.push({
          id: model.id,
          name: model.name,
          providerLabel: provider.label,
          estimatedCostPerImageUsd: model.estimatedCostPerImageUsd,
          estimatedLatencyMs: model.estimatedLatencyMs
        });
      }
    }
  }

  for (const model of fallbackAvailableModels) {
    if (!seen.has(model.id)) {
      seen.add(model.id);
      models.push(model);
    }
  }

  return models;
}

function mergeAvailableModels(
  availableModels: AvailableModel[],
  selectedModels: string[]
) {
  const known = new Map(availableModels.map((model) => [model.id, model]));
  const extras = selectedModels
    .filter((model) => !known.has(model))
    .map((model) => ({
      id: model,
      name: model,
      providerLabel: "Custom",
      estimatedCostPerImageUsd: 0.03,
      estimatedLatencyMs: 4000
    }));
  return [...availableModels, ...extras];
}

function estimateGenerationCost(
  promptCount: number,
  models: string[],
  samplesPerPrompt: number,
  availableModels: AvailableModel[]
) {
  const modelCostUsd = new Map(
    availableModels.map((model) => [model.id, model.estimatedCostPerImageUsd])
  );
  const perPromptCost = models.reduce(
    (total, model) => total + (modelCostUsd.get(model) ?? 0.03),
    0
  );
  return Math.round(promptCount * samplesPerPrompt * perPromptCost * 100) / 100;
}

function maxLatency(availableModels: AvailableModel[], selectedModels: string[]) {
  const latency = new Map(
    availableModels.map((model) => [model.id, model.estimatedLatencyMs])
  );
  return Math.max(...selectedModels.map((model) => latency.get(model) ?? 4000), 0);
}

function normalizeMetrics(value: unknown): ImageMetric[] {
  const rawMetrics = stringArrayConfig(
    value,
    knownMetrics.map((metric) => metric.id)
  );
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
      knownMetrics.some((candidate) => candidate.id === metric)
    );

  return Array.from(
    new Set(mapped.length > 0 ? mapped : knownMetrics.map((metric) => metric.id))
  );
}

function parseJsonObject(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Config JSON must be an object.");
  }

  return parsed;
}

function parseJsonArray(text: string) {
  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Array field JSON must be an array.");
  }
  return parsed;
}

function parseArrayInput(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function arrayInputValue(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item)).join("\n")
    : typeof value === "string"
      ? value
      : "";
}

function isLongTextField(name: string, value: unknown) {
  const normalized = name.toLowerCase();
  return (
    normalized.includes("template") ||
    normalized.includes("prompt") ||
    normalized.includes("guideline") ||
    (typeof value === "string" && value.includes("\n"))
  );
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

function positiveNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, parsed) : fallback;
}

function nonNegativeNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function clampNumberInput(value: string, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : min;
}

function meterWidth(value: number, budget: number) {
  if (budget <= 0) {
    return "100%";
  }
  return `${Math.min(100, Math.max(6, (value / budget) * 100))}%`;
}

function rankingLabel(value: string) {
  switch (value) {
    case "win_rate":
      return "Win rate";
    case "bradley_terry":
      return "Bradley-Terry";
    default:
      return "Elo";
  }
}

function roleLabel(role: AssetRole) {
  switch (role) {
    case "reference":
      return "Reference";
    case "style":
      return "Style";
    case "mask":
      return "Mask";
  }
}

function statusTone(
  status: string
): "neutral" | "success" | "warning" | "danger" | "info" {
  switch (status) {
    case "succeeded":
    case "cached":
      return "success";
    case "running":
    case "queued":
      return "info";
    case "failed":
    case "blocked":
      return "danger";
    default:
      return "neutral";
  }
}

function titleFromKey(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function readImageDimensions(uri: string) {
  return new Promise<{ width: number; height: number } | undefined>((resolve) => {
    const image = new Image();
    image.onload = () =>
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight
      });
    image.onerror = () => resolve(undefined);
    image.src = uri;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
