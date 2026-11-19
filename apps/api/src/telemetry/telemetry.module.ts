import { Module } from "@nestjs/common";
import { ClassificationModule } from "../classification/classification.module.js";
import { IngestModule } from "../ingest/ingest.module.js";
import { PersistenceModule } from "../persistence/persistence.module.js";
import { RealtimeCoreModule } from "../realtime/realtime-core.module.js";
import { SettingsModule } from "../settings/settings.module.js";
import { TelemetryService } from "./telemetry.service.js";

@Module({
  imports: [
    ClassificationModule,
    IngestModule,
    PersistenceModule,
    RealtimeCoreModule,
    SettingsModule,
  ],
  providers: [TelemetryService],
  exports: [TelemetryService, IngestModule],
})
export class TelemetryModule {}
