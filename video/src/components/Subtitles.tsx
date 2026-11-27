import { interpolate, useCurrentFrame } from "remotion";
import { brand } from "../brand";

/**
 * Subtitles for one shot: the narration is split into sentences, each shown
 * for a share of the shot proportional to its length (narration pace is even
 * enough for this to stay in sync).
 */
export function Subtitles({ text, durationInFrames, dark = false }: { text: string; durationInFrames: number; dark?: boolean }) {
  const frame = useCurrentFrame();
  const sentences = text.match(/[^.!?]+[.!?]+["»]?|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [text];
  const total = sentences.reduce((sum, sentence) => sum + sentence.length, 0);

  let start = 0;
  let current = sentences[sentences.length - 1];
  for (const sentence of sentences) {
    const length = (sentence.length / total) * durationInFrames;
    if (frame < start + length) {
      current = sentence;
      break;
    }
    start += length;
  }
  const opacity = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: "clamp" });

  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 48, display: "flex", justifyContent: "center", opacity }}>
      <div
        style={{
          maxWidth: 1300,
          padding: "14px 28px",
          borderRadius: 14,
          background: dark ? "rgba(248, 250, 252, 0.94)" : "rgba(13, 27, 42, 0.88)",
          color: dark ? brand.navy : brand.offWhite,
          fontFamily: brand.fontFamily,
          fontSize: 36,
          lineHeight: 1.35,
          textAlign: "center",
        }}
      >
        {current}
      </div>
    </div>
  );
}
