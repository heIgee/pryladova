import type { IncomingMessage } from "node:http";
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  WebSocketGateway,
} from "@nestjs/websockets";
import { PANEL_WS_ROUTE } from "@pryladova/shared";
import WebSocket from "ws";
import { readSessionCookie } from "../auth/session.js";
import { requirePanelAuth } from "../config.js";
import { ConfigService } from "../config.service.js";
import { TelemetryService } from "../telemetry/telemetry.service.js";
import { RealtimeService } from "./realtime.service.js";

@WebSocketGateway({ path: PANEL_WS_ROUTE })
export class PanelGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    private readonly configService: ConfigService,
    private readonly telemetryService: TelemetryService,
    private readonly realtimeService: RealtimeService,
  ) {}

  handleConnection(client: WebSocket, request: IncomingMessage): void {
    const { sessionSecret } = requirePanelAuth(this.configService.config);
    if (!readSessionCookie(request.headers.cookie, sessionSecret)) {
      client.close(4401, "Panel authentication required");
      return;
    }

    this.realtimeService.addPanelClient(client);
    const state = this.telemetryService.getState();
    client.send(JSON.stringify(this.realtimeService.buildPanelMessage(state)));
  }

  handleDisconnect(client: WebSocket): void {
    this.realtimeService.removePanelClient(client);
  }
}
