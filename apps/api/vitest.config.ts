import swc from "unplugin-swc";
import { defineConfig, mergeConfig } from "vitest/config";
import { vitestShared } from "../../vitest.shared.ts";

export default mergeConfig(
  vitestShared,
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
