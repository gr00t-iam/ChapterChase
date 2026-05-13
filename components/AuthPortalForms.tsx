"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type Mode = "register" | "forgot" | "reset";

export function RegisterForm() {
  return <AuthPortalForm mode="register" endpoint="/api/auth/register" successText="Account created. Check your email to verify the account before signing in." />;
}

export function ForgotPasswordForm() {
  return <AuthPortalForm mode="forgot" endpoint="/api/auth/forgot-password" successText="If that email exists, a password reset link has been sent." />;
}

export function ResetPasswordForm({ token }: { token: string }) {
  return <AuthPortalForm mode="reset" endpoint="/api/auth/reset-password" successText="Password changed. You can now sign in." token={token} />;
}

function AuthPortalForm({ mode, endpoint, successText, token }: { mode: Mode; endpoint: string; successText: string; token?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const body = Object.fromEntries(formData.entries());
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, token }),
    }).catch(() => null);

    setIsSubmitting(false);
    if (!response) {
      setError("Unable to reach ChapterChase. Check your connection and try again.");
      return;
    }

    const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!response.ok) {
      setError(payload.error ?? "Something went wrong.");
      return;
    }

    setStatus(payload.message ?? successText);
    if (mode === "reset") {
      router.refresh();
    }
  }

  return (
    <form className="mt-8 space-y-4" onSubmit={submit}>
      {mode === "register" ? (
        <>
          <input name="name" required placeholder="Display name" className="field" />
          <input name="username" required placeholder="Username" className="field" />
        </>
      ) : null}
      {mode !== "reset" ? <input name="email" required type="email" placeholder="Email" className="field" /> : null}
      {mode !== "forgot" ? <input name="password" required type="password" minLength={8} placeholder="Password" className="field" /> : null}
      <button className="primary-button w-full" disabled={isSubmitting || (mode === "reset" && !token)}>
        {buttonLabel(mode, isSubmitting)}
      </button>
      {status ? <p className="auth-success">{status}</p> : null}
      {error ? <p className="auth-error">{error}</p> : null}
      <div className="auth-links">
        {mode !== "register" ? <Link href="/register">Create an account</Link> : null}
        {mode !== "forgot" ? <Link href="/forgot-password">Forgot password?</Link> : null}
        <Link href="/login">Sign in</Link>
      </div>
    </form>
  );
}

function buttonLabel(mode: Mode, isSubmitting: boolean) {
  if (isSubmitting) {
    return "Working...";
  }
  if (mode === "register") {
    return "Create account";
  }
  if (mode === "forgot") {
    return "Send reset link";
  }
  return "Reset password";
}
