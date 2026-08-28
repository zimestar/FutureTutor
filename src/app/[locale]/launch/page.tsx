import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { homePathForRole } from "@/lib/authorization";
import { routing } from "@/i18n/routing";

export default async function InstalledAppLaunchPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = routing.locales.includes(locale as "en" | "fr") ? locale : routing.defaultLocale;
  const session = await auth();

  redirect(
    session?.user
      ? `/${safeLocale}${homePathForRole(session.user.role)}`
      : `/${safeLocale}/login`,
  );
}
