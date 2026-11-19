import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { type AgentWsInbound, agentWsInboundSchema } from "@pryladova/shared";

export type RetryQueue = {
  nextSequence: () => number;
  enqueue: (poll: AgentWsInbound) => void;
  pending: () => AgentWsInbound[];
  ack: (sequence: number) => void;
  close: () => void;
};

type SqliteStatement = {
  run: (...params: Array<string | number | bigint | null>) => unknown;
  get: (...params: Array<string | number | bigint | null>) => unknown;
  all: (...params: Array<string | number | bigint | null>) => unknown[];
};

type SqliteDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => SqliteStatement;
  pragma: (source: string) => unknown;
  transaction: <T>(fn: () => T) => () => T;
  close: () => void;
};

const isDatabaseConstructor = (value: unknown): value is new (filename: string) => SqliteDatabase =>
  typeof value === "function";

const loadDatabase = async (): Promise<new (filename: string) => SqliteDatabase> => {
  const imported: unknown = await import("better-sqlite3");
  if (isDatabaseConstructor(imported)) {
    return imported;
  }
  if (typeof imported === "object" && imported !== null && "default" in imported) {
    if (isDatabaseConstructor(imported.default)) {
      return imported.default;
    }
  }
  throw new Error("better-sqlite3 did not export a database constructor");
};

const readMetaValue = (row: unknown): number => {
  if (row === undefined) {
    return 1;
  }
  if (!row || typeof row !== "object" || !("value" in row) || typeof row.value !== "number") {
    throw new Error("retry queue meta row is invalid");
  }
  if (!Number.isSafeInteger(row.value) || row.value < 1) {
    throw new Error("retry queue next sequence is invalid");
  }
  return row.value;
};

const parseQueuedPoll = (row: unknown): AgentWsInbound => {
  if (!row || typeof row !== "object" || !("payload" in row) || typeof row.payload !== "string") {
    throw new Error("retry queue row is invalid");
  }
  const parsed: unknown = JSON.parse(row.payload);
  return agentWsInboundSchema.parse(parsed);
};

/** Unsent polls survive a disconnect. `%LOCALAPPDATA%\\pryladova\\retry-queue.sqlite` on Windows. */
export const defaultRetryQueuePath = (): string => {
  const base = process.env.LOCALAPPDATA?.trim() || join(homedir(), "AppData", "Local");
  return join(base, "pryladova", "retry-queue.sqlite");
};

export const openRetryQueue = async (dbPath: string): Promise<RetryQueue> => {
  mkdirSync(dirname(dbPath), { recursive: true });
  const Database = await loadDatabase();
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    create table if not exists poll_queue (
      sequence integer primary key,
      payload text not null
    );
    create table if not exists queue_meta (
      key text primary key,
      value integer not null
    );
  `);

  const readNext = db.prepare("select value from queue_meta where key = ?");
  const writeNext = db.prepare(
    "insert into queue_meta (key, value) values (?, ?) on conflict(key) do update set value = excluded.value",
  );
  const insertPoll = db.prepare(
    "insert into poll_queue (sequence, payload) values (?, ?) on conflict(sequence) do nothing",
  );
  const listPolls = db.prepare("select sequence, payload from poll_queue order by sequence asc");
  const deletePoll = db.prepare("delete from poll_queue where sequence = ?");
  const allocate = db.transaction(() => {
    const current = readMetaValue(readNext.get("next_sequence"));
    writeNext.run("next_sequence", current + 1);
    return current;
  });

  return {
    nextSequence: () => allocate(),
    enqueue: (poll) => {
      insertPoll.run(poll.sequence, JSON.stringify(poll));
    },
    pending: () => listPolls.all().map((row) => parseQueuedPoll(row)),
    ack: (sequence) => {
      deletePoll.run(sequence);
    },
    close: () => {
      db.close();
    },
  };
};

/** Socket-down and send-failure both keep the poll. A successful send is not stored. */
export const keepUnsentPoll = async (
  queue: RetryQueue,
  socketOpen: boolean,
  poll: AgentWsInbound,
  send: (poll: AgentWsInbound) => Promise<void>,
): Promise<"sent" | "queued"> => {
  if (!socketOpen) {
    queue.enqueue(poll);
    return "queued";
  }

  try {
    await send(poll);
    return "sent";
  } catch (error: unknown) {
    queue.enqueue(poll);
    throw error instanceof Error ? error : new Error("Agent poll send failed", { cause: error });
  }
};

/** Replay in sequence order. A failed send stays queued; earlier polls are already acked. */
export const replayPending = async (
  queue: RetryQueue,
  send: (poll: AgentWsInbound) => Promise<void>,
  onAck?: (poll: AgentWsInbound) => void,
): Promise<void> => {
  const pending = queue.pending();
  for (const poll of pending) {
    // biome-ignore lint/performance/noAwaitInLoops: later sequences must wait for earlier ones
    await send(poll);
    queue.ack(poll.sequence);
    onAck?.(poll);
  }
};
