import { describe, expect, it, vi } from "vitest";
import { ApiUnavailableError, apiFetch } from "./api-fetch.js";

describe("apiFetch", () => {
  it("retries transient HTTP statuses until the API responds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    vi.stubGlobal("fetch", fetchMock);

    const response = await apiFetch("/api/test");
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws ApiUnavailableError after exhausting network retries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await expect(apiFetch("/api/test", undefined, { maxRetries: 2 })).rejects.toBeInstanceOf(
      ApiUnavailableError,
    );
  });

  it("returns non-transient error responses without retrying", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await apiFetch("/api/test");
    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
