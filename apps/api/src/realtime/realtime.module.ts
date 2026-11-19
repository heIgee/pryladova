import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ConfigModule } from "../config.module.js";
import { PersistenceModule } from "../persistence/persistence.module.js";
import { TelemetryModule } from "../telemetry/telemetry.module.js";
import { AgentGateway } from "./agent.gateway.js";
import { AgentIngressService } from "./agent-ingress.service.js";
import { PanelGateway } from "./panel.gateway.js";
import { RealtimeCoreModule } from "./realtime-core.module.js";

@Module({
  imports: [AuthModule, ConfigModule, PersistenceModule, TelemetryModule, RealtimeCoreModule],
  providers: [AgentIngressService, PanelGateway, AgentGateway],
})
export class RealtimeModule {}
