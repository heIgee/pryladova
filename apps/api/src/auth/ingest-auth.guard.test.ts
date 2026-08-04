import { type ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { ConfigService } from "../config.service.js";
import { IngestAuthGuard } from "./ingest-auth.guard.js";

const createContext = (authorization?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { authorization },
      }),
    }),
  }) as ExecutionContext;

const createGuard = (ingestSecret: string | undefined): IngestAuthGuard =>
  new IngestAuthGuard({
    config: { geminiApiKey: undefined, geminiModel: "gemini-3.1-flash-lite", ingestSecret },
  } as ConfigService);

describe("IngestAuthGuard", () => {
  it("allows requests when ingest secret is unset", () => {
    const guard = createGuard(undefined);
    expect(guard.canActivate(createContext())).toBe(true);
  });

  it("allows valid bearer token", () => {
    const guard = createGuard("test-secret");
    expect(guard.canActivate(createContext("Bearer test-secret"))).toBe(true);
  });

  it("rejects missing bearer token when secret is set", () => {
    const guard = createGuard("test-secret");
    expect(() => guard.canActivate(createContext())).toThrow(UnauthorizedException);
  });

  it("rejects wrong bearer token", () => {
    const guard = createGuard("test-secret");
    expect(() => guard.canActivate(createContext("Bearer wrong"))).toThrow(UnauthorizedException);
  });

  it("compares secrets without throwing on length mismatch", () => {
    const guard = createGuard("short");
    expect(() => guard.canActivate(createContext("Bearer much-longer-token-value"))).toThrow(
      UnauthorizedException,
    );
  });
});
