import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { HISTORY_ROUTE, type HistoryResponse, historyQuerySchema } from "@pryladova/shared";
import { z } from "zod";
import { HistoryService } from "./history.service.js";

@Controller()
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

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

    return this.historyService.getHistory(parsed.data);
  }
}
