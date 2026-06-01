export type TtsChunk = {
  text: string;
  wordOffset: number;
  wordCount: number;
};

export const defaultTtsChunkMaxCharacters = 160;
export const localTtsChunkMaxCharacters = 520;
export const generatedSpeechWordTrackingEnabled = false;
export const ttsInitialRequestTimeoutMs = 90000;
export const ttsChunkRequestTimeoutMs = 45000;

export function selectTtsChunkMaxCharacters(useLocalTts: boolean) {
  return useLocalTts ? localTtsChunkMaxCharacters : defaultTtsChunkMaxCharacters;
}

export function countTrackableWords(text: string) {
  return text.split(/(\s+)/).filter(isTrackableWordToken).length;
}

export function splitTextIntoTtsChunks(text: string, maxChars = defaultTtsChunkMaxCharacters): TtsChunk[] {
  if (!text.trim()) {
    return [];
  }

  const tokens = text.split(/(\s+)/);
  const chunks: TtsChunk[] = [];

  let current = "";
  let currentWordCount = 0;
  let wordOffset = 0;

  const pushCurrent = () => {
    const chunkText = current.trim();
    if (!chunkText) {
      current = "";
      currentWordCount = 0;
      return;
    }

    chunks.push({ text: chunkText, wordOffset, wordCount: currentWordCount });
    wordOffset += currentWordCount;
    current = "";
    currentWordCount = 0;
  };

  for (const token of tokens) {
    if (!token) continue;

    const candidate = current + token;
    if (current && candidate.length > maxChars && current.trim()) {
      pushCurrent();
    }

    current += token;
    if (!/^\s+$/.test(token) && isTrackableWordToken(token)) {
      currentWordCount += 1;
    }
  }

  pushCurrent();
  return chunks.length ? chunks : [{ text: text.trim(), wordOffset: 0, wordCount: countTrackableWords(text) }];
}

function isTrackableWordToken(token: string) {
  return /[A-Za-z0-9]/.test(token);
}
