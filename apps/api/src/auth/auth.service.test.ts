import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { AuthService } from "./auth.service.js";

const hash = "$2b$10$TtcGsCYSJ53WtzGpi0k7lOXLR3yY2n2jrjAnw0grKQFPV9sCEtQuq";

const createService = (): AuthService =>
  new AuthService({
    config: {
      sessionSecret: "test-session-secret-at-least-32-characters",
      panelPasswordHash: hash,
    },
  } as never);

describe("AuthService", () => {
  it("sets a session cookie on valid login", () => {
    const service = createService();
    const cookies: Record<string, unknown> = {};
    const response = {
      cookie: (name: string, value: string, options: unknown) => {
        cookies[name] = { value, options };
      },
    };

    service.login("dev", response as never);

    expect(cookies.pryladova_session).toBeDefined();
  });

  it("rejects invalid passwords", () => {
    const service = createService();
    expect(() => service.login("wrong", { cookie: () => undefined } as never)).toThrow(
      UnauthorizedException,
    );
  });
});
