import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createLogger, defineConfig, type Logger } from "vite";

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

const isBenignDevProxyError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = (error as NodeJS.ErrnoException).code;
  return code === "ECONNABORTED" || code === "ECONNRESET" || code === "ECONNREFUSED";
};

const createDevLogger = (): Logger => {
  const logger = createLogger();
  const logError = logger.error.bind(logger);
  logger.error = (msg, options) => {
    const err = options?.error ?? (msg instanceof Error ? msg : null);
    if (err && isBenignDevProxyError(err)) {
      return;
    }
    if (typeof msg === "string" && msg.includes("ws proxy")) {
      return;
    }
    logError(msg, options);
  };
  return logger;
};

const apiProxy = {
  target: "http://127.0.0.1:3000",
  changeOrigin: true,
  ws: true,
  configure: (proxy: { on: (event: string, listener: (...args: never[]) => void) => void }) => {
    proxy.on("error", (error: unknown, _req: unknown, res: unknown) => {
      if (!isBenignDevProxyError(error)) {
        return;
      }
      const response = res as {
        headersSent?: boolean;
        writeHead?: (status: number, headers: Record<string, string>) => void;
        end?: (body: string) => void;
      };
      if (response.headersSent || !response.writeHead || !response.end) {
        return;
      }
      response.writeHead(502, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ message: "API temporarily unavailable" }));
    });
    proxy.on(
      "proxyReqWs",
      (_proxyReq, _req, socket: { on: (event: string, listener: () => void) => void }) => {
        socket.on("error", () => {
          // Panel WS reconnect / HMR close — expected in dev.
        });
      },
    );
  },
};

export default defineConfig({
  customLogger: createDevLogger(),
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
      "/api": apiProxy,
    },
  },
  preview: {
    proxy: {
      "/api": apiProxy,
    },
  },
});
