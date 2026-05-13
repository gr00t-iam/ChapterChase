import { redirect } from "next/navigation";
import Link from "next/link";
import { loginAction } from "@/app/auth-actions";
import { getCurrentUser, hasUsers } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!(await hasUsers())) {
    redirect("/setup");
  }

  if (await getCurrentUser()) {
    redirect("/");
  }

  const { error } = await searchParams;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.25em] text-sky-300">ChapterChase</p>
        <h1 className="text-3xl font-semibold">Sign in</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">Access your self-hosted ebook library from any browser.</p>

        {error ? (
          <p className="mt-6 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {error === "unverified" ? "Please verify your email before signing in." : "Invalid email or password."}
          </p>
        ) : null}

        <form action={loginAction} className="mt-8 space-y-4">
          <input name="email" required type="email" placeholder="Email" className="field" />
          <input name="password" required type="password" placeholder="Password" className="field" />
          <button className="primary-button w-full">Sign in</button>
        </form>
        <div className="auth-links mt-5">
          <Link href="/register">Create an account</Link>
          <Link href="/forgot-password">Forgot password?</Link>
        </div>
      </div>
    </main>
  );
}
