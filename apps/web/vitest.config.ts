import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import shared from "../../vitest.shared.js";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default mergeConfig(
  shared,
  defineConfig({
    resolve: {
      alias: {
        "@": path.resolve(rootDir, "./src"),
      },
    },
    test: {
      name: "web",
      include: ["src/**/*.test.ts"],
      environment: "jsdom",
    },
  }),
);
