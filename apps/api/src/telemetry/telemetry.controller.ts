import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  HOST_ROUTE,
  parseHostPayload,
  parseTelemetryPayload,
  TELEMETRY_ROUTE,
  type TelemetryState,
} from "@pryladova/shared";
import { IngestAuthGuard } from "../auth/ingest-auth.guard.js";
import { TelemetryService } from "./telemetry.service.js";

@Controller()
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Post(TELEMETRY_ROUTE)
  @HttpCode(204)
  @UseGuards(IngestAuthGuard)
  ingest(@Body() body: unknown): void {
    const parsed = parseTelemetryPayload(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.issues);
    }
    this.telemetryService.setState(parsed.data);
  }

  @Post(HOST_ROUTE)
  @HttpCode(204)
  @UseGuards(IngestAuthGuard)
  ingestHost(@Body() body: unknown): void {
    const parsed = parseHostPayload(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.issues);
    }
    this.telemetryService.setHost(parsed.data);
  }

  @Get(TELEMETRY_ROUTE)
  getState(): TelemetryState {
    const state = this.telemetryService.getState();
    if (!state) {
      throw new NotFoundException("No telemetry received yet");
    }
    return state;
  }
}
