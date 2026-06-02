import { requireUser } from "@/lib/auth";
import { getReadingInsights } from "@/lib/reading-insights";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  return Response.json(await getReadingInsights(user.id));
}
