"use server";

import { redirect } from "next/navigation";
import { createSession, destroySession, hashPassword, hasUsers, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function setupAdminAction(formData: FormData) {
  if (await hasUsers()) {
    redirect("/login");
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const username = String(formData.get("username") ?? name).trim() || email.split("@")[0];

  if (!name || !email || password.length < 8) {
    throw new Error("Name, email, and an 8+ character password are required.");
  }

  const user = await prisma.user.create({
    data: {
      name,
      username,
      email,
      passwordHash: await hashPassword(password),
      role: "ADMIN",
      isVerified: true,
    },
  });

  await createSession(user.id);
  redirect("/");
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    redirect("/login?error=1");
  }

  if (!user.isVerified) {
    redirect("/login?error=unverified");
  }

  await createSession(user.id);
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
