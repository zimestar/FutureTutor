import { MotionObserver } from "@/components/marketing/MotionObserver";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { site } from "@/content/site";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { ConsentBanner } from "@/components/marketing/ConsentBanner";
import "../globals.css";

// DESIGN-SYSTEM2 — Inter for reading, Plus Jakarta Sans for display headings.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});
const display = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  // DESIGN-SYSTEM3 — 700 is the heaviest display weight: 800 crushed the
  // letterforms at hero sizes. font-extrabold resolves to 700.
  weight: ["600", "700"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#2563eb",
  colorScheme: "light",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "site" });

  const title = `${site.name} — ${t("tagline")}`;
  const description = t("description");

  return {
    metadataBase: new URL(site.url),
    applicationName: site.name,
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      title: site.name,
      statusBarStyle: "default",
    },
    title: {
      default: title,
      template: `%s — ${site.name}`,
    },
    description,
    keywords: [
      "tutoring",
      "online tutor",
      "find a tutor",
      "tutoring platform Canada",
      "math tutor",
      "French tutor",
      "exam prep tutor",
    ],
    authors: [{ name: site.name }],
    alternates: {
      canonical: `/${locale}`,
      languages: {
        en: "/en",
        fr: "/fr",
      },
    },
    openGraph: {
      type: "website",
      locale: locale === "fr" ? "fr_CA" : "en_CA",
      url: `${site.url}/${locale}`,
      siteName: site.name,
      title,
      description,
      images: [
        {
          url: site.ogImage.url,
          width: site.ogImage.width,
          height: site.ogImage.height,
          alt: site.name,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      site: site.twitterHandle,
      title,
      description,
      images: [site.ogImage.url],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return (
    <html lang={locale} className={`${inter.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-off-white text-navy font-sans">
        <NextIntlClientProvider>
          <SessionProvider>{children}</SessionProvider>
          <ConsentBanner />
          <MotionObserver />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
