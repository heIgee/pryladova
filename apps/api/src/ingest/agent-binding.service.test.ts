import { describe, expect, it } from "vitest";
import { testApiConfig } from "../config.js";
import type { ConfigService } from "../config.service.js";
import { AgentBindingService } from "./agent-binding.service.js";

const createService = (): AgentBindingService =>
  new AgentBindingService({ config: testApiConfig() } as ConfigService);

describe("AgentBindingService", () => {
  it("binds the first agent and accepts the same id", () => {
    const service = createService();
    expect(service.assertAgent("desk-a")).toBe("ok");
    expect(service.assertAgent("desk-a")).toBe("ok");
    expect(service.getBoundAgentId()).toBe("desk-a");
  });

  it("rejects a different agent after binding", () => {
    const service = createService();
    expect(service.assertAgent("desk-a")).toBe("ok");
    expect(service.assertAgent("desk-b")).toBe("rejected");
  });

  it("remembers an agent id without ingest", () => {
    const service = createService();
    service.rememberAgentId("desk-a");
    expect(service.getBoundAgentId()).toBe("desk-a");
    service.rememberAgentId("desk-b");
    expect(service.getBoundAgentId()).toBe("desk-a");
  });
});
