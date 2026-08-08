import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  AUTH_LOGIN_ROUTE,
  AUTH_LOGOUT_ROUTE,
  AUTH_SESSION_ROUTE,
  type AuthSessionResponse,
  loginRequestSchema,
  parseAuthSessionResponse,
} from "@pryladova/shared";
import type { Request, Response } from "express";
import { z } from "zod";
import { AuthService } from "./auth.service.js";
import { Public } from "./public.decorator.js";

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post(AUTH_LOGIN_ROUTE)
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() body: unknown, @Res({ passthrough: true }) response: Response): void {
    const parsed = loginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(z.formatError(parsed.error));
    }

    this.authService.login(parsed.data.password, response);
  }

  @Public()
  @Post(AUTH_LOGOUT_ROUTE)
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: Response): void {
    this.authService.logout(response);
  }

  @Public()
  @Get(AUTH_SESSION_ROUTE)
  session(@Req() request: Request): AuthSessionResponse {
    return parseAuthSessionResponse({
      authenticated: this.authService.isAuthenticated(request.headers.cookie),
    });
  }
}
