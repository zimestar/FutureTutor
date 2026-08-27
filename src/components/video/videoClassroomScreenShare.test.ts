import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const classroom = readFileSync("src/components/video/VideoClassroom.tsx", "utf8");

/**
 * VIDEO-2A — structural/source-shape contracts for screen sharing and
 * fullscreen. This repo has no React component-rendering test harness
 * (no jsdom/@testing-library/react is installed — see vitest.config.ts's
 * `environment: "node"`), and VIDEO-2A intentionally introduces zero new
 * dependencies. These assertions follow the same established pattern as
 * videoClassroomSecurity.test.ts: reading the component source and
 * asserting the specific wiring that makes each requirement true, rather
 * than rendering the component. Real screen-share initiation (the native
 * browser picker) cannot be exercised headlessly at all and is explicitly
 * left for human staging QA (see the VIDEO-2A closure report).
 */
describe("VIDEO-2A screen share / fullscreen contracts", () => {
  it("gates the share control behind canShareScreen, never unconditionally renders it", () => {
    expect(classroom).toMatch(/canShareScreen\s*&&\s*\(\s*<RoundControl/);
  });

  it("never grants Observer canShareScreen (structural, not just a hidden button)", () => {
    // controlsForVideoRole (videoClassroomPresentation.ts) is the single
    // source of truth this component reads from — asserted directly there
    // in videoClassroomPresentation.test.ts. Here we assert the component
    // never bypasses it with a hardcoded true.
    expect(classroom).not.toMatch(/canShareScreen:\s*true/);
    expect(classroom).toContain("controlsForVideoRole(props.participantRole)");
  });

  it("wires both directions of screen sharing to the Daily call object", () => {
    expect(classroom).toContain("call.startScreenShare()");
    expect(classroom).toContain("call.stopScreenShare()");
  });

  it("registers screen-share lifecycle listeners and the nonfatal-error channel Daily actually uses for share failures", () => {
    for (const event of ["local-screen-share-started", "local-screen-share-stopped", "local-screen-share-canceled", "nonfatal-error"]) {
      expect(classroom).toContain(`call.on("${event}"`);
    }
    // 'screen-share-error' is a DailyNonFatalErrorType value, not its own
    // DailyEvent — asserting we dispatch off event.type, not a fictitious
    // 'screen-share-error' DailyEvent name (which does not typecheck).
    expect(classroom).not.toMatch(/call\.on\("screen-share-error"/);
  });

  it("derives active-share state from live participant track state, never a separately-tracked boolean that could go stale", () => {
    expect(classroom).toContain('tracks.screenVideo.state === "playable"');
  });

  it("gates fullscreen behind an active share and feature support, available to every role including Observer", () => {
    expect(classroom).toMatch(/isSharing\s*&&\s*fullscreenSupported\s*&&/);
    // Fullscreen is rendered from the shared nav in ConnectedClassroom,
    // which every role (including Observer) passes through — asserting it
    // is not additionally wrapped in a role !== "OBSERVER" check.
    expect(classroom).not.toMatch(/role !== "OBSERVER"[\s\S]{0,80}Maximize2/);
  });

  it("wires both directions of the Fullscreen API with graceful rejection handling", () => {
    expect(classroom).toContain("requestFullscreen()");
    expect(classroom).toContain("document.exitFullscreen()");
    expect(classroom).toMatch(/catch\s*\{[\s\S]{0,200}Browser rejected/);
  });

  it("disables (not hides) the share control for the non-sharing side while someone else is sharing", () => {
    expect(classroom).toContain("shareDisabledByOther");
    expect(classroom).toMatch(/disabled=\{shareDisabledByOther\}/);
  });
});
