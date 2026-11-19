import type { IncomingMessage } from "node:http";
import { Logger } from "@nestjs/common";
import { type OnGatewayConnection, WebSocketGateway } from "@nestjs/websockets";
import { AGENT_WS_ROUTE, parseAgentWsInbound } from "@pryladova/shared";
import type WebSocket from "ws";
import { ConfigService } from "../config.service.js";
import { isIngestAuthorized } from "../ingest/ingest-auth.js";
import { AgentIngressService } from "./agent-ingress.service.js";

type AgentSocket = {
  close(code?: number, reason?: string): void;
  on(event: "message", listener: (raw: WebSocket.RawData) => void): void;
  on(event: "close", listener: () => void): void;
};

type HeaderRequest = {
  headers: IncomingMessage["headers"];
};

@WebSocketGateway({ path: AGENT_WS_ROUTE })
export class AgentGateway implements OnGatewayConnection {
  private readonly logger = new Logger(AgentGateway.name);
  private readonly connectedAgents = new WeakMap<AgentSocket, string>();

  constructor(
    private readonly configService: ConfigService,
    private readonly agentIngressService: AgentIngressService,
  ) {}

  handleConnection(client: AgentSocket, request: HeaderRequest): void {
    const { ingestSecret } = this.configService.config;
    if (!isIngestAuthorized(request.headers.authorization, ingestSecret)) {
      client.close(4401, "Invalid ingest credentials");
      return;
    }

    client.on("message", (raw: WebSocket.RawData) => {
      try {
        const body: unknown = JSON.parse(String(raw));
        const message = parseAgentWsInbound(body);
        if (this.agentIngressService.acceptMessage(message) === "rejected") {
          const boundAgentId = this.agentIngressService.boundAgentId();
          this.logger.warn(
            `[ingest] rejected agent ${message.agentId} — hub bound to ${boundAgentId}`,
          );
          client.close(4403, "Hub already bound to another agent");
          return;
        }
        this.connectedAgents.set(client, message.agentId);
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Rejected agent message: ${detail}`);
        client.close(4400, "Invalid agent message");
      }
    });

    client.on("close", () => {
      const agentId = this.connectedAgents.get(client);
      if (agentId) {
        this.agentIngressService.handleDisconnect(agentId);
      }
    });
  }
}
