import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Star, MapPin, Laptop, Languages, GraduationCap } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Section } from "@/components/ui/Section";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { FavoriteButton } from "@/components/marketing/FavoriteButton";
import { BookingWidget } from "@/components/marketing/BookingWidget";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFavoritedTutorIds } from "@/lib/favorites";
import { dbModeToDisplay } from "@/lib/tutorMode";
import { getAvailableSlots } from "@/lib/availability";
import { paymentsAreLive } from "@/lib/paymentMode";

type Params = { locale: string; slug: string };

async function findApprovedTutor(slug: string) {
  return db.tutorProfile.findFirst({
    where: { slug, applicationStatus: "APPROVED" },
    include: {
      user: { select: { name: true } },
      subjects: { select: { subject: { select: { id: true, slug: true } } } },
      levels: { select: { academicLevel: { select: { id: true, slug: true } } } },
      languages: { select: { language: true } },
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tutor = await findApprovedTutor(slug);
  if (!tutor) return {};

  return {
    title: `${tutor.user.name?.split(" ")[0] ?? ""} — ${tutor.headline ?? ""}`,
    description: tutor.bio ?? undefined,
  };
}

export default async function TutorProfilePage({ params }: { params: Promise<Params> }) {
  const { locale, slug } = await params;
  const tutor = await findApprovedTutor(slug);
  if (!tutor) notFound();

  setRequestLocale(locale);
  const tCard = await getTranslations({ locale, namespace: "tutorCard" });
  const tSubjects = await getTranslations({ locale, namespace: "subjects.items" });
  const tLevels = await getTranslations({ locale, namespace: "gradeLevels" });
  const tLanguages = await getTranslations({ locale, namespace: "languages" });
  const tProfile = await getTranslations({ locale, namespace: "tutorProfilePage" });
  const tBooking = await getTranslations({ locale, namespace: "booking" });

  const session = await auth();
  const favoritedIds = await getFavoritedTutorIds(session);
  const firstName = tutor.user.name?.split(" ")[0] ?? "";
  const displayMode = dbModeToDisplay(tutor.learningMode ?? "BOTH");

  const isStudent = session?.user?.role === "STUDENT";
  const { timezone, days } = isStudent
    ? await getAvailableSlots(tutor.id)
    : { timezone: null, days: [] };
  const serializedDays = days.map((day) => ({
    date: day.date,
    slots: day.slots.map((slot) => ({ startAt: slot.startAt.toISOString(), endAt: slot.endAt.toISOString() })),
  }));

  return (
    <MarketingShell>
      <Section className="bg-off-white">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[2fr_1fr]">
          <div>
            <div className="flex items-start gap-5">
              <Avatar name={firstName} size={80} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-3xl font-bold text-navy">{firstName}</h1>
                  {favoritedIds !== undefined && (
                    <FavoriteButton tutorProfileId={tutor.id} initialFavorited={favoritedIds.has(tutor.id)} />
                  )}
                </div>
                <p className="mt-1 text-lg font-semibold text-slate">{tutor.headline}</p>
                {tutor.reviewCount > 0 && (
                  <div className="mt-2 flex items-center gap-1">
                    <Star size={16} className="text-warning" fill="currentColor" strokeWidth={0} />
                    <span className="font-bold text-navy">{tutor.ratingAverage.toFixed(1)}</span>
                    <span className="text-slate">{tCard("reviews", { count: tutor.reviewCount })}</span>
                  </div>
                )}
              </div>
            </div>

            <p className="mt-8 max-w-2xl text-lg leading-relaxed text-slate">{tutor.bio}</p>

            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4">
                <Laptop size={18} className="text-blue" aria-hidden="true" />
                <span className="text-sm font-semibold text-navy">{tCard(`mode.${displayMode}`)}</span>
              </div>
              {tutor.city && (
                <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4">
                  <MapPin size={18} className="text-blue" aria-hidden="true" />
                  <span className="text-sm font-semibold text-navy">
                    {tutor.city}
                    {tutor.province ? `, ${tutor.province}` : ""}
                  </span>
                </div>
              )}
              {tutor.languages.length > 0 && (
                <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4">
                  <Languages size={18} className="text-blue" aria-hidden="true" />
                  <span className="text-sm font-semibold text-navy">
                    {tutor.languages.map((l) => tLanguages(l.language)).join(", ")}
                  </span>
                </div>
              )}
              {tutor.levels.length > 0 && (
                <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4">
                  <GraduationCap size={18} className="text-blue" aria-hidden="true" />
                  <span className="text-sm font-semibold text-navy">
                    {tutor.levels.map((l) => tLevels(l.academicLevel.slug)).join(", ")}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-8 flex flex-wrap gap-2">
              {tutor.subjects.map((s) => (
                <Badge key={s.subject.slug} variant="neutral">
                  {tSubjects(s.subject.slug)}
                </Badge>
              ))}
            </div>
          </div>

          <aside className="h-fit rounded-lg border border-neutral-200 bg-white p-6 shadow-card">
            <p className="text-sm font-semibold text-slate">{tProfile("pricingNote")}</p>
            <p className="mt-1 text-sm text-slate">
              {tProfile("yearsExperience", { count: tutor.yearsExperience ?? 0 })}
            </p>
            {isStudent ? (
              timezone ? (
                <BookingWidget
                  tutorProfileId={tutor.id}
                  timezone={timezone}
                  days={serializedDays}
                  subjects={tutor.subjects.map((s) => ({ id: s.subject.id, label: tSubjects(s.subject.slug) }))}
                  levels={tutor.levels.map((l) => ({ id: l.academicLevel.id, label: tLevels(l.academicLevel.slug) }))}
                  paymentsLive={paymentsAreLive()}
                  stripePublishableKey={process.env.STRIPE_PUBLISHABLE_KEY ?? null}
                />
              ) : (
                <p className="mt-6 text-sm text-slate">{tBooking("noAvailability")}</p>
              )
            ) : (
              <>
                <Button href="/signup" className="mt-6 w-full">
                  {tProfile("requestToBook")}
                </Button>
                <p className="mt-3 text-center text-xs text-slate">{tProfile("bookingNote")}</p>
              </>
            )}
          </aside>
        </div>
      </Section>
    </MarketingShell>
  );
}
