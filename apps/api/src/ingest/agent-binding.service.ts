import { Injectable } from "@nestjs/common";

@Injectable()
export class AgentBindingService {
  private boundAgentId: string | null = null;

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
    if (process.env.NODE_ENV !== "test") {
      return;
    }
    this.boundAgentId = null;
  }
}
