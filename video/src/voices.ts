import type { Locale } from "./brand";

/**
 * ElevenLabs voices of the coach Alex, chosen by the owner on 2026-11-27:
 * Nicolas (French, international accent) and Eric (American English).
 */
export const ALEX_VOICES: Record<Locale, { name: string; voiceId: string }> = {
  fr: { name: "Nicolas - Narrator", voiceId: "aQROLel5sQbj1vuIVi6B" },
  en: { name: "Eric - Smooth, Trustworthy", voiceId: "cjVigY5qzO86Huf0OWal" },
};

export const ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";

export const ALEX_VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.15,
  use_speaker_boost: true,
} as const;
