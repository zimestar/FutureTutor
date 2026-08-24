import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const action = readFileSync("src/lib/actions/video.ts", "utf8");
const classroom = readFileSync("src/components/video/VideoClassroom.tsx", "utf8");
const provider = readFileSync("src/services/dailyVideoProvider.ts", "utf8");

describe("VIDEO-1C security contracts", () => {
  it("reauthorizes every credential request on the server", () => {
    expect(action).toContain('"use server"');
    expect(action).toContain("await auth()");
    expect(action).toContain("requestVideoJoinToken(");
    expect(action).toContain("freshUser.role");
  });

  it("keeps credentials in memory and never creates client attendance evidence", () => {
    expect(classroom).not.toMatch(/localStorage|sessionStorage|console\.|confirmVideoParticipantJoined|recordSessionCheckIn/);
    expect(classroom).toContain("requestVideoJoinCredentialAction");
    expect(classroom).toContain("credential.token");
    expect(classroom).toContain("credential.joinUrl");
  });

  it("never imports server provider secrets into the client component", () => {
    expect(classroom).not.toMatch(/DAILY_API_KEY|DAILY_WEBHOOK_SECRET|dailyClient|dailyVideoProvider|videoJoinAuthorization/);
    expect(provider).toContain("permissions: isObserver");
    expect(provider).toContain("canSend: []");
  });
});
