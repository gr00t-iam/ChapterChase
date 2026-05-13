import type { User } from "@prisma/client";
import { AppFrame } from "@/components/AppFrame";
import { isAdmin } from "@/lib/auth";
import { ensureLibraryAutomationScheduler } from "@/lib/library-automation";

export function AppShell({ user, children }: { user: User; children: React.ReactNode }) {
  void ensureLibraryAutomationScheduler();

  return (
    <AppFrame
      user={{
        name: user.name,
        email: user.email,
        role: user.role,
        disableAnimations: user.disableAnimations,
      }}
      isAdmin={isAdmin(user.role)}
    >
      {children}
    </AppFrame>
  );
}
