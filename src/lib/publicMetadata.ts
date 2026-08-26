import type { Metadata } from "next";
import { site } from "@/content/site";
import { routing } from "@/i18n/routing";

export function publicPageMetadata({ locale, path, title, description }: { locale: string; path: string; title: string; description: string }): Metadata {
  const normalizedPath = path === "/" ? "" : path;
  const localizedPath = `/${locale}${normalizedPath}`;
  return {
    title,
    description,
    alternates: {
      canonical: localizedPath,
      languages: Object.fromEntries(routing.locales.map((language) => [language, `/${language}${normalizedPath}`])),
    },
    openGraph: { type: "website", locale: locale === "fr" ? "fr_CA" : "en_CA", url: `${site.url}${localizedPath}`, siteName: site.name, title, description },
    twitter: { card: "summary", title, description },
  };
}
