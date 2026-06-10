import { nodeDefinitions } from "@eval/workflow-schema";

const supportedNodes = nodeDefinitions
  .filter((definition) => definition.runtime === "metric")
  .map((definition) => definition.type);

console.info("[metric-worker] ready", {
  supportedNodes,
  plannedMetrics: ["ocr", "safety", "imagereward", "pickscore", "geneval"]
});
