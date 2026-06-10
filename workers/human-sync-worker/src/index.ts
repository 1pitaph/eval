import { nodeDefinitions } from "@eval/workflow-schema";

const supportedNodes = nodeDefinitions
  .filter((definition) => definition.runtime === "human_eval")
  .map((definition) => definition.type);

console.info("[human-sync-worker] ready", {
  supportedNodes,
  target: "Label Studio"
});
