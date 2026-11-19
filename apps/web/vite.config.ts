import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createLogger, defineConfig, type Logger, type UserConfig } from "vite";

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

const BENIGN_PROXY_CODES = new Set(["ECONNABORTED", "ECONNRESET", "ECONNREFUSED"]);

const isBenignDevProxyError = (error: unknown): boolean => {
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }
  const code = error.code;
  return typeof code === "string" && BENIGN_PROXY_CODES.has(code);
};

const createDevLogger = (): Logger => {
  const logger = createLogger();
  const logError = logger.error.bind(logger);
  logger.error = (msg, options) => {
    if (options?.error && isBenignDevProxyError(options.error)) {
      return;
    }
    if (msg.includes("ws proxy")) {
      return;
    }
    logError(msg, options);
  };
  return logger;
};

type DevProxy = Exclude<NonNullable<NonNullable<UserConfig["server"]>["proxy"]>[string], string>;

const apiPort = process.env.E2E_API_PORT?.trim() || "3000";

const apiProxy: DevProxy = {
  target: `http://127.0.0.1:${apiPort}`,
  changeOrigin: true,
  ws: true,
  configure: (proxy) => {
    proxy.on("error", (error, _req, res) => {
      if (!isBenignDevProxyError(error)) {
        return;
      }
      if (!("writeHead" in res) || !("end" in res) || res.headersSent) {
        return;
      }
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "API temporarily unavailable" }));
    });
    proxy.on("proxyReqWs", (_proxyReq, _req, socket) => {
      socket.on("error", () => {
        // Panel WS reconnect / HMR close — expected in dev.
      });
    });
  },
};

export default defineConfig({
  customLogger: createDevLogger(),
  define: {
    "import.meta.env.VITE_APP_RELEASE": JSON.stringify(appRelease),
  },
  plugins: [
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
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
