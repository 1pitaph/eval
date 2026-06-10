import { nodeDefinitions } from "@eval/workflow-schema";

const supportedNodes = nodeDefinitions
  .filter((definition) =>
    ["aggregation", "report", "gate"].includes(definition.runtime)
  )
  .map((definition) => definition.type);

console.info("[report-worker] ready", {
  supportedNodes,
  plannedOutputs: ["leaderboard", "pareto", "release-gate"]
});
