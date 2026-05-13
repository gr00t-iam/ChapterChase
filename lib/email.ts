import nodemailer from "nodemailer";

type MailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export function getAppBaseUrl() {
  return process.env.CHAPTERCHASE_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export async function sendMail(input: MailInput) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user || "ChapterChase <no-reply@chapterchase.local>";

  if (!host || !user || !pass) {
    console.warn(`[email disabled] ${input.subject} -> ${input.to}\n${input.text}`);
    return { skipped: true };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });

  return { skipped: false };
}

export async function sendVerificationEmail(email: string, token: string) {
  const url = `${getAppBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  return sendMail({
    to: email,
    subject: "Verify your ChapterChase account",
    text: `Verify your ChapterChase account by opening this link: ${url}`,
    html: `<p>Verify your ChapterChase account by opening this link:</p><p><a href="${url}">${url}</a></p>`,
  });
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const url = `${getAppBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  return sendMail({
    to: email,
    subject: "Reset your ChapterChase password",
    text: `Reset your ChapterChase password within 1 hour by opening this link: ${url}`,
    html: `<p>Reset your ChapterChase password within 1 hour by opening this link:</p><p><a href="${url}">${url}</a></p>`,
  });
}

export async function sendPasswordChangedEmail(email: string) {
  return sendMail({
    to: email,
    subject: "Your ChapterChase password was changed",
    text: "Your ChapterChase password was changed. If this was not you, reset your password immediately and review your server access.",
  });
}
