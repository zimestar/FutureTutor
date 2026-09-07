import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "UpcomingSessionCard.tsx"), "utf8");
const sourceWithoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("UpcomingSessionCard.tsx", () => {
  it("is a pure presentational component — every string prop is already resolved, no translation/formatting/data-fetching import exists here", () => {
    expect(sourceWithoutComments).not.toContain("next-intl");
    expect(sourceWithoutComments).not.toContain("@/lib/db");
    expect(sourceWithoutComments).not.toContain("formatBookingTime");
    expect(sourceWithoutComments).not.toContain("Intl.DateTimeFormat");
  });

  it("subject is displayed", () => {
    expect(source).toContain("{subjectLabel}");
  });

  it("tutor is displayed via an already-interpolated string, never a raw name + template concatenated here", () => {
    expect(source).toContain("{withTutorText}");
  });

  it("student context for a parent viewer is shown only when provided, never a bare student name", () => {
    expect(source).toMatch(/\{forLearnerText && \(/);
    expect(source).toContain("{forLearnerText}");
  });

  it("mode is displayed as a Badge", () => {
    expect(source).toMatch(/<Badge[^>]*>\s*\{modeLabel\}/);
  });

  it("the 'next session' label only renders for the first item in a list (isNext), never unconditionally", () => {
    expect(source).toMatch(/\{isNext && \(/);
  });

  it("the primary CTA links into the existing server-authorized /session/[bookingId] route, never reproducing classroom-entry logic locally", () => {
    expect(source).toContain("href={viewSessionHref}");
    expect(sourceWithoutComments).not.toMatch(/checkInWindowOpensAt|graceDeadlineAt/);
  });

  it("the view-session CTA is omitted (not a disabled/broken link) when viewSessionHref is null", () => {
    expect(source).toMatch(/\{viewSessionHref && \(/);
  });

  it("the message-tutor CTA routes through the existing /messages inbox, never a new conversation-resolution path", () => {
    expect(source).toContain("href={messageTutorHref}");
    expect(source).not.toMatch(/ensureConversationAccess|conversationId=/);
  });

  it("no internal id is exposed as visible text — bookingId is used only inside id/aria-labelledby template literals, never rendered as bare JSX text content", () => {
    expect(source).not.toMatch(/>\s*\{bookingId\}\s*</);
  });

  it("no fixed pixel widths — mobile-safe, uses flex/truncate", () => {
    expect(source).not.toMatch(/width:\s*\d+px/);
    expect(source).toContain("flex-wrap");
    expect(source).toContain("truncate");
  });

  it("never touches Booking/Session/Payment/Notification/Message state — a pure display component", () => {
    expect(source).not.toMatch(/db\.\w+\.(create|update|delete|upsert)/);
  });
});
