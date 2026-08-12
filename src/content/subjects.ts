export interface Subject {
  slug: string;
  icon:
    | "sigma"
    | "book-open"
    | "languages"
    | "microscope"
    | "flask-conical"
    | "atom"
    | "dna"
    | "code"
    | "notebook-pen"
    | "graduation-cap";
}

/**
 * Canonical subject list. Display labels live in messages/*.json under
 * `subjects.items.<slug>` — look them up with useTranslations("subjects").
 */
export const subjects: Subject[] = [
  { slug: "math", icon: "sigma" },
  { slug: "english", icon: "book-open" },
  { slug: "french", icon: "languages" },
  { slug: "science", icon: "microscope" },
  { slug: "chemistry", icon: "flask-conical" },
  { slug: "physics", icon: "atom" },
  { slug: "biology", icon: "dna" },
  { slug: "computer-science", icon: "code" },
  { slug: "exam-prep", icon: "notebook-pen" },
  { slug: "elementary", icon: "graduation-cap" },
];
