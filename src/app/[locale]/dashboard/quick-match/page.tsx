import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect, Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { StudentActivationNotice } from "@/components/dashboard/StudentActivationNotice";
import { QuickMatchRequestForm } from "@/components/dashboard/QuickMatchRequestForm";
import { QuickMatchPriceReview } from "@/components/dashboard/QuickMatchPriceReview";
import { QuickMatchStatusView } from "@/components/dashboard/QuickMatchStatusView";
import { expireStaleInvitationsAndAdvance } from "@/services/quickMatchDispatch";
import { paymentsUseStripe } from "@/lib/paymentMode";
import { resolveStudentAccountActivationState } from "@/services/familyManagement";
import { listBookableStudentsForActor } from "@/services/learnerSelection";
import { getStudentDashboardNavItems } from "@/lib/dashboardNav";

export default async function StudentQuickMatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ studentProfileId?: string }>;
}) {
  const { locale } = await params;
  const { studentProfileId: requestedStudentProfileId } = await searchParams;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "STUDENT" && user.role !== "PARENT")) {
    redirect({ href: "/login", locale });
    return;
  }

  const t = await getTranslations({ locale, namespace: "quickMatch" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });
  const tSubjects = await getTranslations({ locale, namespace: "subjects.items" });
  const tLevels = await getTranslations({ locale, namespace: "gradeLevels" });

  // Lazy expiry-on-read — the primary correctness mechanism for advancing
  // an in-flight dispatch (see quickMatchDispatch.ts). Cheap no-op when
  // there's nothing stale.
  await expireStaleInvitationsAndAdvance();

  const navItems = getStudentDashboardNavItems((key) => tNav(key), user.role);

  // Phase H.5 Final Claimant-State UX Correction: a linked-less STUDENT must
  // not see the Quick Match request form — this is exactly the
  // financially-binding flow the H.5 security correction (§53) also
  // independently guarded server-side in createTutoringRequestAction; the
  // UI must not even offer it.
  if (user.role === "STUDENT") {
    const activationState = await resolveStudentAccountActivationState(db, user.id);
    if (activationState.state !== "ACTIVE") {
      return (
        <DashboardShell navItems={navItems} userName={user.name ?? ""}>
          <StudentActivationNotice state={activationState} />
        </DashboardShell>
      );
    }
  }

  // Phase H.7 (§9/§56) — server-authoritative bookable-learner resolution,
  // shared with Direct Booking (listBookableStudentsForActor). For a
  // Student this always resolves to exactly their own profile at this
  // point (the activation-state gate above already ensured ACTIVE). For a
  // Parent it's every linked child they currently have authority over.
  const bookableStudents = await listBookableStudentsForActor(db, user.id);

  if (bookableStudents.length === 0) {
    // Only reachable for a PARENT with no (yet) bookable child — the
    // STUDENT case is already excluded by the activation-state gate above.
    return (
      <DashboardShell navItems={navItems} userName={user.name ?? ""}>
        <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
        <p className="mt-6 text-sm text-slate" data-testid="no-bookable-children">
          {t("noBookableChildren")}
        </p>
        <Link href="/dashboard/family" className="mt-3 inline-block text-sm font-semibold text-blue hover:text-blue-hover">
          {t("manageFamilyCta")}
        </Link>
      </DashboardShell>
    );
  }

  // Phase H.7 (§56) — never inferred from "first relationship": an
  // explicit selection is required whenever more than one child is
  // eligible. Exactly one eligible child may auto-select (still an
  // explicit, authorized target server-side, never assumed client-side).
  const selectedStudentProfileId =
    bookableStudents.length === 1
      ? bookableStudents[0].id
      : (requestedStudentProfileId && bookableStudents.some((s) => s.id === requestedStudentProfileId)
          ? requestedStudentProfileId
          : null);

  if (!selectedStudentProfileId) {
    return (
      <DashboardShell navItems={navItems} userName={user.name ?? ""}>
        <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
        <p className="mt-2 max-w-xl text-slate">{t("chooseChildPrompt")}</p>
        <div className="mt-6 flex flex-col gap-2" data-testid="quick-match-child-selector">
          {bookableStudents.map((student) => (
            <Link
              key={student.id}
              href={`/dashboard/quick-match?studentProfileId=${student.id}`}
              className="rounded-md border border-neutral-200 bg-white p-4 text-sm font-semibold text-navy hover:border-blue"
              data-testid="quick-match-child-option"
            >
              {student.firstName} {student.lastName}
            </Link>
          ))}
        </div>
      </DashboardShell>
    );
  }

  const [subjects, levels, latestRequest] = await Promise.all([
    db.subject.findMany({ orderBy: { sortOrder: "asc" } }),
    db.academicLevel.findMany({ orderBy: { sortOrder: "asc" } }),
    db.tutoringRequest.findFirst({
      where: { studentProfileId: selectedStudentProfileId },
      orderBy: { createdAt: "desc" },
      include: { customerPriceQuote: true },
    }),
  ]);

  const subjectOptions = subjects.map((s) => ({ id: s.id, label: tSubjects(s.slug) }));
  const levelOptions = levels.map((l) => ({ id: l.id, label: tLevels(l.slug) }));
  const selectedStudent = bookableStudents.find((s) => s.id === selectedStudentProfileId)!;

  return (
    <DashboardShell navItems={navItems} userName={user.name ?? ""}>
      <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
      <p className="mt-2 max-w-xl text-slate">{t("description")}</p>

      {/* Phase H.7 (§11/§35) — the selected learner's identity stays
          visible throughout; a Parent with more than one child also gets a
          quick link back to the chooser rather than a dead end. */}
      {user.role === "PARENT" && (
        <div className="mt-4 flex items-center gap-3 rounded-md bg-off-white px-4 py-2 text-sm" data-testid="quick-match-selected-child">
          <span className="text-slate">
            {t("bookingForLabel", { name: `${selectedStudent.firstName} ${selectedStudent.lastName}` })}
          </span>
          {bookableStudents.length > 1 && (
            <Link href="/dashboard/quick-match" className="font-semibold text-blue hover:text-blue-hover">
              {t("changeChildCta")}
            </Link>
          )}
        </div>
      )}

      {latestRequest?.status === "PRICED" && latestRequest.customerPriceQuote && (
        <QuickMatchPriceReview
          tutoringRequestId={latestRequest.id}
          customerPriceQuoteId={latestRequest.customerPriceQuote.id}
          basePriceCents={latestRequest.customerPriceQuote.basePriceCents}
          subtotalCents={latestRequest.customerPriceQuote.subtotalCents}
          taxCents={latestRequest.customerPriceQuote.taxCents}
          totalCents={latestRequest.customerPriceQuote.totalCents}
          currency={latestRequest.customerPriceQuote.currency}
          useStripe={paymentsUseStripe()}
          stripePublishableKey={process.env.STRIPE_PUBLISHABLE_KEY ?? null}
        />
      )}

      {(latestRequest?.status === "MATCHING" ||
        latestRequest?.status === "PAYMENT_PENDING" ||
        latestRequest?.status === "BOOKED" ||
        latestRequest?.status === "PAYMENT_FAILED") && (
        <QuickMatchStatusView
          tutoringRequestId={latestRequest.id}
          status={latestRequest.status}
          dispatchRound={latestRequest.dispatchRound}
        />
      )}

      {(!latestRequest ||
        !["PRICED", "MATCHING", "PAYMENT_PENDING", "BOOKED", "PAYMENT_FAILED"].includes(latestRequest.status)) && (
        <>
          {latestRequest?.status === "NO_TUTOR_FOUND" && (
            <p className="mt-6 rounded-md bg-off-white px-4 py-3 text-sm text-slate" data-testid="no-tutor-found-banner">
              {t("status.NO_TUTOR_FOUND.description", { round: latestRequest.dispatchRound })}
            </p>
          )}
          <QuickMatchRequestForm subjects={subjectOptions} levels={levelOptions} studentProfileId={selectedStudentProfileId} />
        </>
      )}
    </DashboardShell>
  );
}
