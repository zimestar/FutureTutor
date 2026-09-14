import type { Metadata } from "next";
import { site } from "@/content/site";
import { routing } from "@/i18n/routing";

export function publicPageMetadata({
  locale,
  path,
  title,
  description,
  index = true,
}: {
  locale: string;
  path: string;
  title: string;
  description: string;
  /** SEO-1 — defaults true (unchanged behavior for every existing caller).
   * Pass false for transactional/utility pages (login, signup, password
   * reset, email verification) that offer no unique search value and
   * shouldn't surface as search results — standard practice, not a security
   * boundary (real access control is unchanged, server-side auth). */
  index?: boolean;
}): Metadata {
  const normalizedPath = path === "/" ? "" : path;
  const localizedPath = `/${locale}${normalizedPath}`;
  return {
    title,
    description,
    robots: index ? undefined : { index: false, follow: true },
    alternates: {
      canonical: localizedPath,
      languages: Object.fromEntries(routing.locales.map((language) => [language, `/${language}${normalizedPath}`])),
    },
    openGraph: {
      type: "website",
      locale: locale === "fr" ? "fr_CA" : "en_CA",
      url: `${site.url}${localizedPath}`,
      siteName: site.name,
      title,
      description,
      images: [{ url: site.ogImage.url, width: site.ogImage.width, height: site.ogImage.height, alt: site.name }],
    },
    twitter: { card: "summary_large_image", title, description, images: [site.ogImage.url] },
  };
}
