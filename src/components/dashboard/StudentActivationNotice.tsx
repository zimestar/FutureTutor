import { getTranslations } from "next-intl/server";
import type { StudentAccountActivationState } from "@/services/familyManagement";

/**
 * Phase H.5 Final Claimant-State UX Correction. Replaces the old
 * PendingStudentActivation, which incorrectly rendered the same "waiting
 * for approval" copy for every no-profile STUDENT session regardless of
 * whether a live claim actually existed. Renders nothing for ACTIVE — the
 * caller is expected to check for that state itself and render normal page
 * content instead of this component. For every other state, the copy is
 * deliberately narrow: no state here offers a self-service way to create a
 * new invitation or attach a profile (see the H.5 §27 fail-closed rule this
 * inherits) — the only action offered anywhere is "contact your guardian"
 * or "sign out," the latter already available via DashboardShell's header.
 */
export async function StudentActivationNotice({ state }: { state: StudentAccountActivationState }) {
  if (state.state === "ACTIVE") return null;

  const namespace =
    state.state === "PENDING_GUARDIAN_APPROVAL"
      ? "family.studentPendingActivation"
      : state.state === "REJECTED_OR_REVOKED"
        ? "family.studentRejectedActivation"
        : state.state === "EXPIRED"
          ? "family.studentExpiredActivation"
          : "family.studentUnlinkedActivation";

  const t = await getTranslations(namespace);

  return (
    <div
      className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center"
      data-testid="student-activation-notice"
      data-activation-state={state.state}
    >
      <p className="text-lg font-semibold text-navy">{t("title")}</p>
      <p className="mt-2 text-sm text-slate">{t("description")}</p>
    </div>
  );
}
