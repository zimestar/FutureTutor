/** Labels live in messages/*.json under `nav.<key>` / `footer.links.<key>`. */
export const mainNav = [
  { key: "findTutor", href: "/find-tutors" },
  { key: "subjects", href: "/subjects" },
  { key: "howItWorks", href: "/how-it-works" },
  { key: "forTutors", href: "/become-a-tutor" },
] as const;

export const footerNav = {
  students: [
    { key: "findTutor", href: "/find-tutors" },
    { key: "subjects", href: "/subjects" },
    { key: "howItWorks", href: "/how-it-works" },
  ],
  tutors: [
    { key: "becomeATutor", href: "/become-a-tutor" },
    { key: "tutorResources", href: "/become-a-tutor#resources" },
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
  ],
} as const;
