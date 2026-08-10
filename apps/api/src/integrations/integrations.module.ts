import { forwardRef, Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module.js";
import { GithubService } from "./github.service.js";
import { GoogleAccountService } from "./google-account.service.js";
import { GoogleCalendarService } from "./google-calendar.service.js";
import { GoogleOauthController } from "./google-oauth.controller.js";
import { GoogleTasksService } from "./google-tasks.service.js";
import { GoogleTokenService } from "./google-token.service.js";
import { IntegrationsController } from "./integrations.controller.js";
import { SteamService } from "./steam.service.js";
import { WeatherController } from "./weather.controller.js";
import { WeatherService } from "./weather.service.js";

@Module({
  imports: [forwardRef(() => SettingsModule)],
  controllers: [IntegrationsController, WeatherController, GoogleOauthController],
  providers: [
    GithubService,
    SteamService,
    WeatherService,
    GoogleTokenService,
    GoogleAccountService,
    GoogleCalendarService,
    GoogleTasksService,
  ],
})
export class IntegrationsModule {}
