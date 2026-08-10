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
import { z } from "zod";
import { AgentBindingService } from "../ingest/agent-binding.service.js";
import { formatPersistenceError, persistenceFailureMessage } from "./persistence-error.js";
import { mapIntervalSummaryRows, parseIntervalSummaryRpcResult } from "./segment.logic.js";
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

    const agentId = parsed.data.agentId ?? this.agentBindingService.getBoundAgentId();
    if (!agentId) {
      return historyResponseSchema.parse({ entries: [] });
    }

    if (!this.supabaseService.isConfigured()) {
      throw new ServiceUnavailableException("History is not available");
    }

    const client = this.supabaseService.getClient();
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

    return historyResponseSchema.parse({ entries });
  }
}
