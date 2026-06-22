import * as memoryStoreModule from "./inMemoryStore";

export type EvalStore = {
  createApiProvider: typeof memoryStoreModule.createApiProvider;
  createRun: typeof memoryStoreModule.createRun;
  deleteApiProvider: typeof memoryStoreModule.deleteApiProvider;
  getApiProvider: typeof memoryStoreModule.getApiProvider;
  getApiProviderSecret: typeof memoryStoreModule.getApiProviderSecret;
  getEvalTask: typeof memoryStoreModule.getEvalTask;
  getReviewCampaign: typeof memoryStoreModule.getReviewCampaign;
  getReviewLink: typeof memoryStoreModule.getReviewLink;
  getReviewLinkByToken: typeof memoryStoreModule.getReviewLinkByToken;
  getReviewerSession: typeof memoryStoreModule.getReviewerSession;
  getReviewTask: typeof memoryStoreModule.getReviewTask;
  getRun: typeof memoryStoreModule.getRun;
  getWorkflow: typeof memoryStoreModule.getWorkflow;
  listApiProviders: typeof memoryStoreModule.listApiProviders;
  listEvalTasks: typeof memoryStoreModule.listEvalTasks;
  listEvalTasksForRun: typeof memoryStoreModule.listEvalTasksForRun;
  listPairwiseVotes: typeof memoryStoreModule.listPairwiseVotes;
  listPairwiseVotesForRun: typeof memoryStoreModule.listPairwiseVotesForRun;
  listPairwiseVotesForSession: typeof memoryStoreModule.listPairwiseVotesForSession;
  listReviewCampaigns: typeof memoryStoreModule.listReviewCampaigns;
  listReviewLinks: typeof memoryStoreModule.listReviewLinks;
  listReviewTasks: typeof memoryStoreModule.listReviewTasks;
  listWorkflows: typeof memoryStoreModule.listWorkflows;
  saveEvalTasks: typeof memoryStoreModule.saveEvalTasks;
  saveImportedRun: typeof memoryStoreModule.saveImportedRun;
  saveReviewCampaign: typeof memoryStoreModule.saveReviewCampaign;
  saveReviewLink: typeof memoryStoreModule.saveReviewLink;
  saveReviewerSession: typeof memoryStoreModule.saveReviewerSession;
  saveReviewTasks: typeof memoryStoreModule.saveReviewTasks;
  saveRun: typeof memoryStoreModule.saveRun;
  saveWorkflow: typeof memoryStoreModule.saveWorkflow;
  testApiProviderConnection: typeof memoryStoreModule.testApiProviderConnection;
  updateApiProvider: typeof memoryStoreModule.updateApiProvider;
  updateEvalTask: typeof memoryStoreModule.updateEvalTask;
  updateReviewCampaign: typeof memoryStoreModule.updateReviewCampaign;
  updateReviewLink: typeof memoryStoreModule.updateReviewLink;
  updateReviewerSession: typeof memoryStoreModule.updateReviewerSession;
  updateReviewTask: typeof memoryStoreModule.updateReviewTask;
  updateRun: typeof memoryStoreModule.updateRun;
  upsertPairwiseVote: typeof memoryStoreModule.upsertPairwiseVote;
};

let currentStore: EvalStore = memoryStoreModule.createInMemoryStore();

export function configureStore(store: EvalStore) {
  currentStore = store;
}

export function resetStoreForTests() {
  memoryStoreModule.resetInMemoryStoreForTests();
  currentStore = memoryStoreModule.createInMemoryStore();
}

export const createApiProvider: EvalStore["createApiProvider"] = (...args) =>
  currentStore.createApiProvider(...args);
export const createRun: EvalStore["createRun"] = (...args) =>
  currentStore.createRun(...args);
export const deleteApiProvider: EvalStore["deleteApiProvider"] = (...args) =>
  currentStore.deleteApiProvider(...args);
export const getApiProvider: EvalStore["getApiProvider"] = (...args) =>
  currentStore.getApiProvider(...args);
export const getApiProviderSecret: EvalStore["getApiProviderSecret"] = (...args) =>
  currentStore.getApiProviderSecret(...args);
export const getEvalTask: EvalStore["getEvalTask"] = (...args) =>
  currentStore.getEvalTask(...args);
export const getReviewCampaign: EvalStore["getReviewCampaign"] = (...args) =>
  currentStore.getReviewCampaign(...args);
