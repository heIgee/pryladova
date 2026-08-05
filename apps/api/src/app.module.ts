import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { loadConfig } from "./config.js";
import { ConfigModule } from "./config.module.js";
import { HealthModule } from "./health/health.module.js";
import { ApiSentryExceptionFilter } from "./sentry-exception.filter.js";
import { TelemetryModule } from "./telemetry/telemetry.module.js";
import { WeatherModule } from "./weather/weather.module.js";

const sentryEnabled = process.env.NODE_ENV !== "test" && Boolean(loadConfig().sentryDsn);

const sentryProviders = sentryEnabled
  ? [{ provide: APP_FILTER, useClass: ApiSentryExceptionFilter }]
  : [];

@Module({
  imports: [ConfigModule, HealthModule, TelemetryModule, WeatherModule],
  providers: [...sentryProviders],
})
export class AppModule {}
