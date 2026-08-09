import { Module } from "@nestjs/common";
import { AgentBindingService } from "./agent-binding.service.js";

@Module({
  providers: [AgentBindingService],
  exports: [AgentBindingService],
})
export class IngestModule {}
