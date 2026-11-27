import { AbsoluteFill, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { brand, type Locale } from "../brand";
import { Coach } from "../components/Coach";
import { Caption } from "../components/Caption";

/**
 * Module 0 — capsule prototype (shots 1, 2 and 4 of docs/training/module-00-welcome.md).
 * Durations are placeholders until the ElevenLabs narration sets the real timing.
 */

const COPY: Record<Locale, { s1: string; s2: string; s3: string; badges: [string, string, string] }> = {
  fr: {
    s1: "Bonjour, et bienvenue chez FutureTutor ! Je m'appelle Alex, et je vais vous accompagner tout au long de votre formation.",
    s2: "Notre mission est simple : aider chaque élève à progresser, grâce à un tuteur qualifié, en ligne ou en personne.",
    s3: "Chaque tuteur FutureTutor prend trois engagements : la compétence, la sécurité et la fiabilité.",
    badges: ["Compétence", "Sécurité", "Fiabilité"],
  },
  en: {
    s1: "Hi, and welcome to FutureTutor! I'm Alex, and I'll be with you throughout your training.",
    s2: "Our mission is simple: help every student move forward with a qualified tutor, online or in person.",
    s3: "Every FutureTutor tutor makes three commitments: competence, safety and reliability.",
    badges: ["Competence", "Safety", "Reliability"],
  },
};

export const SHOT_FRAMES = { s1: 210, s2: 210, s3: 270 } as const;
export const MODULE00_FRAMES = SHOT_FRAMES.s1 + SHOT_FRAMES.s2 + SHOT_FRAMES.s3;

function Wordmark() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 12 } });
  return (
    <div style={{ position: "absolute", top: 70, left: 110, fontFamily: brand.fontFamily, fontWeight: 800, fontSize: 64, color: brand.offWhite, transform: `scale(${pop})`, transformOrigin: "left center" }}>
      Future<span style={{ color: brand.mint }}>Tutor</span>
    </div>
  );
}

function Welcome({ text }: { text: string }) {
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 70% 40%, #1E3A8A 0%, ${brand.navy} 70%)` }}>
      <Wordmark />
      <div style={{ position: "absolute", right: 260, bottom: 250 }}>
        <Coach pose="wave" talking size={620} />
      </div>
      <Caption text={text} durationInFrames={SHOT_FRAMES.s1} />
    </AbsoluteFill>
  );
}

function Mission({ text }: { text: string }) {
  const frame = useCurrentFrame();
  const bulb = interpolate(frame, [70, 100], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: brand.offWhite }}>
      {/* the stuck student: a desk, a notebook, a question mark that turns into a light bulb */}
      <div style={{ position: "absolute", left: 260, top: 230, width: 560, height: 380, borderRadius: 32, background: brand.blueLight }} />
      <div style={{ position: "absolute", left: 360, top: 330, width: 360, height: 220, borderRadius: 16, background: "white", boxShadow: "0 10px 30px rgba(13,27,42,0.12)" }}>
        {[0, 1, 2, 3].map((line) => (
          <div key={line} style={{ margin: "34px 40px 0", height: 12, borderRadius: 6, background: brand.blueLight, width: `${80 - line * 12}%` }} />
        ))}
      </div>
      <div style={{ position: "absolute", left: 500, top: 120, fontFamily: brand.fontFamily, fontSize: 150, fontWeight: 800, color: brand.slate, opacity: 1 - bulb }}>?</div>
      <svg style={{ position: "absolute", left: 470, top: 90, opacity: bulb, transform: `scale(${0.6 + bulb * 0.4})` }} width="160" height="200" viewBox="0 0 80 100">
        <circle cx="40" cy="38" r="30" fill={brand.warm} />
        <rect x="28" y="66" width="24" height="18" rx="4" fill={brand.slate} />
      </svg>
      <div style={{ position: "absolute", right: 230, bottom: 250 }}>
        <Coach pose="point" talking size={560} />
      </div>
      <Caption text={text} durationInFrames={SHOT_FRAMES.s2} />
    </AbsoluteFill>
  );
}

function Commitments({ text, badges }: { text: string; badges: [string, string, string] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const colors = [brand.blue, brand.mint, brand.warm];
  return (
    <AbsoluteFill style={{ background: brand.navy }}>
      <div style={{ position: "absolute", top: 230, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 70 }}>
        {badges.map((label, index) => {
          const appear = spring({ frame: frame - 25 - index * 35, fps, config: { damping: 11 } });
          return (
            <div
              key={label}
              style={{
                width: 380,
                height: 380,
                borderRadius: 190,
                background: colors[index],
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: `scale(${appear})`,
                boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
              }}
            >
              <span style={{ fontFamily: brand.fontFamily, fontWeight: 800, fontSize: 52, color: "white" }}>{label}</span>
            </div>
          );
        })}
      </div>
      <Caption text={text} durationInFrames={SHOT_FRAMES.s3} />
    </AbsoluteFill>
  );
}

export function Module00({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={SHOT_FRAMES.s1}>
        <Welcome text={copy.s1} />
      </Sequence>
      <Sequence from={SHOT_FRAMES.s1} durationInFrames={SHOT_FRAMES.s2}>
        <Mission text={copy.s2} />
      </Sequence>
      <Sequence from={SHOT_FRAMES.s1 + SHOT_FRAMES.s2} durationInFrames={SHOT_FRAMES.s3}>
        <Commitments text={copy.s3} badges={copy.badges} />
      </Sequence>
    </AbsoluteFill>
  );
}
