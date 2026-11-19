import { HEALTH_ROUTE, parseHealthResponse } from "@pryladova/shared";
import { apiFetch } from "./api-fetch.js";

export const fetchApiRelease = async (): Promise<string | undefined> => {
  const response = await apiFetch(HEALTH_ROUTE);
  if (!response.ok) {
    throw new Error(`Health error (${response.status})`);
  }
  const json: unknown = await response.json();
  return parseHealthResponse(json).release;
};
