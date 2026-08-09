import { useCallback, useEffect, useState } from "react";
import { ApiUnavailableError } from "@/lib/api-fetch.js";
import { checkSession, login as loginRequest } from "@/lib/auth.js";

export type AuthStatus = "loading" | "anonymous" | "authenticated";

const SESSION_RETRY_BASE_MS = 500;
const SESSION_RETRY_MAX_MS = 5_000;

export const useAuth = (): {
  status: AuthStatus;
  error: string | null;
  login: (password: string) => Promise<void>;
} => {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let delayMs = SESSION_RETRY_BASE_MS;

    const load = async (): Promise<void> => {
      while (active) {
        try {
          const authenticated = await checkSession();
          if (active) {
            setStatus(authenticated ? "authenticated" : "anonymous");
          }
          return;
        } catch (sessionError: unknown) {
          if (!active) {
            return;
          }
          if (sessionError instanceof ApiUnavailableError) {
            await new Promise<void>((resolve) => {
              window.setTimeout(resolve, delayMs);
            });
            delayMs = Math.min(delayMs * 2, SESSION_RETRY_MAX_MS);
            continue;
          }
          setStatus("anonymous");
          return;
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (password: string): Promise<void> => {
    setError(null);
    try {
      await loginRequest(password);
      setStatus("authenticated");
    } catch (loginError: unknown) {
      const message =
        loginError instanceof ApiUnavailableError
          ? "API is restarting — try again in a moment"
          : loginError instanceof Error
            ? loginError.message
            : "Login failed";
      setError(message);
      setStatus("anonymous");
    }
  }, []);

  return { status, error, login };
};
