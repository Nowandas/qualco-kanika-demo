import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Lock, Mail, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_NAME } from "@/config/app";
import { randomAvatarSeed, randomAvatarStyle } from "@/lib/avatar";
import { useAuth } from "@/lib/auth";
import { apiErrorMessage, notifyError, notifySuccess } from "@/lib/notify";
import { scrubSensitiveQueryParams } from "@/lib/url-security";

type AuthMode = "login" | "invitation";

export function LoginPage() {
  const [mode, setMode] = useState<AuthMode>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [inviteToken, setInviteToken] = useState("");
  const [fullName, setFullName] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [confirmInvitePassword, setConfirmInvitePassword] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);

  const { login, acceptInvitation } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invitationToken = params.get("invitation") ?? params.get("invite") ?? params.get("token");
    if (invitationToken) {
      setMode("invitation");
      setInviteToken(invitationToken);
      scrubSensitiveQueryParams(["invitation", "invite", "token"]);
    }
  }, []);

  const onSubmitLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError("");

    try {
      await login(email, password);
      notifySuccess("Signed in successfully.");
      navigate("/app");
    } catch (error) {
      const message = apiErrorMessage(error, "Invalid credentials.");
      setLoginError(message);
      notifyError(error, "Invalid credentials.");
    } finally {
      setLoginLoading(false);
    }
  };

  const onSubmitInvitation = async (event: FormEvent) => {
    event.preventDefault();
    setInviteLoading(true);
    setInviteError("");

    if (invitePassword !== confirmInvitePassword) {
      setInviteLoading(false);
      setInviteError("Passwords do not match.");
      return;
    }

    try {
      await acceptInvitation({
        token: inviteToken.trim(),
        full_name: fullName.trim(),
        password: invitePassword,
        avatar_seed: randomAvatarSeed(),
        avatar_style: randomAvatarStyle(),
      });
      notifySuccess("Invitation accepted. Signed in successfully.");
      navigate("/app");
    } catch (error) {
      const message = apiErrorMessage(error, "Could not accept invitation.");
      setInviteError(message);
      notifyError(error, "Could not accept invitation.");
    } finally {
      setInviteLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="grid w-full max-w-5xl gap-6 md:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden rounded-3xl border border-border/70 bg-gradient-to-br from-sidebar-primary/90 via-sky-600 to-cyan-500 p-8 text-white shadow-xl md:flex md:flex-col md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">{APP_NAME}</p>
            <h1 className="mt-2 text-3xl font-bold">Access Portal</h1>
            <p className="mt-3 max-w-md text-sm text-white/85">
              Manage accounts, invitations, and secure onboarding from one focused workspace.
            </p>
          </div>
          <div className="rounded-2xl bg-white/12 p-4 text-sm backdrop-blur">
            <p className="font-semibold">Secure sign-in</p>
            <p className="mt-1 text-white/90">Use credentials provided by your administrator.</p>
          </div>
        </section>

        <Card className="justify-center py-8">
          <CardHeader>
            <CardTitle className="text-xl">{mode === "login" ? "Sign in" : "Accept Invitation"}</CardTitle>
            <CardDescription>
              {mode === "login"
                ? "Use your account credentials or switch to invitation onboarding."
                : "Paste your invitation token and set your account details."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-full bg-muted/65 p-1">
              <Button
                type="button"
                variant={mode === "login" ? "secondary" : "ghost"}
                className="w-full"
                onClick={() => setMode("login")}
              >
                Sign in
              </Button>
              <Button
                type="button"
                variant={mode === "invitation" ? "secondary" : "ghost"}
                className="w-full"
                onClick={() => setMode("invitation")}
              >
                Invitation
              </Button>
            </div>

            {mode === "login" ? (
              <form className="space-y-4" onSubmit={onSubmitLogin}>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="pl-9"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      maxLength={72}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="pl-9"
                      required
                    />
                  </div>
                </div>

                {loginError ? <p className="text-sm text-danger">{loginError}</p> : null}

                <Button className="w-full" type="submit" disabled={loginLoading}>
                  {loginLoading ? "Signing in..." : "Continue"}
                </Button>
              </form>
            ) : (
              <form className="space-y-4" onSubmit={onSubmitInvitation}>
                <div className="space-y-2">
                  <Label htmlFor="invite-token">Invitation token</Label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="invite-token"
                      value={inviteToken}
                      onChange={(event) => setInviteToken(event.target.value)}
                      className="pl-9 font-mono text-xs"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invite-full-name">Full name</Label>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="invite-full-name"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      className="pl-9"
                      required
                      minLength={2}
                      maxLength={120}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invite-password">Password</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="invite-password"
                      type="password"
                      maxLength={72}
                      value={invitePassword}
                      onChange={(event) => setInvitePassword(event.target.value)}
                      className="pl-9"
                      required
                      minLength={8}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invite-password-confirm">Confirm password</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="invite-password-confirm"
                      type="password"
                      maxLength={72}
                      value={confirmInvitePassword}
                      onChange={(event) => setConfirmInvitePassword(event.target.value)}
                      className="pl-9"
                      required
                      minLength={8}
                    />
                  </div>
                </div>

                {inviteError ? <p className="text-sm text-danger">{inviteError}</p> : null}

                <p className="text-xs text-muted-foreground">
                  Admin can copy your token/link from the Invitations page. Opening a link with `?invitation=...` prefills
                  the token automatically.
                </p>

                <Button className="w-full" type="submit" disabled={inviteLoading}>
                  {inviteLoading ? "Activating account..." : "Accept invitation and sign in"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
