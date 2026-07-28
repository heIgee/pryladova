import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module.js";
import { SettingsModule } from "./settings/settings.module.js";
import { TelemetryModule } from "./telemetry/telemetry.module.js";

@Module({
  imports: [HealthModule, SettingsModule, TelemetryModule],
})
export class AppModule {}
