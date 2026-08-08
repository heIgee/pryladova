import { Injectable, UnauthorizedException } from "@nestjs/common";
import { compareSync } from "bcryptjs";
import type { Response } from "express";
import { requirePanelAuth } from "../config.js";
import { ConfigService } from "../config.service.js";
import {
  createSessionToken,
  readSessionCookie,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "./session.js";

@Injectable()
export class AuthService {
  constructor(private readonly configService: ConfigService) {}

  login(password: string, response: Response): void {
    const { panelPasswordHash, sessionSecret } = requirePanelAuth(this.configService.config);
    if (!compareSync(password, panelPasswordHash)) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const token = createSessionToken(sessionSecret);
    const secure = process.env.NODE_ENV === "production";
    response.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions(secure));
  }

  logout(response: Response): void {
    const secure = process.env.NODE_ENV === "production";
    response.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions(secure));
  }

  isAuthenticated(cookieHeader: string | undefined): boolean {
    const { sessionSecret } = requirePanelAuth(this.configService.config);
    return readSessionCookie(cookieHeader, sessionSecret);
  }
}