export const getReviewLink: EvalStore["getReviewLink"] = (...args) =>
  currentStore.getReviewLink(...args);
export const getReviewLinkByToken: EvalStore["getReviewLinkByToken"] = (...args) =>
  currentStore.getReviewLinkByToken(...args);
export const getReviewerSession: EvalStore["getReviewerSession"] = (...args) =>
  currentStore.getReviewerSession(...args);
export const getReviewTask: EvalStore["getReviewTask"] = (...args) =>
  currentStore.getReviewTask(...args);
export const getRun: EvalStore["getRun"] = (...args) => currentStore.getRun(...args);
export const getWorkflow: EvalStore["getWorkflow"] = (...args) =>
  currentStore.getWorkflow(...args);
export const listApiProviders: EvalStore["listApiProviders"] = (...args) =>
  currentStore.listApiProviders(...args);
export const listEvalTasks: EvalStore["listEvalTasks"] = (...args) =>
  currentStore.listEvalTasks(...args);
export const listEvalTasksForRun: EvalStore["listEvalTasksForRun"] = (...args) =>
  currentStore.listEvalTasksForRun(...args);
export const listPairwiseVotes: EvalStore["listPairwiseVotes"] = (...args) =>
  currentStore.listPairwiseVotes(...args);
export const listPairwiseVotesForRun: EvalStore["listPairwiseVotesForRun"] = (
  ...args
) => currentStore.listPairwiseVotesForRun(...args);
export const listPairwiseVotesForSession: EvalStore["listPairwiseVotesForSession"] = (
  ...args
) => currentStore.listPairwiseVotesForSession(...args);
export const listReviewCampaigns: EvalStore["listReviewCampaigns"] = (...args) =>
  currentStore.listReviewCampaigns(...args);
export const listReviewLinks: EvalStore["listReviewLinks"] = (...args) =>
  currentStore.listReviewLinks(...args);
export const listReviewTasks: EvalStore["listReviewTasks"] = (...args) =>
  currentStore.listReviewTasks(...args);
export const listWorkflows: EvalStore["listWorkflows"] = (...args) =>
  currentStore.listWorkflows(...args);
export const saveEvalTasks: EvalStore["saveEvalTasks"] = (...args) =>
  currentStore.saveEvalTasks(...args);
export const saveImportedRun: EvalStore["saveImportedRun"] = (...args) =>
  currentStore.saveImportedRun(...args);
export const saveReviewCampaign: EvalStore["saveReviewCampaign"] = (...args) =>
  currentStore.saveReviewCampaign(...args);
export const saveReviewLink: EvalStore["saveReviewLink"] = (...args) =>
  currentStore.saveReviewLink(...args);
export const saveReviewerSession: EvalStore["saveReviewerSession"] = (...args) =>
  currentStore.saveReviewerSession(...args);
export const saveReviewTasks: EvalStore["saveReviewTasks"] = (...args) =>
  currentStore.saveReviewTasks(...args);
export const saveRun: EvalStore["saveRun"] = (...args) => currentStore.saveRun(...args);
export const saveWorkflow: EvalStore["saveWorkflow"] = (...args) =>
  currentStore.saveWorkflow(...args);
export const testApiProviderConnection: EvalStore["testApiProviderConnection"] = (
  ...args
) => currentStore.testApiProviderConnection(...args);
export const updateApiProvider: EvalStore["updateApiProvider"] = (...args) =>
  currentStore.updateApiProvider(...args);
export const updateEvalTask: EvalStore["updateEvalTask"] = (...args) =>
  currentStore.updateEvalTask(...args);
export const updateReviewCampaign: EvalStore["updateReviewCampaign"] = (...args) =>
  currentStore.updateReviewCampaign(...args);
export const updateReviewLink: EvalStore["updateReviewLink"] = (...args) =>
  currentStore.updateReviewLink(...args);
export const updateReviewerSession: EvalStore["updateReviewerSession"] = (...args) =>
  currentStore.updateReviewerSession(...args);
export const updateReviewTask: EvalStore["updateReviewTask"] = (...args) =>
  currentStore.updateReviewTask(...args);
export const updateRun: EvalStore["updateRun"] = (...args) =>
  currentStore.updateRun(...args);
export const upsertPairwiseVote: EvalStore["upsertPairwiseVote"] = (...args) =>
  currentStore.upsertPairwiseVote(...args);
