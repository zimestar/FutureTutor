import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
const optionalYear = z.coerce.number().int().min(1950).max(2100).optional().or(z.literal(""));

const educationRowSchema = z.object({
  institution: z.string().trim().min(1).max(200),
  degree: optionalText(200),
  fieldOfStudy: optionalText(200),
  startYear: optionalYear,
  endYear: optionalYear,
});

const certificationRowSchema = z.object({
  name: z.string().trim().min(1).max(200),
  issuer: optionalText(200),
  issueYear: optionalYear,
  credentialUrl: optionalText(500),
});

export const tutorEducationSchema = z.object({
  education: z.array(educationRowSchema).max(10),
  certifications: z.array(certificationRowSchema).max(10),
});

export type TutorEducationInput = z.infer<typeof tutorEducationSchema>;
