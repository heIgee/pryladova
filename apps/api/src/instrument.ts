import * as Sentry from "@sentry/node";
import { loadConfig } from "./config.js";

const config = loadConfig();
if (config.sentryDsn && !config.runtime.isTest) {
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.runtime.nodeEnv,
    release: config.runtime.sentryRelease,
  });
}
