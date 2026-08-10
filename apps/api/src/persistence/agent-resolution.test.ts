import { describe, expect, it } from "vitest";
import { readLatestPersistedAgentId } from "./agent-resolution.js";

describe("readLatestPersistedAgentId", () => {
  it("returns the most recently seen agent id", async () => {
    const client = {
      from: () => ({
        select: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: async () => ({
                data: { agent_id: "desk-pc" },
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    await expect(readLatestPersistedAgentId(client as never)).resolves.toBe("desk-pc");
  });

  it("returns null when no heartbeat rows exist", async () => {
    const client = {
      from: () => ({
        select: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }),
    };

    await expect(readLatestPersistedAgentId(client as never)).resolves.toBeNull();
  });
});
