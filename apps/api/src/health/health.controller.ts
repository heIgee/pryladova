import { Controller, Get } from "@nestjs/common";
import { HEALTH_ROUTE } from "@pryladova/shared";

@Controller()
export class HealthController {
  @Get(HEALTH_ROUTE)
  getHealth(): { ok: true } {
    return { ok: true };
  }
}
