import { interpolate, useCurrentFrame } from "remotion";
import { brand } from "../brand";

/** Burned-in subtitle at the bottom of the frame (fades in and out). */
export function Caption({ text, durationInFrames }: { text: string; durationInFrames: number }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8, durationInFrames - 8, durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        left: 160,
        right: 160,
        bottom: 60,
        display: "flex",
        justifyContent: "center",
        opacity,
      }}
    >
      <div
        style={{
          background: "rgba(13, 27, 42, 0.86)",
          color: brand.offWhite,
          fontFamily: brand.fontFamily,
          fontSize: 38,
          lineHeight: 1.35,
          padding: "16px 28px",
          borderRadius: 14,
          textAlign: "center",
          maxWidth: 1400,
        }}
      >
        {text}
      </div>
    </div>
  );
}
