import {
  Database,
  ImagePlus,
  Layers3,
  ListChecks,
  Play,
  Table2,
  WandSparkles
} from "lucide-react";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChangeEvent } from "react";
import type { ApiProvider, PromptCase, ReferenceImage } from "@eval/workflow-schema";
import {
  Badge,
  Button,
  CheckboxControl,
  Panel,
  SelectControl,
  TextArea,
  TextInput
} from "@eval/ui";
import { listApiProviders } from "../../../shared/api/evalApi";
import { useWorkflowStore } from "../state/workflowStore";

type InputMode = "single" | "batch" | "dataset";
type AssetRole = ReferenceImage["role"];

type AvailableModel = {
  id: string;
  name: string;
  providerLabel: string;
  estimatedCostPerImageUsd: number;
};

const fallbackAvailableModels: AvailableModel[] = [
  {
    id: "gpt-image",
    name: "GPT Image",
    providerLabel: "OpenAI",
    estimatedCostPerImageUsd: 0.045
  },
  {
    id: "imagen",
    name: "Imagen",
    providerLabel: "Google Imagen",
    estimatedCostPerImageUsd: 0.038
  },
  {
    id: "flux",
    name: "FLUX",
    providerLabel: "fal.ai",
    estimatedCostPerImageUsd: 0.024
  },
  {
    id: "sdxl",
    name: "SDXL",
    providerLabel: "Replicate",
    estimatedCostPerImageUsd: 0.016
  }
];

const visibleAssetRoles: AssetRole[] = ["reference"];

const defaultPrompt =
  "A premium running shoe hero image on a clean studio background with readable launch text";

