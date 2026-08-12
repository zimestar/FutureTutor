import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/marketing/Logo";
import { LanguageSwitcher } from "@/components/marketing/LanguageSwitcher";
import { footerNav } from "@/content/navigation";
import { Container } from "@/components/ui/Container";

const columns = [
  { titleKey: "students" as const, items: footerNav.students },
  { titleKey: "tutors" as const, items: footerNav.tutors },
  { titleKey: "company" as const, items: footerNav.company },
  { titleKey: "legal" as const, items: footerNav.legal },
];

export function Footer() {
  const t = useTranslations("footer");

  return (
    <footer className="border-t border-white/10 bg-navy text-white/70">
      <Container className="py-14 md:py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.2fr_2fr]">
          <div>
            <Logo variant="dark" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed">{t("description")}</p>
            <div className="mt-5 flex items-center gap-3">
              <p className="text-xs font-semibold text-white/50">{t("region")}</p>
              <LanguageSwitcher className="border-white/20" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {columns.map((col) => (
              <div key={col.titleKey}>
                <h3 className="text-sm font-bold text-white">{t(`columns.${col.titleKey}`)}</h3>
                <ul className="mt-4 flex flex-col gap-3">
                  {col.items.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} className="text-sm hover:text-white">
                        {t(`links.${item.key}`)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>{t("copyright", { year: new Date().getFullYear() })}</p>
          <p>{t("tagline")}</p>
        </div>
      </Container>
    </footer>
  );
}
