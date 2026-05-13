import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const themes = new Set(["paper", "night", "scroll", "eink", "reseda", "deepsea"]);
const layouts = new Set(["flat", "shelf"]);
const modes = new Set(["auto", "portrait", "landscape"]);
const hexColor = /^#[0-9a-f]{6}$/i;

export async function PATCH(request: Request) {
  const user = await requireUser();
  const body = (await request.json()) as {
    name?: string;
    readerTheme?: string;
    uiLayout?: string;
    defaultReadingMode?: string;
    blurUnreadSummaries?: boolean;
    disableAnimations?: boolean;
    collapseSeriesRelationships?: boolean;
    annotationHighlightColors?: string[];
    shareProfile?: boolean;
    shareSeriesReviews?: boolean;
    viewSharedAnnotations?: boolean;
    readingProfiles?: unknown[];
  };

  const data: {
    name?: string;
    readerTheme?: string;
    uiLayout?: string;
    defaultReadingMode?: string;
    blurUnreadSummaries?: boolean;
    disableAnimations?: boolean;
    collapseSeriesRelationships?: boolean;
    annotationHighlightColors?: string;
    shareProfile?: boolean;
    shareSeriesReviews?: boolean;
    viewSharedAnnotations?: boolean;
    readingProfiles?: string;
  } = {};
  if (body.name?.trim()) {
    data.name = body.name.trim();
  }
  if (body.readerTheme && themes.has(body.readerTheme)) {
    data.readerTheme = body.readerTheme;
  }
  if (body.uiLayout && layouts.has(body.uiLayout)) {
    data.uiLayout = body.uiLayout;
  }
  if (body.defaultReadingMode && modes.has(body.defaultReadingMode)) {
    data.defaultReadingMode = body.defaultReadingMode;
  }
  if (typeof body.blurUnreadSummaries === "boolean") {
    data.blurUnreadSummaries = body.blurUnreadSummaries;
  }
  if (typeof body.disableAnimations === "boolean") {
    data.disableAnimations = body.disableAnimations;
  }
  if (typeof body.collapseSeriesRelationships === "boolean") {
    data.collapseSeriesRelationships = body.collapseSeriesRelationships;
  }
  if (Array.isArray(body.annotationHighlightColors)) {
    data.annotationHighlightColors = JSON.stringify(
      body.annotationHighlightColors.filter((color) => typeof color === "string" && hexColor.test(color)).slice(0, 12)
    );
  }
  if (typeof body.shareProfile === "boolean") {
    data.shareProfile = body.shareProfile;
  }
  if (typeof body.shareSeriesReviews === "boolean") {
    data.shareSeriesReviews = body.shareSeriesReviews;
  }
  if (typeof body.viewSharedAnnotations === "boolean") {
    data.viewSharedAnnotations = body.viewSharedAnnotations;
  }
  if (Array.isArray(body.readingProfiles)) {
    data.readingProfiles = JSON.stringify(body.readingProfiles.slice(0, 12));
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
    select: {
      id: true,
      name: true,
      readerTheme: true,
      uiLayout: true,
      defaultReadingMode: true,
      blurUnreadSummaries: true,
      disableAnimations: true,
      collapseSeriesRelationships: true,
      annotationHighlightColors: true,
      shareProfile: true,
      shareSeriesReviews: true,
      viewSharedAnnotations: true,
      readingProfiles: true,
    },
  });

  return Response.json({ user: updated });
}
