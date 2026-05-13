import Link from "next/link";

type PreferencesRoute = "settings" | "library-folders" | "duplicates";

export function PreferencesRouteTabs({ active, isAdmin = true }: { active: PreferencesRoute; isAdmin?: boolean }) {
  return (
    <nav className="preferences-route-tabs mt-4" aria-label="Preferences subsections">
      <Link href="/settings" className={active === "settings" ? "active" : ""}>
        Account & Reader
      </Link>
      {isAdmin ? (
        <>
          <Link href="/preferences/library-folders" className={active === "library-folders" ? "active" : ""}>
            Library Folders
          </Link>
          <Link href="/preferences/duplicates" className={active === "duplicates" ? "active" : ""}>
            Duplicates
          </Link>
        </>
      ) : null}
    </nav>
  );
}
