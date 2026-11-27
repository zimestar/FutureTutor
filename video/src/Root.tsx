import { Composition } from "remotion";
import { Module00, calculateModule00Metadata } from "./modules/Module00";
import { PeepsColorTest } from "./tests/PeepsColorTest";

/** One composition per module and language: <Module>-<locale>. Durations follow the narration. */
export function Root() {
  return (
    <>
      {(["fr", "en"] as const).map((locale) => (
        <Composition
          key={locale}
          id={`Module00-${locale}`}
          component={Module00}
          defaultProps={{ locale, shotFrames: [] }}
          calculateMetadata={calculateModule00Metadata}
          durationInFrames={300}
          fps={30}
          width={1920}
          height={1080}
        />
      ))}
      <Composition id="PeepsColorTest" component={PeepsColorTest} durationInFrames={1} fps={30} width={1920} height={1080} />
    </>
  );
}
