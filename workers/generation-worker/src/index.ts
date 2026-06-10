import { nodeDefinitions } from "@eval/workflow-schema";

const supportedNodes = nodeDefinitions
  .filter((definition) => definition.runtime === "generation")
  .map((definition) => definition.type);

console.info("[generation-worker] ready", {
  supportedNodes
});
