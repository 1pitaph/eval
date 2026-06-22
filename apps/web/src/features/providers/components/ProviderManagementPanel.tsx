import {
  Activity,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  ServerCog,
  Trash2
} from "lucide-react";
import { useMemo, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ApiProvider,
  ApiProviderImageProvider,
  ApiProviderInput,
  ApiProviderModel,
  ApiProviderModelType,
  ApiProviderPatch,
  ApiProviderProtocol
} from "@eval/workflow-schema";
import {
  apiProviderCapabilitiesForModelType,
  inferApiProviderModelType,
  inferApiProviderModelVendor
} from "@eval/workflow-schema";
import {
  Badge,
  Button,
  CheckboxControl,
  Panel,
  SelectControl,
  TextInput
} from "@eval/ui";
import {
  createApiProvider,
  deleteApiProvider,
  fetchApiProviderModels,
  listApiProviders,
  testApiProviderConnection,
  updateApiProvider
} from "../../../shared/api/evalApi";

type ProviderFormState = {
  label: string;
  protocol: ApiProviderProtocol;
  imageProvider: ApiProviderImageProvider;
  baseUrl: string;
  docsUrl: string;
  enabled: boolean;
  apiKey: string;
  models: ApiProviderModel[];
};

type NewModelState = {
  id: string;
  name: string;
  vendor: string;
  type: ApiProviderModelType;
  estimatedCostPerImageUsd: number;
  estimatedLatencyMs: number;
};

type ProviderFormDraft = {
  sourceId: string;
  form: ProviderFormState;
  apiKeyTouched: boolean;
};

type ModelGroupBy = "none" | "vendor" | "type" | "status";

const providerProtocolOptions: Array<{
  label: string;
  value: ApiProviderProtocol;
}> = [
  { label: "OpenAI Responses-compatible", value: "openai-responses" },
  { label: "OpenAI Chat Completions-compatible", value: "openai-chat-completions" },
  { label: "Anthropic Messages-compatible", value: "anthropic-messages" }
];

const imageProviderOptions: Array<{
  label: string;
  value: ApiProviderImageProvider;
}> = [
  { label: "OpenAI image profile", value: "openai" },
  { label: "Google Imagen profile", value: "google-imagen" },
  { label: "fal.ai profile", value: "fal" },
  { label: "Replicate profile", value: "replicate" },
  { label: "Custom image profile", value: "custom" }
];

const emptyModel: NewModelState = {
  id: "",
  name: "",
  vendor: "",
  type: "image",
  estimatedCostPerImageUsd: 0.03,
  estimatedLatencyMs: 4000
};

const modelTypeOptions: Array<{
  label: string;
  value: ApiProviderModelType;
}> = [
  { label: "Image", value: "image" },
  { label: "Text", value: "text" },
  { label: "Vision", value: "vision" },
  { label: "Embedding", value: "embedding" },
  { label: "Audio", value: "audio" },
  { label: "Rerank", value: "rerank" },
  { label: "Other", value: "other" }
];

const modelGroupByOptions: Array<{ label: string; value: ModelGroupBy }> = [
  { label: "No grouping", value: "none" },
  { label: "Group by vendor", value: "vendor" },
  { label: "Group by type", value: "type" },
  { label: "Group by status", value: "status" }
];

