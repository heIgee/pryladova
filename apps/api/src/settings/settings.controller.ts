import {
  BadRequestException,
  Body,
  Controller,
  forwardRef,
  Get,
  Inject,
  Put,
} from "@nestjs/common";
import {
  parseSettings,
  parseSettingsPutResponse,
  SETTINGS_ROUTE,
  type Settings,
  type SettingsPutResponse,
  settingsSchema,
} from "@pryladova/shared";
import { z } from "zod";
import { TelemetryService } from "../telemetry/telemetry.service.js";
import { SettingsService } from "./settings.service.js";

@Controller()
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    @Inject(forwardRef(() => TelemetryService))
    private readonly telemetryService: TelemetryService,
  ) {}

  @Get(SETTINGS_ROUTE)
  getSettings(): Settings {
    return parseSettings(this.settingsService.getSettings());
  }

  @Put(SETTINGS_ROUTE)
  async setSettings(@Body() body: unknown): Promise<SettingsPutResponse> {
    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(z.formatError(parsed.error));
    }
    const previous = this.settingsService.getSettings();
    const next = await this.settingsService.saveSettings(parsed.data);

    if (!previous.classificationEnabled && next.classificationEnabled) {
      this.telemetryService.reclassifyCurrentWindow();
    }

    return parseSettingsPutResponse(next);
  }
}
