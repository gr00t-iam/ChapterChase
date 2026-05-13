import { createSession, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !password) {
    return Response.json({ error: "Email and password are required." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return Response.json({ error: "Invalid email or password." }, { status: 401 });
  }

  if (!user.isVerified) {
    return Response.json({ error: "Please verify your email before signing in." }, { status: 403 });
  }

  await createSession(user.id);
  return Response.json({ ok: true, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
}
