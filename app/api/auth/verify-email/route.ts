import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: string };
  const token = body.token?.trim();

  if (!token) {
    return Response.json({ error: "Verification token is required." }, { status: 400 });
  }

  const user = await prisma.user.findFirst({ where: { verificationToken: token } });
  if (!user) {
    return Response.json({ error: "This verification link is invalid or has already been used." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { isVerified: true, verificationToken: null },
  });

  return Response.json({ ok: true });
}
