/**
 * Generates the narration of a capsule with ElevenLabs, one MP3 per shot and
 * language, into public/audio/<module>/<locale>/<shot>.mp3.
 *
 *   ELEVENLABS_API_KEY must be set in the environment (never printed).
 *   npx tsx scripts/generate-voices.ts module00 [--force]
 *
 * Existing files are kept unless --force: re-running only fills the gaps, so
 * credits are spent once per shot. Neighbouring shots are passed as
 * previous_text/next_text so the intonation flows across shots.
 */
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ALEX_VOICES, ALEX_VOICE_SETTINGS, ELEVENLABS_MODEL_ID } from "../src/voices";
import { MODULE00_SHOTS, type Shot } from "../src/scripts/module00";
import type { Locale } from "../src/brand";

const MODULES: Record<string, Shot[]> = { module00: MODULE00_SHOTS };
const LOCALES: Locale[] = ["fr", "en"];

async function main() {
  const [moduleId, flag] = process.argv.slice(2);
  const shots = MODULES[moduleId ?? ""];
  if (!shots) throw new Error(`Unknown module. Known: ${Object.keys(MODULES).join(", ")}`);
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");
  const force = flag === "--force";

  for (const locale of LOCALES) {
    const dir = join("public", "audio", moduleId, locale);
    mkdirSync(dir, { recursive: true });
    for (const [index, shot] of shots.entries()) {
      const file = join(dir, `${shot.id}.mp3`);
      if (existsSync(file) && !force) {
        console.log(`skip ${file}`);
        continue;
      }
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${ALEX_VOICES[locale].voiceId}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: { "xi-api-key": apiKey, "content-type": "application/json" },
          body: JSON.stringify({
            text: shot.text[locale],
            model_id: ELEVENLABS_MODEL_ID,
            voice_settings: ALEX_VOICE_SETTINGS,
            previous_text: shots[index - 1]?.text[locale],
            next_text: shots[index + 1]?.text[locale],
          }),
        }
      );
      if (!response.ok) throw new Error(`ElevenLabs ${response.status} for ${file}`);
      writeFileSync(file, Buffer.from(await response.arrayBuffer()));
      console.log(`wrote ${file}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
