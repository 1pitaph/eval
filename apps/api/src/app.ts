import cors from "@fastify/cors";
import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyServerOptions
} from "fastify";
import { registerProviderRoutes } from "./routes/providers";
import { registerReviewRoutes } from "./routes/reviews";
import { registerRunRoutes } from "./routes/runs";
import { registerWorkflowRoutes } from "./routes/workflows";
import {
  startLocalRunOrchestrator,
  stopLocalRunOrchestrator
} from "./services/localRunOrchestrator";

export type DesktopAuthOptions = {
  cookieName?: string;
  token: string;
};

export type CreateApiAppOptions = {
  corsOrigin?: string | false;
  desktopAuth?: DesktopAuthOptions;
  logger?: FastifyServerOptions["logger"];
};

export const desktopAuthCookieName = "eval_desktop_token";

export async function createApiApp(
  options: CreateApiAppOptions = {}
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false
  });

  if (options.corsOrigin !== false) {
    await app.register(cors, options.corsOrigin ? { origin: options.corsOrigin } : {});
  }

  if (options.desktopAuth) {
    registerDesktopAuth(app, options.desktopAuth);
  }

  app.get("/health", async () => ({
    ok: true,
    service: "@eval/api",
    time: new Date().toISOString()
  }));

  await app.register(registerWorkflowRoutes, { prefix: "/api" });
  await app.register(registerProviderRoutes, { prefix: "/api" });
  await app.register(registerRunRoutes, { prefix: "/api" });
  await app.register(registerReviewRoutes, { prefix: "/api" });

  startLocalRunOrchestrator();
  app.addHook("onClose", async () => {
    stopLocalRunOrchestrator();
  });

  return app;
}

function registerDesktopAuth(app: FastifyInstance, options: DesktopAuthOptions) {
  const cookieName = options.cookieName ?? desktopAuthCookieName;

  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api")) {
      return;
    }

    const token = cookieValue(request.headers.cookie, cookieName);
    if (token !== options.token) {
      return reply.code(401).send({ message: "Desktop session required" });
    }
  });
}

function cookieValue(header: string | undefined, name: string) {
  if (!header) {
    return undefined;
  }

  for (const part of header.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) {
      try {
        return decodeURIComponent(rawValue.join("="));
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}

export function apiListenHostForDesktop() {
  return "127.0.0.1";
}

export function apiLoggerForNodeEnv(
  nodeEnv: string
): FastifyServerOptions["logger"] | FastifyBaseLogger {
  return {
    level: nodeEnv === "production" ? "info" : "debug"
  };
}
