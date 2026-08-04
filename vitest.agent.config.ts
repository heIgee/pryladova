import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import shared from "./vitest.shared.js";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

export default mergeConfig(
  shared,
  defineConfig({
    resolve: {
      alias: {
        "@pryladova/shared": path.join(repoRoot, "packages/shared/dist/index.js"),
      },
    },
    test: {
      name: "agent",
      root: repoRoot,
      include: ["apps/agent/src/**/*.test.ts"],
    },
  }),
);
