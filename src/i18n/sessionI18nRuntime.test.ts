import { createTranslator } from "use-intl/core";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { sessionStateTranslationKeys, type SessionArrivalPresentation } from "@/lib/sessionPresentation";

const PRESENTATIONS: SessionArrivalPresentation[] = [
  "preWindow", "ready", "waitingForTutor", "waitingForStudent",
  "graceReady", "graceWaitingForTutor", "graceWaitingForStudent", "deadlinePending",
  "inProgress", "completionPending", "completed", "interrupted",
  "studentNoShow", "tutorNoShow", "neutralNoShow", "unavailable",
];

describe("Session runtime i18n namespace contract", () => {
  for (const [locale, messages] of [["en", en], ["fr", fr]] as const) {
    it(`resolves every presentation-emitted state key under sessionExperience in ${locale}`, () => {
      const t = createTranslator({ locale, messages, namespace: "sessionExperience", onError: (error) => { throw error; } });
      for (const presentation of PRESENTATIONS) {
        const keys = sessionStateTranslationKeys(presentation);
        for (const key of [keys.label, keys.title, keys.description]) {
          const resolved = t(key, { opensAt: "10:00", endTime: "11:00", name: "Sam" });
          expect(resolved).toBeTruthy();
          expect(resolved).not.toContain("sessionExperience.");
          expect(resolved).not.toBe(key);
        }
      }
      for (const key of ["details.startedAt", "details.completedAt", "details.endedAt"] as const) {
        expect(t(key)).not.toContain("sessionExperience.");
      }
    });

    it(`resolves the exact scoped client-component namespaces without unresolved keys in ${locale}`, () => {
      const interruption = createTranslator({ locale, messages, namespace: "sessionExperience.interruption", onError: (error) => { throw error; } });
      const completion = createTranslator({ locale, messages, namespace: "sessionExperience.completion", onError: (error) => { throw error; } });
      const renderedCopy = [
        interruption("summary"), interruption("trigger"), interruption("dialogTitle"), interruption("confirm"),
        completion("checking"), completion("retry"),
      ].join(" | ");
      expect(renderedCopy).not.toContain("sessionExperience.");
      expect(renderedCopy).not.toContain("interruption.summary");
      expect(renderedCopy).not.toContain("completion.checking");
    });
  }
});
