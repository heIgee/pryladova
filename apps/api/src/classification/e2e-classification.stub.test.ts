import { afterEach, describe, expect, it, vi } from "vitest";
import { e2eClassificationStub, readE2eClassificationEnabled } from "./e2e-classification.stub.js";

describe("e2eClassificationStub", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads classification enabled flag in test env", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_CLASSIFICATION_ENABLED", "1");
    expect(readE2eClassificationEnabled()).toBe(true);
  });

  it("maps deadlock.exe to Deadlock gaming classification", () => {
    expect(e2eClassificationStub("deadlock.exe", "Deadlock")).toEqual({
      category: "Gaming",
      displayAppName: "Deadlock",
      workRelated: "no",
    });
  });
});
