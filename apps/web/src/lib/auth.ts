import { AUTH_LOGIN_ROUTE, AUTH_SESSION_ROUTE, parseAuthSessionResponse } from "@pryladova/shared";
import { apiFetch } from "./api-fetch.js";

export const checkSession = async (): Promise<boolean> => {
  const response = await apiFetch(AUTH_SESSION_ROUTE);
  if (!response.ok) {
    return false;
  }

  const json: unknown = await response.json();
  return parseAuthSessionResponse(json).authenticated;
};

export const login = async (password: string): Promise<void> => {
  const response = await apiFetch(AUTH_LOGIN_ROUTE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  if (response.status === 401) {
    throw new Error("Invalid password");
  }

  if (!response.ok) {
    throw new Error(`Login failed (${response.status})`);
  }
};
