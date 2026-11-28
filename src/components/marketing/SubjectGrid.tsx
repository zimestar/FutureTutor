import { useTranslations } from "next-intl";
import {
  Sigma,
  BookOpen,
  Languages,
  Microscope,
  FlaskConical,
  Atom,
  Dna,
  Code2,
  NotebookPen,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Section } from "@/components/ui/Section";
import { subjects, type Subject } from "@/content/subjects";

/** HOME-COLOR — each subject gets its own accent tone. */
const tones = [
  "bg-blue-50 text-blue group-hover:bg-blue group-hover:text-white",
  "bg-coral-50 text-[#c2410c] group-hover:bg-coral group-hover:text-navy",
  "bg-mint-50 text-emerald-700 group-hover:bg-mint group-hover:text-navy",
  "bg-sun-50 text-amber-700 group-hover:bg-sun group-hover:text-navy",
  "bg-lilac-50 text-[#6d5bd0] group-hover:bg-lilac group-hover:text-white",
];

const iconMap: Record<Subject["icon"], LucideIcon> = {
  sigma: Sigma,
  "book-open": BookOpen,
  languages: Languages,
  microscope: Microscope,
  "flask-conical": FlaskConical,
  atom: Atom,
  dna: Dna,
  code: Code2,
  "notebook-pen": NotebookPen,
  "graduation-cap": GraduationCap,
};

export function SubjectGrid({ showHeader = true }: { showHeader?: boolean }) {
  const t = useTranslations("subjects");
  const tItems = useTranslations("subjects.items");

  return (
    <Section id="subjects" ariaLabelledby="subjects-heading" className="bg-off-white">
      {showHeader && <div className="mx-auto max-w-2xl text-center">
        <h2 id="subjects-heading" className="text-[2rem] font-extrabold leading-[1.12] text-navy md:text-[2.6rem]">
          {t("heading")}
        </h2>
        <p className="mt-5 text-lg leading-8 text-neutral-600">{t("subheading")}</p>
      </div>}

      <div className="reveal-stagger mt-12 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {subjects.map((subject, index) => {
          const Icon = iconMap[subject.icon];
          return (
            <Link
              key={subject.slug}
              href={`/subjects/${subject.slug}`}
              className="group flex items-center gap-4 rounded-2xl border border-border bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue/30 hover:shadow-(--shadow-card-hover)"
            >
              <span className={`flex size-12 shrink-0 items-center justify-center rounded-xl transition-colors ${tones[index % tones.length]}`}>
                <Icon size={22} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 text-[15px] font-semibold text-navy">{tItems(subject.slug)}</span>
              <ArrowUpRight className="size-4 shrink-0 text-neutral-300 transition-colors group-hover:text-blue" aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </Section>
  );
}
