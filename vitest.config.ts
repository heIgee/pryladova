import { defineConfig, mergeConfig } from "vitest/config";
import { vitestCoverage } from "./vitest.shared.ts";

export default mergeConfig(
  vitestCoverage,
  defineConfig({
    test: {
      projects: [
        "packages/shared/vitest.config.ts",
        "apps/api/vitest.config.ts",
        "apps/web/vitest.config.ts",
        "vitest.agent.config.ts",
      ],
    },
  }),
);