export function RunInputPanel() {
  const providersQuery = useQuery({
    queryKey: ["api-providers"],
    queryFn: listApiProviders
  });
  const nodes = useWorkflowStore((state) => state.nodes);
  const updateNodeConfig = useWorkflowStore((state) => state.updateNodeConfig);
  const setCanvasOpen = useWorkflowStore((state) => state.setCanvasOpen);

  const datasetNode = nodes.find((node) => node.type === "dataset.prompt_set");
  const templateNode = nodes.find((node) => node.type === "prompt.template");
  const generationNode = nodes.find((node) => node.type === "generation.model_fanout");
  const humanNode = nodes.find((node) => node.type === "human.pairwise");
  const datasetConfig = datasetNode?.data.config ?? {};
  const templateConfig = templateNode?.data.config ?? {};
  const generationConfig = generationNode?.data.config ?? {};
  const humanConfig = humanNode?.data.config ?? {};

  const promptCases = promptCasesFromConfig(datasetConfig.inlinePrompts);
  const referenceImages = referenceImagesFromConfig(datasetConfig.referenceImages);
  const inputMode = inputModeFromConfig(datasetConfig, promptCases);
  const singlePrompt = promptCases[0]?.prompt ?? defaultPrompt;
  const batchText = promptCases.map((prompt) => prompt.prompt).join("\n");
  const datasetId = stringConfig(datasetConfig.datasetId, "golden-image-prompts-v1");
  const sampleLimit = numberConfig(datasetConfig.sampleLimit, 4);
  const template = stringConfig(
    templateConfig.template,
    "{{prompt}}\nDirection: commercial-ready, brand-safe, no watermark."
  );
  const negativePrompt = stringConfig(
    templateConfig.negativePrompt,
    "watermark, distorted text, unsafe content"
  );
  const availableModels = useMemo(
    () => modelsFromProviders(providersQuery.data?.providers),
    [providersQuery.data?.providers]
  );
  const availableModelIds = useMemo(
    () => new Set(availableModels.map((model) => model.id)),
    [availableModels]
  );
  const selectedModels = stringArrayConfig(
    generationConfig.models,
    availableModels.map((model) => model.id).slice(0, 4)
  ).filter((model) => availableModelIds.has(model));
  const samplesPerPrompt = numberConfig(generationConfig.samplesPerPrompt, 2);
  const seedStrategy = stringConfig(generationConfig.seedStrategy, "fixed_by_prompt");
  const budgetUsd = numberConfig(generationConfig.budgetUsd, 50);
  const reviewersPerTask = numberConfig(humanConfig.reviewersPerTask, 3);
  const sampleRate = numberConfig(humanConfig.sampleRate, 0.2);

  const promptCount =
    inputMode === "dataset"
      ? Math.min(sampleLimit, 4)
      : Math.max(promptCases.length, 1);
  const imageCount = promptCount * selectedModels.length * samplesPerPrompt;
  const estimatedCost = estimateCost(
    promptCount,
    selectedModels,
    samplesPerPrompt,
    availableModels
  );
  const variables = variablesFromTemplate(template);
  const renderedPreview = template.replaceAll("{{prompt}}", singlePrompt);
  const issues = readinessIssues({
    budgetUsd,
    estimatedCost,
    inputMode,
    promptCases,
    referenceImages,
    selectedModels
  });

  const patchConfig = (nodeId: string | undefined, patch: Record<string, unknown>) => {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      return;
    }

    updateNodeConfig(node.id, {
      ...node.data.config,
      ...patch
    });
  };

  const updateDatasetConfig = (patch: Record<string, unknown>) =>
    patchConfig(datasetNode?.id, patch);
  const updateTemplateConfig = (patch: Record<string, unknown>) =>
    patchConfig(templateNode?.id, patch);
  const updateGenerationConfig = (patch: Record<string, unknown>) =>
    patchConfig(generationNode?.id, patch);
  const updateHumanConfig = (patch: Record<string, unknown>) =>
    patchConfig(humanNode?.id, patch);

  const setInputMode = (mode: InputMode) => {
    if (mode === "dataset") {
      updateDatasetConfig({
        inputUiMode: "dataset",
        mode: "dataset",
        datasetId,
        sampleLimit: Math.max(sampleLimit, 1)
      });
      return;
    }

    const prompts =
      mode === "single"
        ? [toPromptCase(singlePrompt, 1)]
        : promptCases.length > 1
          ? promptCases
          : linesToPromptCases(batchText || singlePrompt);

    updateDatasetConfig({
      inputUiMode: mode,
      mode: "inline",
      datasetId: "inline-run-input",
      sampleLimit: Math.max(prompts.length, 1),
      inlinePrompts: prompts
    });
  };

  const setSinglePrompt = (value: string) => {
    updateDatasetConfig({
      inputUiMode: "single",
      mode: "inline",
      datasetId: "inline-run-input",
      sampleLimit: 1,
      inlinePrompts: [toPromptCase(value, 1)]
    });
  };

  const setBatchText = (value: string) => {
    const prompts = linesToPromptCases(value);
    updateDatasetConfig({
      inputUiMode: "batch",
      mode: "inline",
      datasetId: "inline-run-input",
      sampleLimit: Math.max(prompts.length, 1),
      inlinePrompts: prompts
    });
  };

  const toggleModel = (model: string) => {
    const nextModels = selectedModels.includes(model)
      ? selectedModels.filter((candidate) => candidate !== model)
      : [...selectedModels, model];
    updateGenerationConfig({
      models: nextModels.length > 0 ? nextModels : [model]
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
    const nextImages = [
      ...referenceImages.filter((image) => image.role !== role),
      asset
    ];
    updateDatasetConfig({ referenceImages: nextImages });
  };

  const removeAsset = (role: AssetRole) => {
    updateDatasetConfig({
      referenceImages: referenceImages.filter((image) => image.role !== role)
    });
  };

  return (
    <Panel
      actions={
        <Button onClick={() => setCanvasOpen(true)} type="button" variant="ghost">
          <Layers3 aria-hidden="true" size={14} />
          Pipeline Map
        </Button>
      }
      className="run-input-panel"
      title="Eval Setup"
    >
      <div className="readiness-strip" aria-label="Run readiness">
        <ReadinessMetric label="Prompts" value={String(promptCount)} />
        <ReadinessMetric label="Refs" value={String(referenceImages.length)} />
        <ReadinessMetric label="Models" value={String(selectedModels.length)} />
        <ReadinessMetric label="Images" value={String(imageCount)} />
        <ReadinessMetric label="Est. cost" value={`$${estimatedCost.toFixed(2)}`} />
        <Badge tone={issues.length > 0 ? "warning" : "success"}>
          {issues.length} issues
        </Badge>
      </div>

      <div className="run-input-layout">
        <section className="run-input-section run-input-section--primary">
          <div className="run-input-section__header">
            <div>
              <h3>Prompt source</h3>
              <span>{inputMode === "dataset" ? datasetId : "Inline prompt set"}</span>
            </div>
            <div className="segmented-control" role="tablist">
              {(["single", "batch", "dataset"] as InputMode[]).map((mode) => (
                <Button
                  aria-selected={inputMode === mode}
                  className={inputMode === mode ? "is-active" : ""}
                  key={mode}
                  onClick={() => setInputMode(mode)}
                  size="sm"
                  type="button"
                  variant={inputMode === mode ? "primary" : "ghost"}
                >
                  {modeIcon(mode)}
                  {modeLabel(mode)}
                </Button>
              ))}
            </div>
          </div>

          {inputMode === "single" ? (
            <label className="run-input-field">
              Prompt
              <TextArea
                onChange={(event) => setSinglePrompt(event.target.value)}
                value={singlePrompt}
              />
            </label>
          ) : null}

          {inputMode === "batch" ? (
            <label className="run-input-field">
              Batch prompts
              <TextArea
                onChange={(event) => setBatchText(event.target.value)}
                value={batchText || singlePrompt}
              />
            </label>
          ) : null}

          {inputMode === "dataset" ? (
            <div className="dataset-source-grid">
              <label className="run-input-field">
                Dataset
                <SelectControl
                  onValueChange={(value) => updateDatasetConfig({ datasetId: value })}
                  options={[
                    {
                      label: "golden-image-prompts-v1",
                      value: "golden-image-prompts-v1"
                    }
                  ]}
                  value={datasetId}
                />
              </label>
              <label className="run-input-field">
                Sample limit
                <TextInput
                  min="1"
                  onChange={(event) =>
                    updateDatasetConfig({
                      sampleLimit: Number(event.target.value)
                    })
                  }
                  type="number"
                  value={sampleLimit}
                />
              </label>
            </div>
          ) : null}

          <div className="asset-tray">
            {visibleAssetRoles.map((role) => (
              <AssetSlot
                asset={referenceImages.find((image) => image.role === role)}
                key={role}
                onRemove={() => removeAsset(role)}
                onUpload={(event) => void handleAssetUpload(role, event)}
                role={role}
              />
            ))}
          </div>
        </section>

        <section className="run-input-section">
          <div className="run-input-section__header">
            <div>
              <h3>Template</h3>
              <span>{variables.length} variables</span>
            </div>
            <WandSparkles aria-hidden="true" size={16} />
          </div>
          <label className="run-input-field">
            Template
            <TextArea
              className="run-input-field__template"
              onChange={(event) =>
                updateTemplateConfig({ template: event.target.value })
              }
              value={template}
            />
          </label>
          <div className="variable-chip-row">
            {variables.length > 0 ? (
              variables.map((variable) => <span key={variable}>{variable}</span>)
            ) : (
              <span>prompt</span>
            )}
          </div>
          <label className="run-input-field">
            Negative prompt
            <TextInput
              onChange={(event) =>
                updateTemplateConfig({ negativePrompt: event.target.value })
              }
              value={negativePrompt}
            />
          </label>
          <div className="rendered-preview">
            <strong>Preview</strong>
            <p>{renderedPreview}</p>
          </div>
        </section>

        <section className="run-input-section">
          <div className="run-input-section__header">
            <div>
              <h3>Run plan</h3>
              <span>{imageCount} generations</span>
            </div>
            <Play aria-hidden="true" size={16} />
          </div>
          <div className="model-choice-grid">
            {availableModels.map((model) => (
              <div className="model-choice" key={model.id}>
                <CheckboxControl
                  checked={selectedModels.includes(model.id)}
                  onCheckedChange={() => toggleModel(model.id)}
                />
                <span>
                  <strong>{model.name}</strong>
                  <small>{model.providerLabel}</small>
                </span>
              </div>
            ))}
          </div>
          {availableModels.length === 0 ? (
            <div className="readiness-issues">
              <span>No enabled image models. Add one in API Providers.</span>
            </div>
          ) : null}
          <div className="run-plan-grid">
            <label className="run-input-field">
              Samples
              <TextInput
                min="1"
                max="16"
                onChange={(event) =>
                  updateGenerationConfig({
                    samplesPerPrompt: Number(event.target.value)
                  })
                }
                type="number"
                value={samplesPerPrompt}
              />
            </label>
            <label className="run-input-field">
              Seed
              <SelectControl
                onValueChange={(value) =>
                  updateGenerationConfig({ seedStrategy: value })
                }
                options={[
                  { label: "Fixed by prompt", value: "fixed_by_prompt" },
                  { label: "Random", value: "random" },
                  { label: "Manual", value: "manual" }
                ]}
                value={seedStrategy}
              />
            </label>
            <label className="run-input-field">
              Budget
              <TextInput
                min="0"
                onChange={(event) =>
                  updateGenerationConfig({ budgetUsd: Number(event.target.value) })
                }
                type="number"
                value={budgetUsd}
              />
            </label>
            <label className="run-input-field">
              Reviewers
              <TextInput
                min="1"
                onChange={(event) =>
                  updateHumanConfig({ reviewersPerTask: Number(event.target.value) })
                }
                type="number"
                value={reviewersPerTask}
              />
            </label>
          </div>
          <div className="human-review-toggle">
            <CheckboxControl
              checked={sampleRate > 0}
              onCheckedChange={(checked) =>
                updateHumanConfig({ sampleRate: checked ? 0.2 : 0 })
              }
            />
            <span>Blind pairwise review</span>
          </div>
          <div className="readiness-issues">
            {issues.length > 0 ? (
              issues.map((issue) => <span key={issue}>{issue}</span>)
            ) : (
              <span>Ready for validation</span>
            )}
          </div>
        </section>
      </div>
    </Panel>
  );
}

function ReadinessMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="readiness-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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
    <div className="asset-slot">
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

function toPromptCase(prompt: string, index: number): PromptCase {
  return {
    id: `prompt-${index}`,
    prompt: prompt.trim() || defaultPrompt,
    tags: index === 1 ? ["single"] : ["batch"],
    referenceImages: []
  };
}

function linesToPromptCases(value: string): PromptCase[] {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((prompt, index) => toPromptCase(prompt, index + 1));
}

function promptCasesFromConfig(value: unknown): PromptCase[] {
  if (!Array.isArray(value)) {
    return [toPromptCase(defaultPrompt, 1)];
  }

  const prompts = value
    .filter(
      (candidate): candidate is PromptCase =>
        typeof candidate === "object" &&
        candidate !== null &&
        "prompt" in candidate &&
        typeof candidate.prompt === "string"
    )
    .map((prompt, index) => {
      const promptCase: PromptCase = {
        id: typeof prompt.id === "string" ? prompt.id : `prompt-${index + 1}`,
        prompt: prompt.prompt,
        tags: Array.isArray(prompt.tags)
          ? prompt.tags.filter((tag): tag is string => typeof tag === "string")
          : [],
        referenceImages: referenceImagesFromConfig(prompt.referenceImages)
      };
      if (typeof prompt.expectedText === "string") {
        promptCase.expectedText = prompt.expectedText;
      }
      return promptCase;
    });

  return prompts.length > 0 ? prompts : [toPromptCase(defaultPrompt, 1)];
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

function variablesFromTemplate(template: string) {
  return Array.from(template.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g))
    .map((match) => match[1])
    .filter((variable): variable is string => Boolean(variable));
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
          estimatedCostPerImageUsd: model.estimatedCostPerImageUsd
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

function estimateCost(
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

function readinessIssues({
  budgetUsd,
  estimatedCost,
  inputMode,
  promptCases,
  referenceImages,
  selectedModels
}: {
  budgetUsd: number;
  estimatedCost: number;
  inputMode: InputMode;
  promptCases: PromptCase[];
  referenceImages: ReferenceImage[];
  selectedModels: string[];
}) {
  const issues: string[] = [];
  if (inputMode !== "dataset" && promptCases.every((prompt) => !prompt.prompt.trim())) {
    issues.push("Add at least one prompt");
  }
  if (selectedModels.length === 0) {
    issues.push("Select at least one model");
  }
  if (budgetUsd > 0 && estimatedCost > budgetUsd) {
    issues.push("Estimated cost is over budget");
  }
  if (
    referenceImages.some((image) => image.role === "mask") &&
    !referenceImages.some((image) => image.role === "reference")
  ) {
    issues.push("Mask needs a reference image");
  }
  return issues;
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

function modeLabel(mode: InputMode) {
  switch (mode) {
    case "single":
      return "Single";
    case "batch":
      return "Batch";
    case "dataset":
      return "Dataset";
  }
}

function modeIcon(mode: InputMode) {
  switch (mode) {
    case "single":
      return <ListChecks aria-hidden="true" size={13} />;
    case "batch":
      return <Table2 aria-hidden="true" size={13} />;
    case "dataset":
      return <Database aria-hidden="true" size={13} />;
  }
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
