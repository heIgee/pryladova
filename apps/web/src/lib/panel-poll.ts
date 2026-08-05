/// <reference types="vite/client" />

import { fetchTelemetry, type PanelState, POLL_INTERVAL_MS } from "./panel.js";

type PanelPollStore = {
  panel: PanelState;
  listeners: Set<() => void>;
  timer: number | null;
  requestId: number;
};

const createStore = (): PanelPollStore => ({
  panel: { status: "loading" },
  listeners: new Set(),
  timer: null,
  requestId: 0,
});

let moduleStore: PanelPollStore | undefined;

const getStore = (): PanelPollStore => {
  if (import.meta.hot?.data?.panelPollStore) {
    return import.meta.hot.data.panelPollStore as PanelPollStore;
  }

  if (moduleStore === undefined) {
    moduleStore = createStore();
    if (import.meta.hot?.data) {
      import.meta.hot.data.panelPollStore = moduleStore;
    }
  }

  return moduleStore;
};

const notify = (store: PanelPollStore): void => {
  for (const listener of store.listeners) {
    listener();
  }
};

const poll = async (store: PanelPollStore): Promise<void> => {
  const id = ++store.requestId;

  try {
    const next = await fetchTelemetry();
    if (id !== store.requestId) {
      return;
    }
    store.panel = next;
    notify(store);
  } catch (error: unknown) {
    if (id !== store.requestId) {
      return;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    store.panel = { status: "error", message };
    notify(store);
  }
};

const ensureTimer = (store: PanelPollStore): void => {
  if (store.timer !== null) {
    return;
  }

  void poll(store);
  store.timer = window.setInterval(() => {
    void poll(store);
  }, POLL_INTERVAL_MS);
};

export const subscribePanelPoll = (listener: () => void): (() => void) => {
  const store = getStore();
  store.listeners.add(listener);
  ensureTimer(store);

  return () => {
    store.listeners.delete(listener);
  };
};

export const getPanelPollSnapshot = (): PanelState => getStore().panel;

export const refreshPanelPoll = (): void => {
  void poll(getStore());
};
