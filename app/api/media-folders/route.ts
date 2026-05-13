import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listMediaDirectories } from "@/lib/media-roots";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  await requireAdmin();
  const selectedPath = request.nextUrl.searchParams.get("path");

  try {
    return Response.json(await listMediaDirectories(selectedPath));
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to read media folder.",
        ...(await listMediaDirectories(null)),
      },
      { status: 400 }
    );
  }
}
