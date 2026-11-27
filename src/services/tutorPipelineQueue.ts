import "server-only";
import { db } from "@/lib/db";
import type { TutorApplicationStatus } from "@/generated/prisma/enums";
import { classifyPipelineItem, PIPELINE_STAGES, waitingDays, type PipelineItem } from "@/lib/tutorPipeline/pipelineQueue";

/**
 * TUTOR-PIPELINE1 — loads every open tutor application with the facts the
 * pure classifier needs (src/lib/tutorPipeline/pipelineQueue.ts). Read-only.
 */

const PENDING_DOCUMENT_STATUSES = ["UPLOADED", "PENDING_REVIEW"] as const;
const EDUCATION_DOCUMENT_TYPES = ["TRANSCRIPT", "DIPLOMA", "DEGREE"] as const;

export interface PipelineEntry extends PipelineItem {
  tutorProfileId: string;
  tutorName: string;
  email: string;
  status: TutorApplicationStatus;
  waitingDays: number;
}

export async function loadTutorPipeline(now: Date = new Date()): Promise<PipelineEntry[]> {
  const tutors = await db.tutorProfile.findMany({
    where: { applicationStatus: { in: PIPELINE_STAGES } },
    select: {
      id: true,
      applicationStatus: true,
      updatedAt: true,
      user: { select: { name: true, email: true } },
      documents: {
        where: {
          OR: [
            { status: { in: [...PENDING_DOCUMENT_STATUSES] } },
            { status: "APPROVED", type: { in: [...EDUCATION_DOCUMENT_TYPES] } },
          ],
        },
        select: { status: true, uploadedAt: true },
      },
      interviews: {
        where: { status: "SCHEDULED", scheduledAt: { not: null } },
        orderBy: { scheduledAt: "desc" },
        take: 1,
        select: { scheduledAt: true },
      },
    },
  });

  return tutors.map((tutor) => {
    const pending = tutor.documents.filter((doc) => doc.status !== "APPROVED").map((doc) => doc.uploadedAt.getTime());
    const item = classifyPipelineItem(
      {
        status: tutor.applicationStatus,
        lastActivityAt: tutor.updatedAt,
        oldestPendingDocumentAt: pending.length > 0 ? new Date(Math.min(...pending)) : null,
        hasApprovedEducationDocument: tutor.documents.some((doc) => doc.status === "APPROVED"),
        scheduledInterviewAt: tutor.interviews[0]?.scheduledAt ?? null,
      },
      now
    );
    return {
      ...item,
      tutorProfileId: tutor.id,
      tutorName: tutor.user.name ?? "",
      email: tutor.user.email,
      status: tutor.applicationStatus,
      waitingDays: waitingDays(item, now),
    };
  });
}
