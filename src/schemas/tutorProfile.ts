import { z } from "zod";
import { subjects } from "@/content/subjects";

const subjectSlugValues = subjects.map((s) => s.slug) as [string, ...string[]];
const levelSlugValues = [
  "elementary",
  "middleSchool",
  "highSchool",
  "cegepCollege",
  "university",
  "adultLearner",
] as const;
const languageValues = ["en", "fr"] as const;
const learningModeValues = ["ONLINE", "IN_PERSON", "BOTH"] as const;

export const tutorProfileSchema = z.object({
  headline: z.string().trim().min(10).max(120),
  bio: z.string().trim().min(50).max(2000),
  subjectSlugs: z.array(z.enum(subjectSlugValues)).min(1),
  levelSlugs: z.array(z.enum(levelSlugValues)).min(1),
  languages: z.array(z.enum(languageValues)).min(1),
  yearsExperience: z.coerce.number().int().min(0).max(60),
  city: z.string().trim().min(1).max(100),
  province: z.string().trim().min(1).max(100),
  learningMode: z.enum(learningModeValues),
});

export type TutorProfileInput = z.infer<typeof tutorProfileSchema>;
