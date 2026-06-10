# Monorepo Boundaries

This repository uses `pnpm workspaces`.

## What Lives Here

- Self-developed web, API, workers, shared schemas, and UI components.
- Infrastructure templates that describe how self-developed services connect.
- Thin integration clients for Langfuse, MLflow, Label Studio, and OSS.

## What Does Not Live Here

- Langfuse source code.
- MLflow source code.
- Label Studio source code.
- FiftyOne source code.
- Large benchmark repos unless they are pinned metric-worker dependencies.

Platform services should be deployed independently and consumed via API.

## Package Layout

```text
apps/web                  React Flow Eval Studio
apps/api                  Eval Core API and compiler
packages/workflow-schema  Shared DSL and node catalog
packages/ui               Shared UI primitives
workers/*                 Runtime executors
infra/*                   Deployment templates
docs/*                    Architecture notes
```

## Dependency Direction

Allowed:

```text
apps/* -> packages/*
workers/* -> packages/*
apps/api -> packages/workflow-schema
```

Avoid:

```text
packages/* -> apps/*
packages/* -> workers/*
apps/web -> workers/*
```

The workflow schema package is the contract. Keep it small, stable, and
runtime-agnostic.
