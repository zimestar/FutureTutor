"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowRight, ChevronDown, CreditCard, Footprints, MonitorPlay, Search, ShieldCheck, UsersRound } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** HOME-V2 — "Find help" mega menu in the public header (desktop only). */
const items = [
  { key: "browse", href: "/find-tutors", Icon: Search, tone: "bg-blue-50 text-blue" },
  { key: "howItWorks", href: "/how-it-works", Icon: Footprints, tone: "bg-mint-50 text-emerald-700" },
  { key: "online", href: "/online-classroom", Icon: MonitorPlay, tone: "bg-blue-50 text-blue" },
  { key: "parents", href: "/parents", Icon: UsersRound, tone: "bg-sand text-amber-700" },
  { key: "pricing", href: "/pricing", Icon: CreditCard, tone: "bg-neutral-100 text-neutral-700" },
  { key: "safety", href: "/safety", Icon: ShieldCheck, tone: "bg-mint-50 text-emerald-700" },
] as const;

const popularSubjects = ["math", "french", "english", "science", "chemistry", "physics"] as const;

export function MegaMenu() {
  const t = useTranslations("homeV2.megaMenu");
  const tSubjects = useTranslations("subjects.items");
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const root = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const panelId = useId();

  useEffect(() => {
    // Close on navigation.
    const timer = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const show = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hide = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  };

  return (
    <div ref={root} onMouseEnter={show} onMouseLeave={hide}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        // Hover already opens it on desktop; a click (or Enter/Space) must not
        // immediately close what the hover just opened. Escape, an outside
        // click or leaving the menu closes it.
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-[15px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-navy",
          open && "bg-blue-50 text-blue hover:bg-blue-50 hover:text-blue"
        )}
      >
        {t("trigger")}
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-full border-t border-border bg-white shadow-[0_40px_80px_-30px_rgba(13,27,42,0.45)]"
      >
        <div className="mx-auto flex w-full max-w-(--container-page) gap-0 px-5 md:px-10">
          <div className="flex-1 py-8 pr-8">
            <p className="px-3 text-xs font-bold uppercase tracking-[0.1em] text-text-muted">{t("heading")}</p>
            <ul className="mt-3 grid grid-cols-2 gap-1">
              {items.map(({ key, href, Icon, tone }) => (
                <li key={key}>
                  <Link href={href} onClick={() => setOpen(false)} className="flex gap-3.5 rounded-2xl p-3 transition-colors hover:bg-neutral-50">
                    <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", tone)}>
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block font-bold text-navy">{t(`items.${key}.title`)}</span>
                      <span className="mt-0.5 block text-sm leading-6 text-text-muted">{t(`items.${key}.text`)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="w-56 shrink-0 border-l border-border px-7 py-8">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-text-muted">{t("subjectsHeading")}</p>
            <ul className="mt-4 flex flex-col gap-3">
              {popularSubjects.map((slug) => (
                <li key={slug}>
                  <Link href={`/subjects/${slug}`} onClick={() => setOpen(false)} className="text-[15px] font-medium text-navy hover:text-blue">
                    {tSubjects(slug)}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/subjects" onClick={() => setOpen(false)} className="inline-flex items-center gap-1.5 text-[15px] font-bold text-blue">
                  {t("allSubjects")} <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </li>
            </ul>
          </div>
          <Link
            href="/online-classroom"
            onClick={() => setOpen(false)}
            className="relative my-6 block w-80 shrink-0 overflow-hidden rounded-3xl text-white"
          >
            <Image src="/images/online-classroom-call.webp" alt={t("card.imageAlt")} fill sizes="320px" className="object-cover" />
            <span className="absolute inset-0 bg-gradient-to-t from-navy/95 via-navy/30 to-transparent" />
            <span className="absolute inset-x-6 bottom-6">
              <span className="block text-xs font-bold uppercase tracking-[0.1em] text-emerald-300">{t("card.eyebrow")}</span>
              <span className="mt-1.5 block text-xl font-extrabold leading-tight">{t("card.title")}</span>
              <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold">{t("card.cta")} <ArrowRight className="size-4" aria-hidden="true" /></span>
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
