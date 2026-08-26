import type { MetadataRoute } from "next";
import { site } from "@/content/site";
import { subjects } from "@/content/subjects";
import { routing } from "@/i18n/routing";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPaths = ["", "/find-tutors", "/subjects", "/how-it-works", "/become-a-tutor", "/tutor-resources", "/about", "/contact"];
  const subjectPaths = subjects.map((s) => `/subjects/${s.slug}`);
  const allPaths = [...staticPaths, ...subjectPaths];

  return allPaths.map((path) => ({
    url: `${site.url}/${routing.defaultLocale}${path}`,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path === "/find-tutors" ? 0.9 : 0.7,
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((locale) => [locale, `${site.url}/${locale}${path}`])
      ),
    },
  }));
}
