import cors from "@fastify/cors";
import Fastify from "fastify";
import { env } from "./config/env";
import { registerReviewRoutes } from "./routes/reviews";
import { registerRunRoutes } from "./routes/runs";
import { registerWorkflowRoutes } from "./routes/workflows";

const app = Fastify({
  logger: {
    level: env.nodeEnv === "production" ? "info" : "debug"
  }
});

await app.register(cors, {
  origin: env.corsOrigin
});

app.get("/health", async () => ({
  ok: true,
  service: "@eval/api",
  time: new Date().toISOString()
}));

await app.register(registerWorkflowRoutes, { prefix: "/api" });
await app.register(registerRunRoutes, { prefix: "/api" });
await app.register(registerReviewRoutes, { prefix: "/api" });

try {
  await app.listen({ host: env.apiHost, port: env.apiPort });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
