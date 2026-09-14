import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { routing } from "@/i18n/routing";
import { canAccessSection, homePathForRole } from "@/lib/authorization";
import { canonicalWwwRedirectUrl } from "@/lib/canonicalHost";

const intlMiddleware = createMiddleware(routing);
const locales: readonly string[] = routing.locales;

function startsWithSegment(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

function protectedSection(pathname: string): "dashboard" | "tutor" | "admin" | null {
  // Segment-boundary matches only — a naive `startsWith("/tutor")` would
  // also match the public `/tutors/[slug]` profile route (plural) and
  // wrongly gate it as the protected tutor-dashboard section.
  if (startsWithSegment(pathname, "/dashboard")) return "dashboard";
  if (startsWithSegment(pathname, "/tutor")) return "tutor";
  // Invitation activation is intentionally public; the raw single-use token
  // is its authorization boundary until the new Admin account exists.
  if (startsWithSegment(pathname, "/admin/setup")) return null;
  if (startsWithSegment(pathname, "/admin")) return "admin";
  return null;
}

// `proxy.ts` always runs on the Node.js runtime in Next.js 16 (unlike the
// old `middleware.ts`/Edge convention), so it's safe to pull in the full,
// Prisma-backed auth config here — no edge/node split needed.
export const proxy = auth((req) => {
  // TEMPORARY — SEO-INFRA-WWW1-FIX1 diagnostic, removed before this
  // mission's final commit. Logs only the 5 hostname/protocol fields named
  // in the mission spec, only for requests explicitly opted in via
  // ?seo_host_probe=1, never cookies/auth/body/user data.
  if (req.nextUrl.searchParams.get("seo_host_probe") === "1") {
    console.log(
      "[SEO-INFRA-WWW1-FIX1 host-probe]",
      JSON.stringify({
        nextUrlHostname: req.nextUrl.hostname,
        host: req.headers.get("host"),
        xForwardedHost: req.headers.get("x-forwarded-host"),
        forwarded: req.headers.get("forwarded"),
        xForwardedProto: req.headers.get("x-forwarded-proto"),
      })
    );
  }

  const wwwRedirect = canonicalWwwRedirectUrl(req.nextUrl);
  if (wwwRedirect) {
    return NextResponse.redirect(wwwRedirect, 308);
  }

  const { pathname } = req.nextUrl;
  const segments = pathname.split("/").filter(Boolean);
  const maybeLocale = segments[0];

  if (locales.includes(maybeLocale)) {
    const locale = maybeLocale;
    const rest = `/${segments.slice(1).join("/")}`;
    const section = protectedSection(rest);

    if (section) {
      const user = req.auth?.user;
      if (!user) {
        return NextResponse.redirect(new URL(`/${locale}/login`, req.url));
      }
      if (!canAccessSection(user.role, section)) {
        return NextResponse.redirect(
          new URL(`/${locale}${homePathForRole(user.role)}`, req.url)
        );
      }
    }
  }

  return intlMiddleware(req);
});

export const config = {
  matcher: ["/((?!api|trpc|_next|_vercel|.*\\..*).*)"],
};
