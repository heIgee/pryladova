import { Module } from "@nestjs/common";
import { ConfigModule } from "./config.module.js";
import { HealthModule } from "./health/health.module.js";
import { TelemetryModule } from "./telemetry/telemetry.module.js";

@Module({
  imports: [ConfigModule, HealthModule, TelemetryModule],
})
export class AppModule {}
