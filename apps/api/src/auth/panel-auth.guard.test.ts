import { type ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import { PanelAuthGuard } from "./panel-auth.guard.js";
import { createSessionToken } from "./session.js";

const secret = "test-session-secret-at-least-32-characters";

const hash = "$2b$10$TtcGsCYSJ53WtzGpi0k7lOXLR3yY2n2jrjAnw0grKQFPV9sCEtQuq";

const createContext = (cookieHeader?: string): ExecutionContext =>
  ({
    getType: () => "http",
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { cookie: cookieHeader },
      }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  }) as ExecutionContext;

describe("PanelAuthGuard", () => {
  const guard = new PanelAuthGuard(new Reflector(), {
    config: { sessionSecret: secret, panelPasswordHash: hash },
  } as never);

  it("allows public routes", () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(true);
    const publicGuard = new PanelAuthGuard(reflector, {
      config: { sessionSecret: secret, panelPasswordHash: hash },
    } as never);

    expect(publicGuard.canActivate(createContext())).toBe(true);
  });

  it("rejects requests without a session cookie", () => {
    expect(() => guard.canActivate(createContext())).toThrow(UnauthorizedException);
  });

  it("accepts a valid session cookie", () => {
    const token = createSessionToken(secret);
    const cookieHeader = `pryladova_session=${encodeURIComponent(token)}`;
    expect(guard.canActivate(createContext(cookieHeader))).toBe(true);
  });
});
