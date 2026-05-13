import { randomBytes } from "node:crypto";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    username?: string;
    name?: string;
    email?: string;
    password?: string;
  };
  const email = body.email?.trim().toLowerCase();
  const username = body.username?.trim();
  const name = body.name?.trim() || username;
  const password = body.password ?? "";

  if (!email || !username || !name || password.length < 8) {
    return Response.json({ error: "Username, email, and an 8+ character password are required." }, { status: 400 });
  }

  const verificationToken = randomBytes(32).toString("base64url");

  try {
    await prisma.user.create({
      data: {
        username,
        name,
        email,
        passwordHash: await hashPassword(password),
        role: "USER",
        isVerified: false,
        verificationToken,
      },
    });
  } catch {
    return Response.json({ error: "A user with that email or username already exists." }, { status: 409 });
  }

  await sendVerificationEmail(email, verificationToken);
  return Response.json({ ok: true, message: "Account created. Check your email to verify the account before signing in." }, { status: 201 });
}
