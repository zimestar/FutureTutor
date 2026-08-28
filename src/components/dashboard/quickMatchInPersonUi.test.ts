import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const form = readFileSync("src/components/dashboard/QuickMatchRequestForm.tsx", "utf8");
const page = readFileSync("src/app/[locale]/dashboard/quick-match/page.tsx", "utf8");
const invitation = readFileSync("src/components/dashboard/TutorInvitationCard.tsx", "utf8");

describe("Quick Match in-person integration boundaries", () => {
  it("renders location fields only for IN_PERSON and leaves ONLINE clean", () => {
    expect(form).toContain('tutoringMode === "IN_PERSON" && <LocationForm />');
    expect(form).not.toContain('tutoringMode !== "ONLINE"');
  });

  it("uses a server-derived guardian management mode for the restriction UX", () => {
    expect(page).toContain('select: { managementMode: true }');
    expect(page).toContain('ownManagementMode === "GUARDIAN_MANAGED"');
    expect(page).toContain("<GuardianManagedLocationNotice />");
  });

  it("passes only dispatch-safe location fields to the Tutor invitation", () => {
    expect(invitation).toContain("ApproximateLocationSummary");
    expect(invitation).not.toContain("addressLine1");
    expect(invitation).not.toContain("arrivalInstructions");
    expect(invitation).not.toContain("latitude");
    expect(invitation).not.toContain("longitude");
  });
});
