import { afterEach, describe, expect, it, vi } from "vitest";
import {
  releaseE2eClassificationGate,
  resetE2eClassificationGate,
  waitForE2eClassificationRelease,
} from "./e2e-classification.gate.js";

describe("e2eClassificationGate", () => {
  afterEach(() => {
    resetE2eClassificationGate();
    vi.unstubAllEnvs();
  });

  it("resolves a waiter when release runs after classify blocks", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_CLASSIFICATION_ENABLED", "1");

    let settled = false;
    const pending = waitForE2eClassificationRelease().then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    expect(releaseE2eClassificationGate()).toBe(1);
    await pending;
    expect(settled).toBe(true);
  });

  it("opens the latch when release runs before classify blocks", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_CLASSIFICATION_ENABLED", "1");

    expect(releaseE2eClassificationGate()).toBe(0);
    await expect(waitForE2eClassificationRelease()).resolves.toBeUndefined();
  });

  it("rejects waiters on reset", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_CLASSIFICATION_ENABLED", "1");

    const pending = waitForE2eClassificationRelease();
    resetE2eClassificationGate();
    await expect(pending).rejects.toThrow("e2e classification gate reset");
  });
});
