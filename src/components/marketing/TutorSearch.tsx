"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { subjects } from "@/content/subjects";
import { trackEvent } from "@/lib/analytics";
import type { GradeLevelKey } from "@/types/tutor";

const gradeLevelKeys: GradeLevelKey[] = [
  "elementary",
  "middleSchool",
  "highSchool",
  "cegepCollege",
  "university",
  "adultLearner",
];

export function TutorSearch({
  className,
  resultsPath = "/find-tutors",
  presentation = "default",
}: {
  className?: string;
  resultsPath?: string;
  presentation?: "default" | "hero";
}) {
  const router = useRouter();
  const t = useTranslations("search");
  const tLevels = useTranslations("gradeLevels");
  const tSubjects = useTranslations("subjects.items");
  const [subject, setSubject] = useState("");
  const [level, setLevel] = useState("");
  const [mode, setMode] = useState("");
  const [subjectOpen, setSubjectOpen] = useState(false);
  const [activeSubject, setActiveSubject] = useState(-1);
  const subjectRoot = useRef<HTMLDivElement>(null);
  const localizedSubjects = useMemo(
    () => subjects.map(({ slug }) => ({ slug, label: tSubjects(slug) })),
    [tSubjects],
  );
  const filteredSubjects = localizedSubjects.filter(({ label }) =>
    label.toLocaleLowerCase().includes(subject.trim().toLocaleLowerCase()),
  );

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!subjectRoot.current?.contains(event.target as Node)) setSubjectOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  function selectSubject(label: string) {
    setSubject(label);
    setSubjectOpen(false);
    setActiveSubject(-1);
  }

  function handleSubjectKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSubjectOpen(true);
      setActiveSubject((current) => Math.min(current + 1, filteredSubjects.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSubjectOpen(true);
      setActiveSubject((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && subjectOpen && activeSubject >= 0) {
      event.preventDefault();
      selectSubject(filteredSubjects[activeSubject].label);
    } else if (event.key === "Escape") {
      setSubjectOpen(false);
      setActiveSubject(-1);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    trackEvent("search_started", { subject, level, mode });

    const params = new URLSearchParams();
    if (subject) params.set("subject", subject);
    if (level) params.set("level", level);
    if (mode) params.set("mode", mode);

    router.push(`${resultsPath}?${params.toString()}`);
  }

  const isHero = presentation === "hero";

  return (
    <form
      onSubmit={handleSubmit}
      className={`${isHero ? "rounded-2xl border border-white/80 bg-white/96 p-4 shadow-[0_24px_70px_rgba(15,35,67,0.16)] backdrop-blur-sm md:p-5" : "rounded-xl border border-neutral-200 bg-white p-3 shadow-pop md:p-4"} ${className ?? ""}`}
    >
      <div className={`grid grid-cols-1 gap-3 ${isHero ? "md:grid-cols-2 min-[1366px]:grid-cols-[1.4fr_1fr_1fr_auto] min-[1366px]:items-end" : "md:grid-cols-[1.4fr_1fr_1fr_auto]"}`}>
        <div ref={subjectRoot} className="relative">
          <label htmlFor="search-subject" className={isHero ? "mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-navy/70" : "sr-only"}>
            {t("subjectLabel")}
          </label>
          <Input
            id="search-subject"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={subjectOpen}
            aria-controls="subject-options"
            aria-activedescendant={activeSubject >= 0 ? `subject-option-${filteredSubjects[activeSubject]?.slug}` : undefined}
            placeholder={t("subjectPlaceholder")}
            value={subject}
            className="pr-11"
            onFocus={() => setSubjectOpen(true)}
            onClick={() => setSubjectOpen(true)}
            onChange={(e) => {
              setSubject(e.target.value);
              setSubjectOpen(true);
              setActiveSubject(-1);
            }}
            onKeyDown={handleSubjectKeyDown}
          />
          <ChevronDown className="pointer-events-none absolute right-3 top-[calc(50%+0.75rem)] size-5 -translate-y-1/2 text-slate" aria-hidden="true" />
          {subjectOpen && filteredSubjects.length > 0 ? (
            <ul id="subject-options" role="listbox" className="absolute left-0 right-0 top-full z-[70] mt-2 max-h-64 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1.5 shadow-[0_18px_45px_rgba(15,35,67,0.2)]">
              {filteredSubjects.map(({ slug, label }, index) => {
                const selected = subject === label;
                return (
                  <li
                    id={`subject-option-${slug}`}
                    key={slug}
                    role="option"
                    aria-selected={selected}
                    className={`flex min-h-11 cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm text-navy ${index === activeSubject ? "bg-blue/10" : "hover:bg-neutral-100"}`}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => selectSubject(label)}
                  >
                    <span>{label}</span>
                    {selected ? <Check className="size-4 text-blue" aria-hidden="true" /> : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        <div>
          <label htmlFor="search-mode" className={isHero ? "mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-navy/70" : "sr-only"}>
            {t("modeLabel")}
          </label>
          <Select id="search-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="">{t("modePlaceholder")}</option>
            <option value="online">{t("online")}</option>
            <option value="in-person">{t("inPerson")}</option>
          </Select>
        </div>

        <div>
          <label htmlFor="search-level" className={isHero ? "mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-navy/70" : "sr-only"}>
            {t("levelLabel")}
          </label>
          <Select id="search-level" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">{t("levelPlaceholder")}</option>
            {gradeLevelKeys.map((key) => (
              <option key={key} value={key}>
                {tLevels(key)}
              </option>
            ))}
          </Select>
        </div>

        <Button type="submit" size="md" className={isHero ? "h-12 w-full md:col-span-2 min-[1366px]:col-span-1 min-[1366px]:w-auto" : "w-full md:w-auto"}>
          <Search size={18} aria-hidden="true" />
          <span>{t(isHero ? "heroSubmit" : "submit")}</span>
        </Button>
      </div>
    </form>
  );
}
