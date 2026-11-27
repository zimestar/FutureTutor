/** Labels live in messages/*.json under `nav.<key>` / `footer.links.<key>`. */

/**
 * DESIGN-SYSTEM2 — primary header links. "Find a tutor" and "Become a tutor"
 * are the header's two buttons, so they are not repeated here; four short
 * links keep the header on one line in both languages.
 */
export const mainNav = [
  { key: "subjects", href: "/subjects" },
  { key: "howItWorks", href: "/how-it-works" },
  { key: "resources", href: "/resources" },
  { key: "about", href: "/about" },
] as const;

// Edmonton (and any future city added to src/content/localMarkets.ts) is
// deliberately kept out of mainNav — it's a supporting local page, not a
// primary navigation destination. It's reachable from the students footer
// column, subject-page contextual links, and search.
export const footerNav = {
  students: [
    { key: "findTutor", href: "/find-tutors" },
    { key: "subjects", href: "/subjects" },
    { key: "howItWorks", href: "/how-it-works" },
    { key: "resources", href: "/resources" },
    { key: "tutoringEdmonton", href: "/tutoring/edmonton" },
  ],
  tutors: [
    { key: "becomeATutor", href: "/become-a-tutor" },
    { key: "tutorResources", href: "/tutor-resources" },
  ],
  company: [
    { key: "about", href: "/about" },
    { key: "contact", href: "/contact" },
    { key: "careers", href: "/careers" },
  ],
  legal: [
    { key: "privacy", href: "/privacy" },
    { key: "terms", href: "/terms" },
    { key: "cookies", href: "/cookies" },
    { key: "tutorAgreement", href: "/tutor-agreement" },
  ],
} as const;
