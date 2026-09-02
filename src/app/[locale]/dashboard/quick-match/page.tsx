import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect, Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { closedBetaOnlineOnlyActive } from "@/lib/closedBetaConfig";
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
import { quickMatchCustomerView } from "@/lib/quickMatchCustomerFlow";
import { ACTIVE_TUTORING_REQUEST_STATUSES } from "@/services/tutoringRequestCreation";
import { GuardianManagedLocationNotice } from "@/components/dashboard/InPersonTutoringLocation";

export default async function StudentQuickMatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ studentProfileId?: string; newRequest?: string }>;
}) {
  const { locale } = await params;
  const { studentProfileId: requestedStudentProfileId, newRequest } = await searchParams;
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
  const [bookableStudents, ownManagementMode] = await Promise.all([
    listBookableStudentsForActor(db, user.id),
    user.role === "STUDENT"
      ? db.studentProfile.findUnique({ where: { userId: user.id }, select: { managementMode: true } }).then((profile) => profile?.managementMode ?? null)
      : Promise.resolve(null),
  ]);

  if (bookableStudents.length === 0) {
    if (user.role === "STUDENT" && ownManagementMode === "GUARDIAN_MANAGED") {
      return <DashboardShell navItems={navItems} userName={user.name ?? ""}><h1 className="text-2xl font-bold text-navy">{t("title")}</h1><div className="mt-6"><GuardianManagedLocationNotice /></div></DashboardShell>;
    }
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

  const [subjects, levels, activeRequest, latestRequest] = await Promise.all([
    db.subject.findMany({ orderBy: { sortOrder: "asc" } }),
    db.academicLevel.findMany({ orderBy: { sortOrder: "asc" } }),
    db.tutoringRequest.findFirst({
      where: { studentProfileId: selectedStudentProfileId, status: { in: [...ACTIVE_TUTORING_REQUEST_STATUSES] } },
      orderBy: { createdAt: "desc" },
      include: { customerPriceQuote: true },
    }),
    db.tutoringRequest.findFirst({
      where: { studentProfileId: selectedStudentProfileId },
      orderBy: { createdAt: "desc" },
      include: { customerPriceQuote: true },
    }),
  ]);

  const subjectOptions = subjects.map((s) => ({ id: s.id, label: tSubjects(s.slug) }));
  const levelOptions = levels.map((l) => ({ id: l.id, label: tLevels(l.slug) }));
  const selectedStudent = bookableStudents.find((s) => s.id === selectedStudentProfileId)!;
  const view = quickMatchCustomerView(activeRequest?.status ?? null, latestRequest?.status ?? null, newRequest === "1");
  const displayedRequest = activeRequest ?? latestRequest;
  const startNewHref = `/dashboard/quick-match?newRequest=1${bookableStudents.length > 1 ? `&studentProfileId=${selectedStudentProfileId}` : ""}`;

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

      {view === "price-review" && activeRequest?.status === "PRICED" && activeRequest.customerPriceQuote && (
        <QuickMatchPriceReview
          tutoringRequestId={activeRequest.id}
          customerPriceQuoteId={activeRequest.customerPriceQuote.id}
          basePriceCents={activeRequest.customerPriceQuote.basePriceCents}
          subtotalCents={activeRequest.customerPriceQuote.subtotalCents}
          taxCents={activeRequest.customerPriceQuote.taxCents}
          totalCents={activeRequest.customerPriceQuote.totalCents}
          currency={activeRequest.customerPriceQuote.currency}
          useStripe={paymentsUseStripe()}
          stripePublishableKey={process.env.STRIPE_PUBLISHABLE_KEY ?? null}
        />
      )}

      {(view === "active-status" || view === "terminal-status") && displayedRequest &&
        ["MATCHING", "PAYMENT_PENDING", "BOOKED", "PAYMENT_FAILED"].includes(displayedRequest.status) && (
        <QuickMatchStatusView
          tutoringRequestId={displayedRequest.id}
          status={displayedRequest.status === "CONFIRMED" ? "MATCHING" : displayedRequest.status as "MATCHING" | "PAYMENT_PENDING" | "BOOKED" | "PAYMENT_FAILED"}
          dispatchRound={displayedRequest.dispatchRound}
        />
      )}

      {view === "terminal-status" && (
        <Link
          href={startNewHref}
          data-testid="start-new-quick-match"
          className="mt-4 inline-flex min-h-11 items-center rounded-md bg-blue px-5 text-sm font-bold text-white hover:bg-blue/90"
        >
          {t("startNewCta")}
        </Link>
      )}

      {view === "form" && (
        <>
          {latestRequest?.status === "NO_TUTOR_FOUND" && (
            <p className="mt-6 rounded-md bg-off-white px-4 py-3 text-sm text-slate" data-testid="no-tutor-found-banner">
              {t("status.NO_TUTOR_FOUND.description", { round: latestRequest.dispatchRound })}
            </p>
          )}
          <QuickMatchRequestForm
            subjects={subjectOptions}
            levels={levelOptions}
            studentProfileId={selectedStudentProfileId}
            initialAcademicLevelId={selectedStudent.academicLevelId}
            betaOnlineOnly={closedBetaOnlineOnlyActive()}
          />
        </>
      )}
    </DashboardShell>
  );
}
