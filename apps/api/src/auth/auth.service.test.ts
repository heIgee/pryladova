import { UnauthorizedException } from "@nestjs/common";
import type { CookieOptions, Response } from "express";
import { describe, expect, it } from "vitest";
import { testApiConfig } from "../config.js";
import type { ConfigService } from "../config.service.js";
import { AuthService } from "./auth.service.js";
import { SESSION_COOKIE_NAME } from "./session.js";

const hash = "$2b$10$TtcGsCYSJ53WtzGpi0k7lOXLR3yY2n2jrjAnw0grKQFPV9sCEtQuq";

const configService = {
  config: testApiConfig({
    sessionSecret: "test-session-secret-at-least-32-characters",
    panelPasswordHash: hash,
  }),
} as ConfigService;

const createService = (): AuthService => new AuthService(configService);

describe("AuthService", () => {
  it("sets a session cookie on valid login", () => {
    const service = createService();
    const cookies: Record<string, unknown> = {};
    const response: Pick<Response, "cookie"> = {
      cookie: (name: string, value: string, options?: CookieOptions) => {
        cookies[name] = { value, options };
        return {} as Response;
      },
    };

    service.login("dev", response);

    expect(cookies[SESSION_COOKIE_NAME]).toBeDefined();
  });

  it("rejects invalid passwords", () => {
    const service = createService();
    const response: Pick<Response, "cookie"> = {
      cookie: () => ({}) as Response,
    };
    expect(() => service.login("wrong", response)).toThrow(UnauthorizedException);
  });
});
