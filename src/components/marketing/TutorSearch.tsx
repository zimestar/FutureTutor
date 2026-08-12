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

export function TutorSearch({ className }: { className?: string }) {
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

    router.push(`/find-tutors?${params.toString()}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-xl border border-neutral-200 bg-white p-3 shadow-pop md:p-4 ${className ?? ""}`}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.4fr_1fr_1fr_auto]">
        <div>
          <label htmlFor="search-subject" className="sr-only">
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
          <label htmlFor="search-level" className="sr-only">
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
          <label htmlFor="search-mode" className="sr-only">
            {t("modeLabel")}
          </label>
          <Select id="search-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="">{t("modePlaceholder")}</option>
            <option value="online">{t("online")}</option>
            <option value="in-person">{t("inPerson")}</option>
          </Select>
        </div>

        <Button type="submit" size="md" className="w-full md:w-auto">
          <Search size={18} aria-hidden="true" />
          <span>{t("submit")}</span>
        </Button>
      </div>
    </form>
  );
}
