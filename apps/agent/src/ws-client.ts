import {
  AGENT_WS_ROUTE,
  type AgentWsInbound,
  type HostPayload,
  type TelemetryPayload,
} from "@pryladova/shared";
import WebSocket from "ws";
import { agentLog } from "./logger.js";

const WS_CONNECT_TIMEOUT_MS = 30_000;
const HUB_BOUND_CLOSE_CODE = 4403;

const toWsUrl = (httpOrigin: string, path: string): string => {
  const url = new URL(httpOrigin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = path;
  url.search = "";
  url.hash = "";
  return url.toString();
};

type AgentWsClient = {
  isOpen: () => boolean;
  sendUpdate: (host: HostPayload, sequence: number, telemetry?: TelemetryPayload) => Promise<void>;
  sendShutdown: (capturedAt: string, sequence: number) => Promise<void>;
  sendSessionLock: (capturedAt: string, sequence: number) => Promise<void>;
  close: () => void;
};

export type AgentWsConnectResult = {
  client: AgentWsClient;
  hubBoundReject: Promise<never>;
};

export const connectAgentWs = (
  apiUrl: string,
  ingestSecret: string | undefined,
  agentId: string,
  onDisconnect?: () => void,
): Promise<AgentWsConnectResult> =>
  new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (ingestSecret) {
      headers.Authorization = `Bearer ${ingestSecret}`;
    }

    const socket = new WebSocket(toWsUrl(apiUrl, AGENT_WS_ROUTE), { headers });
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("Agent WebSocket connect timed out"));
    }, WS_CONNECT_TIMEOUT_MS);

    let rejectHubBound: ((reason?: unknown) => void) | undefined;
    const hubBoundPromise = new Promise<never>((_, reject) => {
      rejectHubBound = reject;
    });
    let opened = false;

    socket.on("close", (code, reason) => {
      if (code === HUB_BOUND_CLOSE_CODE) {
        const detail = reason.toString() || "Hub already bound to another agent";
        agentLog.error(`ws closed (${code}): ${detail}`);
        rejectHubBound?.(new Error(detail));
        return;
      }

      if (opened && code !== 1000) {
        onDisconnect?.();
      }
    });

    socket.once("open", () => {
      opened = true;
      clearTimeout(timeout);
      const sendMessage = (message: AgentWsInbound): Promise<void> =>
        new Promise((resolveSend, rejectSend) => {
          if (socket.readyState !== WebSocket.OPEN) {
            rejectSend(new Error("Agent WebSocket is not open"));
            return;
          }
          socket.send(JSON.stringify(message), (error) => {
            if (error) {
              rejectSend(error);
              return;
            }
            resolveSend();
          });
        });

      resolve({
        client: {
          isOpen: () => socket.readyState === WebSocket.OPEN,
          sendUpdate: (host, sequence, telemetry) =>
            sendMessage({
              type: "update",
              agentId,
              host,
              sequence,
              ...(telemetry ? { telemetry } : {}),
            }),
          sendShutdown: (capturedAt, sequence) =>
            sendMessage({ type: "shutdown", agentId, capturedAt, sequence }),
          sendSessionLock: (capturedAt, sequence) =>
            sendMessage({ type: "session_lock", agentId, capturedAt, sequence }),
          close: () => {
            socket.close();
          },
        },
        hubBoundReject: hubBoundPromise,
      });
    });

    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
