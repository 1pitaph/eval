# Eval Platform

Self-hosted eval infrastructure for image-generation and prompt workflows.

The repository keeps only the self-developed platform in the monorepo:

- `apps/web`: React Flow based Eval Studio.
- `apps/api`: Eval Core API, workflow compiler, run orchestration boundary.
- `apps/desktop`: Electron shell for the macOS-first desktop app.
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
pnpm test
pnpm build
pnpm format
```

Desktop app checks:

```bash
pnpm dev:desktop
pnpm build:desktop
pnpm dist:desktop
pnpm dist:desktop:release
```

The Electron desktop app starts a private loopback API server, stores desktop
data in the OS user-data directory, and encrypts provider API keys with the
platform secure storage exposed by Electron. `pnpm dist:desktop` produces a
local unsigned macOS build. `pnpm dist:desktop:release` uses the signed release
configuration, requires `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and
`APPLE_TEAM_ID`, and publishes update metadata through GitHub Releases when
GitHub publishing credentials are present.

## Config-as-Code Runner

Eval Studio compiles the canvas into an `EvalRunSpec` with an
`image-eval-manifest/v1` manifest. Runs can export:

- `export.json`: full run result package.
- `spec.json`: executable workflow spec for replay.
- `manifest.json`: lightweight input matrix, cost, and review plan.

CI can run a workflow draft, spec, manifest, or exported run JSON without the web
UI:

```bash
pnpm --filter @eval/api eval:run -- \
  --input ./fixtures/eval-starter-workflow.json \
  --output ./eval-run.json
```

## Architecture Contract

React Flow stores a visual draft. The backend compiles that draft into an
immutable `EvalRunSpec`, validates the DAG, and dispatches tasks to workers.
PostgreSQL and OSS are the source of truth for metadata and artifacts.

```text
React Flow Draft -> Workflow Compiler -> EvalRunSpec -> Orchestrator -> Workers
```
