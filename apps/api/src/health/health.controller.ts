import { Controller, Get } from "@nestjs/common";
import { HEALTH_ROUTE, type HealthResponse, parseHealthResponse } from "@pryladova/shared";
import { resolveRelease } from "../release.js";

@Controller()
export class HealthController {
  @Get(HEALTH_ROUTE)
  getHealth(): HealthResponse {
    const release = resolveRelease();
    return parseHealthResponse(release ? { ok: true, release } : { ok: true });
  }
}
