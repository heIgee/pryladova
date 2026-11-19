import { type FormEvent, useEffect, useRef, useState } from "react";
import { PageHeader, Shell } from "@/components/layout/shell";
import { Card, CardContent } from "@/components/ui/card";

type LoginFormProps = {
  error: string | null;
  onLogin: (password: string) => Promise<void>;
};

export const LoginForm = ({ error, onLogin }: LoginFormProps) => {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const shownError = error ?? localError;

  useEffect(() => {
    if (error) {
      passwordRef.current?.focus();
    }
  }, [error]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (submitting) {
      return;
    }
    if (password.length === 0) {
      setLocalError("Enter a password");
      passwordRef.current?.focus();
      return;
    }

    setLocalError(null);
    setSubmitting(true);
    void onLogin(password).finally(() => {
      setSubmitting(false);
    });
  };

  return (
    <Shell centered>
      <div className="flex w-full max-w-sm flex-col gap-5">
        <PageHeader />
        <Card>
          <CardContent inset="login" className="flex flex-col gap-4">
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <label className="flex flex-col gap-2">
                <span className="text-caption text-muted-foreground">Password</span>
                <input
                  ref={passwordRef}
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setLocalError(null);
                  }}
                  className="h-10 rounded-lg border border-border bg-background px-3 text-base ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              {shownError ? (
                <p className="text-caption text-destructive" aria-live="polite">
                  {shownError}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={submitting}
                className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
              >
                Sign in
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
};
