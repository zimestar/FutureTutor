import { headers } from "next/headers";
import Image from "next/image";
import { Manrope } from "next/font/google";
import { Container } from "@/components/ui/Container";
import { NotFoundContent } from "@/components/marketing/NotFoundContent";
import { routing, type Locale } from "@/i18n/routing";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const messagesByLocale = { en, fr };

// The exact header next-intl's own middleware (invoked via src/proxy.ts's
// intlMiddleware) sets on every matching request — confirmed against the
// installed package (node_modules/next-intl/dist/.../shared/constants.js).
// Not exported publicly, so the literal is reproduced here rather than
// imported from an internal path.
const LOCALE_HEADER = "X-NEXT-INTL-LOCALE";

/**
 * UX-404 fix — handles genuinely unmatched URLs (a path with no matching
 * page anywhere, e.g. a typo'd route). Per the installed Next.js 16 docs
 * (node_modules/next/dist/docs/.../not-found.md): "global-not-found.js is
 * useful when... your root layout is defined using top-level dynamic
 * segments" — exactly this app's shape (src/app/[locale]/layout.tsx is the
 * only layout defining <html>/<body>, with no plain src/app/layout.tsx). For
 * that architecture, Next.js "skips rendering" the normal layout tree for a
 * fully unmatched path and needs this root-level file instead;
 * src/app/[locale]/not-found.tsx (still fixed separately) remains the
 * correct file for an explicit notFound() thrown from inside a route that
 * DID match, e.g. an invalid tutor slug.
 *
 * Confirmed empirically against a local dev server that global-not-found.js
 * bypasses next-intl's request pipeline entirely — every next-intl server
 * API (getLocale/getTranslations, and the shared Link/Button components
 * built on it) throws "No intl context found" here, even though the exact
 * same calls work correctly in [locale]/not-found.tsx. This file therefore
 * resolves locale itself by reading the same header next-intl's own
 * middleware already sets (see LOCALE_HEADER above), validated against
 * `routing.locales` with a safe fallback to `routing.defaultLocale` — never
 * derived from unvalidated input — and reads translated strings directly
 * from the message catalogs rather than through next-intl's context-bound
 * APIs. It also avoids the shared Logo/Button components (both use
 * next-intl's Link) in favor of plain, locale-prefixed <a> tags.
 */
export default async function GlobalNotFound() {
  const headerList = await headers();
  const requested = headerList.get(LOCALE_HEADER);
  const locale: Locale = routing.locales.includes(requested as Locale)
    ? (requested as Locale)
    : routing.defaultLocale;
  const t = messagesByLocale[locale].comingSoon.notFound;
  const backHome = messagesByLocale[locale].comingSoon.backHome;

  return (
    <html lang={locale} className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-off-white text-navy font-sans">
        <header className="border-b border-neutral-200 bg-white py-4">
          <Container className="flex items-center">
            <a href={`/${locale}`} aria-label="FutureTutor home" className="block shrink-0">
              <Image src="/brand/logo-horizontal-light.png" alt="FutureTutor" width={188} height={41} priority />
            </a>
          </Container>
        </header>
        <main id="main" className="flex-1">
          <NotFoundContent
            title={t.title}
            description={t.description}
            homeHref={`/${locale}`}
            homeLabel={backHome}
            findTutorHref={`/${locale}/find-tutors`}
            findTutorLabel={t.findTutorCta}
          />
        </main>
        <footer className="border-t border-neutral-200 py-6 text-center text-sm text-slate">
          <Container>© {new Date().getFullYear()} FutureTutor</Container>
        </footer>
      </body>
    </html>
  );
}
