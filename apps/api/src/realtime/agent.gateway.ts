import type { IncomingMessage } from "node:http";
import { Logger } from "@nestjs/common";
import { type OnGatewayConnection, WebSocketGateway } from "@nestjs/websockets";
import { AGENT_WS_ROUTE, parseAgentWsInbound } from "@pryladova/shared";
import WebSocket from "ws";
import { isIngestAuthorized } from "../auth/ingest-auth.js";
import { ConfigService } from "../config.service.js";
import { AgentBindingService } from "../ingest/agent-binding.service.js";
import { SegmentService } from "../persistence/segment.service.js";
import { TelemetryService } from "../telemetry/telemetry.service.js";

@WebSocketGateway({ path: AGENT_WS_ROUTE })
export class AgentGateway implements OnGatewayConnection {
  private readonly logger = new Logger(AgentGateway.name);
  private readonly connectedAgents = new WeakMap<WebSocket, string>();

  constructor(
    private readonly configService: ConfigService,
    private readonly telemetryService: TelemetryService,
    private readonly segmentService: SegmentService,
    private readonly agentBindingService: AgentBindingService,
  ) {}

  handleConnection(client: WebSocket, request: IncomingMessage): void {
    const { ingestSecret } = this.configService.config;
    if (!isIngestAuthorized(request.headers.authorization, ingestSecret)) {
      client.close(4401, "Invalid ingest credentials");
      return;
    }

    client.on("message", (raw: WebSocket.RawData) => {
      try {
        const body: unknown = JSON.parse(String(raw));
        const message = parseAgentWsInbound(body);
        this.connectedAgents.set(client, message.agentId);
        const binding = this.agentBindingService.assertAgent(message.agentId);
        if (binding === "rejected") {
          const boundAgentId = this.agentBindingService.getBoundAgentId();
          this.logger.warn(
            `[ingest] rejected agent ${message.agentId} — hub bound to ${boundAgentId}`,
          );
          client.close(4403, "Hub already bound to another agent");
          return;
        }

        if (message.type === "update") {
          this.telemetryService.ingestAgentUpdate(message.agentId, message.host, message.telemetry);
          return;
        }

        void this.segmentService.closeForShutdown(message.agentId, message.capturedAt);
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Rejected agent message: ${detail}`);
        client.close(4400, "Invalid agent message");
      }
    });

    client.on("close", () => {
      const agentId = this.connectedAgents.get(client);
      if (agentId) {
        void this.segmentService.closeForAgentDisconnect(agentId);
      }
    });
  }
}
