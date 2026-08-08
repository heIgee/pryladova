import { forwardRef, Module } from "@nestjs/common";
import { ClassificationModule } from "../classification/classification.module.js";
import { RealtimeModule } from "../realtime/realtime.module.js";
import { SettingsModule } from "../settings/settings.module.js";
import { TelemetryService } from "./telemetry.service.js";

@Module({
  imports: [
    ClassificationModule,
    forwardRef(() => SettingsModule),
    forwardRef(() => RealtimeModule),
  ],
  providers: [TelemetryService],
  exports: [TelemetryService],
})
export class TelemetryModule {}
