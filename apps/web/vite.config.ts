import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const numberFromEnv = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const webPort = numberFromEnv(env.WEB_PORT ?? env.PORT, 8455);
  const apiPort = numberFromEnv(env.API_PORT, 8456);
  const apiProxyTarget = env.VITE_API_PROXY_TARGET ?? `http://localhost:${apiPort}`;

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      tsconfigPaths: true
    },
    server: {
      host: env.WEB_HOST ?? "0.0.0.0",
      port: webPort,
      strictPort: true,
      hmr: {
        clientPort: numberFromEnv(env.WEB_HMR_CLIENT_PORT, webPort),
        host: env.WEB_HMR_HOST ?? "localhost",
        protocol: env.WEB_HMR_PROTOCOL === "wss" ? "wss" : "ws"
      },
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true
        }
      }
    }
  };
});
