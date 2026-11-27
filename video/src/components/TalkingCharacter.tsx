import { staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import type { CSSProperties } from "react";
import { Character, type CharacterLook, type CharacterPalette } from "./Character";

/**
 * A character whose mouth follows the narration: while the voice is loud the
 * face switches to an open-mouth expression, otherwise to the resting one.
 * `audioSrc` is a path under public/ (the same file the shot plays).
 */
export function TalkingCharacter({
  audioSrc,
  look,
  palette,
  restingFace = "Smile",
  talkingFace = "Explaining",
  style,
}: {
  audioSrc: string;
  look: Omit<CharacterLook, "face">;
  palette: CharacterPalette;
  restingFace?: string;
  talkingFace?: string;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useAudioData(staticFile(audioSrc));

  let talking = false;
  if (audioData) {
    const spectrum = visualizeAudio({ fps, frame, audioData, numberOfSamples: 16 });
    const loudness = spectrum.reduce((sum, value) => sum + value, 0) / spectrum.length;
    // Hold the mouth open on alternate frames while speaking, which reads as natural speech.
    talking = loudness > 0.012 && Math.floor(frame / 3) % 2 === 0;
  }

  return <Character look={{ ...look, face: talking ? talkingFace : restingFace }} palette={palette} style={style} />;
}
