import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { AgentBindingService } from "../ingest/agent-binding.service.js";
import { HistoryController } from "./history.controller.js";
import { SupabaseService } from "./supabase.service.js";

const createController = async (options: {
  configured?: boolean;
  boundAgentId?: string | null;
  persistedAgentId?: string | null;
  heartbeatError?: { message: string; code?: string };
  rpcResult?: { data: unknown; error: unknown };
}) => {
  const rpc = vi.fn().mockResolvedValue(
    options.rpcResult ?? {
      data: [{ app_name: "Code", duration_sec: 120 }],
      error: null,
    },
  );
  const boundAgentId = options.boundAgentId === undefined ? "desk-pc" : options.boundAgentId;
  const agentBindingService = new AgentBindingService();
  if (boundAgentId) {
    agentBindingService.rememberAgentId(boundAgentId);
  }
  const moduleRef = await Test.createTestingModule({
    controllers: [HistoryController],
    providers: [
      {
        provide: SupabaseService,
        useValue: {
          isConfigured: () => options.configured ?? true,
          getClient: () => ({
            rpc,
            from: (table: string) => {
              if (table !== "agent_heartbeats") {
                throw new Error(`Unexpected table ${table}`);
              }
              return {
                select: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => {
                        if (options.heartbeatError) {
                          return { data: null, error: options.heartbeatError };
                        }
                        return {
                          data: options.persistedAgentId
                            ? { agent_id: options.persistedAgentId }
                            : null,
                          error: null,
                        };
                      },
                    }),
                  }),
                }),
              };
            },
          }),
        },
      },
      {
        provide: AgentBindingService,
        useValue: agentBindingService,
      },
    ],
  }).compile();

  return {
    controller: moduleRef.get(HistoryController),
    rpc,
    agentBindingService,
  };
};

describe("HistoryController", () => {
  it("returns mapped interval summary entries", async () => {
    const { controller, rpc } = await createController({});
    const result = await controller.getHistory({
      from: "2026-08-08T00:00:00.000Z",
      to: "2026-08-08T01:00:00.000Z",
    });

    expect(result.entries).toEqual([{ appName: "Code", durationSec: 120 }]);
    expect(rpc).toHaveBeenCalledWith("get_interval_summary", {
      p_agent_id: "desk-pc",
      p_range_start: "2026-08-08T00:00:00.000Z",
      p_range_end: "2026-08-08T01:00:00.000Z",
    });
  });

  it("prefers explicit agentId over the bound agent", async () => {
    const { controller, rpc } = await createController({ boundAgentId: "desk-pc" });
    await controller.getHistory({
      agentId: "other-pc",
      from: "2026-08-08T00:00:00.000Z",
      to: "2026-08-08T01:00:00.000Z",
    });

    expect(rpc).toHaveBeenCalledWith(
      "get_interval_summary",
      expect.objectContaining({ p_agent_id: "other-pc" }),
    );
  });

  it("rejects invalid query params", async () => {
    const { controller } = await createController({});
    await expect(
      controller.getHistory({
        from: "2026-08-08T02:00:00.000Z",
        to: "2026-08-08T01:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("returns empty entries when no agent is bound or persisted", async () => {
    const { controller, rpc } = await createController({ boundAgentId: null });
    await expect(
      controller.getHistory({
        from: "2026-08-08T00:00:00.000Z",
        to: "2026-08-08T01:00:00.000Z",
      }),
    ).resolves.toEqual({ entries: [] });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("falls back to the latest persisted heartbeat agent when memory is unbound", async () => {
    const { controller, rpc, agentBindingService } = await createController({
      boundAgentId: null,
      persistedAgentId: "desk-pc",
    });

    const result = await controller.getHistory({
      from: "2026-08-08T00:00:00.000Z",
      to: "2026-08-08T01:00:00.000Z",
    });

    expect(result.entries).toEqual([{ appName: "Code", durationSec: 120 }]);
    expect(rpc).toHaveBeenCalledWith(
      "get_interval_summary",
      expect.objectContaining({ p_agent_id: "desk-pc" }),
    );
    expect(agentBindingService.getBoundAgentId()).toBe("desk-pc");
  });

  it("returns 503 when Supabase is not configured", async () => {
    const { controller } = await createController({ configured: false });
    await expect(
      controller.getHistory({
        from: "2026-08-08T00:00:00.000Z",
        to: "2026-08-08T01:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("returns 503 when the RPC fails", async () => {
    const { controller } = await createController({
      rpcResult: { data: null, error: { message: "connection reset", code: "08006" } },
    });
    await expect(
      controller.getHistory({
        from: "2026-08-08T00:00:00.000Z",
        to: "2026-08-08T01:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("returns 503 when persisted agent lookup fails", async () => {
    const { controller } = await createController({
      boundAgentId: null,
      heartbeatError: { message: "connection reset", code: "08006" },
    });
    await expect(
      controller.getHistory({
        from: "2026-08-08T00:00:00.000Z",
        to: "2026-08-08T01:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("returns a schema hint when migrations are missing", async () => {
    const { controller } = await createController({
      rpcResult: {
        data: null,
        error: { message: "Could not find the function", code: "PGRST202" },
      },
    });

    await expect(
      controller.getHistory({
        from: "2026-08-08T00:00:00.000Z",
        to: "2026-08-08T01:00:00.000Z",
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("supabase db push"),
    });
  });
});
