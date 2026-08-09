import { Module } from "@nestjs/common";
import { GithubService } from "./github.service.js";
import { IntegrationsController } from "./integrations.controller.js";
import { SteamService } from "./steam.service.js";
import { WeatherController } from "./weather.controller.js";
import { WeatherService } from "./weather.service.js";

@Module({
  controllers: [IntegrationsController, WeatherController],
  providers: [GithubService, SteamService, WeatherService],
})
export class IntegrationsModule {}
