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
    // SEO-PRIVATE-NOINDEX1 re-audit finding: this previously emitted
    // `follow: true` for every index:false caller, with no documented
    // reason — every current caller is an auth-utility page (login,
    // signup, forgot-password, reset-password, verify-email,
    // check-email), for which this mission's own policy is
    // `follow: false` unless a specific route documents otherwise. The
    // one other caller of `index: false` (a draft resource article —
    // currently zero live drafts exist) is strictly better served by the
    // same conservative default, not worse.
    robots: index ? undefined : { index: false, follow: false },
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
