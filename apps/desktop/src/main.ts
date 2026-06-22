import { mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import { BrowserWindow, app, safeStorage, session, shell } from "electron";
import fastifyStatic from "@fastify/static";
import { autoUpdater } from "electron-updater";
import {
  apiListenHostForDesktop,
  createApiApp,
  desktopAuthCookieName
} from "@eval/api/app";
import {
  configureArtifactStore,
  createLocalArtifactStore
} from "@eval/api/artifact-store";
import { createSqliteStore, type SecretCodec } from "@eval/api/sqlite-store";
import { configureStore } from "@eval/api/store";

const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'"
].join("; ");

let mainWindow: BrowserWindow | undefined;
let localAppUrl: string | undefined;
let localApi: Awaited<ReturnType<typeof createApiApp>> | undefined;
let desktopStore: ReturnType<typeof createSqliteStore> | undefined;

app.setName("Eval Studio");
process.env.EVAL_IMAGE_ADAPTER ??= "openai-live";

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (!mainWindow) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
});

app.whenReady().then(async () => {
  configureSessionSecurity();
  const { url, token } = await startLocalApp();
  await createWindow(url, token);
  configureAutoUpdates();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    if (!localAppUrl) {
      const { url, token } = await startLocalApp();
      await createWindow(url, token);
      return;
    }
    await createWindow(localAppUrl, "");
  }
});

app.on("before-quit", async () => {
  await localApi?.close();
  desktopStore?.close();
});

async function startLocalApp() {
  const userData = app.getPath("userData");
  const artifactsDir = join(userData, "artifacts");
  mkdirSync(artifactsDir, { recursive: true });
  configureArtifactStore(createLocalArtifactStore(artifactsDir));

  desktopStore = createSqliteStore({
    databasePath: join(userData, "eval-studio.sqlite"),
    secretCodec: electronSecretCodec()
  });
  configureStore(desktopStore);

  const token = randomBytes(32).toString("base64url");
  localApi = await createApiApp({
    corsOrigin: false,
    desktopAuth: { token }
  });
  localApi.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api")) {
      reply.header("Content-Security-Policy", csp);
    }
  });
  await localApi.register(fastifyStatic, {
    decorateReply: true,
    prefix: "/",
    root: webDistRoot()
  });
  localApi.setNotFoundHandler((request, reply) => {
    if (request.method === "GET" && !request.url.startsWith("/api")) {
      return reply.header("Content-Security-Policy", csp).sendFile("index.html");
    }

    return reply.code(404).send({
      error: "Not Found",
      message: `Route ${request.method}:${request.url} not found`,
      statusCode: 404
    });
  });
  await localApi.listen({
    host: apiListenHostForDesktop(),
    port: 0
  });

  const address = localApi.server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine local desktop server address.");
  }

  const url = `http://${apiListenHostForDesktop()}:${address.port}`;
  localAppUrl = url;

  return { token, url };
}

async function createWindow(url: string, token: string) {
  if (token) {
    await session.defaultSession.cookies.set({
      httpOnly: true,
      name: desktopAuthCookieName,
      sameSite: "strict",
      secure: false,
      url,
      value: encodeURIComponent(token)
    });
  }

  mainWindow = new BrowserWindow({
    backgroundColor: "#f7f8fb",
    height: 900,
    minHeight: 720,
    minWidth: 1080,
    show: false,
    title: "Eval Studio",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, "../preload/preload.js"),
      sandbox: true
    },
    width: 1440
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    openExternalHttps(targetUrl);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (isLocalAppUrl(targetUrl)) {
      return;
    }
    event.preventDefault();
    openExternalHttps(targetUrl);
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });

  await mainWindow.loadURL(url);
}

function electronSecretCodec(): SecretCodec {
  return {
    decrypt: (value) => safeStorage.decryptString(Buffer.from(value, "base64")),
    encrypt: (value) => safeStorage.encryptString(value).toString("base64"),
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    unavailableMessage:
      "Secure credential storage is unavailable on this system. API keys cannot be saved."
  };
}

function webDistRoot() {
  if (app.isPackaged) {
    return join(process.resourcesPath, "web");
  }

  return resolve(__dirname, "../../..", "web/dist");
}

function configureSessionSecurity() {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    }
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
}

function isLocalAppUrl(targetUrl: string) {
  if (!localAppUrl) {
    return false;
  }

  try {
    return new URL(targetUrl).origin === new URL(localAppUrl).origin;
  } catch {
    return false;
  }
}

function openExternalHttps(targetUrl: string) {
  try {
    const url = new URL(targetUrl);
    if (url.protocol === "https:") {
      void shell.openExternal(url.toString());
    }
  } catch {
    // Ignore invalid navigation targets.
  }
}

function configureAutoUpdates() {
  if (!app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("error", (error) => {
    console.warn("[updates] Update check failed", error);
  });
  void autoUpdater.checkForUpdatesAndNotify();
}
