"use client";

import Link from "next/link";
import { useState } from "react";
import { BarChart3, BookOpen, Clock3, Home, Settings, SlidersHorizontal, Star, Trophy } from "lucide-react";
import { usePathname } from "next/navigation";
import { ReadingSprintTimer } from "@/components/ReadingSprintTimer";

export function AppNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const [isTimerVisible, setIsTimerVisible] = useState(false);

  return (
    <nav className="space-y-1 px-2 text-sm">
      <NavItem href="/" icon={<Home size={16} />} label="Home" active={pathname === "/"} />
      <NavItem href="/books" icon={<BookOpen size={16} />} label="Book Shelf" active={pathname === "/books" || pathname.startsWith("/books/")} />
      <NavItem href="/want-to-read" icon={<Star size={16} />} label="Want to Read" active={pathname === "/want-to-read"} />
      <NavItem href="/insights" icon={<BarChart3 size={16} />} label="Reading Insights" active={pathname === "/insights"} />
      <NavItem href="/trophies" icon={<Trophy size={16} />} label="Trophy Room" active={pathname === "/trophies"} />
      <NavItem
        href="/settings"
        icon={<SlidersHorizontal size={16} />}
        label="Preferences"
        active={pathname === "/settings" || pathname.startsWith("/preferences")}
      />
      {isAdmin ? (
        <>
          <NavItem href="/admin" icon={<Settings size={16} />} label="Admin" active={pathname === "/admin"} />
        </>
      ) : null}
      <button className="kavita-nav-link w-full" onClick={() => setIsTimerVisible((current) => !current)}>
        <Clock3 size={16} />
        <span>{isTimerVisible ? "Hide Timer" : "Reading Timer"}</span>
      </button>
      {isTimerVisible ? (
        <div className="sidebar-timer-panel">
          <ReadingSprintTimer compact onClose={() => setIsTimerVisible(false)} />
        </div>
      ) : null}
    </nav>
  );
}

function NavItem({
  href,
  icon,
  label,
  active = false,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <Link className={`kavita-nav-link ${active ? "active" : ""}`} href={href}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}
