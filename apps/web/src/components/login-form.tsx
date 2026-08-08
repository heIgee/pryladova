import { type FormEvent, useState } from "react";
import { PageHeader, Shell } from "@/components/layout/shell";
import { Card, CardContent } from "@/components/ui/card";

type LoginFormProps = {
  error: string | null;
  onLogin: (password: string) => Promise<void>;
};

export const LoginForm = ({ error, onLogin }: LoginFormProps) => {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (submitting || password.length === 0) {
      return;
    }

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
          <CardContent className="flex flex-col gap-4 pt-6">
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <label className="flex flex-col gap-2">
                <span className="text-caption text-muted-foreground">Password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                  }}
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              {error ? <p className="text-caption text-destructive">{error}</p> : null}
              <button
                type="submit"
                disabled={submitting || password.length === 0}
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
