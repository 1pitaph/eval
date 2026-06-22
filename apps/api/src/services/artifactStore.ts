import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import type { EvalRunRecord } from "@eval/workflow-schema";

export type ArtifactReadResult = {
  body: Buffer;
  contentType: string;
};

export type ArtifactStore = {
  publicUrl(runId: string, fileName: string): string;
  read(runId: string, fileName: string): Promise<ArtifactReadResult>;
  writeDataUri(runId: string, fileName: string, dataUri: string): Promise<string>;
};

let currentArtifactStore: ArtifactStore | undefined;

export function configureArtifactStore(store: ArtifactStore | undefined) {
  currentArtifactStore = store;
}

export function getArtifactStore() {
  return currentArtifactStore;
}

export function createLocalArtifactStore(rootDir: string): ArtifactStore {
  return {
    publicUrl: (runId, fileName) =>
      `/api/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(
        safeFileName(fileName)
      )}`,
    read: async (runId, fileName) => {
      const safeName = safeFileName(fileName);
      const filePath = safeJoin(rootDir, runId, safeName);
      return {
        body: await readFile(filePath),
        contentType: contentTypeForFile(safeName)
      };
    },
    writeDataUri: async (runId, fileName, dataUri) => {
      const parsed = parseDataUri(dataUri);
      if (!parsed) {
        return dataUri;
      }

      const safeName = safeFileName(fileName);
      const runDir = safeJoin(rootDir, runId);
      await mkdir(runDir, { recursive: true });
      await writeFile(join(runDir, safeName), parsed.body);
      return `/api/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(
        safeName
      )}`;
    }
  };
}

export async function materializeRunArtifacts(run: EvalRunRecord) {
  const store = getArtifactStore();
  if (!store || run.artifacts.length === 0) {
    return run;
  }

  const artifacts = await Promise.all(
    run.artifacts.map(async (artifact) => {
      const imageFile = `${artifact.id}.svg`;
      const thumbnailFile = `${artifact.id}-thumb.svg`;
      return {
        ...artifact,
        uri: await store.writeDataUri(run.id, imageFile, artifact.uri),
        thumbnailUri: await store.writeDataUri(
          run.id,
          thumbnailFile,
          artifact.thumbnailUri
        )
      };
    })
  );

  return {
    ...run,
    artifacts
  };
}

function parseDataUri(dataUri: string) {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/u.exec(dataUri);
  if (!match) {
    return undefined;
  }

  const [, contentType, encoding, rawBody] = match;
  const body =
    encoding === ";base64"
      ? Buffer.from(rawBody ?? "", "base64")
      : Buffer.from(decodeURIComponent(rawBody ?? ""), "utf8");

  return {
    body,
    contentType: contentType ?? "application/octet-stream"
  };
}

function safeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function safeJoin(rootDir: string, runId: string, fileName?: string) {
  const safeRunId = safeFileName(runId);
  const joined = fileName
    ? join(rootDir, safeRunId, safeFileName(fileName))
    : join(rootDir, safeRunId);
  const normalizedRoot = normalize(rootDir);
  const normalizedJoined = normalize(joined);
  if (!normalizedJoined.startsWith(normalizedRoot)) {
    throw new Error("Artifact path escaped the configured artifact root.");
  }
  return normalizedJoined;
}

function contentTypeForFile(fileName: string) {
  if (fileName.endsWith(".svg")) {
    return "image/svg+xml; charset=utf-8";
  }
  if (fileName.endsWith(".png")) {
    return "image/png";
  }
  if (fileName.endsWith(".webp")) {
    return "image/webp";
  }
  if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  return "application/octet-stream";
}
