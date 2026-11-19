import { Module } from "@nestjs/common";
import { ConfigModule } from "../config.module.js";
import { AgentBindingService } from "./agent-binding.service.js";

@Module({
  imports: [ConfigModule],
  providers: [AgentBindingService],
  exports: [AgentBindingService],
})
export class IngestModule {}
