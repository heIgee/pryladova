import { forwardRef, Module } from "@nestjs/common";
import { ClassificationModule } from "../classification/classification.module.js";
import { IngestModule } from "../ingest/ingest.module.js";
import { PersistenceModule } from "../persistence/persistence.module.js";
import { RealtimeModule } from "../realtime/realtime.module.js";
import { SettingsModule } from "../settings/settings.module.js";
import { TelemetryService } from "./telemetry.service.js";

@Module({
  imports: [
    ClassificationModule,
    IngestModule,
    PersistenceModule,
    forwardRef(() => SettingsModule),
    forwardRef(() => RealtimeModule),
  ],
  providers: [TelemetryService],
  exports: [TelemetryService, IngestModule],
})
export class TelemetryModule {}
