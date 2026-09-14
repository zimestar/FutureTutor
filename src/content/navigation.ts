/** Labels live in messages/*.json under `nav.<key>` / `footer.links.<key>`. */
export const mainNav = [
  { key: "findTutor", href: "/find-tutors" },
  { key: "subjects", href: "/subjects" },
  { key: "howItWorks", href: "/how-it-works" },
  { key: "resources", href: "/resources" },
  { key: "about", href: "/about" },
  { key: "forTutors", href: "/become-a-tutor" },
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
