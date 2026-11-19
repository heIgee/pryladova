const NETWORK_ERROR_CODES = new Set(["ECONNRESET", "ECONNREFUSED", "ECONNABORTED"]);

export const readErrorCode = (error: unknown): string | undefined => {
  if (!(error instanceof Error) || !("code" in error)) {
    return undefined;
  }
  const code = error.code;
  return typeof code === "string" ? code : undefined;
};

export const isNetworkErrnoCode = (code: string | undefined): boolean =>
  code !== undefined && NETWORK_ERROR_CODES.has(code);
