import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { getStudentDashboardNavItems } from "@/lib/dashboardNav";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("INFRA-1E manual QA defect contracts", () => {
  it("renders every select with a font-independent Lucide chevron", () => {
    const selectSource = read("src/components/ui/Input.tsx");
    expect(selectSource).toContain('import { ChevronDown } from "lucide-react"');
    expect(selectSource).toContain("<ChevronDown");
    expect(selectSource).toContain('aria-hidden="true"');
    expect(selectSource).toContain("pointer-events-none");
    expect(selectSource).not.toContain("data:image/svg+xml");

    for (const sourcePath of [
      "src/components/dashboard/InterviewRubricForm.tsx",
      "src/components/dashboard/TutorPayoutTierSelect.tsx",
      "src/app/[locale]/admin/tutors/[id]/page.tsx",
    ]) {
      expect(read(sourcePath)).not.toContain("<select");
      expect(read(sourcePath)).toContain("<Select");
    }
  });

  it.each([
    ["en", en.dashboard.nav.findTutor],
    ["fr", fr.dashboard.nav.findTutor],
  ])("keeps the %s learner navigation in the authenticated tutor directory", (_locale, label) => {
    const items = getStudentDashboardNavItems((key) => key === "findTutor" ? label : key, "STUDENT");
    const findTutor = items.find((item) => item.label === label);
    expect(findTutor?.href).toBe("/dashboard/find-tutors");
    expect(findTutor?.href).not.toBe("/find-tutors");
  });

  it("renders the authenticated directory inside the dashboard shell", () => {
    const page = read("src/app/[locale]/dashboard/find-tutors/page.tsx");
    const search = read("src/components/marketing/TutorSearch.tsx");
    expect(page).toContain("<DashboardShell");
    expect(page).toContain("user.role !== \"STUDENT\"");
    expect(page).toContain("user.role !== \"PARENT\"");
    expect(page).not.toContain("MarketingShell");
    expect(search).toContain('resultsPath = "/find-tutors"');
    expect(search).toContain("router.push(`${resultsPath}?");
  });

  it.each([
    ["en", en.tutorProfilePage.backToTutorSearch],
    ["fr", fr.tutorProfilePage.backToTutorSearch],
  ])("provides a localized, touch-sized %s mobile profile return", (_locale, label) => {
    const profile = read("src/app/[locale]/tutors/[slug]/page.tsx");
    expect(label.length).toBeGreaterThan(0);
    expect(profile).toContain('href="/dashboard/find-tutors"');
    expect(profile).toContain('tProfile("backToTutorSearch")');
    expect(profile).toContain("min-h-11");
    expect(profile).toContain("lg:hidden");
    expect(profile).toContain('aria-label={tProfile("backToTutorSearch")}');
  });

  it("keeps authenticated dashboard CTAs off the public tutor-search route", () => {
    for (const sourcePath of [
      "src/app/[locale]/dashboard/page.tsx",
      "src/app/[locale]/dashboard/bookings/page.tsx",
      "src/app/[locale]/dashboard/favorites/page.tsx",
      "src/lib/dashboardNav.ts",
      "src/lib/sessionPresentation.ts",
    ]) {
      expect(read(sourcePath)).not.toContain('"/find-tutors"');
      expect(read(sourcePath)).toContain('"/dashboard/find-tutors"');
    }
  });
});
