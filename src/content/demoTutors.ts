import type { DemoTutor } from "@/types/tutor";

/**
 * DEMO DATA — for UI preview purposes only. FutureTutor has not yet
 * onboarded real tutors. Replace this fixture with `GET /api/tutors`
 * once the marketplace backend exists; components consume this shape
 * either way. Headline/bio copy lives in messages/*.json under
 * `demoTutors.<id>` so profiles are translated along with the rest of
 * the site.
 */
export const demoTutors: DemoTutor[] = [
  {
    id: "demo-1",
    slug: "amara-d-mathematics",
    firstName: "Amara",
    subjectSlugs: ["math", "physics"],
    gradeLevels: ["highSchool", "cegepCollege"],
    languages: ["en", "fr"],
    rating: 4.9,
    reviewCount: 6,
    learningMode: "both",
    city: "Montreal, QC",
    yearsExperience: 5,
    badges: ["topTutor"],
  },
  {
    id: "demo-2",
    slug: "liam-c-french",
    firstName: "Liam",
    subjectSlugs: ["french", "english"],
    gradeLevels: ["elementary", "middleSchool"],
    languages: ["en", "fr"],
    rating: 4.8,
    reviewCount: 4,
    learningMode: "online",
    city: "Ottawa, ON",
    yearsExperience: 3,
    badges: ["respondsQuickly"],
  },
  {
    id: "demo-3",
    slug: "priya-s-sciences",
    firstName: "Priya",
    subjectSlugs: ["chemistry", "biology"],
    gradeLevels: ["highSchool"],
    languages: ["en"],
    rating: 5.0,
    reviewCount: 3,
    learningMode: "in-person",
    city: "Toronto, ON",
    yearsExperience: 4,
    badges: [],
  },
  {
    id: "demo-4",
    slug: "noah-b-computer-science",
    firstName: "Noah",
    subjectSlugs: ["computer-science", "math"],
    gradeLevels: ["highSchool", "university"],
    languages: ["en"],
    rating: 4.7,
    reviewCount: 5,
    learningMode: "online",
    city: "Vancouver, BC",
    yearsExperience: 6,
    badges: ["popular"],
  },
];
