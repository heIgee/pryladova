import swc from "unplugin-swc";
import { defineConfig, mergeConfig } from "vitest/config";
import shared from "../../vitest.shared.js";

export default mergeConfig(
  shared,
  defineConfig({
    plugins: [
      swc.vite({
        module: { type: "es6" },
        jsc: {
          parser: { syntax: "typescript", decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
        },
      }),
    ],
    test: {
      name: "api",
      include: ["src/**/*.test.ts", "test/**/*.test.ts"],
      setupFiles: ["./vitest.setup.ts"],
    },
  }),
);
