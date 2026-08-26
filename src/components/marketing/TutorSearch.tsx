"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";
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
      <div className={`grid grid-cols-1 gap-3 ${isHero ? "md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_auto] xl:items-end" : "md:grid-cols-[1.4fr_1fr_1fr_auto]"}`}>
        <div>
          <label htmlFor="search-subject" className={isHero ? "mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-navy/70" : "sr-only"}>
            {t("subjectLabel")}
          </label>
          <Input
            id="search-subject"
            list="subject-options"
            placeholder={t("subjectPlaceholder")}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <datalist id="subject-options">
            {subjects.map((s) => (
              <option key={s.slug} value={tSubjects(s.slug)} />
            ))}
          </datalist>
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

        <Button type="submit" size="md" className={isHero ? "h-12 w-full md:col-span-2 xl:col-span-1 xl:w-auto" : "w-full md:w-auto"}>
          <Search size={18} aria-hidden="true" />
          <span>{t(isHero ? "heroSubmit" : "submit")}</span>
        </Button>
      </div>
    </form>
  );
}
