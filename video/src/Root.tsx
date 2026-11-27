import { Composition } from "remotion";
import { Module00, MODULE00_FRAMES } from "./modules/Module00";

/** One composition per module and language: <Module>-<locale>. */
export function Root() {
  return (
    <>
      <Composition id="Module00-fr" component={Module00} defaultProps={{ locale: "fr" as const }} durationInFrames={MODULE00_FRAMES} fps={30} width={1920} height={1080} />
      <Composition id="Module00-en" component={Module00} defaultProps={{ locale: "en" as const }} durationInFrames={MODULE00_FRAMES} fps={30} width={1920} height={1080} />
    </>
  );
}
