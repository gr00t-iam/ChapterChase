import { redirect } from "next/navigation";
import { setupAdminAction } from "@/app/auth-actions";
import { hasUsers } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await hasUsers()) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.25em] text-sky-300">ChapterChase</p>
        <h1 className="text-3xl font-semibold">Create the first admin</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          This account manages users, NAS library folders, scans, and metadata.
        </p>

        <form action={setupAdminAction} className="mt-8 space-y-4">
          <input name="name" required placeholder="Name" className="field" />
          <input name="username" required placeholder="Username" className="field" />
          <input name="email" required type="email" placeholder="Email" className="field" />
          <input name="password" required type="password" minLength={8} placeholder="Password" className="field" />
          <button className="primary-button w-full">Create admin</button>
        </form>
      </div>
    </main>
  );
}
