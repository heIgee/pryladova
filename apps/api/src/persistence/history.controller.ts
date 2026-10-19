import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Query,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  HISTORY_ROUTE,
  type HistoryResponse,
  historyQuerySchema,
  historyResponseSchema,
} from "@pryladova/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AgentBindingService } from "../ingest/agent-binding.service.js";
import { readLatestPersistedAgentId } from "./agent-resolution.js";
import { formatPersistenceError, persistenceFailureMessage } from "./persistence-error.js";
import {
  buildHistorySpans,
  mapIntervalSummaryRows,
  parseHistorySpanHeartbeat,
  parseHistorySpanSources,
  parseIntervalSummaryRpcResult,
} from "./segment.logic.js";
import { SupabaseService } from "./supabase.service.js";

@Controller()
export class HistoryController {
  private readonly logger = new Logger(HistoryController.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly agentBindingService: AgentBindingService,
  ) {}

  @Get(HISTORY_ROUTE)
  async getHistory(@Query() query: Record<string, unknown>): Promise<HistoryResponse> {
    const parsed = historyQuerySchema.safeParse({
      agentId: query.agentId,
      from: query.from,
      to: query.to,
    });

    if (!parsed.success) {
      throw new BadRequestException(z.formatError(parsed.error));
    }

    if (!this.supabaseService.isConfigured()) {
      throw new ServiceUnavailableException("History is not available");
    }

    const client = this.supabaseService.getClient();
    const agentId = await this.resolveHistoryAgentId(client, parsed.data.agentId);
    if (!agentId) {
      return historyResponseSchema.parse({ entries: [] });
    }
    const { data, error } = await client.rpc("get_interval_summary", {
      p_agent_id: agentId,
      p_range_start: parsed.data.from,
      p_range_end: parsed.data.to,
    });

    if (error) {
      const detail = formatPersistenceError(error);
      this.logger.warn(`[persistence] get_interval_summary failed: ${detail}`);
      throw new ServiceUnavailableException(
        persistenceFailureMessage(detail, "History query failed"),
      );
    }

    const entries = mapIntervalSummaryRows(parseIntervalSummaryRpcResult(data));
    const spans = await this.loadHistorySpans(client, agentId, parsed.data.from, parsed.data.to);

    return historyResponseSchema.parse({ entries, spans });
  }

  private async loadHistorySpans(
    client: SupabaseClient,
    agentId: string,
    from: string,
    to: string,
  ) {
    const [segmentsResult, heartbeatResult] = await Promise.all([
      client
        .from("window_segments")
        .select("app_name, started_at, ended_at")
        .eq("agent_id", agentId)
        .lt("started_at", to)
        .or(`ended_at.gt."${from}",ended_at.is.null`)
        .order("started_at", { ascending: true }),
      client
        .from("agent_heartbeats")
        .select("last_active_at, last_seen_at")
        .eq("agent_id", agentId)
        .maybeSingle(),
    ]);

    if (segmentsResult.error) {
      const detail = formatPersistenceError(segmentsResult.error);
      this.logger.warn(`[persistence] history spans failed: ${detail}`);
      throw new ServiceUnavailableException(
        persistenceFailureMessage(detail, "History query failed"),
      );
    }
    if (heartbeatResult.error) {
      const detail = formatPersistenceError(heartbeatResult.error);
      this.logger.warn(`[persistence] history span heartbeat failed: ${detail}`);
      throw new ServiceUnavailableException(
        persistenceFailureMessage(detail, "History query failed"),
      );
    }

    return buildHistorySpans(
      parseHistorySpanSources(segmentsResult.data),
      parseHistorySpanHeartbeat(heartbeatResult.data),
      { start: from, end: to },
    );
  }

  private async resolveHistoryAgentId(
    client: SupabaseClient,
    explicitAgentId?: string,
  ): Promise<string | null> {
    if (explicitAgentId) {
      return explicitAgentId;
    }

    const boundAgentId = this.agentBindingService.getBoundAgentId();
    if (boundAgentId) {
      return boundAgentId;
    }

    try {
      const persistedAgentId = await readLatestPersistedAgentId(client);
      if (persistedAgentId) {
        this.agentBindingService.rememberAgentId(persistedAgentId);
      }
      return persistedAgentId;
    } catch (error: unknown) {
      const detail = formatPersistenceError(error);
      this.logger.warn(`[persistence] agent_heartbeats lookup failed: ${detail}`);
      throw new ServiceUnavailableException(
        persistenceFailureMessage(detail, "History agent lookup failed"),
      );
    }
  }
}
