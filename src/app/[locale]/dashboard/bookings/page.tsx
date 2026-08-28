import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { StudentActivationNotice } from "@/components/dashboard/StudentActivationNotice";
import { CancelBookingButton } from "@/components/dashboard/CancelBookingButton";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatBookingTime } from "@/lib/utils";
import { resolveStudentAccountActivationState } from "@/services/familyManagement";
import { getStudentDashboardNavItems } from "@/lib/dashboardNav";
import { listBookableStudentsForActor } from "@/services/learnerSelection";
import { describeCancellationConsequence } from "@/services/cancellationPolicy";
import { toExactLocationDto } from "@/services/bookingLocationAccess";
import { ConfirmedLocationCard } from "@/components/dashboard/InPersonTutoringLocation";
import { toConfirmedTutoringLocation } from "@/lib/inPersonLocationPresentation";

/** The booking's own Student/Parent always sees the exact location they (or
 * their authorized guardian) submitted — no privacy gate applies to the
 * party who provided the data (bookingLocation.ts's getBookingLocationAction
 * applies this same rule). Shown only while still meaningful — a
 * cancelled/declined/refunded/rescheduled booking's location is moot. */
const LOCATION_RELEVANT_STATUSES = new Set(["DRAFT", "PENDING_PAYMENT", "CONFIRMED", "COMPLETED", "NO_SHOW"]);

export default async function StudentBookingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "STUDENT" && user.role !== "PARENT")) {
    redirect({ href: "/login", locale });
    return;
  }

  const t = await getTranslations({ locale, namespace: "dashboard.student.bookings" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });
  const tStatus = await getTranslations({ locale, namespace: "booking.status" });
  const tSubjects = await getTranslations({ locale, namespace: "subjects.items" });
  const tSession = await getTranslations({ locale, namespace: "sessionExperience" });

  const studentProfile = await db.studentProfile.findUnique({ where: { userId: user.id } });

  const navItems = getStudentDashboardNavItems((key) => tNav(key), user.role);

  // Phase H.5 Final Claimant-State UX Correction: see
  // src/app/[locale]/dashboard/page.tsx's identical guard for the full
  // rationale. studentProfile above is still fetched directly for this
  // page's own data (bookings), independent of this gating decision.
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

  // Phase H.8 (§V) — a PARENT actor sees their currently-ACTIVE-relationship
  // children's bookings. A REVOKED guardian has NO booking-history
  // visibility through this surface (closed product decision, §AJ item 1)
  // — listBookableStudentsForActor already scopes to ACTIVE relationships
  // only, so reusing it here directly (rather than duplicating its query)
  // makes that exclusion automatic, not an extra filter to remember.
  let childProfilesById = new Map<string, { firstName: string }>();
  if (user.role === "PARENT") {
    const bookableStudents = await listBookableStudentsForActor(db, user.id);
    childProfilesById = new Map(bookableStudents.map((s) => [s.id, { firstName: s.firstName }]));
  }

  const studentProfileIds =
    user.role === "PARENT" ? Array.from(childProfilesById.keys()) : studentProfile ? [studentProfile.id] : [];

  const bookings =
    studentProfileIds.length > 0
      ? await db.booking.findMany({
          where: { studentProfileId: { in: studentProfileIds } },
          include: {
            tutorProfile: { select: { user: { select: { name: true } } } },
            subject: { select: { slug: true } },
            payment: { select: { status: true, refundedAmountCents: true, amountCents: true, currency: true } },
            session: { select: { id: true, status: true } },
          },
          orderBy: { startAt: "asc" },
        })
      : [];

  const now = new Date();
  const upcoming = bookings.filter((b) => b.endAt >= now);
  const past = bookings.filter((b) => b.endAt < now);

  const sections = [
    { title: t("upcomingTitle"), bookings: upcoming, allowCancel: true },
    { title: t("pastTitle"), bookings: past, allowCancel: false },
  ];

  return (
    <DashboardShell navItems={navItems} userName={user.name ?? ""}>
      <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
      <p className="mt-2 max-w-xl text-slate">{t("description")}</p>

      {bookings.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
          <p className="text-slate">{t("empty")}</p>
          <div className="mt-6 flex justify-center">
            <Button href="/dashboard/find-tutors">{t("findTutorCta")}</Button>
          </div>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-8">
          {sections
            .filter((section) => section.bookings.length > 0)
            .map((section) => (
              <div key={section.title}>
                <h2 className="mb-3 text-lg font-bold text-navy">{section.title}</h2>
                <div className="flex flex-col gap-3">
                  {section.bookings.map((booking) => (
                    <div
                      key={booking.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-4"
                    >
                      <div>
                        <p className="font-semibold text-navy">
                          {tSubjects(booking.subject.slug)} —{" "}
                          {t("withTutor", { name: booking.tutorProfile.user.name?.split(" ")[0] ?? "" })}
                        </p>
                        {user.role === "PARENT" && childProfilesById.get(booking.studentProfileId) && (
                          <p className="mt-0.5 text-xs font-semibold text-slate">
                            {t("forLearner", { name: childProfilesById.get(booking.studentProfileId)!.firstName })}
                          </p>
                        )}
                        <p className="mt-1 text-sm text-slate">
                          {formatBookingTime(booking.startAt, booking.timezone, locale)}
                        </p>
                        {booking.payment && booking.payment.refundedAmountCents > 0 && (
                          <p className="mt-1 text-xs font-semibold text-slate" data-testid="refund-note">
                            {t("refundedAmount", {
                              amount: new Intl.NumberFormat(locale, { style: "currency", currency: booking.payment.currency }).format(booking.payment.refundedAmountCents / 100),
                            })}
                          </p>
                        )}
                        {booking.status === "PENDING_PAYMENT" && (
                          <p className="mt-1 text-xs font-semibold text-slate">{t("paymentProcessing")}</p>
                        )}
                        {booking.mode === "IN_PERSON" && LOCATION_RELEVANT_STATUSES.has(booking.status) && (
                          <div className="mt-3 max-w-md">
                            <ConfirmedLocationCard location={toConfirmedTutoringLocation(toExactLocationDto(booking))} />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <Badge variant={booking.status === "CONFIRMED" ? "mint" : "outline"}>
                          {tStatus(booking.status)}
                        </Badge>
                        {booking.session?.status === "NO_SHOW" && <Badge variant="neutral">{tSession("bookingNoShow")}</Badge>}
                        {booking.session?.status === "COMPLETED" && <Badge variant="mint">{tSession("bookingCompleted")}</Badge>}
                        {booking.session?.status === "INTERRUPTED" && <Badge variant="neutral">{tSession("bookingInterrupted")}</Badge>}
                        {booking.session && (
                          <Button href={`/session/${booking.id}`} variant="outline" size="sm">
                            {tSession("viewSession")}
                          </Button>
                        )}
                        {section.allowCancel && booking.status === "CONFIRMED" && booking.startAt > now && (
                          <CancelBookingButton
                            bookingId={booking.id}
                            label={t("cancelCta")}
                            cancellingLabel={t("cancelling")}
                            consequencePreview={describeCancellationConsequence({
                              isTutorViewer: false,
                              paymentStatus: booking.payment?.status === "CAPTURED" ? "CAPTURED" : null,
                              sessionStartAt: booking.startAt,
                              now,
                              amountCents: booking.payment?.amountCents ?? 0,
                              currency: booking.payment?.currency ?? booking.currency,
                            })}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </DashboardShell>
  );
}
