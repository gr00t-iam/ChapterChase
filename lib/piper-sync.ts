export type WordMapEntry = {
  index: number;
  word: string;
  startChar: number;
  endChar: number;
  weight: number;
};

export type WordTiming = {
  word: string;
  index: number;
  start: number;
  end: number;
};

export type AudioChunk = {
  startSample: number;
  endSample: number;
  samples: Float32Array;
};

export function createWordMap(text: string, punctuationPaddingMs = 150): WordMapEntry[] {
  const matches = [...text.matchAll(/\S+/g)];
  const punctuationWeight = Math.max(0, punctuationPaddingMs / 1000);

  return matches.map((match, index) => {
    const word = match[0] ?? "";
    const startChar = match.index ?? 0;
    const endChar = startChar + word.length;
    const trailingPunctuation = /[.,!?;:]+$/.test(word);

    return {
      index,
      word,
      startChar,
      endChar,
      weight: word.length + (trailingPunctuation ? punctuationWeight : 0),
    };
  });
}

export function buildWordTimingMap({
  text,
  durationMs,
  punctuationPaddingMs = 150,
}: {
  text: string;
  durationMs: number;
  punctuationPaddingMs?: number;
}): WordTiming[] {
  const words = createWordMap(text, punctuationPaddingMs);
  if (!words.length || durationMs <= 0) {
    return [];
  }

  const totalWeight = words.reduce((sum, word) => sum + word.weight, 0);
  let cursor = 0;

  return words.map((word, index) => {
    const sliceDuration = index === words.length - 1 ? durationMs - cursor : Math.round((word.weight / totalWeight) * durationMs);
    const start = cursor;
    const end = index === words.length - 1 ? durationMs : Math.min(durationMs, start + Math.max(1, sliceDuration));
    cursor = end;

    return {
      word: word.word,
      index: word.index,
      start,
      end,
    };
  });
}

export function samplesToMilliseconds(sampleCount: number, sampleRate: number) {
  if (!sampleRate || sampleRate <= 0) {
    return 0;
  }

  return Math.round((sampleCount / sampleRate) * 1000);
}

export function chunkFloat32Audio(samples: Float32Array, chunkSize = 4096): AudioChunk[] {
  if (!samples.length) {
    return [];
  }

  const normalizedChunkSize = Math.max(1, Math.floor(chunkSize));
  const chunks: AudioChunk[] = [];

  for (let startSample = 0; startSample < samples.length; startSample += normalizedChunkSize) {
    const endSample = Math.min(samples.length, startSample + normalizedChunkSize);
    chunks.push({
      startSample,
      endSample,
      samples: samples.slice(startSample, endSample),
    });
  }

  return chunks;
}

export function resolveChunkWordRange({
  chunkStartMs,
  chunkEndMs,
  timings,
}: {
  chunkStartMs: number;
  chunkEndMs: number;
  timings: WordTiming[];
}) {
  const overlapping = timings.filter((timing) => timing.end > chunkStartMs && timing.start < chunkEndMs);
  if (!overlapping.length) {
    return { startWordIndex: -1, endWordIndex: -1 };
  }

  return {
    startWordIndex: overlapping[0]?.index ?? -1,
    endWordIndex: overlapping.at(-1)?.index ?? -1,
  };
}

export function findActiveWordIndex(timings: WordTiming[], playbackMs: number) {
  return timings.find((timing) => playbackMs >= timing.start && playbackMs < timing.end)?.index ?? -1;
}

export function decodeWavAudio(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  if (readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") {
    throw new Error("Unsupported WAV container.");
  }

  let offset = 12;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let format = 0;
  let channelCount = 0;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= view.byteLength) {
    const chunkId = readAscii(view, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;

    if (chunkId === "fmt ") {
      format = view.getUint16(chunkDataOffset, true);
      channelCount = view.getUint16(chunkDataOffset + 2, true);
      sampleRate = view.getUint32(chunkDataOffset + 4, true);
      bitsPerSample = view.getUint16(chunkDataOffset + 14, true);
    } else if (chunkId === "data") {
      dataOffset = chunkDataOffset;
      dataSize = chunkSize;
      break;
    }

    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  if (dataOffset < 0 || sampleRate <= 0 || channelCount <= 0) {
    throw new Error("WAV metadata is incomplete.");
  }

  const bytesPerSample = bitsPerSample / 8;
  if (format !== 1 && format !== 3) {
    throw new Error(`Unsupported WAV format ${format}.`);
  }
  if (!bytesPerSample || (format === 1 && bitsPerSample !== 16) || (format === 3 && bitsPerSample !== 32)) {
    throw new Error(`Unsupported WAV bit depth ${bitsPerSample}.`);
  }

  const frameCount = Math.floor(dataSize / (bytesPerSample * channelCount));
  const samples = new Float32Array(frameCount);

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const frameOffset = dataOffset + frameIndex * bytesPerSample * channelCount;
    let monoSample = 0;

    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sampleOffset = frameOffset + channelIndex * bytesPerSample;
      monoSample +=
        format === 3
          ? view.getFloat32(sampleOffset, true)
          : Math.max(-1, view.getInt16(sampleOffset, true) / 0x8000);
    }

    samples[frameIndex] = monoSample / channelCount;
  }

  return { sampleRate, samples, durationMs: samplesToMilliseconds(samples.length, sampleRate) };
}

function readAscii(view: DataView, offset: number, length: number) {
  return String.fromCharCode(...new Uint8Array(view.buffer.slice(offset, offset + length)));
}
