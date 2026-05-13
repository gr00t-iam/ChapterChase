import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/AuthPortalForms";
import { getCurrentUser, hasUsers } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (!(await hasUsers())) {
    redirect("/setup");
  }

  if (await getCurrentUser()) {
    redirect("/");
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="auth-brand">ChapterChase</p>
        <h1>Create account</h1>
        <p>New accounts must verify their email before they can access your ChapterChase library.</p>
        <RegisterForm />
      </section>
    </main>
  );
}
