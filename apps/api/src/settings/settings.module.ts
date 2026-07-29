import { forwardRef, Module } from "@nestjs/common";
import { TelemetryModule } from "../telemetry/telemetry.module.js";
import { SettingsController } from "./settings.controller.js";
import { SettingsService } from "./settings.service.js";

@Module({
  imports: [forwardRef(() => TelemetryModule)],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
