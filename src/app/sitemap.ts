import type { MetadataRoute } from "next";
import { site } from "@/content/site";
import { subjects } from "@/content/subjects";
import { demoTutors } from "@/content/demoTutors";
import { routing } from "@/i18n/routing";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPaths = ["", "/find-tutors", "/subjects", "/how-it-works", "/become-a-tutor"];
  const subjectPaths = subjects.map((s) => `/subjects/${s.slug}`);
  const tutorPaths = demoTutors.map((t) => `/tutors/${t.slug}`);

  const allPaths = [...staticPaths, ...subjectPaths, ...tutorPaths];

  return allPaths.map((path) => ({
    url: `${site.url}/${routing.defaultLocale}${path}`,
    lastModified: new Date(),
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((locale) => [locale, `${site.url}/${locale}${path}`])
      ),
    },
  }));
}
