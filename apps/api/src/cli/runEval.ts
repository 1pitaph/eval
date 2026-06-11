import { readFile, writeFile } from "node:fs/promises";
import { nanoid } from "nanoid";
import { runImageEvalSpec } from "../services/imageEvalRunner";
import { resolveEvalSpecFromPayload } from "../services/workflowImport";

type CliOptions = {
  input?: string;
  output?: string;
  id?: string;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.input) {
    throw new Error(
      "Missing --input. Usage: pnpm --filter @eval/api eval:run -- --input manifest-or-spec.json --output run.json"
    );
  }

  const payload = JSON.parse(await readFile(options.input, "utf8")) as unknown;
  const resolved = resolveEvalSpecFromPayload(payload);
  const createdAt = new Date().toISOString();
  const run = runImageEvalSpec(
    resolved.spec,
    options.id ?? `ci-${nanoid(12)}`,
    createdAt
  );
  const output = `${JSON.stringify(run, null, 2)}\n`;

  if (options.output) {
    await writeFile(options.output, output, "utf8");
  } else {
    process.stdout.write(output);
  }

  process.stderr.write(
    [
      `Eval input: ${resolved.kind}`,
      `Run: ${run.id}`,
      `Artifacts: ${run.summary.artifactCount}`,
      `Planned operations: ${run.summary.taskCount}`,
      `Estimated cost: $${run.summary.estimatedCostUsd.toFixed(2)}`,
      `Decision: ${run.decision.status}`
    ].join("\n") + "\n"
  );
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    switch (arg) {
      case "--":
        break;
      case "--input":
      case "-i":
        options.input = requireValue(arg, next);
        index += 1;
        break;
      case "--output":
      case "-o":
        options.output = requireValue(arg, next);
        index += 1;
        break;
      case "--id":
        options.id = requireValue(arg, next);
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument "${arg}".`);
    }
  }

  return options;
}

function requireValue(flag: string, value: string | undefined) {
  if (!value || value.startsWith("-")) {
    throw new Error(`Missing value for ${flag}.`);
  }

  return value;
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Eval runner failed."}\n`
  );
  process.exitCode = 1;
});
