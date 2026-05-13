import { ResetPasswordForm } from "@/components/AuthPortalForms";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="auth-brand">ChapterChase</p>
        <h1>Choose a new password</h1>
        <p>Your recovery link is valid for 1 hour. Pick a new password with at least 8 characters.</p>
        {!token ? <p className="auth-error">Missing reset token. Use the link from your email.</p> : null}
        <ResetPasswordForm token={token} />
      </section>
    </main>
  );
}
