import { requireAdmin } from "@/lib/auth";
import { readServerLogLines } from "@/lib/server-logs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireAdmin();
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 50);

  return Response.json({ lines: await readServerLogLines(limit) });
}
