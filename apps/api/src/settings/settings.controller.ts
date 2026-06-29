import { BadRequestException, Body, Controller, Get, Put } from "@nestjs/common";
import { SETTINGS_ROUTE, type Settings, settingsSchema } from "@pryladova/shared";
import { SettingsService } from "./settings.service.js";

@Controller()
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

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
    return this.settingsService.setSettings(parsed.data);
  }
}
