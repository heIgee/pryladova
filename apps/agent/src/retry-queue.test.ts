import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentWsInbound } from "@pryladova/shared";
import { afterEach, describe, expect, it } from "vitest";
import {
  defaultRetryQueuePath,
  keepUnsentPoll,
  openRetryQueue,
  type RetryQueue,
  replayPending,
} from "./retry-queue.js";

const sqliteLoadError = await import("better-sqlite3").then(
  () => null,
  (error: unknown) => error,
);

const sqliteMissing =
  sqliteLoadError instanceof Error &&
  (("code" in sqliteLoadError && sqliteLoadError.code === "ERR_MODULE_NOT_FOUND") ||
    sqliteLoadError.message.includes("Cannot find package 'better-sqlite3'"));

if (sqliteLoadError && !sqliteMissing) {
  throw sqliteLoadError;
}

const host = {
  idleMs: 0,
  cpuPercent: 1,
  ramPercent: 2,
  uptimeSec: 3,
  media: null,
  capturedAt: "2026-01-01T12:00:00.000Z",
};

const update = (sequence: number, appName: string, capturedAt: string): AgentWsInbound => ({
  type: "update",
  agentId: "desk-pc",
  sequence,
  host: { ...host, capturedAt },
  telemetry: {
    appName,
    windowTitle: "title",
    capturedAt,
  },
});

describe("defaultRetryQueuePath", () => {
  const previous = process.env.LOCALAPPDATA;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.LOCALAPPDATA;
      return;
    }
    process.env.LOCALAPPDATA = previous;
  });

  it("stores the queue under LOCALAPPDATA", () => {
    process.env.LOCALAPPDATA = join("C:", "Users", "me", "AppData", "Local");
    expect(defaultRetryQueuePath()).toBe(
      join(process.env.LOCALAPPDATA, "pryladova", "retry-queue.sqlite"),
    );
  });
});

describe.skipIf(sqliteMissing)("retry queue", () => {
  const directories: string[] = [];
  const queues: RetryQueue[] = [];

  afterEach(() => {
    for (const queue of queues) {
      queue.close();
    }
    queues.length = 0;
    for (const directory of directories) {
      rmSync(directory, { recursive: true, force: true });
    }
    directories.length = 0;
  });

  const openTemp = async (): Promise<RetryQueue> => {
    const directory = mkdtempSync(join(tmpdir(), "pryladova-queue-"));
    directories.push(directory);
    const queue = await openRetryQueue(join(directory, "retry-queue.sqlite"));
    queues.push(queue);
    return queue;
  };

  it("keeps a failed send and replays two focus changes in sequence order", async () => {
    const queue = await openTemp();
    const first = update(queue.nextSequence(), "Chrome", "2026-01-01T12:00:00.000Z");
    const second = update(queue.nextSequence(), "Code", "2026-01-01T12:00:02.000Z");
    const sent: AgentWsInbound[] = [];
    const send = async (poll: AgentWsInbound): Promise<void> => {
      sent.push(poll);
    };

    await expect(keepUnsentPoll(queue, false, first, send)).resolves.toBe("queued");
    await expect(
      keepUnsentPoll(queue, true, second, async () => {
        throw new Error("socket reset");
      }),
    ).rejects.toThrow("socket reset");
    expect(sent).toEqual([]);
    expect(queue.pending()).toEqual([first, second]);

    await replayPending(queue, send);
    expect(sent).toEqual([first, second]);
    expect(queue.pending()).toEqual([]);
  });

  it("keeps the first poll when the same sequence is enqueued twice", async () => {
    const queue = await openTemp();
    const poll = update(queue.nextSequence(), "Chrome", "2026-01-01T12:00:00.000Z");
    queue.enqueue(poll);
    queue.enqueue(poll);
    expect(queue.pending()).toEqual([poll]);
  });

  it("does not replay an acked sequence", async () => {
    const queue = await openTemp();
    const poll = update(queue.nextSequence(), "Chrome", "2026-01-01T12:00:00.000Z");
    queue.enqueue(poll);
    const sent: number[] = [];
    await replayPending(queue, async (item) => {
      sent.push(item.sequence);
    });
    await replayPending(queue, async (item) => {
      sent.push(item.sequence);
    });
    expect(sent).toEqual([poll.sequence]);
  });

  it("leaves the failed poll queued when a later replay send fails", async () => {
    const queue = await openTemp();
    const first = update(queue.nextSequence(), "Chrome", "2026-01-01T12:00:00.000Z");
    const second = update(queue.nextSequence(), "Code", "2026-01-01T12:00:02.000Z");
    queue.enqueue(first);
    queue.enqueue(second);

    await expect(
      replayPending(queue, async (poll) => {
        if (poll.sequence === second.sequence) {
          throw new Error("still down");
        }
      }),
    ).rejects.toThrow("still down");

    expect(queue.pending()).toEqual([second]);
  });

  it("continues sequence numbers after the file is reopened", async () => {
    const directory = mkdtempSync(join(tmpdir(), "pryladova-queue-"));
    directories.push(directory);
    const path = join(directory, "retry-queue.sqlite");
    const first = await openRetryQueue(path);
    queues.push(first);
    const sequence = first.nextSequence();
    first.enqueue(update(sequence, "Chrome", "2026-01-01T12:00:00.000Z"));
    first.close();
    queues.length = 0;

    const reopened = await openRetryQueue(path);
    queues.push(reopened);
    expect(reopened.pending().map((poll) => poll.sequence)).toEqual([sequence]);
    expect(reopened.nextSequence()).toBe(sequence + 1);
  });
});
