/// <reference types="vite/client" />

import { PANEL_WS_ROUTE, parsePanelWsMessage } from "@pryladova/shared";
import { type PanelState, panelStateFromWsMessage } from "./panel.js";

const RECONNECT_MS = 2_000;

type PanelStreamStore = {
  panel: PanelState;
  listeners: Set<() => void>;
  socket: WebSocket | null;
  reconnectTimer: number | null;
  shouldRun: boolean;
};

const createStore = (): PanelStreamStore => ({
  panel: { status: "loading" },
  listeners: new Set(),
  socket: null,
  reconnectTimer: null,
  shouldRun: false,
});

let moduleStore: PanelStreamStore | undefined;

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

const notify = (store: PanelStreamStore): void => {
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

const scheduleReconnect = (store: PanelStreamStore): void => {
  if (!store.shouldRun || store.reconnectTimer !== null) {
    return;
  }

  store.reconnectTimer = window.setTimeout(() => {
    store.reconnectTimer = null;
    connect(store);
  }, RECONNECT_MS);
};

const connect = (store: PanelStreamStore): void => {
  if (!store.shouldRun) {
    return;
  }

  store.socket?.close();
  const socket = new WebSocket(buildPanelWsUrl());
  store.socket = socket;

  socket.onopen = () => {
    clearReconnect(store);
  };

  socket.onmessage = (event: MessageEvent<string>) => {
    try {
      const message = parsePanelWsMessage(JSON.parse(event.data));
      store.panel = panelStateFromWsMessage(message);
      notify(store);
    } catch {
      store.panel = { status: "error", message: "Invalid telemetry response" };
      notify(store);
    }
  };

  socket.onclose = () => {
    if (!store.shouldRun) {
      return;
    }

    if (store.panel.status !== "error") {
      store.panel = { status: "error", message: "Live connection closed" };
      notify(store);
    }

    scheduleReconnect(store);
  };

  socket.onerror = () => {
    socket.close();
  };
};

const start = (store: PanelStreamStore): void => {
  if (store.shouldRun) {
    return;
  }

  store.shouldRun = true;
  store.panel = { status: "loading" };
  notify(store);
  connect(store);
};

const stop = (store: PanelStreamStore): void => {
  store.shouldRun = false;
  clearReconnect(store);
  store.socket?.close();
  store.socket = null;
};

export const subscribePanelPoll = (listener: () => void): (() => void) => {
  const store = getStore();
  store.listeners.add(listener);
  start(store);

  return () => {
    store.listeners.delete(listener);
    if (store.listeners.size === 0) {
      stop(store);
    }
  };
};

export const getPanelPollSnapshot = (): PanelState => getStore().panel;

export const refreshPanelPoll = (): void => {
  const store = getStore();
  if (!store.shouldRun) {
    return;
  }

  connect(store);
};
