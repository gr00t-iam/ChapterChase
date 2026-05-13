import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  let message = "This verification link is invalid or has already been used.";
  let verified = false;

  if (token) {
    const user = await prisma.user.findFirst({ where: { verificationToken: token } });
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { isVerified: true, verificationToken: null },
      });
      verified = true;
      message = "Your email is verified. You can now sign in to ChapterChase.";
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="auth-brand">ChapterChase</p>
        <h1>{verified ? "Email verified" : "Verification failed"}</h1>
        <p>{message}</p>
        <Link className="primary-button w-full" href="/login">
          Go to sign in
        </Link>
      </section>
    </main>
  );
}
