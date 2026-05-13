"use client";

import { useState } from "react";
import { loadFocusBadges } from "@/components/ReadingSprintTimer";

type Trophy = {
  id: string;
  title: string;
  description: string;
  tone: "gold" | "emerald" | "sky" | "violet";
};

export function TrophyRoom({ trophies }: { trophies: Trophy[] }) {
  const [focusBadges] = useState<string[]>(() => loadFocusBadges());

  const focusTrophies: Trophy[] = focusBadges.map((badge, index) => ({
    id: `focus-${badge}`,
    title: `Focus Badge ${index + 1}`,
    description: "Completed a Reading Sprint without leaving the app.",
    tone: "violet",
  }));
  const allTrophies = [...trophies, ...focusTrophies];

  return (
    <section className="trophy-room">
      {allTrophies.length ? (
        allTrophies.map((trophy) => (
          <article className="trophy-card" data-tone={trophy.tone} key={trophy.id}>
            <TrophySvg />
            <h2>{trophy.title}</h2>
            <p>{trophy.description}</p>
          </article>
        ))
      ) : (
        <div className="trophy-empty">
          <TrophySvg />
          <h2>No trophies yet</h2>
          <p>Complete streaks, long books, and reading sprints to fill the shelf.</p>
        </div>
      )}
    </section>
  );
}

function TrophySvg() {
  return (
    <svg viewBox="0 0 96 96" aria-hidden="true">
      <path d="M30 15h36v10h16v9c0 13-8 24-21 26-3 4-6 7-10 8v9h16v8H29v-8h16v-9c-4-1-8-4-10-8-13-2-21-13-21-26v-9h16V15Zm36 18v15c5-2 8-7 8-14v-1h-8Zm-44 0v1c0 7 3 12 8 14V33h-8Z" />
    </svg>
  );
}
