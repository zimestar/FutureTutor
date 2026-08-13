import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { routing } from "@/i18n/routing";
import { canAccessSection, homePathForRole } from "@/lib/authorization";

const intlMiddleware = createMiddleware(routing);
const locales: readonly string[] = routing.locales;

function protectedSection(pathname: string): "dashboard" | "tutor" | "admin" | null {
  if (pathname.startsWith("/dashboard")) return "dashboard";
  if (pathname.startsWith("/tutor")) return "tutor";
  if (pathname.startsWith("/admin")) return "admin";
  return null;
}

// `proxy.ts` always runs on the Node.js runtime in Next.js 16 (unlike the
// old `middleware.ts`/Edge convention), so it's safe to pull in the full,
// Prisma-backed auth config here — no edge/node split needed.
export const proxy = auth((req) => {
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
