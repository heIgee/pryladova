import type { IncomingMessage } from "node:http";
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  WebSocketGateway,
} from "@nestjs/websockets";
import { PANEL_WS_ROUTE } from "@pryladova/shared";
import { AuthService } from "../auth/auth.service.js";
import { TelemetryService } from "../telemetry/telemetry.service.js";
import { type PanelSocket, RealtimeService } from "./realtime.service.js";

type HeaderRequest = {
  headers: IncomingMessage["headers"];
};

@WebSocketGateway({ path: PANEL_WS_ROUTE })
export class PanelGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    private readonly authService: AuthService,
    private readonly telemetryService: TelemetryService,
    private readonly realtimeService: RealtimeService,
  ) {}

  handleConnection(client: PanelSocket, request: HeaderRequest): void {
    if (!this.authService.isAuthenticated(request.headers.cookie)) {
      client.close(4401, "Panel authentication required");
      return;
    }

    this.realtimeService.addPanelClient(client);
    const state = this.telemetryService.getState();
    client.send(JSON.stringify(this.realtimeService.buildPanelMessage(state)));
  }

  handleDisconnect(client: PanelSocket): void {
    this.realtimeService.removePanelClient(client);
  }
}
