import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, UserRound } from "lucide-react";

import { api } from "@/api/client";
import type { PasswordResetTokenContext } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_NAME } from "@/config/app";
import { apiErrorMessage, notifyError, notifySuccess } from "@/lib/notify";
import { scrubSensitiveQueryParams } from "@/lib/url-security";

export function PasswordResetPage() {
  const [token, setToken] = useState("");
  const [context, setContext] = useState<PasswordResetTokenContext | null>(null);
  const [loadingContext, setLoadingContext] = useState(true);
  const [contextError, setContextError] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resetToken = params.get("token") ?? params.get("reset") ?? params.get("password_reset") ?? "";
    setToken(resetToken);
    if (resetToken) {
      scrubSensitiveQueryParams(["token", "reset", "password_reset"]);
    }

    if (!resetToken) {
      setLoadingContext(false);
      setContextError("Password reset token is missing from the URL.");
      return;
    }

    const load = async () => {
      try {
        const response = await api.get<PasswordResetTokenContext>(`/auth/password-reset/${encodeURIComponent(resetToken)}`);
        setContext(response.data);
      } catch (error) {
        const message = apiErrorMessage(error, "Could not validate password reset link.");
        setContextError(message);
      } finally {
        setLoadingContext(false);
      }
    };

    load().catch(() => null);
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitError("");

    if (newPassword !== confirmNewPassword) {
      setSubmitError("Passwords do not match.");
      return;
    }

    if (newPassword.length < 8) {
      setSubmitError("Password must be at least 8 characters.");
      return;
    }

    if (!token) {
      setSubmitError("Password reset token is missing.");
      return;
    }

    setSubmitLoading(true);
    try {
      await api.post("/auth/password-reset", {
        token,
        new_password: newPassword,
      });
      notifySuccess("Password reset completed. Please sign in.");
      navigate("/");
    } catch (error) {
      const message = apiErrorMessage(error, "Could not reset password.");
      setSubmitError(message);
      notifyError(error, "Could not reset password.");
    } finally {
      setSubmitLoading(false);
    }
  };

  const greetingName = useMemo(() => {
    if (!context?.user_full_name) {
      return "there";
    }
    return context.user_full_name;
  }, [context]);

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="grid w-full max-w-4xl gap-6 md:grid-cols-[1fr_1fr]">
        <section className="hidden rounded-3xl border border-border/70 bg-gradient-to-br from-sidebar-primary/90 via-sky-600 to-cyan-500 p-8 text-white shadow-xl md:flex md:flex-col md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">{APP_NAME}</p>
            <h1 className="mt-2 text-3xl font-bold">Password Reset</h1>
            <p className="mt-3 max-w-md text-sm text-white/85">
              Use your secure reset link to set a new password and continue to the admin workspace.
            </p>
          </div>
          {context ? (
            <div className="rounded-2xl bg-white/12 p-4 text-sm backdrop-blur">
              <p className="font-semibold">Account</p>
              <p className="mt-1">{context.user_full_name}</p>
              <p className="text-white/85">{context.user_email}</p>
            </div>
          ) : null}
        </section>

        <Card className="justify-center py-8">
          <CardHeader>
            <CardTitle className="text-xl">Hello {greetingName}</CardTitle>
            <CardDescription>
              {context
                ? "Set your new password below. Your name and email are fixed for this reset link."
                : "Open your password reset link from the admin message to continue."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingContext ? (
              <p className="text-sm text-muted-foreground">Validating reset link...</p>
            ) : contextError ? (
              <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{contextError}</div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="reset-user-name">User</Label>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="reset-user-name"
                      value={context?.user_full_name ?? ""}
                      className="pl-9"
                      readOnly
                      aria-readonly
                    />
                  </div>
                </div>

                <form className="space-y-4" onSubmit={onSubmit}>
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New password</Label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="new-password"
                        type="password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        className="pl-9"
                        maxLength={72}
                        minLength={8}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-new-password">Confirm new password</Label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="confirm-new-password"
                        type="password"
                        value={confirmNewPassword}
                        onChange={(event) => setConfirmNewPassword(event.target.value)}
                        className="pl-9"
                        maxLength={72}
                        minLength={8}
                        required
                      />
                    </div>
                  </div>

                  {submitError ? <p className="text-sm text-danger">{submitError}</p> : null}

                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" onClick={() => navigate("/")}>Back to sign in</Button>
                    <Button type="submit" disabled={submitLoading}>
                      {submitLoading ? "Updating password..." : "Update password"}
                    </Button>
                  </div>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
