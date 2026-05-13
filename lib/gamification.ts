export type GamificationSettings = {
  storyMap: boolean;
  loot: boolean;
  assistantAvatar: boolean;
  ghostPace: boolean;
  themeLocks: boolean;
};

export type EchoLoot = {
  id: string;
  bookId: string;
  title: string;
  icon: "sword" | "potion" | "scroll";
  rarity: "Common" | "Rare" | "Epic";
  pageIndex: number;
  createdAt: string;
};

const settingsKey = "chapterchase:gamification:settings";
const lootKey = "chapterchase:gamification:echoes";
const speedsterKey = "chapterchase:speedsterBadges";
const focusBadgeKey = "chapterchase:focusBadges";

export const defaultGamificationSettings: GamificationSettings = {
  storyMap: true,
  loot: true,
  assistantAvatar: true,
  ghostPace: true,
  themeLocks: false,
};

export function loadGamificationSettings(): GamificationSettings {
  if (typeof window === "undefined") {
    return defaultGamificationSettings;
  }

  try {
    return { ...defaultGamificationSettings, ...JSON.parse(window.localStorage.getItem(settingsKey) ?? "{}") };
  } catch {
    return defaultGamificationSettings;
  }
}

export function saveGamificationSettings(settings: GamificationSettings) {
  window.localStorage.setItem(settingsKey, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent("chapterchase:gamification-settings"));
}

export function loadEchoes(): EchoLoot[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const echoes = JSON.parse(window.localStorage.getItem(lootKey) ?? "[]");
    return Array.isArray(echoes) ? echoes.filter(isEchoLoot) : [];
  } catch {
    return [];
  }
}

export function saveEcho(echo: EchoLoot) {
  const echoes = loadEchoes();
  if (echoes.some((current) => current.bookId === echo.bookId && current.pageIndex === echo.pageIndex)) {
    return echoes;
  }

  const nextEchoes = [...echoes, echo];
  window.localStorage.setItem(lootKey, JSON.stringify(nextEchoes));
  window.dispatchEvent(new CustomEvent("chapterchase:echoes"));
  return nextEchoes;
}

export function loadSpeedsterBadges() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const badges = JSON.parse(window.localStorage.getItem(speedsterKey) ?? "[]");
    return Array.isArray(badges) ? badges.filter((badge) => typeof badge === "string") : [];
  } catch {
    return [];
  }
}

export function loadFocusBadges() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const badges = JSON.parse(window.localStorage.getItem(focusBadgeKey) ?? "[]");
    return Array.isArray(badges) ? badges.filter((badge) => typeof badge === "string") : [];
  } catch {
    return [];
  }
}

export function grantSpeedsterBadge(bookId: string) {
  const badges = loadSpeedsterBadges();
  const badge = `${bookId}:${new Date().toISOString().slice(0, 10)}`;
  if (badges.includes(badge)) {
    return badges;
  }
  const nextBadges = [...badges, badge];
  window.localStorage.setItem(speedsterKey, JSON.stringify(nextBadges));
  return nextBadges;
}

function isEchoLoot(value: unknown): value is EchoLoot {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<EchoLoot>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.bookId === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.pageIndex === "number" &&
    typeof candidate.createdAt === "string"
  );
}
