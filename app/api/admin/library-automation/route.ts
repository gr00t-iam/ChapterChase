import { requireAdmin } from "@/lib/auth";
import { getLibraryAutomationSettings, saveLibraryAutomationSettings, type ScanFrequency } from "@/lib/library-automation";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin();
  return Response.json(await getLibraryAutomationSettings());
}

export async function PATCH(request: Request) {
  await requireAdmin();
  const body = (await request.json().catch(() => ({}))) as {
    enabled?: unknown;
    frequency?: unknown;
    customMinutes?: unknown;
  };

  const settings = await saveLibraryAutomationSettings({
    enabled: body.enabled === true,
    frequency: isScanFrequency(body.frequency) ? body.frequency : undefined,
    customMinutes: typeof body.customMinutes === "number" ? body.customMinutes : Number(body.customMinutes),
  });

  return Response.json(settings);
}

function isScanFrequency(value: unknown): value is ScanFrequency {
  return value === "hourly" || value === "six-hours" || value === "daily" || value === "weekly" || value === "custom";
}
