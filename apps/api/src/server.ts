import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { apiLoggerForNodeEnv, createApiApp } from "./app";
import { env } from "./config/env";
import { createSqliteStore, type SecretCodec } from "./lib/sqliteStore";
import { configureStore } from "./lib/store";

const devStore = createDevStore();
const app = await createApiApp({
  corsOrigin: env.corsOrigin,
  logger: apiLoggerForNodeEnv(env.nodeEnv)
});
app.addHook("onClose", async () => {
  devStore?.close();
});

try {
  await app.listen({ host: env.apiHost, port: env.apiPort });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

function createDevStore() {
  if (process.env.EVAL_STORE === "memory") {
    return undefined;
  }

  const dataDir = process.env.EVAL_DATA_DIR
    ? resolve(process.env.EVAL_DATA_DIR)
    : join(repoRoot(), ".tmp", "eval-studio-dev");
  const store = createSqliteStore({
    databasePath: join(dataDir, "eval-studio.sqlite"),
    secretCodec: localFileSecretCodec(join(dataDir, "secret.key"))
  });
  configureStore(store);
  return store;
}

function localFileSecretCodec(keyPath: string): SecretCodec {
  return {
    decrypt: (value) => {
      const [ivBase64, tagBase64, encryptedBase64] = value.split(".");
      if (!ivBase64 || !tagBase64 || !encryptedBase64) {
        throw new Error("Invalid encrypted value.");
      }

      const decipher = createDecipheriv(
        "aes-256-gcm",
        localSecretKey(keyPath),
        Buffer.from(ivBase64, "base64")
      );
      decipher.setAuthTag(Buffer.from(tagBase64, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(encryptedBase64, "base64")),
        decipher.final()
      ]).toString("utf8");
    },
    encrypt: (value) => {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", localSecretKey(keyPath), iv);
      const encrypted = Buffer.concat([
        cipher.update(value, "utf8"),
        cipher.final()
      ]);
      return [
        iv.toString("base64"),
        cipher.getAuthTag().toString("base64"),
        encrypted.toString("base64")
      ].join(".");
    },
    isAvailable: () => true
  };
}

function localSecretKey(keyPath: string) {
  mkdirSync(dirname(keyPath), { recursive: true });
  if (!existsSync(keyPath)) {
    writeFileSync(keyPath, randomBytes(32).toString("base64"), { mode: 0o600 });
  }

  const key = Buffer.from(readFileSync(keyPath, "utf8"), "base64");
  if (key.length !== 32) {
    throw new Error("Invalid local dev secret key.");
  }
  return key;
}

function repoRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}
