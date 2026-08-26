import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, Star, MapPin, Laptop, Languages, GraduationCap } from "lucide-react";
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
import { paymentsUseStripe } from "@/lib/paymentMode";
import { listBookableStudentsForActor } from "@/services/learnerSelection";
import { publicPageMetadata } from "@/lib/publicMetadata";

type Params = { locale: string; slug: string };

const findApprovedTutor = cache(async (slug: string) => {
  return db.tutorProfile.findFirst({
    where: { slug, applicationStatus: "APPROVED" },
    include: {
      user: { select: { name: true, image: true } },
      subjects: { select: { subject: { select: { id: true, slug: true } } } },
      levels: { select: { academicLevel: { select: { id: true, slug: true } } } },
      languages: { select: { language: true } },
    },
  });
});

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const tutor = await findApprovedTutor(slug);
  if (!tutor) return {};

  const title = `${tutor.user.name?.split(" ")[0] ?? ""} — ${tutor.headline ?? ""}`;
  return publicPageMetadata({ locale, path: `/tutors/${slug}`, title, description: tutor.bio ?? title });
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

  // Phase H.5 (§30 dashboard/route audit) extended in H.7: role===STUDENT
  // alone was never enough — a STUDENT session with no linked
  // StudentProfile yet (a claimed-but-unapproved restricted login) must not
  // be offered the booking widget. H.7 widens this from "does the actor
  // have their own bookable profile" to "does the actor have ANY
  // financially-bookable learner" — server-authoritative via
  // listBookableStudentsForActor (H.2-backed), covering both a
  // SELF_MANAGED Student's own profile and a Parent's linked children. The
  // underlying Server Actions independently re-verify this on every call
  // (§13/§25) — this is UX only, never the security boundary.
  const bookableStudents =
    session?.user && (session.user.role === "STUDENT" || session.user.role === "PARENT")
      ? await listBookableStudentsForActor(db, session.user.id)
      : [];
  const canBook = bookableStudents.length > 0;
  const { timezone, days } = canBook ? await getAvailableSlots(tutor.id) : { timezone: null, days: [] };
  const serializedDays = days.map((day) => ({
    date: day.date,
    slots: day.slots.map((slot) => ({ startAt: slot.startAt.toISOString(), endAt: slot.endAt.toISOString() })),
  }));

  return (
    <MarketingShell>
      <Section className="bg-off-white">
        {(session?.user?.role === "STUDENT" || session?.user?.role === "PARENT") && (
          <Button
            href="/dashboard/find-tutors"
            variant="ghost"
            className="mb-5 min-h-11 px-2 lg:hidden"
            aria-label={tProfile("backToTutorSearch")}
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
            {tProfile("backToTutorSearch")}
          </Button>
        )}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[2fr_1fr]">
          <div className="@container">
            <div className="flex items-start gap-5">
              <Avatar name={firstName} src={tutor.user.image ?? undefined} size={80} />
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

            {/*
              Two-up presentation is gated on the ACTUAL rendered width of
              this column (a CSS container query), not the browser viewport.
              At lg+ viewports the outer grid above splits into a 2fr/1fr
              layout, and this column's real width can land anywhere from
              ~250px to ~700px depending on viewport — a viewport-based
              sm:grid-cols-2 was already "true" long before this column was
              actually wide enough to hold two cards without cramming long
              localized phrases (FR mode/level labels) into a narrow card
              and wrapping them word-by-word. @2xl here means "only go
              two-up once this column itself has ~42rem to work with" —
              comfortably wide either at full page width pre-lg, or once
              the split column itself is genuinely spacious.
            */}
            <div className="mt-8 grid grid-cols-1 gap-4 @2xl:grid-cols-2">
              <div className="flex min-w-0 items-start gap-3 rounded-lg border border-neutral-200 bg-white p-4">
                <Laptop size={18} className="mt-0.5 shrink-0 text-blue" aria-hidden="true" />
                <span className="min-w-0 text-sm font-semibold text-navy">{tCard(`mode.${displayMode}`)}</span>
              </div>
              {tutor.city && (
                <div className="flex min-w-0 items-start gap-3 rounded-lg border border-neutral-200 bg-white p-4">
                  <MapPin size={18} className="mt-0.5 shrink-0 text-blue" aria-hidden="true" />
                  <span className="min-w-0 text-sm font-semibold text-navy">
                    {tutor.city}
                    {tutor.province ? `, ${tutor.province}` : ""}
                  </span>
                </div>
              )}
              {tutor.languages.length > 0 && (
                <div className="flex min-w-0 items-start gap-3 rounded-lg border border-neutral-200 bg-white p-4">
                  <Languages size={18} className="mt-0.5 shrink-0 text-blue" aria-hidden="true" />
                  <span className="min-w-0 text-sm font-semibold text-navy">
                    {tutor.languages.map((l) => tLanguages(l.language)).join(", ")}
                  </span>
                </div>
              )}
              {tutor.levels.length > 0 && (
                <div className="flex min-w-0 items-start gap-3 rounded-lg border border-neutral-200 bg-white p-4">
                  <GraduationCap size={18} className="mt-0.5 shrink-0 text-blue" aria-hidden="true" />
                  <span className="min-w-0 text-sm font-semibold text-navy">
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
            {canBook ? (
              timezone ? (
                <BookingWidget
                  tutorProfileId={tutor.id}
                  timezone={timezone}
                  days={serializedDays}
                  subjects={tutor.subjects.map((s) => ({ id: s.subject.id, label: tSubjects(s.subject.slug) }))}
                  levels={tutor.levels.map((l) => ({ id: l.academicLevel.id, label: tLevels(l.academicLevel.slug) }))}
                  useStripe={paymentsUseStripe()}
                  stripePublishableKey={process.env.STRIPE_PUBLISHABLE_KEY ?? null}
                  bookableStudents={bookableStudents.map((s) => ({ id: s.id, label: `${s.firstName} ${s.lastName}` }))}
                  actorIsParent={session?.user?.role === "PARENT"}
                />
              ) : (
                <p className="mt-6 text-sm text-slate">{tBooking("noAvailability")}</p>
              )
            ) : session?.user?.role === "PARENT" ? (
              // Phase H.7 — an authenticated Parent with zero currently-
              // bookable children (none yet, or none with active guardian
              // authority) gets a distinct, honest message instead of the
              // generic "sign up" CTA meant for a logged-out visitor.
              <>
                <p className="mt-6 text-sm text-slate">{tProfile("noBookableChildren")}</p>
                <Button href="/dashboard/family" className="mt-3 w-full">
                  {tProfile("manageFamilyCta")}
                </Button>
              </>
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
