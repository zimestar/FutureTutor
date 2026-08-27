import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const classroom = readFileSync("src/components/video/VideoClassroom.tsx", "utf8");
const tile = readFileSync("src/components/video/ParticipantTile.tsx", "utf8");

/**
 * VIDEO-2A.1 — structural contracts for the intermittent-remote-video fix
 * and the object-fit/identity polish. Same reasoning as
 * videoClassroomScreenShare.test.ts: this repo has no React
 * component-rendering harness, so the event-wiring and DOM-attribute
 * choices that can't be expressed as pure functions are asserted at the
 * source level; the actual show/hide *decision* is covered by real unit
 * tests against `shouldRenderParticipantVideo`
 * (videoClassroomPresentation.test.ts).
 */
describe("VIDEO-2A.1 remote video reliability contracts", () => {
  it("registers Daily's track-level events, not just participant-level events, as a render trigger", () => {
    expect(classroom).toContain('call.on("track-started"');
    expect(classroom).toContain('call.on("track-stopped"');
  });

  it("routes every render-affecting Daily event through the same fresh refreshParticipants() read, never a stale snapshot", () => {
    const trackStartedHandler = classroom.match(/const onTrackStarted = \(\) => ([^;]+);/)?.[1];
    const trackStoppedHandler = classroom.match(/const onTrackStopped = \(\) => ([^;]+);/)?.[1];
    expect(trackStartedHandler).toBe("refreshParticipants()");
    expect(trackStoppedHandler).toBe("refreshParticipants()");
  });

  it("derives the render decision via the pure, tested helper — not an inline re-implementation", () => {
    expect(classroom).toContain("shouldRenderParticipantVideo({ local: isLocal, videoTrackState: participant.tracks.video.state }, cameraOn)");
  });

  it("does not gate remote video visibility on any screen-share state", () => {
    // The render decision call site must not reference isSharing/share
    // state at all — visibility depends only on (participant, cameraOn).
    const callSite = classroom.match(/cameraOn=\{shouldRenderParticipantVideo\([^)]*\)\}/)?.[0] ?? "";
    expect(callSite).not.toMatch(/isSharing|Sharing/);
  });

  it("uses no polling/remount hacks to force video visibility (no setInterval driving participant refresh, no key-based remount trick)", () => {
    expect(classroom).not.toMatch(/setInterval\(\(\) => refreshParticipants/);
    expect(classroom).not.toMatch(/key=\{.*(now|Date\.now|Math\.random)/);
  });

  it("uses object-contain for participant camera video (never crops a face)", () => {
    expect(tile).toMatch(/<video[^>]*object-contain/);
    expect(tile).not.toMatch(/<video[^>]*object-cover/);
  });

  it("suppresses a redundant role label when it duplicates the display name (e.g. an unset-name fallback)", () => {
    expect(tile).toContain("roleLabel !== name");
  });

  it("Observer is excluded from the Tutor/Student grid by construction (role-bucketed lookup, not participant order)", () => {
    expect(classroom).toContain('roleOfParticipant(p) === "TUTOR"');
    expect(classroom).toContain('roleOfParticipant(p) === "STUDENT"');
    // No fallback path that would let a third connected participant (the
    // Observer) fill in for a missing Tutor/Student slot.
    expect(classroom).not.toMatch(/find\(\(p\) => !p\.local\)/);
  });
});

/**
 * VIDEO-2A.2 — the intermittent remote-video defect was NOT fully closed by
 * VIDEO-2A.1's event-wiring fix alone: a `useEffect` dependency array is
 * compared against the previous render of the SAME component instance, not
 * against whether a child DOM element just mounted. The old code
 * conditionally mounted/unmounted the <video> element based on camera
 * on/off state while keying its attachment effect only on `[track]` — so a
 * freshly-mounted node whose `track` value happened not to have changed
 * since the last render never got `srcObject` assigned. These assertions
 * guard the actual fix: the element's presence must never depend on
 * `track`/`cameraOn`.
 */
describe("VIDEO-2A.2 media element attachment lifecycle", () => {
  it("never conditionally mounts/unmounts the participant <video> element based on camera-on state", () => {
    expect(tile).not.toMatch(/\{showVideo \? <video/);
    expect(tile).not.toMatch(/\{track \? <video/);
  });

  it("never conditionally mounts/unmounts the screen-share <video> element based on track presence", () => {
    expect(classroom).not.toMatch(/\{track \? <video/);
  });

  it("toggles video visibility via a CSS class on a persistently-mounted element, not JSX presence", () => {
    expect(tile).toMatch(/<video[\s\S]{0,200}!showVideo[\s\S]{0,20}"hidden"/);
    expect(classroom).toMatch(/<video[\s\S]{0,200}!track[\s\S]{0,20}"hidden"/);
  });

  it("explicitly calls play() after assigning srcObject, not relying solely on the autoPlay attribute", () => {
    expect(tile).toMatch(/video\.play\(\)\.catch/);
    expect(classroom).toMatch(/video\.play\(\)\.catch/);
  });
});

describe("VIDEO-2A.2 desktop classroom layout", () => {
  it("renders an explicit, symmetric two-tile desktop grid, separate from the mobile PiP layout", () => {
    expect(classroom).toContain('data-testid="desktop-participant-grid"');
    // Equal-weight tiles: identical sizing classes for both slots, not a
    // primary/secondary asymmetric pair.
    const desktopGrid = classroom.match(/data-testid="desktop-participant-grid"[\s\S]{0,900}/)?.[0] ?? "";
    const tileClassMatches = [...desktopGrid.matchAll(/className="aspect-video[^"]*"/g)].map((m) => m[0]);
    expect(tileClassMatches.length).toBe(2);
    expect(tileClassMatches[0]).toBe(tileClassMatches[1]);
  });

  it("keeps the desktop grid gated to lg: and the mobile PiP layout gated to lg:hidden, never both visible at once", () => {
    expect(classroom).toMatch(/hidden h-full items-center justify-center gap-4 p-4 lg:flex/);
    expect(classroom).toMatch(/relative h-full min-h-\[24rem\] w-full lg:hidden/);
  });
});

describe("VIDEO-2A.2 in-session device settings", () => {
  it("adds a Settings control to the classroom nav, reusing the existing RoundControl pattern", () => {
    expect(classroom).toMatch(/icon=\{Settings\}[\s\S]{0,80}label=\{t\("controls\.settings"\)\}/);
  });

  it("hides Settings for Observer (no publish capability, nothing to configure)", () => {
    const settingsControl = classroom.match(/\{\(canPublishAudio \|\| canPublishVideo\) && \([\s\S]{0,200}\)\}/)?.[0] ?? "";
    expect(settingsControl).toContain("RoundControl");
    expect(settingsControl).toContain("icon={Settings}");
  });

  it("reuses the existing device-switch mechanism (setInputDevicesAsync via changeDevice) — no parallel getUserMedia system", () => {
    // Both setInputDevicesAsync calls live inside the single shared
    // `changeDevice` function (audio/video branches) — Settings and PreJoin
    // both funnel through the same function, not a duplicated mechanism.
    const changeDeviceBody = classroom.match(/async function changeDevice\([\s\S]{0,600}?\n  \}/)?.[0] ?? "";
    expect(changeDeviceBody).toContain("call.setInputDevicesAsync");
    const outsideChangeDevice = classroom.replace(changeDeviceBody, "");
    expect(outsideChangeDevice).not.toContain("setInputDevicesAsync");
    expect(classroom).not.toMatch(/navigator\.mediaDevices\.getUserMedia/);
  });

  it("listens to Daily's own device-change events instead of polling enumerateDevices", () => {
    expect(classroom).toContain('call.on("available-devices-updated"');
    expect(classroom).toContain('call.on("selected-devices-updated"');
    expect(classroom).not.toMatch(/setInterval\([^)]*enumerateDevices/);
  });

  it("does not invent an unsupported output-routing API (speaker selection intentionally out of scope this pass)", () => {
    expect(classroom).not.toMatch(/setOutputDeviceAsync|setSinkId/);
  });

  it("reuses the existing accessible Dialog primitive (focus trap, Escape-to-close) rather than a bespoke modal", () => {
    expect(classroom).toContain('import { ConfirmationDialog, Dialog } from "@/components/ui/Dialog"');
    expect(classroom).toMatch(/<Dialog open=\{settingsOpen\}/);
  });
});
