const TRANSIENT_STATUSES = new Set([502, 504]);
const DEFAULT_MAX_RETRIES = 5;
const BASE_DELAY_MS = 400;
const MAX_DELAY_MS = 4_000;

export class ApiUnavailableError extends Error {
  constructor(message = "API temporarily unavailable") {
    super(message);
    this.name = "ApiUnavailableError";
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const isNetworkError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error instanceof TypeError) {
    return true;
  }
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ECONNRESET" || code === "ECONNREFUSED" || code === "ECONNABORTED";
};

const isTransientStatus = (status: number): boolean => TRANSIENT_STATUSES.has(status);

export const apiFetch = async (
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: { maxRetries?: number },
): Promise<Response> => {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  let attempt = 0;
  let delayMs = BASE_DELAY_MS;

  for (;;) {
    try {
      const response = await fetch(input, { ...init, credentials: "include" });
      if (isTransientStatus(response.status) && attempt < maxRetries) {
        attempt += 1;
        await sleep(delayMs);
        delayMs = Math.min(delayMs * 2, MAX_DELAY_MS);
        continue;
      }
      return response;
    } catch (error: unknown) {
      if (!isNetworkError(error) || attempt >= maxRetries) {
        if (isNetworkError(error)) {
          throw new ApiUnavailableError();
        }
        throw error;
      }
      attempt += 1;
      await sleep(delayMs);
      delayMs = Math.min(delayMs * 2, MAX_DELAY_MS);
    }
  }
};
