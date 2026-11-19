import { Injectable } from "@nestjs/common";
import type { AgentWsInbound } from "@pryladova/shared";
import { AgentBindingService } from "../ingest/agent-binding.service.js";
import { SegmentService } from "../persistence/segment.service.js";
import { TelemetryService } from "../telemetry/telemetry.service.js";

@Injectable()
export class AgentIngressService {
  constructor(
    private readonly telemetryService: TelemetryService,
    private readonly segmentService: SegmentService,
    private readonly agentBindingService: AgentBindingService,
  ) {}

  acceptMessage(message: AgentWsInbound): "ok" | "rejected" {
    if (this.agentBindingService.assertAgent(message.agentId) === "rejected") {
      return "rejected";
    }

    if (message.type === "update") {
      this.telemetryService.ingestAgentUpdate(message.agentId, message.host, message.telemetry);
      return "ok";
    }

    void this.segmentService.closeForShutdown(message.agentId, message.capturedAt);
    return "ok";
  }

  handleDisconnect(agentId: string): void {
    void this.segmentService.closeForAgentDisconnect(agentId);
  }

  boundAgentId(): string | null {
    return this.agentBindingService.getBoundAgentId();
  }
}
