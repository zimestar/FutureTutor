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
