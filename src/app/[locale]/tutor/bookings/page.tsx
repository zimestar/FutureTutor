import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { CancelBookingButton } from "@/components/dashboard/CancelBookingButton";
import { Badge } from "@/components/ui/Badge";
import { formatBookingTime } from "@/lib/utils";
import { tutorNavItems } from "@/lib/tutorNav";
import { describeCancellationConsequence } from "@/services/cancellationPolicy";
import { EmptyState } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";
import { Button } from "@/components/ui/Button";

export default async function TutorBookingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user || user.role !== "TUTOR") {
    redirect({ href: "/login", locale });
    return;
  }

  const t = await getTranslations({ locale, namespace: "dashboard.tutor.bookings" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });
  const tStatus = await getTranslations({ locale, namespace: "booking.status" });
  const tSubjects = await getTranslations({ locale, namespace: "subjects.items" });
  const tPayouts = await getTranslations({ locale, namespace: "tutorPayouts" });
  const tSession = await getTranslations({ locale, namespace: "sessionExperience" });

  const tutorProfile = await db.tutorProfile.findUnique({ where: { userId: user.id } });

  const bookings = tutorProfile
    ? await db.booking.findMany({
        where: { tutorProfileId: tutorProfile.id },
        include: {
          studentProfile: { select: { firstName: true, lastName: true } },
          subject: { select: { slug: true } },
          earning: { select: { status: true, amountCents: true, currency: true } },
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
    <DashboardShell navItems={tutorNavItems(tNav, tutorProfile?.applicationStatus ?? "DRAFT")} userName={user.name ?? ""}>
      <PageHeader
        title={t("title")}
        description={t("description")}
        eyebrow={t("eyebrow")}
        status={bookings.length > 0 && <Badge variant="neutral">{t("bookingCount", { count: bookings.length })}</Badge>}
      />

      {bookings.length === 0 ? (
        <EmptyState className="mt-8" title={t("emptyTitle")} description={t("empty")} />
      ) : (
        <div className="mt-8 flex flex-col gap-8">
          {sections
            .filter((section) => section.bookings.length > 0)
            .map((section) => (
              <div key={section.title}>
                <h2 className="mb-3 text-lg font-bold text-navy">{section.title}</h2>
                <div className="flex flex-col gap-3">
                  {section.bookings.map((booking) => (
                    <Surface
                      key={booking.id}
                      padding="sm"
                      className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-semibold text-navy">
                          {tSubjects(booking.subject.slug)} —{" "}
                          {t("withStudent", { name: booking.studentProfile.firstName })}
                        </p>
                        <p className="mt-1 text-sm text-slate">
                          {formatBookingTime(booking.startAt, booking.timezone, locale)}
                        </p>
                        {booking.earning && (
                          <p className="mt-1 text-xs font-semibold text-slate" data-testid="earning-status">
                            {t("earning", { amount: (booking.earning.amountCents / 100).toFixed(2), currency: booking.earning.currency })} —{" "}
                            {tPayouts(`earningStatus.${booking.earning.status}`)}
                          </p>
                        )}
                        {booking.status === "PENDING_PAYMENT" && (
                          <p className="mt-1 text-xs font-semibold text-slate">{t("paymentProcessing")}</p>
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
                              isTutorViewer: true,
                              paymentStatus: null,
                              sessionStartAt: booking.startAt,
                              now,
                              amountCents: 0,
                              currency: booking.currency,
                            })}
                          />
                        )}
                      </div>
                    </Surface>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </DashboardShell>
  );
}
