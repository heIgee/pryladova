import { describe, expect, it } from "vitest";
import { RealtimeService } from "./realtime.service.js";

describe("RealtimeService", () => {
  it("builds empty panel messages", () => {
    const service = new RealtimeService();
    expect(service.buildPanelMessage(null)).toEqual({ type: "empty" });
  });
});
