import { z } from "zod";

export const TIMEZONE_OPTIONS = [
  "America/St_Johns",
  "America/Halifax",
  "America/Toronto",
  "America/Winnipeg",
  "America/Edmonton",
  "America/Vancouver",
] as const;

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const dayWindowSchema = z
  .object({
    enabled: z.boolean(),
    startTime: z.string().regex(timeRegex).or(z.literal("")),
    endTime: z.string().regex(timeRegex).or(z.literal("")),
  })
  .refine((day) => !day.enabled || (day.startTime !== "" && day.endTime !== "" && day.startTime < day.endTime), {
    message: "invalidWindow",
  });

export const tutorAvailabilitySchema = z.object({
  timezone: z.enum(TIMEZONE_OPTIONS),
  days: z.array(dayWindowSchema).length(7),
});

export type TutorAvailabilityInput = z.infer<typeof tutorAvailabilitySchema>;
