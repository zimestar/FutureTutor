import { useLocale, useTranslations } from "next-intl";
import { Star, MapPin, Laptop } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { formatHourlyRate } from "@/lib/utils";
import type { DemoTutor } from "@/types/tutor";

export function TutorCard({ tutor }: { tutor: DemoTutor }) {
  const locale = useLocale();
  const t = useTranslations("tutorCard");
  const tSubjects = useTranslations("subjects.items");
  const tDemo = useTranslations(`demoTutors.${tutor.id}`);

  return (
    <Card className="flex h-full flex-col p-5 hover:shadow-card-hover">
      <div className="flex items-start gap-4">
        <Avatar name={tutor.firstName} size={56} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold text-navy">{tutor.firstName}</h3>
          <p className="text-sm font-semibold text-slate">{tDemo("headline")}</p>
          <div className="mt-1 flex items-center gap-1 text-sm">
            <Star size={14} className="text-warning" fill="currentColor" strokeWidth={0} />
            <span className="font-bold text-navy">{tutor.rating.toFixed(1)}</span>
            <span className="text-slate">{t("reviews", { count: tutor.reviewCount })}</span>
          </div>
        </div>
      </div>

      {tutor.badges.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tutor.badges.map((badge) => (
            <Badge key={badge} variant={badge === "topTutor" ? "mint" : "blue"}>
              {t(`badges.${badge}`)}
            </Badge>
          ))}
        </div>
      )}

      <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-neutral-600">{tDemo("bio")}</p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {tutor.subjectSlugs.map((slug) => (
          <Badge key={slug} variant="neutral">
            {tSubjects(slug)}
          </Badge>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate">
        <span className="flex items-center gap-1">
          <Laptop size={14} aria-hidden="true" />
          {t(`mode.${tutor.learningMode}`)}
        </span>
        <span className="flex items-center gap-1">
          <MapPin size={14} aria-hidden="true" />
          {tutor.city}
        </span>
        <span>{t("yearsExperience", { count: tutor.yearsExperience })}</span>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-neutral-200 pt-4">
        <p className="text-lg font-extrabold text-navy">
          {formatHourlyRate(tutor.hourlyRateCad, locale)}
          <span className="text-sm font-semibold text-slate"> {t("perHour")}</span>
        </p>
        <Link
          href={`/tutors/${tutor.slug}`}
          className="text-sm font-bold text-blue hover:text-blue-hover"
        >
          {t("viewProfile")} →
        </Link>
      </div>
    </Card>
  );
}
