export const settingsSections = ["Account", "Preferences", "Reading Profiles", "Annotations", "Social"] as const;

export type SettingsSection = (typeof settingsSections)[number];

const sectionSlugByName = {
  Account: "account",
  Preferences: "preferences",
  "Reading Profiles": "reading-profiles",
  Annotations: "annotations",
  Social: "social",
} satisfies Record<SettingsSection, string>;

const sectionBySlug = new Map(settingsSections.map((section) => [sectionSlugByName[section], section]));

export function normalizeSettingsSection(value: unknown): SettingsSection {
  if (typeof value !== "string") {
    return "Account";
  }

  return sectionBySlug.get(value.trim().toLowerCase()) ?? "Account";
}

export function settingsSectionPath(section: SettingsSection) {
  return `/settings?section=${sectionSlugByName[section]}`;
}
