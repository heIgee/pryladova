import { describe, expect, it } from "vitest";
import { isIngestAuthorized } from "./ingest-auth.js";

describe("isIngestAuthorized", () => {
  it("rejects missing bearer tokens", () => {
    expect(isIngestAuthorized(undefined, "secret")).toBe(false);
    expect(isIngestAuthorized("Basic x", "secret")).toBe(false);
    expect(isIngestAuthorized("Bearer ", "secret")).toBe(false);
  });

  it("accepts matching bearer secrets", () => {
    expect(isIngestAuthorized("Bearer secret", "secret")).toBe(true);
    expect(isIngestAuthorized("Bearer other", "secret")).toBe(false);
  });

  it("rejects when ingest secret is unset", () => {
    expect(isIngestAuthorized("Bearer secret", undefined)).toBe(false);
  });
});
