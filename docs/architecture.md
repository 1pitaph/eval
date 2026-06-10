# Eval Platform Architecture

## System Shape

The platform has three control boundaries:

1. **Eval Studio**: React Flow canvas, node inspector, run panel, reports.
2. **Eval Core**: workflow compiler, validation, orchestration, ledger writes.
3. **Workers**: generation, automatic metrics, human-eval sync, aggregation.

React Flow is the visual DSL editor. It is not the execution engine.

```text
WorkflowDraft -> WorkflowCompiler -> EvalRunSpec -> Queue -> Workers
```

## Source Of Truth

PostgreSQL and OSS are the canonical data layer.

- PostgreSQL: workflow versions, eval runs, tasks, artifacts, scores, costs.
- OSS: images, videos, thumbnails, raw provider responses, metric JSON.
- Langfuse/Phoenix: trace and observability views.
- MLflow: experiment ledger and run artifact index.
- Label Studio: human review task UI.
- FiftyOne: visual inspection and sample analysis.

No external platform should become the only source of truth.

## Main Runtime Flow

1. User edits a DAG in `apps/web`.
2. The API validates and compiles it into an immutable `EvalRunSpec`.
3. The orchestrator expands the DAG into concrete tasks.
4. Workers execute tasks and write artifacts to OSS.
5. Metrics and human annotations are written back to the ledger.
6. Reports compute model rankings, Pareto frontiers, and release gates.

## Alibaba Cloud Mapping

MVP:

- ECS + Docker Compose for self-developed services.
- RDS PostgreSQL for metadata.
- OSS for artifacts.
- Tair Redis for queue/cache.
- SLS for logs and alerts.

Scale-out:

- ACK + ALB + ACR for container orchestration.
- Dedicated worker pools for generation, metrics, and reporting.
- GPU node pool only when local model inference or heavy metrics require it.
