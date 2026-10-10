export type DesktopSpeech = {
  speak: (text: string) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
};

export function getDesktopSpeech(): DesktopSpeech | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as typeof window & { chapterChaseSpeech?: DesktopSpeech }).chapterChaseSpeech;
}
