import type { IncomingMessage } from "node:http";
import { Logger } from "@nestjs/common";
import { type OnGatewayConnection, WebSocketGateway } from "@nestjs/websockets";
import { AGENT_WS_ROUTE, parseAgentWsInbound } from "@pryladova/shared";
import WebSocket from "ws";
import { isIngestAuthorized } from "../auth/ingest-auth.js";
import { ConfigService } from "../config.service.js";
import { TelemetryService } from "../telemetry/telemetry.service.js";

@WebSocketGateway({ path: AGENT_WS_ROUTE })
export class AgentGateway implements OnGatewayConnection {
  private readonly logger = new Logger(AgentGateway.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly telemetryService: TelemetryService,
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
        if (message.type === "update") {
          this.telemetryService.ingestAgentUpdate(message.host, message.telemetry);
          return;
        }

        if (message.type === "host") {
          this.telemetryService.setHost(message.payload);
          return;
        }

        this.telemetryService.setState(message.payload);
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Rejected agent message: ${detail}`);
        client.close(4400, "Invalid agent message");
      }
    });
  }
}
