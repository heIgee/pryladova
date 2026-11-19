import { defineConfig, mergeConfig } from "vitest/config";
import { vitestShared } from "../../vitest.shared.ts";

export default mergeConfig(
  vitestShared,
  defineConfig({
    test: {
      name: "shared",
      include: ["src/**/*.test.ts"],
    },
  }),
);
