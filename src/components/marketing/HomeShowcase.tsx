import Image from "next/image";
import { getTranslations } from "next-intl/server";
import {
  ArrowRight,
  BellRing,
  Mic,
  MonitorUp,
  PhoneOff,
  Quote,
  Star,
  Video,
} from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Link } from "@/i18n/navigation";
import { TrackedCtaButton } from "@/components/marketing/TrackedCtaButton";
import { db } from "@/lib/db";
import { BOOKABLE_TUTOR_WHERE } from "@/lib/tutorBookability";
import { founderNote, founderTutorSlugs, marketResearchTestimonials } from "@/content/homeVoices";

/**
 * HOME-V2 — homepage showcase sections (approved mockup, lot A).
 * Everything shown is either real data (approved tutors), real product
 * behaviour, or a clearly illustrative mini-UI. Sections that depend on
 * content we do not have yet (founder note, testimonials, tutors) render
 * nothing until that content exists.
 */

const eyebrowClass = "text-[13px] font-bold uppercase tracking-[0.12em] text-blue";
const h2Class = "mt-3 text-[clamp(2rem,3.6vw,3rem)] font-extrabold leading-[1.06] tracking-[-0.03em] text-navy";
const tileTitle = "text-2xl font-extrabold tracking-[-0.02em] text-navy";

/* ------------------------------------------------------------------ */
/* Tutors (real approved profiles)                                     */
/* ------------------------------------------------------------------ */