export function ProviderManagementPanel() {
  const queryClient = useQueryClient();
  const providersQuery = useQuery({
    queryKey: ["api-providers"],
    queryFn: listApiProviders
  });
  const providers = useMemo(
    () => providersQuery.data?.providers ?? [],
    [providersQuery.data?.providers]
  );
  const [selectedProviderId, setSelectedProviderId] = useState<string | undefined>();
  const [isCreating, setIsCreating] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [formDraft, setFormDraft] = useState<ProviderFormDraft>(() => ({
    sourceId: "new",
    form: newProviderForm(),
    apiKeyTouched: false
  }));
  const [newModel, setNewModel] = useState<NewModelState>(emptyModel);
  const [modelGroupBy, setModelGroupBy] = useState<ModelGroupBy>("vendor");
  const [modelVendorFilter, setModelVendorFilter] = useState("all");
  const [modelTypeFilter, setModelTypeFilter] = useState("all");
  const [statusMessage, setStatusMessage] = useState(
    "Provider settings are local to this API server session."
  );

  const selectedProvider =
    providers.find((provider) => provider.id === selectedProviderId) ??
    (isCreating ? undefined : providers[0]);
  const formSourceId = isCreating ? "new" : (selectedProvider?.id ?? "none");
  const defaultForm = useMemo(
    () =>
      isCreating || !selectedProvider
        ? newProviderForm()
        : formFromProvider(selectedProvider),
    [isCreating, selectedProvider]
  );
  const form = formDraft.sourceId === formSourceId ? formDraft.form : defaultForm;
  const apiKeyTouched =
    formDraft.sourceId === formSourceId ? formDraft.apiKeyTouched : false;
  const setForm = (updater: (current: ProviderFormState) => ProviderFormState) => {
    setFormDraft((current) => {
      const baseForm = current.sourceId === formSourceId ? current.form : defaultForm;
      return {
        sourceId: formSourceId,
        form: updater(baseForm),
        apiKeyTouched: current.sourceId === formSourceId ? current.apiKeyTouched : false
      };
    });
  };
  const setApiKeyTouched = (nextApiKeyTouched: boolean) => {
    setFormDraft((current) => ({
      sourceId: formSourceId,
      form: current.sourceId === formSourceId ? current.form : defaultForm,
      apiKeyTouched: nextApiKeyTouched
    }));
  };
  const visibleProviders = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) {
      return providers;
    }

    return providers.filter((provider) => {
      const haystack = [
        provider.label,
        provider.protocol,
        provider.imageProvider,
        provider.baseUrl,
        ...provider.models.flatMap((model) => [
          model.id,
          model.name,
          model.vendor ?? "",
          model.type ?? ""
        ])
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [providers, searchText]);

  const fetchModelsMutation = useMutation({
    mutationFn: fetchApiProviderModels,
    onSuccess: async ({
      addedModelCount,
      provider,
      totalRemoteModelCount
    }) => {
      upsertProviderInCache(queryClient, provider);
      setSelectedProviderId(provider.id);
      setFormDraft(() => ({
        sourceId: provider.id,
        form: formFromProvider(provider),
        apiKeyTouched: false
      }));
      setStatusMessage(modelFetchStatus(totalRemoteModelCount, addedModelCount));
      await queryClient.invalidateQueries({ queryKey: ["api-providers"] });
    },
    onError: (error) => setStatusMessage(messageFromError(error))
  });

  const createMutation = useMutation({
    mutationFn: ({
      input
    }: {
      autoFetchModels: boolean;
      input: ApiProviderInput;
    }) => createApiProvider(input),
    onSuccess: async ({ provider }, variables) => {
      upsertProviderInCache(queryClient, provider);
      setStatusMessage(`${provider.label} has been added.`);
      setSelectedProviderId(provider.id);
      setFormDraft({
        sourceId: provider.id,
        form: formFromProvider(provider),
        apiKeyTouched: false
      });
      setIsCreating(false);
      await queryClient.invalidateQueries({ queryKey: ["api-providers"] });
      maybeFetchModels(fetchModelsMutation, provider, variables.autoFetchModels);
    },
    onError: (error) => setStatusMessage(messageFromError(error))
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      patch
    }: {
      autoFetchModels: boolean;
      id: string;
      patch: ApiProviderPatch;
    }) => updateApiProvider(id, patch),
    onSuccess: async ({ provider }, variables) => {
      upsertProviderInCache(queryClient, provider);
      setFormDraft({
        sourceId: provider.id,
        form: formFromProvider(provider),
        apiKeyTouched: false
      });
      setStatusMessage(`${provider.label} settings saved.`);
      await queryClient.invalidateQueries({ queryKey: ["api-providers"] });
      maybeFetchModels(fetchModelsMutation, provider, variables.autoFetchModels);
    },
    onError: (error) => setStatusMessage(messageFromError(error))
  });

  const deleteMutation = useMutation({
    mutationFn: deleteApiProvider,
    onSuccess: async (_result, providerId) => {
      queryClient.setQueryData<{ providers: ApiProvider[] }>(
        ["api-providers"],
        (current) => ({
          providers: (current?.providers ?? []).filter(
            (provider) => provider.id !== providerId
          )
        })
      );
      setStatusMessage("Provider deleted.");
      setSelectedProviderId(undefined);
      await queryClient.invalidateQueries({ queryKey: ["api-providers"] });
    },
    onError: (error) => setStatusMessage(messageFromError(error))
  });

  const testMutation = useMutation({
    mutationFn: testApiProviderConnection,
    onSuccess: async ({ provider }) => {
      upsertProviderInCache(queryClient, provider);
      setStatusMessage(provider.credential.message ?? `${provider.label} checked.`);
      await queryClient.invalidateQueries({ queryKey: ["api-providers"] });
    },
    onError: (error) => setStatusMessage(messageFromError(error))
  });

  const formIssues = validateProviderForm(form);
  const saving = createMutation.isPending || updateMutation.isPending;
  const hasUnsavedConnectionChanges =
    Boolean(selectedProvider) &&
    (form.baseUrl.trim() !== selectedProvider?.baseUrl || apiKeyTouched);

  const startCreate = () => {
    setFormDraft({
      sourceId: "new",
      form: newProviderForm(),
      apiKeyTouched: false
    });
    setIsCreating(true);
    setSelectedProviderId(undefined);
    setStatusMessage("Add a provider, then save it to make its models available.");
  };

  const selectProvider = (providerId: string) => {
    const provider = providers.find((candidate) => candidate.id === providerId);
    if (provider) {
      setFormDraft({
        sourceId: provider.id,
        form: formFromProvider(provider),
        apiKeyTouched: false
      });
    }
    setIsCreating(false);
    setSelectedProviderId(providerId);
  };

  const handleSave = () => {
    if (formIssues.length > 0) {
      setStatusMessage(formIssues[0] ?? "Fix the provider form before saving.");
      return;
    }

    if (isCreating) {
      createMutation.mutate({
        autoFetchModels: Boolean(form.apiKey.trim() && form.baseUrl.trim()),
        input: providerInputFromForm(form)
      });
      return;
    }

    if (!selectedProvider) {
      return;
    }

    updateMutation.mutate({
      autoFetchModels:
        Boolean(form.baseUrl.trim()) &&
        (apiKeyTouched || form.baseUrl.trim() !== selectedProvider.baseUrl),
      id: selectedProvider.id,
      patch: providerPatchFromForm(form, apiKeyTouched)
    });
  };

  const handleFetchModels = () => {
    if (!selectedProvider) {
      return;
    }
    if (hasUnsavedConnectionChanges) {
      setStatusMessage("Save connection changes before fetching models.");
      return;
    }

    fetchModelsMutation.mutate(selectedProvider.id);
  };

  const addModel = () => {
    const id = newModel.id.trim();
    const name = newModel.name.trim() || id;
    if (!id) {
      setStatusMessage("Model ID is required.");
      return;
    }
    if (form.models.some((model) => model.id === id)) {
      setStatusMessage(`Model "${id}" already exists on this provider.`);
      return;
    }

    setForm((current) => ({
      ...current,
      models: [
        ...current.models,
        {
          id,
          name,
          enabled: true,
          vendor: newModel.vendor.trim() || inferApiProviderModelVendor(id, name),
          type: newModel.type,
          capabilities: apiProviderCapabilitiesForModelType(newModel.type),
          estimatedCostPerImageUsd: newModel.estimatedCostPerImageUsd,
          estimatedLatencyMs: Math.round(newModel.estimatedLatencyMs)
        }
      ]
    }));
    setNewModel(emptyModel);
  };

  const updateModel = (modelId: string, patch: Partial<ApiProviderModel>) => {
    setForm((current) => ({
      ...current,
      models: current.models.map((model) =>
        model.id === modelId ? { ...model, ...patch } : model
      )
    }));
  };

  const updateModelType = (modelId: string, type: ApiProviderModelType) => {
    updateModel(modelId, {
      type,
      capabilities: apiProviderCapabilitiesForModelType(type)
    });
  };

  const removeModel = (modelId: string) => {
    setForm((current) => ({
      ...current,
      models: current.models.filter((model) => model.id !== modelId)
    }));
  };

  const modelVendors = useMemo(
    () => uniqueValues(form.models.map((model) => modelVendor(model))),
    [form.models]
  );
  const modelTypes = useMemo(
    () =>
      Array.from(new Set(form.models.map((model) => modelType(model)))).sort(
        (left, right) => left.localeCompare(right)
      ),
    [form.models]
  );
  const filteredModels = useMemo(
    () => filterModels(form.models, modelVendorFilter, modelTypeFilter),
    [form.models, modelTypeFilter, modelVendorFilter]
  );
  const modelGroups = useMemo(
    () => groupModels(filteredModels, modelGroupBy),
    [filteredModels, modelGroupBy]
  );

  return (
    <Panel
      actions={
        <Button onClick={startCreate} type="button" variant="secondary">
          <Plus aria-hidden="true" size={14} />
          Add API
        </Button>
      }
      className="provider-management-panel"
      title="API Providers"
    >
      <div className="provider-management">
        <aside className="provider-management__list" aria-label="API providers">
          <label className="provider-search">
            <Search aria-hidden="true" size={14} />
            <TextInput
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search providers or models"
              value={searchText}
            />
          </label>

          <div className="provider-list">
            {isCreating ? (
              <button className="provider-list-item is-active" type="button">
                <span className="provider-list-item__icon">
                  <Plus aria-hidden="true" size={16} />
                </span>
                <span className="provider-list-item__body">
                  <strong>New provider</strong>
                  <small>Unsaved API profile</small>
                </span>
              </button>
            ) : null}

            {visibleProviders.map((provider) => (
              <button
                className={`provider-list-item ${
                  provider.id === selectedProvider?.id ? "is-active" : ""
                }`}
                key={provider.id}
                onClick={() => selectProvider(provider.id)}
                type="button"
              >
                <span className="provider-list-item__icon">
                  <ServerCog aria-hidden="true" size={16} />
                </span>
                <span className="provider-list-item__body">
                  <strong>{provider.label}</strong>
                  <small>
                    {provider.models.filter((model) => model.enabled).length} models ·{" "}
                    {protocolLabel(provider.protocol)}
                  </small>
                </span>
                <span
                  className={`provider-list-item__dot ${
                    provider.enabled ? "is-enabled" : ""
                  }`}
                  aria-hidden="true"
                />
              </button>
            ))}

            {!providersQuery.isLoading && visibleProviders.length === 0 ? (
              <div className="provider-list-empty">No providers match this search.</div>
            ) : null}
          </div>
        </aside>

        <section className="provider-detail" aria-label="Provider details">
          <header className="provider-detail__header">
            <div className="provider-detail__title">
              <span>
                <KeyRound aria-hidden="true" size={16} />
              </span>
              <div>
                <h3>{isCreating ? "New API Provider" : form.label}</h3>
                <p>{providerSubtitle(selectedProvider, isCreating)}</p>
              </div>
            </div>
            <div className="provider-detail__actions">
              {selectedProvider?.docsUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => window.open(selectedProvider.docsUrl, "_blank")}
                >
                  <ExternalLink aria-hidden="true" size={14} />
                  Docs
                </Button>
              ) : null}
              {selectedProvider ? (
                <Button
                  disabled={testMutation.isPending}
                  loading={testMutation.isPending}
                  onClick={() => testMutation.mutate(selectedProvider.id)}
                  type="button"
                  variant="secondary"
                >
                  <Activity aria-hidden="true" size={14} />
                  Test
                </Button>
              ) : null}
              <Button
                disabled={saving || formIssues.length > 0}
                loading={saving}
                onClick={handleSave}
                type="button"
                variant="primary"
              >
                <CheckCircle2 aria-hidden="true" size={14} />
                Save
              </Button>
            </div>
          </header>

          <div className="provider-status-row">
            <Badge tone={form.enabled ? "success" : "neutral"}>
              {form.enabled ? "Enabled" : "Disabled"}
            </Badge>
            {selectedProvider ? (
              <CredentialBadge provider={selectedProvider} />
            ) : (
              <Badge tone="warning">Unsaved</Badge>
            )}
            <span>{statusMessage}</span>
          </div>

          <div className="provider-detail__content">
            <section className="provider-section">
              <div className="provider-section__header">
                <h4>Connection</h4>
                <CheckboxControl
                  checked={form.enabled}
                  onCheckedChange={(enabled) =>
                    setForm((current) => ({ ...current, enabled }))
                  }
                >
                  Enable provider
                </CheckboxControl>
              </div>

              <div className="provider-form-grid">
                <label className="provider-field">
                  Provider name
                  <TextInput
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        label: event.target.value
                      }))
                    }
                    value={form.label}
                  />
                </label>
                <label className="provider-field">
                  Protocol
                  <SelectControl
                    onValueChange={(protocol) =>
                      setForm((current) => ({
                        ...current,
                        protocol: protocol as ApiProviderProtocol
                      }))
                    }
                    options={providerProtocolOptions}
                    value={form.protocol}
                  />
                </label>
                <label className="provider-field">
                  Image eval profile
                  <SelectControl
                    onValueChange={(imageProvider) =>
                      setForm((current) => ({
                        ...current,
                        imageProvider: imageProvider as ApiProviderImageProvider
                      }))
                    }
                    options={imageProviderOptions}
                    value={form.imageProvider}
                  />
                </label>
                <label className="provider-field provider-field--wide">
                  Base URL
                  <TextInput
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        baseUrl: event.target.value
                      }))
                    }
                    placeholder="https://api.example.com/v1"
                    value={form.baseUrl}
                  />
                </label>
                <label className="provider-field provider-field--wide">
                  API key
                  <TextInput
                    onChange={(event) => {
                      setApiKeyTouched(true);
                      setForm((current) => ({
                        ...current,
                        apiKey: event.target.value
                      }));
                    }}
                    placeholder={
                      selectedProvider?.credential.maskedKey ?? "No API key saved"
                    }
                    type="password"
                    value={form.apiKey}
                  />
                </label>
                <label className="provider-field provider-field--wide">
                  Docs URL
                  <TextInput
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        docsUrl: event.target.value
                      }))
                    }
                    placeholder="https://docs.example.com"
                    value={form.docsUrl}
                  />
                </label>
              </div>
            </section>

            <section className="provider-section">
              <div className="provider-section__header">
                <div>
                  <h4>Models</h4>
                  <p>Enabled image models appear in Eval Setup.</p>
                </div>
                <div className="provider-section__actions">
                  <Badge tone="info">{enabledImageModelCount(form.models)} active</Badge>
                  {selectedProvider ? (
                    <Button
                      disabled={fetchModelsMutation.isPending || saving}
                      loading={fetchModelsMutation.isPending}
                      onClick={handleFetchModels}
                      type="button"
                      variant="secondary"
                    >
                      <RefreshCw aria-hidden="true" size={14} />
                      Fetch models
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="provider-model-controls">
                <label className="provider-field">
                  Classification
                  <SelectControl
                    onValueChange={(value) => setModelGroupBy(value as ModelGroupBy)}
                    options={modelGroupByOptions}
                    value={modelGroupBy}
                  />
                </label>
                <label className="provider-field">
                  Vendor
                  <SelectControl
                    onValueChange={setModelVendorFilter}
                    options={[
                      { label: "All vendors", value: "all" },
                      ...modelVendors.map((vendor) => ({
                        label: vendor,
                        value: vendor
                      }))
                    ]}
                    value={modelVendorFilter}
                  />
                </label>
                <label className="provider-field">
                  Type
                  <SelectControl
                    onValueChange={setModelTypeFilter}
                    options={[
                      { label: "All types", value: "all" },
                      ...modelTypes.map((type) => ({
                        label: modelTypeLabel(type),
                        value: type
                      }))
                    ]}
                    value={modelTypeFilter}
                  />
                </label>
              </div>

              <div className="provider-model-list">
                {form.models.length === 0 ? (
                  <div className="provider-model-empty">
                    No models yet. Fetch them from the saved Base URL or add one
                    manually.
                  </div>
                ) : null}
                {form.models.length > 0 && filteredModels.length === 0 ? (
                  <div className="provider-model-empty">
                    No models match the selected classification filters.
                  </div>
                ) : null}
                {modelGroups.map((group) => (
                  <div className="provider-model-group" key={group.key}>
                    {modelGroupBy !== "none" ? (
                      <div className="provider-model-group__header">
                        <strong>{group.label}</strong>
                        <span>
                          {group.models.length}{" "}
                          {group.models.length === 1 ? "model" : "models"}
                        </span>
                      </div>
                    ) : null}
                    {group.models.map((model) => (
                      <div className="provider-model-row" key={model.id}>
                        <CheckboxControl
                          checked={model.enabled}
                          onCheckedChange={(enabled) =>
                            updateModel(model.id, { enabled })
                          }
                        />
                        <label className="provider-field">
                          Model ID
                          <TextInput
                            onChange={(event) =>
                              updateModel(model.id, { id: event.target.value })
                            }
                            value={model.id}
                          />
                        </label>
                        <label className="provider-field">
                          Display name
                          <TextInput
                            onChange={(event) =>
                              updateModel(model.id, { name: event.target.value })
                            }
                            value={model.name}
                          />
                        </label>
                        <label className="provider-field">
                          Vendor
                          <TextInput
                            onChange={(event) =>
                              updateModel(model.id, { vendor: event.target.value })
                            }
                            value={modelVendor(model)}
                          />
                        </label>
                        <label className="provider-field">
                          Type
                          <SelectControl
                            onValueChange={(value) =>
                              updateModelType(model.id, value as ApiProviderModelType)
                            }
                            options={modelTypeOptions}
                            value={modelType(model)}
                          />
                        </label>
                        <label className="provider-field provider-field--number">
                          Cost
                          <TextInput
                            min="0"
                            onChange={(event) =>
                              updateModel(model.id, {
                                estimatedCostPerImageUsd: Number(event.target.value)
                              })
                            }
                            step="0.001"
                            type="number"
                            value={model.estimatedCostPerImageUsd}
                          />
                        </label>
                        <label className="provider-field provider-field--number">
                          Latency
                          <TextInput
                            min="0"
                            onChange={(event) =>
                              updateModel(model.id, {
                                estimatedLatencyMs: Number(event.target.value)
                              })
                            }
                            step="100"
                            type="number"
                            value={model.estimatedLatencyMs}
                          />
                        </label>
                        <Button
                          aria-label={`Remove ${model.name}`}
                          onClick={() => removeModel(model.id)}
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 aria-hidden="true" size={14} />
                        </Button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div className="provider-model-add">
                <TextInput
                  onChange={(event) =>
                    setNewModel((current) => ({
                      ...current,
                      id: event.target.value
                    }))
                  }
                  placeholder="model-id"
                  value={newModel.id}
                />
                <TextInput
                  onChange={(event) =>
                    setNewModel((current) => ({
                      ...current,
                      name: event.target.value
                    }))
                  }
                  placeholder="Display name"
                  value={newModel.name}
                />
                <TextInput
                  onChange={(event) =>
                    setNewModel((current) => ({
                      ...current,
                      vendor: event.target.value
                    }))
                  }
                  placeholder="Vendor"
                  value={newModel.vendor}
                />
                <SelectControl
                  onValueChange={(value) =>
                    setNewModel((current) => ({
                      ...current,
                      type: value as ApiProviderModelType
                    }))
                  }
                  options={modelTypeOptions}
                  value={newModel.type}
                />
                <TextInput
                  min="0"
                  onChange={(event) =>
                    setNewModel((current) => ({
                      ...current,
                      estimatedCostPerImageUsd: Number(event.target.value)
                    }))
                  }
                  step="0.001"
                  type="number"
                  value={newModel.estimatedCostPerImageUsd}
                />
                <TextInput
                  min="0"
                  onChange={(event) =>
                    setNewModel((current) => ({
                      ...current,
                      estimatedLatencyMs: Number(event.target.value)
                    }))
                  }
                  step="100"
                  type="number"
                  value={newModel.estimatedLatencyMs}
                />
                <Button onClick={addModel} type="button" variant="secondary">
                  <Plus aria-hidden="true" size={14} />
                  Add model
                </Button>
              </div>
            </section>

            {selectedProvider ? (
              <section className="provider-section provider-section--danger">
                <div>
                  <h4>Delete provider</h4>
                  <p>
                    Removing a provider also removes its models from future setup
                    choices.
                  </p>
                </div>
                <Button
                  disabled={deleteMutation.isPending}
                  loading={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(selectedProvider.id)}
                  type="button"
                  variant="destructive-outline"
                >
                  <Trash2 aria-hidden="true" size={14} />
                  Delete
                </Button>
              </section>
            ) : null}
          </div>
        </section>
      </div>
    </Panel>
  );
}

function CredentialBadge({ provider }: { provider: ApiProvider }) {
  switch (provider.credential.status) {
    case "valid":
      return <Badge tone="success">Key valid</Badge>;
    case "invalid":
      return <Badge tone="warning">Key issue</Badge>;
    case "configured":
      return <Badge tone="info">Key saved</Badge>;
    case "not_configured":
      return <Badge tone="warning">No key</Badge>;
  }
}

function providerSubtitle(provider: ApiProvider | undefined, isCreating: boolean) {
  if (isCreating) {
    return "Create an API profile and add the models it exposes.";
  }
  if (!provider) {
    return "Select a provider to edit its API settings.";
  }

  return `${protocolLabel(provider.protocol)} · ${provider.baseUrl}`;
}

function formFromProvider(provider: ApiProvider): ProviderFormState {
  return {
    label: provider.label,
    protocol: provider.protocol,
    imageProvider: provider.imageProvider,
    baseUrl: provider.baseUrl,
    docsUrl: provider.docsUrl ?? "",
    enabled: provider.enabled,
    apiKey: "",
    models: provider.models
  };
}

function newProviderForm(): ProviderFormState {
  return {
    label: "Custom Provider",
    protocol: "openai-chat-completions",
    imageProvider: "custom",
    baseUrl: "https://api.example.com/v1",
    docsUrl: "",
    enabled: false,
    apiKey: "",
    models: []
  };
}

function providerInputFromForm(form: ProviderFormState): ApiProviderInput {
  const input: ApiProviderInput = {
    label: form.label.trim(),
    protocol: form.protocol,
    imageProvider: form.imageProvider,
    baseUrl: form.baseUrl.trim(),
    enabled: form.enabled,
    models: normalizeModels(form.models)
  };
  const docsUrl = form.docsUrl.trim();
  const apiKey = form.apiKey.trim();
  if (docsUrl) {
    input.docsUrl = docsUrl;
  }
  if (apiKey) {
    input.apiKey = apiKey;
  }

  return input;
}

function providerPatchFromForm(
  form: ProviderFormState,
  apiKeyTouched: boolean
): ApiProviderPatch {
  const patch: ApiProviderPatch = {
    label: form.label.trim(),
    protocol: form.protocol,
    imageProvider: form.imageProvider,
    baseUrl: form.baseUrl.trim(),
    enabled: form.enabled,
    models: normalizeModels(form.models)
  };
  const docsUrl = form.docsUrl.trim();
  if (docsUrl) {
    patch.docsUrl = docsUrl;
  }
  if (apiKeyTouched) {
    patch.apiKey = form.apiKey.trim();
  }

  return patch;
}

function normalizeModels(models: ApiProviderModel[]) {
  return models
    .map((model) => {
      const id = model.id.trim();
      const name = model.name.trim() || id;
      const type = inferApiProviderModelType(id, name, model.type);
      return {
        id,
        name,
        enabled: model.enabled,
        vendor: inferApiProviderModelVendor(id, name, model.vendor),
        type,
        capabilities:
          model.capabilities?.length > 0
            ? model.capabilities
            : apiProviderCapabilitiesForModelType(type),
        estimatedCostPerImageUsd: Number(model.estimatedCostPerImageUsd) || 0,
        estimatedLatencyMs: Math.max(
          0,
          Math.round(Number(model.estimatedLatencyMs) || 0)
        )
      };
    })
    .filter((model) => model.id.length > 0);
}

function validateProviderForm(form: ProviderFormState) {
  const issues: string[] = [];
  if (!form.label.trim()) {
    issues.push("Provider name is required.");
  }
  if (!form.baseUrl.trim()) {
    issues.push("Base URL is required.");
  }
  return issues;
}

function enabledImageModelCount(models: ApiProviderModel[]) {
  return models.filter(
    (model) => model.enabled && model.capabilities.includes("image-generation")
  ).length;
}

function filterModels(
  models: ApiProviderModel[],
  vendorFilter: string,
  typeFilter: string
) {
  return models.filter(
    (model) =>
      (vendorFilter === "all" || modelVendor(model) === vendorFilter) &&
      (typeFilter === "all" || modelType(model) === typeFilter)
  );
}

function groupModels(models: ApiProviderModel[], groupBy: ModelGroupBy) {
  if (groupBy === "none") {
    return [{ key: "all", label: "All models", models }];
  }

  const groups = new Map<string, ApiProviderModel[]>();
  for (const model of models) {
    const key = modelGroupKey(model, groupBy);
    groups.set(key, [...(groups.get(key) ?? []), model]);
  }

  return Array.from(groups.entries())
    .map(([key, groupModels]) => ({
      key,
      label: modelGroupLabel(key, groupBy),
      models: groupModels
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function modelGroupKey(model: ApiProviderModel, groupBy: Exclude<ModelGroupBy, "none">) {
  switch (groupBy) {
    case "vendor":
      return modelVendor(model);
    case "type":
      return modelType(model);
    case "status":
      return model.enabled ? "enabled" : "disabled";
  }
}

function modelGroupLabel(key: string, groupBy: Exclude<ModelGroupBy, "none">) {
  switch (groupBy) {
    case "vendor":
      return key;
    case "type":
      return modelTypeLabel(key as ApiProviderModelType);
    case "status":
      return key === "enabled" ? "Enabled" : "Disabled";
  }
}

function modelVendor(model: ApiProviderModel) {
  return inferApiProviderModelVendor(model.id, model.name, model.vendor);
}

function modelType(model: ApiProviderModel): ApiProviderModelType {
  return inferApiProviderModelType(model.id, model.name, model.type);
}

function modelTypeLabel(type: ApiProviderModelType) {
  return modelTypeOptions.find((option) => option.value === type)?.label ?? "Other";
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) =>
    left.localeCompare(right)
  );
}

function protocolLabel(protocol: ApiProviderProtocol) {
  switch (protocol) {
    case "openai-responses":
      return "OpenAI Responses";
    case "openai-chat-completions":
      return "OpenAI Chat Completions";
    case "anthropic-messages":
      return "Anthropic Messages";
  }
}

function maybeFetchModels(
  mutation: { mutateAsync: (providerId: string) => Promise<unknown> },
  provider: ApiProvider,
  shouldFetch: boolean
) {
  if (!shouldFetch || provider.credential.status === "not_configured") {
    return;
  }

  void mutation.mutateAsync(provider.id).catch(() => undefined);
}

function modelFetchStatus(totalRemoteModelCount: number, addedModelCount: number) {
  const remoteLabel =
    totalRemoteModelCount === 1 ? "1 remote model" : `${totalRemoteModelCount} remote models`;
  if (addedModelCount === 0) {
    return `Fetched ${remoteLabel}; no new models were added.`;
  }

  const addedLabel =
    addedModelCount === 1 ? "1 new model" : `${addedModelCount} new models`;
  return `Fetched ${remoteLabel}; added ${addedLabel}.`;
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : "Provider request failed.";
}

function upsertProviderInCache(queryClient: QueryClient, provider: ApiProvider) {
  queryClient.setQueryData<{ providers: ApiProvider[] }>(
    ["api-providers"],
    (current) => {
      const providers = current?.providers ?? [];
      const nextProviders = providers.some((candidate) => candidate.id === provider.id)
        ? providers.map((candidate) =>
            candidate.id === provider.id ? provider : candidate
          )
        : [...providers, provider];

      return { providers: nextProviders };
    }
  );
}
