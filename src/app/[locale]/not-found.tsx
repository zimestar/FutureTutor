import { getLocale, getTranslations } from "next-intl/server";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { NotFoundContent } from "@/components/marketing/NotFoundContent";

/**
 * UX-404 fix. not-found.js components receive no props (confirmed against
 * the installed Next.js docs, node_modules/next/dist/docs/.../not-found.md),
 * so this can never read `locale` from route params the way every other
 * page in this app does. The previous version called `getTranslations`
 * without an explicit locale and never called `setRequestLocale`, which is
 * what let a plain `notFound()` throw (e.g. from an invalid tutor slug in
 * tutors/[slug]/page.tsx) fall through to Next's generic, unbranded,
 * English-only 404 instead of this file's UI.
 *
 * `getLocale()` (next-intl/server) is the documented, prop-less, safe way to
 * resolve the current request's locale here: it reads the same
 * middleware-set locale header used by getRequestConfig's own fallback
 * (src/i18n/request.ts), which already validates against `routing.locales`
 * and falls back to `routing.defaultLocale` — so this never derives locale
 * from unvalidated input and never silently renders a broken localized
 * route.
 */
export default async function NotFound() {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "comingSoon.notFound" });
  const tComingSoon = await getTranslations({ locale, namespace: "comingSoon" });

  return (
    <MarketingShell>
      <NotFoundContent
        title={t("title")}
        description={t("description")}
        homeHref={`/${locale}`}
        homeLabel={tComingSoon("backHome")}
        findTutorHref={`/${locale}/find-tutors`}
        findTutorLabel={t("findTutorCta")}
      />
    </MarketingShell>
  );
}
