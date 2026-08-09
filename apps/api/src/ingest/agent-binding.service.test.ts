import { describe, expect, it } from "vitest";
import { AgentBindingService } from "./agent-binding.service.js";

describe("AgentBindingService", () => {
  it("binds the first agent and accepts the same id", () => {
    const service = new AgentBindingService();
    expect(service.assertAgent("desk-a")).toBe("ok");
    expect(service.assertAgent("desk-a")).toBe("ok");
    expect(service.getBoundAgentId()).toBe("desk-a");
  });

  it("rejects a different agent after binding", () => {
    const service = new AgentBindingService();
    expect(service.assertAgent("desk-a")).toBe("ok");
    expect(service.assertAgent("desk-b")).toBe("rejected");
  });
});
