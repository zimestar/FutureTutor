import "server-only";
import { db } from "@/lib/db";
import type { AssistantAudience } from "@/lib/assistant/config";

/** Who may use Ika: parents, and tutors whose application is approved. */
export async function resolveAssistantAudience(user: { id: string; role?: string | null }): Promise<AssistantAudience | null> {
  if (user.role === "PARENT") return "PARENT";
  if (user.role !== "TUTOR") return null;
  const profile = await db.tutorProfile.findUnique({ where: { userId: user.id }, select: { applicationStatus: true } });
  return profile?.applicationStatus === "APPROVED" ? "TUTOR" : null;
}
