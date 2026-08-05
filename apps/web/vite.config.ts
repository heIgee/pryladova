import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const resolveAppRelease = (): string => {
  const fromEnv = process.env.VITE_SENTRY_RELEASE?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  try {
    return execSync("git rev-parse HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
};

const appRelease = resolveAppRelease();

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN?.trim();
const sentryOrg = process.env.SENTRY_ORG?.trim();
const sentryProject = process.env.SENTRY_PROJECT?.trim();
const sentryRelease = appRelease;
const viteSentryDsn = process.env.VITE_SENTRY_DSN?.trim();
const sentryUploadEnabled = Boolean(sentryAuthToken && sentryOrg && sentryProject);

const resolveSentryApiUrl = (): string | undefined => {
  const configured = process.env.SENTRY_URL?.trim();
  if (configured) {
    return configured;
  }
  if (viteSentryDsn?.includes("ingest.de.sentry.io")) {
    return "https://de.sentry.io";
  }
  return undefined;
};

const sentryApiUrl = resolveSentryApiUrl();

export default defineConfig({
  define: {
    "import.meta.env.VITE_APP_RELEASE": JSON.stringify(appRelease),
  },
  plugins: [
    react(),
    tailwindcss(),
    ...(sentryUploadEnabled
      ? [
          sentryVitePlugin({
            org: sentryOrg,
            project: sentryProject,
            authToken: sentryAuthToken,
            ...(sentryApiUrl ? { url: sentryApiUrl } : {}),
            release: { name: sentryRelease },
            errorHandler: (error: Error) => {
              throw error;
            },
            sourcemaps: {
              filesToDeleteAfterUpload: ["./dist/**/*.map"],
            },
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
  build: {
    sourcemap: sentryUploadEnabled ? "hidden" : false,
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
});
