/// <reference types="vite/client" />

import { PANEL_WS_ROUTE, parsePanelWsMessage } from "@pryladova/shared";
import { applyPanelWsMessage, type PanelState } from "./panel.js";

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 8_000;
const STOP_GRACE_MS = 500;

export type PanelPollSnapshot = {
  panel: PanelState;
  streamConnected: boolean;
};

type PanelStreamStore = {
  panel: PanelState;
  streamConnected: boolean;
  snapshot: PanelPollSnapshot;
  listeners: Set<() => void>;
  socket: WebSocket | null;
  reconnectTimer: number | null;
  reconnectDelayMs: number;
  shouldRun: boolean;
  connectGeneration: number;
};

const createStore = (): PanelStreamStore => {
  const panel: PanelState = { status: "loading" };
  return {
    panel,
    streamConnected: false,
    snapshot: { panel, streamConnected: false },
    listeners: new Set(),
    socket: null,
    reconnectTimer: null,
    reconnectDelayMs: RECONNECT_BASE_MS,
    shouldRun: false,
    connectGeneration: 0,
  };
};

let moduleStore: PanelStreamStore | undefined;
let stopTimer: number | null = null;

const getStore = (): PanelStreamStore => {
  if (import.meta.hot?.data?.panelStreamStore) {
    return import.meta.hot.data.panelStreamStore as PanelStreamStore;
  }

  if (moduleStore === undefined) {
    moduleStore = createStore();
    if (import.meta.hot?.data) {
      import.meta.hot.data.panelStreamStore = moduleStore;
    }
  }

  return moduleStore;
};

const buildPanelWsUrl = (): string => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${PANEL_WS_ROUTE}`;
};

const refreshSnapshot = (store: PanelStreamStore): void => {
  store.snapshot = { panel: store.panel, streamConnected: store.streamConnected };
};

const notify = (store: PanelStreamStore): void => {
  refreshSnapshot(store);
  for (const listener of store.listeners) {
    listener();
  }
};

const clearReconnect = (store: PanelStreamStore): void => {
  if (store.reconnectTimer !== null) {
    window.clearTimeout(store.reconnectTimer);
    store.reconnectTimer = null;
  }
};

const abandonSocket = (socket: WebSocket | null): void => {
  if (
    !socket ||
    socket.readyState === WebSocket.CLOSED ||
    socket.readyState === WebSocket.CLOSING
  ) {
    return;
  }

  if (socket.readyState === WebSocket.CONNECTING) {
    const pending = socket;
    pending.onopen = () => {
      pending.close(1000, "client closing");
    };
    pending.onmessage = null;
    pending.onclose = null;
    pending.onerror = null;
    return;
  }

  socket.close(1000, "client closing");
};

const scheduleReconnect = (store: PanelStreamStore): void => {
  if (!store.shouldRun || store.reconnectTimer !== null) {
    return;
  }

  store.reconnectTimer = window.setTimeout(() => {
    store.reconnectTimer = null;
    connect(store);
    store.reconnectDelayMs = Math.min(store.reconnectDelayMs * 2, RECONNECT_MAX_MS);
  }, store.reconnectDelayMs);
};

const connect = (store: PanelStreamStore): void => {
  if (!store.shouldRun) {
    return;
  }

  if (store.socket?.readyState === WebSocket.OPEN) {
    return;
  }

  const generation = ++store.connectGeneration;
  abandonSocket(store.socket);
  const socket = new WebSocket(buildPanelWsUrl());
  store.socket = socket;

  socket.onopen = () => {
    if (generation !== store.connectGeneration) {
      return;
    }
    clearReconnect(store);
    store.reconnectDelayMs = RECONNECT_BASE_MS;
    store.streamConnected = true;
    notify(store);
  };

  socket.onmessage = (event: MessageEvent<string>) => {
    if (generation !== store.connectGeneration) {
      return;
    }

    try {
      const message = parsePanelWsMessage(JSON.parse(event.data));
      store.panel = applyPanelWsMessage(store.panel, message);
      notify(store);
    } catch {
      store.panel = { status: "error", message: "Invalid telemetry response" };
      notify(store);
    }
  };

  socket.onclose = () => {
    if (generation !== store.connectGeneration || !store.shouldRun) {
      return;
    }

    store.streamConnected = false;
    notify(store);
    scheduleReconnect(store);
  };

  socket.onerror = () => {
    // onclose follows; reconnect is scheduled there.
  };
};

const cancelPendingStop = (): void => {
  if (stopTimer !== null) {
    window.clearTimeout(stopTimer);
    stopTimer = null;
  }
};

const scheduleStop = (store: PanelStreamStore): void => {
  cancelPendingStop();
  stopTimer = window.setTimeout(() => {
    stopTimer = null;
    if (store.listeners.size === 0) {
      stop(store);
    }
  }, STOP_GRACE_MS);
};

const start = (store: PanelStreamStore): void => {
  if (store.shouldRun) {
    return;
  }

  store.shouldRun = true;
  connect(store);
};

const stop = (store: PanelStreamStore): void => {
  store.shouldRun = false;
  store.connectGeneration += 1;
  store.reconnectDelayMs = RECONNECT_BASE_MS;
  store.streamConnected = false;
  clearReconnect(store);
  abandonSocket(store.socket);
  store.socket = null;
};

export const subscribePanelPoll = (listener: () => void): (() => void) => {
  const store = getStore();
  cancelPendingStop();
  store.listeners.add(listener);
  start(store);

  return () => {
    store.listeners.delete(listener);
    if (store.listeners.size === 0) {
      scheduleStop(store);
    }
  };
};

export const getPanelPollSnapshot = (): PanelPollSnapshot => getStore().snapshot;

export const refreshPanelPoll = (): void => {
  const store = getStore();
  if (!store.shouldRun) {
    return;
  }

  store.connectGeneration += 1;
  clearReconnect(store);
  abandonSocket(store.socket);
  store.socket = null;
  connect(store);
};

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    refreshPanelPoll();
  });
}
