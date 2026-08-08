import { useCallback, useEffect, useState } from "react";
import { checkSession, login as loginRequest } from "@/lib/auth.js";

export type AuthStatus = "loading" | "anonymous" | "authenticated";

export const useAuth = (): {
  status: AuthStatus;
  error: string | null;
  login: (password: string) => Promise<void>;
} => {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async (): Promise<void> => {
      try {
        const authenticated = await checkSession();
        if (active) {
          setStatus(authenticated ? "authenticated" : "anonymous");
        }
      } catch {
        if (active) {
          setStatus("anonymous");
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
      const message = loginError instanceof Error ? loginError.message : "Login failed";
      setError(message);
      setStatus("anonymous");
    }
  }, []);

  return { status, error, login };
};