export async function HomeFounders({ locale }: { locale: string }) {
  const [t, tSubjects, tutors] = await Promise.all([
    getTranslations({ locale, namespace: "homeV2.founders" }),
    getTranslations({ locale, namespace: "subjects.items" }),
    db.tutorProfile
      .findMany({
        where: { ...BOOKABLE_TUTOR_WHERE },
        select: {
          id: true,
          slug: true,
          headline: true,
          city: true,
          createdAt: true,
          user: { select: { name: true, image: true } },
          subjects: { select: { subject: { select: { slug: true } } } },
          _count: { select: { availability: true } },
        },
        orderBy: { createdAt: "asc" },
        take: 24,
      })
      // The homepage must still render if marketplace data is unavailable.
      .catch(() => []),
  ]);
  if (tutors.length === 0) return null;

  const founders = new Set(founderTutorSlugs);
  const cards = [...tutors]
    .sort((a, b) => Number(founders.has(b.slug)) - Number(founders.has(a.slug)))
    .slice(0, 8);

  return (
    <Section id="featured-tutors" ariaLabelledby="home-tutors-heading" className="border-y border-border bg-canvas">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div className="max-w-2xl">
          <p className={eyebrowClass}>{t("eyebrow")}</p>
          <h2 id="home-tutors-heading" className={h2Class}>{t("title")}</h2>
          <p className="mt-4 text-lg leading-8 text-text-secondary">{t("description")}</p>
        </div>
        <TrackedCtaButton href="/find-tutors" event="find_tutor_cta_clicked" properties={{ cta_location: "content" }} variant="outline" className="shrink-0">
          {t("browseAll")}
        </TrackedCtaButton>
      </div>
      <ul className="-mx-5 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
        {cards.map((tutor) => {
          const name = tutor.user.name?.trim() || "";
          const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
          const subjects = tutor.subjects.slice(0, 3).map((s) => tSubjects(s.subject.slug));
          return (
            <li key={tutor.id} className="flex w-[78%] shrink-0 snap-start flex-col overflow-hidden rounded-3xl sm:w-auto border border-border bg-white transition-shadow hover:shadow-(--shadow-pop)">
              <div className="relative h-56 bg-gradient-to-br from-blue-100 to-blue-50">
                {tutor.user.image ? (
                  <Image src={tutor.user.image} alt={t("photoAlt", { name })} fill sizes="(min-width: 1024px) 280px, (min-width: 640px) 45vw, 100vw" className="object-cover object-[50%_30%]" />
                ) : (
                  <span aria-hidden="true" className="flex h-full items-center justify-center text-5xl font-extrabold text-blue/70">{initials}</span>
                )}
                <div className="absolute inset-x-3 top-3 flex flex-wrap justify-between gap-2">
                  {founders.has(tutor.slug) ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-navy px-2.5 py-1 text-xs font-bold text-white">
                      <Star className="size-3.5 fill-amber-300 text-amber-300" aria-hidden="true" />
                      {t("founderBadge")}
                    </span>
                  ) : <span />}
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-emerald-700">
                    <span className="size-1.5 rounded-full bg-mint" aria-hidden="true" />
                    {t("verified")}
                  </span>
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-3 p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-lg font-bold text-navy">{name}</h3>
                  {tutor.city ? <span className="truncate text-[13px] text-text-muted">{tutor.city}</span> : null}
                </div>
                {tutor.headline ? <p className="line-clamp-2 text-sm leading-6 text-text-secondary">{tutor.headline}</p> : null}
                {subjects.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {subjects.map((label) => (
                      <li key={label} className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700">{label}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                  <Link href={`/tutors/${tutor.slug}`} className="text-sm font-bold text-blue hover:text-blue-hover">
                    {t("viewProfile")} <span aria-hidden="true">→</span>
                  </Link>
                  {tutor._count.availability === 0 ? <span className="text-xs font-semibold text-amber-700">{t("soon")}</span> : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Platform bento                                                      */
/* ------------------------------------------------------------------ */

const classroomControls = [
  { Icon: Mic, className: "bg-white/15" },
  { Icon: Video, className: "bg-white/15" },
  { Icon: MonitorUp, className: "bg-blue" },
  { Icon: PhoneOff, className: "bg-red-600" },
];

export async function HomePlatform({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "homeV2.platform" });
  const tile = "flex min-w-0 flex-col gap-6 rounded-[28px] border p-7 md:p-8";
  const mock = "mt-auto rounded-2xl bg-white p-5 shadow-[0_20px_40px_-28px_rgba(13,27,42,0.35)]";

  return (
    <Section ariaLabelledby="home-platform-heading" className="bg-white">
      <div className="max-w-3xl">
        <p className={eyebrowClass}>{t("eyebrow")}</p>
        <h2 id="home-platform-heading" className={h2Class}>{t("title")}</h2>
        <p className="mt-4 text-lg leading-8 text-text-secondary md:text-xl md:leading-9">{t("description")}</p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Booking */}
        <article className={`${tile} border-border bg-canvas`}>
          <div>
            <h3 className={tileTitle}>{t("booking.title")}</h3>
            <p className="mt-2 leading-7 text-text-secondary">{t("booking.text")}</p>
          </div>
          <div aria-hidden="true" className={`${mock} border border-border`}>
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-text-muted">{t("booking.day")}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm font-semibold">
              <span className="rounded-lg border border-border py-2.5">15:00</span>
              <span className="rounded-lg bg-blue py-2.5 text-white">16:00</span>
              <span className="rounded-lg border border-border py-2.5">17:30</span>
            </div>
            <div className="mt-4 flex justify-between border-t border-dashed border-neutral-300 pt-3.5 text-sm">
              <span className="text-text-secondary">{t("booking.total")}</span>
              <span className="font-bold text-navy">{t("booking.price")}</span>
            </div>
          </div>
        </article>

        {/* Classroom (wide) */}
        <article className={`${tile} border-navy bg-navy text-white lg:col-span-2 lg:flex-row`}>
          <div className="flex flex-col gap-3 lg:w-[38%]">
            <h3 className="text-2xl font-extrabold tracking-[-0.02em]">{t("classroom.title")}</h3>
            <p className="leading-7 text-white/75">{t("classroom.text")}</p>
            <Link href="/online-classroom" className="mt-auto inline-flex items-center gap-2 font-bold text-blue-100 hover:text-white">
              {t("classroom.cta")} <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-2xl border border-white/10 bg-[#13263d] p-3">
            <div className="grid flex-1 grid-cols-2 gap-3">
              <div className="relative min-h-40 overflow-hidden rounded-xl">
                <Image src="/images/classroom-tutor-video.webp" alt={t("classroom.tutorAlt")} fill sizes="(min-width: 1024px) 260px, 45vw" className="object-cover object-[55%_30%]" />
                <span className="absolute bottom-2 left-2 rounded-md bg-navy/75 px-2 py-0.5 text-xs">{t("classroom.tutor")}</span>
              </div>
              <div className="relative min-h-40 overflow-hidden rounded-xl">
                <Image src="/images/auth-portrait-3.webp" alt={t("classroom.studentAlt")} fill sizes="(min-width: 1024px) 260px, 45vw" className="object-cover object-[50%_30%]" />
                <span className="absolute bottom-2 left-2 rounded-md bg-navy/75 px-2 py-0.5 text-xs">{t("classroom.student")}</span>
              </div>
            </div>
            <div aria-hidden="true" className="flex justify-center gap-2.5">
              {classroomControls.map(({ Icon, className }, index) => (
                <span key={index} className={`flex size-10 items-center justify-center rounded-full ${className}`}><Icon className="size-[18px]" /></span>
              ))}
            </div>
          </div>
        </article>

        {/* Family */}
        <article className={`${tile} border-blue-100 bg-blue-50`}>
          <div>
            <h3 className={tileTitle}>{t("family.title")}</h3>
            <p className="mt-2 leading-7 text-text-secondary">{t("family.text")}</p>
          </div>
          <div aria-hidden="true" className={`${mock} p-2`}>
            {[
              { initial: t("family.childOne").charAt(0), name: t("family.childOne"), next: t("family.childOneNext"), bg: "bg-blue" },
              { initial: t("family.childTwo").charAt(0), name: t("family.childTwo"), next: t("family.childTwoNext"), bg: "bg-mint" },
            ].map((child) => (
              <div key={child.name} className="flex items-center gap-3 p-3">
                <span className={`flex size-9 items-center justify-center rounded-full font-bold text-white ${child.bg}`}>{child.initial}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-navy">{child.name}</span>
                  <span className="block text-xs text-text-muted">{child.next}</span>
                </span>
                <span className="rounded-full bg-mint-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{t("family.status")}</span>
              </div>
            ))}
          </div>
        </article>

        {/* Quick Match */}
        <article className={`${tile} border-border bg-canvas`}>
          <div>
            <h3 className={tileTitle}>{t("quickMatch.title")}</h3>
            <p className="mt-2 leading-7 text-text-secondary">{t("quickMatch.text")}</p>
          </div>
          <div aria-hidden="true" className="mt-auto flex flex-col gap-2.5">
            <p className="max-w-[88%] self-start rounded-2xl rounded-bl-sm border border-border bg-white px-4 py-3 text-sm leading-6 text-navy">{t("quickMatch.request")}</p>
            <p className="self-end rounded-2xl rounded-br-sm bg-blue px-4 py-2.5 text-sm font-semibold text-white">{t("quickMatch.accepted")}</p>
          </div>
        </article>

        {/* Reminders */}
        <article className={`${tile} border-emerald-100 bg-mint-50`}>
          <div>
            <h3 className={tileTitle}>{t("reminders.title")}</h3>
            <p className="mt-2 leading-7 text-text-secondary">{t("reminders.text")}</p>
          </div>
          <div aria-hidden="true" className={`${mock} flex items-start gap-3`}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-navy text-white"><BellRing className="size-[18px]" /></span>
            <span>
              <span className="block text-sm font-bold text-navy">{t("reminders.notifTitle")}</span>
              <span className="mt-0.5 block text-xs text-text-muted">{t("reminders.notifMeta")}</span>
            </span>
          </div>
        </article>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Virtual classroom showcase (dark)                                   */
/* ------------------------------------------------------------------ */

export async function HomeClassroom({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "homeV2.classroom" });
  const features = t.raw("features") as { title: string; text: string }[];

  return (
    <section aria-labelledby="home-classroom-heading" className="bg-navy bg-[radial-gradient(900px_500px_at_15%_0%,rgba(37,99,235,0.35)_0%,transparent_60%)] py-20 text-white md:py-28">
      <div className="mx-auto w-full max-w-(--container-page) px-5 md:px-10">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-emerald-300">{t("eyebrow")}</p>
          <h2 id="home-classroom-heading" className="mt-3 text-[clamp(2.1rem,4vw,3.4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">{t("title")}</h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/75">{t("description")}</p>
        </div>

        <div className="mx-auto mt-14 max-w-5xl overflow-hidden rounded-3xl border border-white/12 bg-[#13263d] shadow-[0_60px_120px_-40px_rgba(0,0,0,0.7)]">
          <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
            <span className="size-2.5 rounded-full bg-red-500" aria-hidden="true" />
            <span className="size-2.5 rounded-full bg-amber-400" aria-hidden="true" />
            <span className="size-2.5 rounded-full bg-mint" aria-hidden="true" />
            <span className="mx-auto hidden rounded-lg bg-white/7 px-4 py-1 text-xs text-white/70 sm:block">futuretutor.ca</span>
            <span className="ml-auto rounded-full bg-mint/20 px-2.5 py-1 text-xs font-bold text-emerald-300 sm:ml-0">● {t("live")}</span>
          </div>
          <div className="flex flex-col gap-3.5 p-4 md:flex-row">
            <div aria-hidden="true" className="flex min-h-72 flex-[3] flex-col gap-3.5 rounded-2xl bg-canvas p-6 text-navy">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-text-muted">{t("screenLabel")}</p>
              <p className="text-2xl font-extrabold">{t("problem")}</p>
              <div className="font-mono text-lg leading-9 text-neutral-800">
                <p>Δ = b² − 4ac = 25 + 24 = 49</p>
                <p>x = (5 ± 7) / 4</p>
                <p><span className="rounded-md bg-blue-100 px-2 py-0.5">x = 3 · x = −1/2</span></p>
              </div>
            </div>
            <div className="grid flex-[1.2] grid-cols-2 gap-3.5 md:grid-cols-1">
              <div className="relative min-h-36 overflow-hidden rounded-2xl">
                <Image src="/images/classroom-tutor-video.webp" alt={t("videoAlt")} fill sizes="(min-width: 768px) 300px, 45vw" className="object-cover object-[55%_30%]" />
              </div>
              <div className="relative min-h-36 overflow-hidden rounded-2xl">
                <Image src="/images/auth-portrait-5.webp" alt={t("studentAlt")} fill sizes="(min-width: 768px) 300px, 45vw" className="object-cover object-[50%_35%]" />
              </div>
            </div>
          </div>
          <div aria-hidden="true" className="flex justify-center gap-3 px-4 pb-5 pt-1">
            {classroomControls.map(({ Icon, className }, index) => (
              <span key={index} className={`flex size-11 items-center justify-center rounded-full ${className}`}><Icon className="size-5" /></span>
            ))}
          </div>
        </div>

        <ul className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <li key={feature.title}>
              <p className="text-[17px] font-bold">{feature.title}</p>
              <p className="mt-1.5 leading-7 text-white/70">{feature.text}</p>
            </li>
          ))}
        </ul>
        <div className="mt-12 text-center">
          <Link href="/online-classroom" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-6 font-bold text-navy transition-colors hover:bg-blue-50">
            {t("cta")} <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Founder note + market-research testimonials (real content only)     */
/* ------------------------------------------------------------------ */

export async function HomeVoices({ locale }: { locale: string }) {
  if (!founderNote && marketResearchTestimonials.length === 0) return null;
  const t = await getTranslations({ locale, namespace: "homeV2.voices" });
  const lang = locale === "fr" ? "fr" : "en";

  return (
    <Section ariaLabelledby={marketResearchTestimonials.length > 0 ? "home-voices-heading" : undefined} className="bg-white">
      {founderNote ? (
        <figure className="flex flex-col gap-10 rounded-[32px] bg-navy p-8 text-white md:flex-row md:items-center md:p-12">
          <div className="relative h-64 w-full shrink-0 overflow-hidden rounded-3xl bg-[#13263d] md:w-56">
            {founderNote.photo ? (
              <Image src={founderNote.photo} alt={founderNote.name} fill sizes="224px" className="object-cover" />
            ) : null}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-emerald-300">{t("founderEyebrow")}</p>
            <blockquote className="mt-4 text-[clamp(1.4rem,2.4vw,2rem)] font-bold leading-snug tracking-[-0.02em]">« {founderNote.quote[lang]} »</blockquote>
            <figcaption className="mt-6">
              <span className="block font-bold">{founderNote.name}</span>
              <span className="block text-sm text-white/65">{t("founderRole")}</span>
            </figcaption>
          </div>
        </figure>
      ) : null}

      {marketResearchTestimonials.length > 0 ? (
        <div className={founderNote ? "mt-20 md:mt-24" : undefined}>
          <div className="mx-auto max-w-2xl text-center">
            <p className={eyebrowClass}>{t("eyebrow")}</p>
            <h2 id="home-voices-heading" className={h2Class}>{t("title")}</h2>
            <p className="mt-4 text-lg leading-8 text-text-secondary">{t("description")}</p>
          </div>
          <ul className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {marketResearchTestimonials.map((item, index) => (
              <li key={item.id}>
                <figure className={`flex h-full flex-col gap-6 rounded-3xl border border-border p-8 ${index % 2 === 1 ? "bg-blue-50" : "bg-white"}`}>
                  <Quote className="size-8 fill-blue text-blue" aria-hidden="true" />
                  <blockquote className="text-lg leading-8 text-neutral-800">{item.quote[lang]}</blockquote>
                  <figcaption className="mt-auto flex items-center gap-3">
                    <span aria-hidden="true" className="flex size-11 items-center justify-center rounded-full bg-navy font-bold text-white">{item.name.charAt(0)}</span>
                    <span>
                      <span className="block font-bold text-navy">{item.name}</span>
                      <span className="block text-sm text-text-muted">{item.role[lang]}</span>
                    </span>
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Role cards (final call to action)                                   */
/* ------------------------------------------------------------------ */

export async function HomeRoles({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "homeV2.roles" });
  const roles = [
    { key: "student", href: "/find-tutors", className: "bg-blue hover:bg-blue-hover" },
    { key: "parent", href: "/signup?role=parent", className: "bg-[#13263d] hover:bg-[#1a3150]" },
    { key: "tutor", href: "/become-a-tutor", className: "bg-[#13263d] hover:bg-[#1a3150]" },
  ] as const;

  return (
    <section aria-labelledby="home-roles-heading" className="bg-navy py-20 text-white md:py-28">
      <div className="mx-auto w-full max-w-(--container-page) px-5 md:px-10">
        <h2 id="home-roles-heading" className="text-center text-[clamp(2.1rem,4vw,3.2rem)] font-extrabold leading-[1.06] tracking-[-0.03em]">{t("title")}</h2>
        <ul className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          {roles.map((role) => (
            <li key={role.key}>
              <Link href={role.href} className={`flex h-full min-h-52 flex-col gap-2.5 rounded-3xl border border-white/12 p-8 transition-colors ${role.className}`}>
                <span className="text-sm font-bold text-white/70">{t(`${role.key}.kicker`)}</span>
                <span className="text-[26px] font-extrabold leading-tight tracking-[-0.02em]">{t(`${role.key}.title`)}</span>
                <span className="leading-7 text-white/75">{t(`${role.key}.text`)}</span>
                <span className="mt-auto inline-flex items-center gap-2 pt-3 font-bold">{t(`${role.key}.cta`)} <ArrowRight className="size-4" aria-hidden="true" /></span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
