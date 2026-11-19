import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import { vitestShared } from "../../vitest.shared.ts";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default mergeConfig(
  vitestShared,
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
      // Node 26 exposes localStorage without --localstorage-file. That getter
      // wins over jsdom and tests see undefined storage.
      execArgv: ["--no-experimental-webstorage"],
    },
  }),
);
