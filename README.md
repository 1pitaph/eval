# Eval Platform

Self-hosted eval infrastructure for image-generation and prompt workflows.

The repository keeps only the self-developed platform in the monorepo:

- `apps/web`: React Flow based Eval Studio.
- `apps/api`: Eval Core API, workflow compiler, run orchestration boundary.
- `packages/workflow-schema`: shared workflow DSL, node catalog, validation types.
- `packages/ui`: shared React primitives used by internal apps.
- `workers/*`: generation, metric, human-eval sync, and report workers.
- `infra/*`: deployment manifests and environment templates.

External platforms such as Langfuse, MLflow, Label Studio, and FiftyOne should be
deployed as separate services and integrated through APIs. They are not vendored
into this monorepo.

## Local Development

```bash
pnpm install
pnpm dev
```

Useful checks:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

## Architecture Contract

React Flow stores a visual draft. The backend compiles that draft into an
immutable `EvalRunSpec`, validates the DAG, and dispatches tasks to workers.
PostgreSQL and OSS are the source of truth for metadata and artifacts.

```text
React Flow Draft -> Workflow Compiler -> EvalRunSpec -> Orchestrator -> Workers
```
