import { useEffect, useState } from "react";
import { ApiUnavailableError } from "@/lib/api-fetch.js";
import { checkSession, login as loginRequest } from "@/lib/auth.js";
import { subscribePanelSessionLost } from "@/lib/panel-poll.js";

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

  useEffect(
    () =>
      subscribePanelSessionLost(() => {
        setStatus("anonymous");
        setError("Session expired. Sign in again.");
      }),
    [],
  );

  useEffect(() => {
    let active = true;
    let delayMs = SESSION_RETRY_BASE_MS;

    const load = async (): Promise<void> => {
      while (active) {
        try {
          // biome-ignore lint/performance/noAwaitInLoops: session poll retries until it answers
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

  const login = async (password: string): Promise<void> => {
    setError(null);
    try {
      await loginRequest(password);
      setStatus("authenticated");
    } catch (loginError: unknown) {
      let message = "Login failed";
      if (loginError instanceof ApiUnavailableError) {
        message = "API is restarting — try again in a moment";
      } else if (loginError instanceof Error) {
        message = loginError.message;
      }
      setError(message);
      setStatus("anonymous");
    }
  };

  return { status, error, login };
};
