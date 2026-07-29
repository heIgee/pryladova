import {
  BadRequestException,
  Body,
  Controller,
  forwardRef,
  Get,
  Inject,
  Put,
} from "@nestjs/common";
import { SETTINGS_ROUTE, type Settings, settingsSchema } from "@pryladova/shared";
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
    return this.settingsService.getSettings();
  }

  @Put(SETTINGS_ROUTE)
  setSettings(@Body() body: unknown): Settings {
    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }
    const previous = this.settingsService.getSettings();
    const next = this.settingsService.setSettings(parsed.data);

    if (!previous.classificationEnabled && next.classificationEnabled) {
      this.telemetryService.reclassifyCurrentWindow();
    }

    return next;
  }
}
