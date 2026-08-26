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
import { Link } from "@/i18n/navigation";
import { Section } from "@/components/ui/Section";
import { subjects, type Subject } from "@/content/subjects";

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
        <h2 id="subjects-heading" className="text-3xl font-bold tracking-tight text-navy md:text-4xl">
          {t("heading")}
        </h2>
        <p className="mt-3 text-lg text-slate">{t("subheading")}</p>
      </div>}

      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
        {subjects.map((subject) => {
          const Icon = iconMap[subject.icon];
          return (
            <Link
              key={subject.slug}
              href={`/subjects/${subject.slug}`}
              className="group flex flex-col items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-6 text-center shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-blue/30 hover:shadow-card-hover"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-md bg-blue/10 text-blue transition-colors group-hover:bg-blue group-hover:text-white">
                <Icon size={22} aria-hidden="true" />
              </span>
              <span className="text-sm font-semibold text-navy">{tItems(subject.slug)}</span>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}
