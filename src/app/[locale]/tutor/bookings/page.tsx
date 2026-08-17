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

  const tutorProfile = await db.tutorProfile.findUnique({ where: { userId: user.id } });

  const bookings = tutorProfile
    ? await db.booking.findMany({
        where: { tutorProfileId: tutorProfile.id },
        include: {
          studentProfile: { select: { firstName: true, lastName: true } },
          subject: { select: { slug: true } },
          earning: { select: { status: true, amountCents: true, currency: true } },
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
    <DashboardShell navItems={tutorNavItems(tNav)} userName={user.name ?? ""}>
      <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
      <p className="mt-2 max-w-xl text-slate">{t("description")}</p>

      {bookings.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
          <p className="text-slate">{t("empty")}</p>
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
                          {t("withStudent", { name: booking.studentProfile.firstName })}
                        </p>
                        <p className="mt-1 text-sm text-slate">
                          {formatBookingTime(booking.startAt, booking.timezone, locale)}
                        </p>
                        {booking.earning && (
                          <p className="mt-1 text-xs font-semibold text-slate" data-testid="earning-status">
                            Earning: {(booking.earning.amountCents / 100).toFixed(2)} {booking.earning.currency} —{" "}
                            {booking.earning.status}
                          </p>
                        )}
                        {booking.status === "PENDING_PAYMENT" && (
                          <p className="mt-1 text-xs font-semibold text-slate">Payment processing…</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={booking.status === "CONFIRMED" ? "mint" : "outline"}>
                          {tStatus(booking.status)}
                        </Badge>
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
