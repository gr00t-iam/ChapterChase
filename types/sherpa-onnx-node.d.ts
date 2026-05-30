declare module "sherpa-onnx-node" {
  export type GeneratedAudio = {
    samples: Float32Array;
    sampleRate: number;
  };

  export type OfflineTtsConfig = {
    model?: {
      kokoro?: {
        model?: string;
        voices?: string;
        tokens?: string;
        dataDir?: string;
        lengthScale?: number;
        lexicon?: string;
        lang?: string;
      };
    };
    maxNumSentences?: number;
    silenceScale?: number;
    numThreads?: number;
    debug?: boolean | number;
    provider?: string;
  };

  export class OfflineTts {
    constructor(config: OfflineTtsConfig);
    sampleRate: number;
    numSpeakers: number;
    generate(config: { text: string; sid?: number; speed?: number }): GeneratedAudio;
  }
}
