import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ["@eval/api", "@eval/workflow-schema"]
      })
    ],
    build: {
      rollupOptions: {
        external: ["electron"],
        input: resolve(__dirname, "src/main.ts")
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        external: ["electron"],
        input: resolve(__dirname, "src/preload.ts")
      }
    }
  }
});
