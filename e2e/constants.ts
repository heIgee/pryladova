/** Isolated from dev API (3000) so E2E can run while `pnpm dev` is up. */
export const e2eApiPort = 3001;

/** Isolated from dev Vite (5173); proxies to {@link e2eApiPort} via `E2E_API_PORT`. */
export const e2eWebPort = 5174;

export const apiBase = `http://127.0.0.1:${e2eApiPort}`;
export const panelPassword = "dev";
/** Must match INGEST_SECRET in playwright.config.ts webServer env. */
export const ingestSecret = "e2e-ingest-secret-at-least-16-chars";
