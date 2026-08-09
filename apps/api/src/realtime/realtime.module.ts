import { forwardRef, Module } from "@nestjs/common";
import { ConfigModule } from "../config.module.js";
import { PersistenceModule } from "../persistence/persistence.module.js";
import { TelemetryModule } from "../telemetry/telemetry.module.js";
import { AgentGateway } from "./agent.gateway.js";
import { PanelGateway } from "./panel.gateway.js";
import { RealtimeService } from "./realtime.service.js";

@Module({
  imports: [ConfigModule, PersistenceModule, forwardRef(() => TelemetryModule)],
  providers: [RealtimeService, PanelGateway, AgentGateway],
  exports: [RealtimeService],
})
export class RealtimeModule {}
