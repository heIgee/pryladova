import { Controller, Get } from "@nestjs/common";
import { HEALTH_ROUTE, type HealthResponse, parseHealthResponse } from "@pryladova/shared";
import { Public } from "../auth/public.decorator.js";
import { resolveRelease } from "../release.js";

@Controller()
export class HealthController {
  @Public()
  @Get(HEALTH_ROUTE)
  getHealth(): HealthResponse {
    const release = resolveRelease();
    return parseHealthResponse(release ? { ok: true, release } : { ok: true });
  }
}
