import { configDefaults, defineConfig } from "vitest/config";

// Merge into each package config. Coverage is not here: Vitest 4 reads `coverage` from the root config only.
export const vitestShared = defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/dist/**", "**/e2e/**"],
  },
});

// Merge into the root vitest.config.ts only. A `test.projects` setup ignores this block on child projects.
export const vitestCoverage = defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.spec.ts",
        "**/*.spec.tsx",
        "**/*.d.ts",
        "**/dist/**",
        "**/e2e/**",
      ],
    },
  },
});
