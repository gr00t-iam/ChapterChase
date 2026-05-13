import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = body.email?.trim().toLowerCase();

  if (email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const resetPasswordToken = randomBytes(32).toString("base64url");
      const resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
      await prisma.user.update({
        where: { id: user.id },
        data: { resetPasswordToken, resetPasswordExpires },
      });
      await sendPasswordResetEmail(user.email, resetPasswordToken);
    }
  }

  return Response.json({ ok: true, message: "If that email exists, a password reset link has been sent." });
}
