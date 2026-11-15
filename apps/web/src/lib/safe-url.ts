const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

/** http(s) only. Drops javascript:, data:, and other schemes before they reach href or img src. */
export const safeHttpUrl = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    if (!HTTP_PROTOCOLS.has(url.protocol)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
};
