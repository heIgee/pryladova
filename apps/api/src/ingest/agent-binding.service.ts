import { Injectable } from "@nestjs/common";
import { ConfigService } from "../config.service.js";

@Injectable()
export class AgentBindingService {
  private boundAgentId: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  assertAgent(agentId: string): "ok" | "rejected" {
    if (this.boundAgentId === null) {
      this.boundAgentId = agentId;
      return "ok";
    }

    if (this.boundAgentId === agentId) {
      return "ok";
    }

    return "rejected";
  }

  getBoundAgentId(): string | null {
    return this.boundAgentId;
  }

  rememberAgentId(agentId: string): void {
    if (this.boundAgentId === null) {
      this.boundAgentId = agentId;
    }
  }

  resetForE2e(): void {
    if (!this.configService.config.runtime.isTest) {
      return;
    }
    this.boundAgentId = null;
  }
}
