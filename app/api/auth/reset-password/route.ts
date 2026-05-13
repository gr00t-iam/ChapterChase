import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendPasswordChangedEmail } from "@/lib/email";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: string; password?: string };
  const token = body.token?.trim();
  const password = body.password ?? "";

  if (!token || password.length < 8) {
    return Response.json({ error: "A valid reset token and an 8+ character password are required." }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: {
      resetPasswordToken: token,
      resetPasswordExpires: { gt: new Date() },
    },
  });

  if (!user) {
    return Response.json({ error: "This reset link is invalid or expired." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(password),
      resetPasswordToken: null,
      resetPasswordExpires: null,
    },
  });

  await sendPasswordChangedEmail(user.email);
  return Response.json({ ok: true, message: "Password changed. You can now sign in." });
}
