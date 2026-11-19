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
  let ingress: AgentIngressService;
  let telemetry: { ingestAgentUpdate: ReturnType<typeof vi.fn> };
  let segments: ReturnType<typeof createSegmentServiceMock>;

  beforeEach(async () => {
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
    telemetry = { ingestAgentUpdate: vi.fn().mockResolvedValue(undefined) };
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
    ingress = moduleRef.get(AgentIngressService);
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

    sendJson(socket, { type: "update", agentId: "desk", host, telemetry: window, sequence: 1 });

    expect(telemetry.ingestAgentUpdate).toHaveBeenCalledWith("desk", host, window, 1);
    expect(socket.close).not.toHaveBeenCalled();
  });

  it("forwards focus changes in sequence order and ignores a duplicate sequence", () => {
    const socket = connect();
    const chrome = { appName: "Chrome", windowTitle: "inbox", capturedAt: host.capturedAt };
    const code = {
      appName: "Code",
      windowTitle: "main.ts",
      capturedAt: "2026-08-08T10:00:02.000Z",
    };

    sendJson(socket, { type: "update", agentId: "desk", host, telemetry: chrome, sequence: 1 });
    sendJson(socket, { type: "update", agentId: "desk", host, telemetry: chrome, sequence: 1 });
    sendJson(socket, {
      type: "update",
      agentId: "desk",
      host: { ...host, capturedAt: code.capturedAt },
      telemetry: code,
      sequence: 2,
    });

    expect(telemetry.ingestAgentUpdate).toHaveBeenCalledTimes(2);
    expect(telemetry.ingestAgentUpdate).toHaveBeenNthCalledWith(1, "desk", host, chrome, 1);
    expect(telemetry.ingestAgentUpdate).toHaveBeenNthCalledWith(
      2,
      "desk",
      { ...host, capturedAt: code.capturedAt },
      code,
      2,
    );
  });

  it("closes the segment on shutdown, session lock, and disconnect", () => {
    const socket = connect();
    sendJson(socket, {
      type: "shutdown",
      agentId: "desk",
      capturedAt: host.capturedAt,
      sequence: 1,
    });
    expect(segments.closeForShutdown).toHaveBeenCalledWith("desk", host.capturedAt, 1);

    sendJson(socket, {
      type: "session_lock",
      agentId: "desk",
      capturedAt: host.capturedAt,
      sequence: 2,
    });
    expect(segments.closeForSessionLock).toHaveBeenCalledWith("desk", host.capturedAt, 2);

    socket.emit("close");
    expect(segments.closeForAgentDisconnect).toHaveBeenCalledWith("desk");
  });

  it("forwards a failed sequence again after a later sequence was accepted", async () => {
    vi.mocked(segments.closeForSessionLock).mockRejectedValueOnce(new Error("db down"));
    const lock = {
      type: "session_lock" as const,
      agentId: "desk",
      capturedAt: host.capturedAt,
      sequence: 1,
    };

    expect(ingress.acceptMessage(lock)).toBe("ok");
    expect(
      ingress.acceptMessage({
        type: "shutdown",
        agentId: "desk",
        capturedAt: host.capturedAt,
        sequence: 2,
      }),
    ).toBe("ok");
    await Promise.resolve();

    vi.mocked(segments.closeForSessionLock).mockResolvedValue(undefined);
    expect(ingress.acceptMessage(lock)).toBe("ok");
    expect(segments.closeForSessionLock).toHaveBeenCalledTimes(2);
  });

  it("ignores a duplicate session lock", () => {
    const socket = connect();
    const lock = {
      type: "session_lock",
      agentId: "desk",
      capturedAt: host.capturedAt,
      sequence: 4,
    };
    sendJson(socket, lock);
    sendJson(socket, lock);
    expect(segments.closeForSessionLock).toHaveBeenCalledTimes(1);
    expect(segments.closeForSessionLock).toHaveBeenCalledWith("desk", host.capturedAt, 4);
    expect(socket.close).not.toHaveBeenCalled();
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
    sendJson(first, { type: "update", agentId: "desk", host, sequence: 1 });

    const intruder = connect();
    sendJson(intruder, { type: "update", agentId: "laptop", host, sequence: 1 });
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
