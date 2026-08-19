import { createTranslator } from "use-intl/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { TutorEarningStatus } from "@/components/dashboard/TutorEarningStatus";
import { presentTutorEarning } from "./tutorEarningPresentation";

const futureEligibility = new Date("2026-08-21T18:30:00.000Z");
const cases = [
  { status: "PENDING_ELIGIBLE", eligibleAt: null, key: "pendingOutcome", showsDate: false },
  { status: "PENDING_ELIGIBLE", eligibleAt: futureEligibility, key: "pendingEligibility", showsDate: true },
  { status: "ELIGIBLE", eligibleAt: futureEligibility, key: "eligible", showsDate: false },
  { status: "HELD", eligibleAt: null, key: "held", showsDate: false },
  { status: "TRANSFERRED", eligibleAt: futureEligibility, key: "transferred", showsDate: false },
  { status: "CANCELLED", eligibleAt: null, key: "cancelled", showsDate: false },
] as const;

function translator(locale: "en" | "fr") {
  return createTranslator({
    locale,
    messages: locale === "en" ? en : fr,
    namespace: "tutorPayouts",
    onError: (error) => { throw error; },
  }) as unknown as (key: string, values?: Record<string, string>) => string;
}

describe("Phase-5B Tutor earning presentation", () => {
  it.each(cases)("maps $status / $eligibleAt to $key without making a financial decision", ({ status, eligibleAt, key, showsDate }) => {
    expect(presentTutorEarning(status, eligibleAt)).toMatchObject({ key, showEligibilityDate: showsDate });
  });

  it("never formats or fabricates an eligibility date when eligibleAt is null", () => {
    const presentation = presentTutorEarning("PENDING_ELIGIBLE", null);
    const html = renderToStaticMarkup(
      <TutorEarningStatus presentation={presentation} label="Pending session outcome" description="No eligibility date is available yet." />
    );
    expect(presentation.showEligibilityDate).toBe(false);
    expect(html).not.toMatch(/Invalid Date|1970|Eligible on/);
  });

  for (const locale of ["en", "fr"] as const) {
    it(`resolves every Phase-5B presentation in ${locale} without raw keys or promises`, () => {
      const t = translator(locale);
      for (const { key } of cases) {
        const copy = `${t(`earningPresentation.${key}.label`)} ${t(`earningPresentation.${key}.description`)}`;
        expect(copy).not.toContain("earningPresentation.");
        expect(copy).not.toMatch(/refund|rembours|guaranteed|garanti/i);
      }
    });
  }

  it("renders every state and shows the authoritative date only for pending eligibility", () => {
    const t = translator("en");
    for (const row of cases) {
      const presentation = presentTutorEarning(row.status, row.eligibleAt);
      const html = renderToStaticMarkup(
        <TutorEarningStatus
          presentation={presentation}
          label={t(`earningPresentation.${presentation.key}.label`)}
          description={t(`earningPresentation.${presentation.key}.description`)}
          eligibilityDateLabel={presentation.showEligibilityDate && row.eligibleAt
            ? t("earningPresentation.pendingEligibility.eligibleAt", { date: row.eligibleAt.toISOString() })
            : undefined}
        />
      );
      expect(html).toContain("data-testid=\"earning-presentation\"");
      expect(html).not.toMatch(/tutorPayouts\.|earningPresentation\./);
      expect(html.includes(futureEligibility.toISOString())).toBe(row.showsDate);
    }
  });
});
