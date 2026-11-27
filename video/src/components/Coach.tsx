import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { brand } from "../brand";

/**
 * Alex, the training coach. A flat vector character in brand colours.
 * `talking` animates the mouth (replaced by audio-driven lip flaps once
 * ElevenLabs narration exists); `pose` drives the right arm.
 */
export function Coach({
  talking = false,
  pose = "idle",
  size = 520,
}: {
  talking?: boolean;
  pose?: "idle" | "wave" | "point";
  size?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 14 } });
  const breathe = Math.sin(frame / 18) * 3;
  const wave = pose === "wave" ? Math.sin(frame / 4) * 18 : 0;
  const armAngle = pose === "wave" ? -140 + wave : pose === "point" ? -70 : 10;
  const mouthOpen = talking ? Math.abs(Math.sin(frame / 2.6)) * 10 + 2 : 2;
  const blink = frame % 90 > 86 ? 0.15 : 1;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 400 400"
      style={{ transform: `translateY(${interpolate(enter, [0, 1], [60, 0]) + breathe}px)`, opacity: enter }}
    >
      {/* body */}
      <path d="M110 400 C110 300 150 260 200 260 C250 260 290 300 290 400 Z" fill={brand.blue} />
      <path d="M180 262 L200 300 L220 262 Z" fill={brand.offWhite} />
      {/* left arm */}
      <rect x="92" y="300" width="34" height="95" rx="17" fill={brand.blue} transform="rotate(12 109 305)" />
      {/* right arm, animated around the shoulder */}
      <g transform={`rotate(${armAngle} 285 300)`}>
        <rect x="268" y="300" width="34" height="100" rx="17" fill={brand.blue} />
        <circle cx="285" cy="402" r="19" fill={brand.skin} />
      </g>
      {/* neck and head */}
      <rect x="185" y="225" width="30" height="40" rx="10" fill={brand.skin} />
      <circle cx="200" cy="170" r="72" fill={brand.skin} />
      {/* hair */}
      <path d="M128 165 C128 100 170 88 200 88 C245 88 275 112 272 160 C255 130 225 122 200 124 C170 126 145 140 128 165 Z" fill={brand.hair} />
      {/* eyes */}
      <ellipse cx="176" cy="170" rx="7" ry={9 * blink} fill={brand.navy} />
      <ellipse cx="224" cy="170" rx="7" ry={9 * blink} fill={brand.navy} />
      {/* glasses */}
      <g stroke={brand.navy} strokeWidth="4" fill="none" opacity="0.85">
        <circle cx="176" cy="170" r="20" />
        <circle cx="224" cy="170" r="20" />
        <path d="M196 170 L204 170" />
      </g>
      {/* mouth */}
      <ellipse cx="200" cy="208" rx="16" ry={mouthOpen} fill={brand.navy} />
      {/* name badge */}
      <rect x="160" y="320" width="80" height="30" rx="8" fill={brand.mint} />
      <text x="200" y="341" textAnchor="middle" fontFamily={brand.fontFamily} fontWeight={700} fontSize="18" fill={brand.offWhite}>
        Alex
      </text>
    </svg>
  );
}
