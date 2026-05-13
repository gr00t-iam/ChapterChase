import { ForgotPasswordForm } from "@/components/AuthPortalForms";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="auth-brand">ChapterChase</p>
        <h1>Reset password</h1>
        <p>Enter your account email and ChapterChase will send a recovery link that expires in 1 hour.</p>
        <ForgotPasswordForm />
      </section>
    </main>
  );
}
