import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Manrope } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { site } from "@/content/site";
import { SessionProvider } from "@/components/providers/SessionProvider";
import "../globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

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
          url: "/brand/logo-horizontal-light.png",
          width: 471,
          height: 103,
          alt: site.name,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      site: site.twitterHandle,
      title,
      description,
      images: ["/brand/logo-horizontal-light.png"],
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
    <html lang={locale} className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-off-white text-navy font-sans">
        <NextIntlClientProvider>
          <SessionProvider>{children}</SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
