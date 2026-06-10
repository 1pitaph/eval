# Node Authoring Guide

Every executable block starts as a node definition in
`packages/workflow-schema`.

```ts
{
  type: "metric.auto_image",
  version: "1.0.0",
  title: "Auto Image Metrics",
  category: "eval",
  runtime: "metric",
  inputs: [{ id: "artifacts", type: "artifact" }],
  outputs: [{ id: "scores", type: "score" }],
  requiredConfig: ["metrics"],
  costSensitive: true
}
```

## Rules

- Use stable `type` values; never rename them casually.
- Use semver-style `version` values for node behavior changes.
- Prefer typed ports over free-form JSON connections.
- Put secrets behind credential IDs, not node config.
- Mark generation, judge, and paid metric nodes as `costSensitive`.
- Keep UI labels human-readable, but keep execution data in config.

## Adding A Node

1. Add the node definition to `packages/workflow-schema`.
2. Add executor support in the matching worker.
3. Add config rendering in the web inspector if JSON editing is not enough.
4. Add compiler validation for any special gate or budget rule.
5. Add report aggregation if the node emits scores or decisions.
