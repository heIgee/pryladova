export const readApiErrorMessage = async (response: Response): Promise<string> => {
  try {
    const json: unknown = await response.json();
    if (json && typeof json === "object" && "message" in json) {
      const { message } = json as { message?: unknown };
      if (typeof message === "string") {
        return message;
      }
      if (Array.isArray(message) && message.every((part) => typeof part === "string")) {
        return message.join(", ");
      }
    }
  } catch {
    // response body may not be JSON
  }

  return `Request failed (${response.status})`;
};
