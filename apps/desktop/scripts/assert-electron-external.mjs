import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundles = ["out/main/main.js", "out/preload/preload.js"];
const forbiddenPatterns = [
  {
    pattern: "Downloading Electron binary",
    reason: "Electron's npm installer was bundled into the app."
  },
  {
    pattern: /electron@\d+\.\d+\.\d+\/node_modules\/electron\/index\.js/,
    reason: "The electron npm package was bundled instead of externalized."
  },
  {
    pattern: /node_modules\/electron\/index\.js/,
    reason: "The electron npm package was bundled instead of externalized."
  }
];

let hasFailure = false;

for (const relativePath of bundles) {
  const bundlePath = resolve(desktopRoot, relativePath);
  if (!existsSync(bundlePath)) {
    console.error(
      `[desktop:bundle-check] Missing ${relativePath}. Run electron-vite build first.`
    );
    hasFailure = true;
    continue;
  }

  const source = readFileSync(bundlePath, "utf8");
  for (const { pattern, reason } of forbiddenPatterns) {
    const matched =
      typeof pattern === "string" ? source.includes(pattern) : pattern.test(source);
    if (matched) {
      console.error(`[desktop:bundle-check] ${relativePath}: ${reason}`);
      hasFailure = true;
    }
  }
}

if (hasFailure) {
  console.error(
    "[desktop:bundle-check] Keep electron as a Rollup external dependency. Bundling it can recursively spawn Electron installer processes."
  );
  process.exit(1);
}

console.log("[desktop:bundle-check] Electron runtime is externalized.");
