import { requireUser } from "@/lib/auth";
import { getScanActivities } from "@/lib/scan-activity";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireUser();
  return Response.json({
    tasks: getScanActivities(),
  });
}
