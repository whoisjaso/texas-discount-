// The narration as the Narrated film plays it. TEMPLATE COPY: empty. recordly-demo scripts/voice/prepare-vo.py writes
// this file from the approved takes (public/vo/<id>.wav: one gain for the set, limited, trimmed to speech) and
// narration/words.json (faster-whisper small.en word timestamps). Never edit it by hand.
export type VoLine = { id: string; sec: number; text: string; words: [string, number][] };
export const VO_LINES: VoLine[] = [];
