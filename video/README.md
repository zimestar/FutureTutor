# FutureTutor training capsules

Motion-graphics capsules for the tutor training (lot 3), written as React
components and rendered to MP4 with [Remotion](https://www.remotion.dev).
Remotion's free license covers companies of up to 3 employees (FYRA
Services Inc., confirmed 2026-11-27); re-check the license if that changes.

Scripts live in `docs/training/` (one file per module). This package is
separate from the web app so its dependencies never reach the site bundle.

```bash
cd video
npm install
npm run studio                         # live preview in the browser
npm run render -- Module00-fr out/module-00-fr.mp4
```

Brand colours come from the web app (`src/app/globals.css`): navy #0D1B2A,
blue #2563EB, mint #10B981, off-white #F8FAFC.

Voices: ElevenLabs (owner's account), one French-Canadian and one English
voice for the coach Alex. Narration audio files go in `public/audio/` and
are referenced by each scene; subtitles are generated from the script text.
