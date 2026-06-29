import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Post,
} from "@nestjs/common";
import { parseTelemetryPayload, TELEMETRY_ROUTE, type TelemetryState } from "@pryladova/shared";
import { TelemetryService } from "./telemetry.service.js";

@Controller()
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Post(TELEMETRY_ROUTE)
  @HttpCode(204)
  ingest(@Body() body: unknown): void {
    const parsed = parseTelemetryPayload(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.issues);
    }
    this.telemetryService.setState(parsed.data);
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
