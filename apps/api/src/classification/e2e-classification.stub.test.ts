import { afterEach, describe, expect, it, vi } from "vitest";
import {
  e2eClassificationStub,
  readE2eClassificationDelayMs,
  readE2eClassificationEnabled,
} from "./e2e-classification.stub.js";

describe("e2eClassificationStub", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads delay only in test env", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_CLASSIFICATION_DELAY_MS", "100");
    expect(readE2eClassificationDelayMs()).toBeNull();
  });

  it("parses delay in test env", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_CLASSIFICATION_DELAY_MS", "250");
    expect(readE2eClassificationDelayMs()).toBe(250);
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
