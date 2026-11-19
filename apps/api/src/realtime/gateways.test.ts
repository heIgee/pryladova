import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import { Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import WebSocket from "ws";
import { AuthService } from "../auth/auth.service.js";
import { createSessionToken, readSessionCookie, SESSION_COOKIE_NAME } from "../auth/session.js";
import { testApiConfig } from "../config.js";
import { ConfigService } from "../config.service.js";
import { AgentBindingService } from "../ingest/agent-binding.service.js";
import { SegmentService } from "../persistence/segment.service.js";
import { TelemetryService } from "../telemetry/telemetry.service.js";
import { createSegmentServiceMock } from "../test/persistence-mocks.js";
import { AgentGateway } from "./agent.gateway.js";
import { AgentIngressService } from "./agent-ingress.service.js";
import { PanelGateway } from "./panel.gateway.js";
import { RealtimeService } from "./realtime.service.js";

const SESSION_SECRET = "panel-session-secret-0123456789abcdef";

const config = testApiConfig({
  ingestSecret: "ingest-secret",
  sessionSecret: SESSION_SECRET,
  panelPasswordHash: "$2b$10$hash",
});

type FakeSocket = EventEmitter & {
  close: Mock<(code?: number, reason?: string) => void>;
  send: Mock<(data: string) => void>;
  readyState: number;
};

const createSocket = (): FakeSocket =>
  Object.assign(new EventEmitter(), {
    close: vi.fn<(code?: number, reason?: string) => void>(),
    send: vi.fn<(data: string) => void>(),
    readyState: WebSocket.OPEN,
  });

const requestWith = (
  headers: IncomingMessage["headers"],
): { headers: IncomingMessage["headers"] } => ({
  headers,
});

const host = {
  idleMs: 0,
  cpuPercent: 5,
  ramPercent: 40,
  uptimeSec: 60,
  media: null,
  capturedAt: "2026-08-08T10:00:00.000Z",
};

describe("AgentGateway", () => {
  let gateway: AgentGateway;
  let telemetry: { ingestAgentUpdate: ReturnType<typeof vi.fn> };
  let segments: ReturnType<typeof createSegmentServiceMock>;

  beforeEach(async () => {
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
    telemetry = { ingestAgentUpdate: vi.fn() };
    segments = createSegmentServiceMock();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AgentGateway,
        AgentIngressService,
        AgentBindingService,
        { provide: ConfigService, useValue: { config } },
        { provide: TelemetryService, useValue: telemetry },
        { provide: SegmentService, useValue: segments },
      ],
    }).compile();
    gateway = moduleRef.get(AgentGateway);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const connect = (authorization = "Bearer ingest-secret"): FakeSocket => {
    const socket = createSocket();
    gateway.handleConnection(socket, requestWith({ authorization }));
    return socket;
  };

  const sendJson = (socket: FakeSocket, body: unknown) => {
    socket.emit("message", Buffer.from(JSON.stringify(body)));
  };

  it("closes connections with bad ingest credentials", () => {
    const socket = connect("Bearer wrong");
    expect(socket.close).toHaveBeenCalledWith(4401, "Invalid ingest credentials");
    expect(socket.listenerCount("message")).toBe(0);
  });

  it("forwards updates to telemetry", () => {
    const socket = connect();
    const window = {
      appName: "Code",
      windowTitle: "main.ts",
      capturedAt: "2026-08-08T10:00:00.000Z",
    };

    sendJson(socket, { type: "update", agentId: "desk", host, telemetry: window });

    expect(telemetry.ingestAgentUpdate).toHaveBeenCalledWith("desk", host, window);
    expect(socket.close).not.toHaveBeenCalled();
  });

  it("closes the segment on shutdown and on disconnect", () => {
    const socket = connect();
    sendJson(socket, { type: "shutdown", agentId: "desk", capturedAt: host.capturedAt });
    expect(segments.closeForShutdown).toHaveBeenCalledWith("desk", host.capturedAt);

    socket.emit("close");
    expect(segments.closeForAgentDisconnect).toHaveBeenCalledWith("desk");
  });

  it("rejects malformed messages", () => {
    const socket = connect();
    socket.emit("message", Buffer.from("not json"));
    expect(socket.close).toHaveBeenCalledWith(4400, "Invalid agent message");

    const second = connect();
    sendJson(second, { type: "update", agentId: "desk" });
    expect(second.close).toHaveBeenCalledWith(4400, "Invalid agent message");
    expect(telemetry.ingestAgentUpdate).not.toHaveBeenCalled();
  });

  it("rejects a second agent without touching its segments on close", () => {
    const first = connect();
    sendJson(first, { type: "update", agentId: "desk", host });

    const intruder = connect();
    sendJson(intruder, { type: "update", agentId: "laptop", host });
    expect(intruder.close).toHaveBeenCalledWith(4403, "Hub already bound to another agent");

    intruder.emit("close");
    expect(segments.closeForAgentDisconnect).not.toHaveBeenCalled();
    expect(telemetry.ingestAgentUpdate).toHaveBeenCalledTimes(1);
  });

  it("does not close segments for sockets that never identified", () => {
    const socket = connect();
    socket.emit("close");
    expect(segments.closeForAgentDisconnect).not.toHaveBeenCalled();
  });
});

describe("PanelGateway", () => {
  let gateway: PanelGateway;
  let realtime: RealtimeService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PanelGateway,
        RealtimeService,
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: (cookieHeader?: string) =>
              readSessionCookie(cookieHeader, SESSION_SECRET),
          },
        },
        { provide: TelemetryService, useValue: { getState: () => null } },
      ],
    }).compile();
    gateway = moduleRef.get(PanelGateway);
    realtime = moduleRef.get(RealtimeService);
  });

  it("refuses connections without a valid session cookie", () => {
    const socket = createSocket();
    gateway.handleConnection(socket, requestWith({}));
    expect(socket.close).toHaveBeenCalledWith(4401, "Panel authentication required");
    expect(socket.send).not.toHaveBeenCalled();

    const forged = createSocket();
    gateway.handleConnection(
      forged,
      requestWith({ cookie: `${SESSION_COOKIE_NAME}=forged.token` }),
    );
    expect(forged.close).toHaveBeenCalledWith(4401, "Panel authentication required");
  });

  it("sends the current state on connect and receives broadcasts until disconnect", () => {
    const socket = createSocket();
    const cookie = `${SESSION_COOKIE_NAME}=${createSessionToken(SESSION_SECRET)}`;
    gateway.handleConnection(socket, requestWith({ cookie }));

    expect(socket.close).not.toHaveBeenCalled();
    expect(JSON.parse(String(socket.send.mock.calls[0]?.[0]))).toEqual({ type: "empty" });

    realtime.broadcastPanelHost(host);
    expect(JSON.parse(String(socket.send.mock.calls[1]?.[0]))).toMatchObject({ type: "host" });

    gateway.handleDisconnect(socket);
    realtime.broadcastPanelState(null);
    expect(socket.send).toHaveBeenCalledTimes(2);
  });
});
