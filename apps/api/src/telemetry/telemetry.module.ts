import { Module } from "@nestjs/common";
import { ClassificationModule } from "../classification/classification.module.js";
import { SettingsModule } from "../settings/settings.module.js";
import { TelemetryController } from "./telemetry.controller.js";
import { TelemetryService } from "./telemetry.service.js";

@Module({
  imports: [ClassificationModule, SettingsModule],
  controllers: [TelemetryController],
  providers: [TelemetryService],
})
export class TelemetryModule {}
