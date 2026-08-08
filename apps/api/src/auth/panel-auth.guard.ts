import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { requirePanelAuth } from "../config.js";
import { ConfigService } from "../config.service.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";
import { readSessionCookie } from "./session.js";

@Injectable()
export class PanelAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    if (context.getType() !== "http") {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const { sessionSecret } = requirePanelAuth(this.configService.config);
    const authenticated = readSessionCookie(request.headers.cookie, sessionSecret);
    if (!authenticated) {
      throw new UnauthorizedException("Panel authentication required");
    }

    return true;
  }
}
