import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { QuickMatchRequestForm } from "@/components/dashboard/QuickMatchRequestForm";
import { QuickMatchPriceReview } from "@/components/dashboard/QuickMatchPriceReview";
import { QuickMatchStatusView } from "@/components/dashboard/QuickMatchStatusView";
import { expireStaleInvitationsAndAdvance } from "@/services/quickMatchDispatch";

export default async function StudentQuickMatchPage({
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

  const t = await getTranslations({ locale, namespace: "quickMatch" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });
  const tSubjects = await getTranslations({ locale, namespace: "subjects.items" });
  const tLevels = await getTranslations({ locale, namespace: "gradeLevels" });

  // Lazy expiry-on-read — the primary correctness mechanism for advancing
  // an in-flight dispatch (see quickMatchDispatch.ts). Cheap no-op when
  // there's nothing stale.
  await expireStaleInvitationsAndAdvance();

  const studentProfile = await db.studentProfile.findUnique({ where: { userId: user.id } });

  const [subjects, levels, latestRequest] = await Promise.all([
    db.subject.findMany({ orderBy: { sortOrder: "asc" } }),
    db.academicLevel.findMany({ orderBy: { sortOrder: "asc" } }),
    studentProfile
      ? db.tutoringRequest.findFirst({
          where: { studentProfileId: studentProfile.id },
          orderBy: { createdAt: "desc" },
          include: { customerPriceQuote: true },
        })
      : null,
  ]);

  const subjectOptions = subjects.map((s) => ({ id: s.id, label: tSubjects(s.slug) }));
  const levelOptions = levels.map((l) => ({ id: l.id, label: tLevels(l.slug) }));

  return (
    <DashboardShell
      navItems={[
        { label: tNav("overview"), href: "/dashboard" },
        { label: tNav("favorites"), href: "/dashboard/favorites" },
        { label: tNav("quickMatch"), href: "/dashboard/quick-match" },
        { label: tNav("bookings"), href: "/dashboard/bookings" },
      ]}
      userName={user.name ?? ""}
    >
      <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
      <p className="mt-2 max-w-xl text-slate">{t("description")}</p>

      {latestRequest?.status === "PRICED" && latestRequest.customerPriceQuote && (
        <QuickMatchPriceReview
          tutoringRequestId={latestRequest.id}
          customerPriceQuoteId={latestRequest.customerPriceQuote.id}
          basePriceCents={latestRequest.customerPriceQuote.basePriceCents}
          subtotalCents={latestRequest.customerPriceQuote.subtotalCents}
          taxCents={latestRequest.customerPriceQuote.taxCents}
          totalCents={latestRequest.customerPriceQuote.totalCents}
          currency={latestRequest.customerPriceQuote.currency}
        />
      )}

      {latestRequest?.status === "MATCHING" && (
        <QuickMatchStatusView
          tutoringRequestId={latestRequest.id}
          status="MATCHING"
          dispatchRound={latestRequest.dispatchRound}
        />
      )}

      {latestRequest?.status === "BOOKED" && (
        <QuickMatchStatusView tutoringRequestId={latestRequest.id} status="BOOKED" dispatchRound={latestRequest.dispatchRound} />
      )}

      {(!latestRequest || !["PRICED", "MATCHING", "BOOKED"].includes(latestRequest.status)) && (
        <>
          {latestRequest?.status === "NO_TUTOR_FOUND" && (
            <p className="mt-6 rounded-md bg-off-white px-4 py-3 text-sm text-slate" data-testid="no-tutor-found-banner">
              {t("status.NO_TUTOR_FOUND.description", { round: latestRequest.dispatchRound })}
            </p>
          )}
          <QuickMatchRequestForm subjects={subjectOptions} levels={levelOptions} />
        </>
      )}
    </DashboardShell>
  );
}
