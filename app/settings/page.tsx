import { AppShell } from "@/components/AppShell";
import { PreferencesRouteTabs } from "@/components/PreferencesRouteTabs";
import { UserSettingsForm } from "@/components/UserSettingsForm";
import { hasUsers, isAdmin, requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!(await hasUsers())) {
    redirect("/setup");
  }

  const user = await requireUser();

  return (
    <AppShell user={user}>
      <main className="settings-page px-5 py-6 pr-12">
        <div className="mb-5">
          <h1 className="text-2xl font-medium tracking-tight text-zinc-200">User Settings</h1>
          <p className="mt-1 text-sm text-zinc-400">Reading preferences and account details for this ChapterChase profile.</p>
          <PreferencesRouteTabs active="settings" isAdmin={isAdmin(user.role)} />
        </div>
        <UserSettingsForm
          user={{
            name: user.name,
            email: user.email,
            readerTheme: user.readerTheme,
            ttsVoice: user.ttsVoice,
            uiLayout: user.uiLayout,
            defaultReadingMode: user.defaultReadingMode,
            blurUnreadSummaries: user.blurUnreadSummaries,
            disableAnimations: user.disableAnimations,
            collapseSeriesRelationships: user.collapseSeriesRelationships,
            annotationHighlightColors: user.annotationHighlightColors,
            shareProfile: user.shareProfile,
            shareSeriesReviews: user.shareSeriesReviews,
            viewSharedAnnotations: user.viewSharedAnnotations,
            readingProfiles: user.readingProfiles,
          }}
        />
      </main>
    </AppShell>
  );
}
