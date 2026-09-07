import "server-only";
import { db } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";
import { resolveAuditActionCategory, type AuditActionCategory } from "@/lib/auditLogPresentation";

/**
 * ADMIN-AUDITLOG-VIEWER1 — read-only AuditLog access. This module has NO
 * write export at all (mirrors this file's own "no mutation controls, no
 * replay, no rollback" mission constraint structurally, not just by
 * discipline) — the only writer remains src/lib/audit.ts's writeAuditLog,
 * called from dozens of existing sites this mission does not touch.
 *
 * Authorization is NOT performed here — exactly like listMessageReports/
 * getMessageReportDetail, the caller (the page) is responsible for
 * checking hasAdminPermission("ADMIN_AUDIT_LOG_READ") BEFORE calling
 * either function below. This mirrors the established convention in this
 * codebase (messageReports.ts, financial-ops's own inline queries): the
 * domain-read layer trusts its caller for admin-only surfaces, since every
 * caller is itself a Server Component page that already gates on the
 * permission server-side.
 */

const AUDIT_LOG_PAGE_LIMIT = 50;

/** Every entityType value this codebase's writeAuditLog callers actually
 * emit today (grepped, not invented) — used for the entity-type filter
 * dropdown. A future entityType not yet in this list is still fully
 * readable (no filter WHERE clause restricts what's stored, only what's
 * offered as a dropdown option) — this list only bounds the FILTER UI, not
 * the underlying data. */
export const ALL_KNOWN_AUDIT_ENTITY_TYPES: readonly string[] = [
  "AdminInvitation",
  "Booking",
  "CustomerBasePriceRule",
  "FamilyInvitation",
  "MarketplacePricingSettings",
  "MessageReport",
  "ParentProfile",
  "ParentStudentRelationship",
  "Payment",
  "Refund",
  "Session_",
  "StudentProfile",
  "TutorBasePayoutRule",
  "TutorCertification",
  "TutorDocument",
  "TutorEarning",
  "TutorEducation",
  "TutorExamAttempt",
  "TutorInterview",
  "TutorInterviewEvaluation",
  "TutorInvitation",
  "TutorProfile",
  "TutorRankingSettings",
  "TutorTrainingProgress",
  "TutorTransfer",
  "TutoringRequest",
  "User",
].sort();

export interface AuditLogFilters {
  action?: string;
  entityType?: string;
  /** Matched against the actor's name OR email, case-insensitive contains
   * — never against a raw id here (entityIdQuery covers id-shaped
   * searches). */
  actorQuery?: string;
  /** Matched against entityId, case-insensitive contains — this is what
   * covers "booking id / tutor id / student id / report id" search per
   * the mission's own framing: AuditLog stores exactly one generic
   * entityId regardless of domain, so a booking-id search and a report-id
   * search are the same query shape, just against rows whose entityType
   * happens to be Booking vs MessageReport. */
  entityIdQuery?: string;
  from?: Date;
  to?: Date;
}

export type AuditLogActorSummary =
  | { kind: "SYSTEM" }
  | { kind: "UNKNOWN"; actorUserId: string }
  | { kind: "USER"; id: string; name: string | null; email: string; role: Role; deactivated: boolean };

export interface AuditLogListItem {
  id: string;
  action: string;
  category: AuditActionCategory;
  entityType: string;
  entityId: string | null;
  createdAt: Date;
  actor: AuditLogActorSummary;
}

export interface AuditLogListPage {
  items: AuditLogListItem[];
  nextCursor: string | null;
}

function resolveActorSummary(actorUserId: string | null, actor: { id: string; name: string | null; email: string; role: Role; deactivatedAt: Date | null } | null): AuditLogActorSummary {
  if (actorUserId === null) return { kind: "SYSTEM" };
  if (actor === null) return { kind: "UNKNOWN", actorUserId };
  return { kind: "USER", id: actor.id, name: actor.name, email: actor.email, role: actor.role, deactivated: actor.deactivatedAt !== null };
}

/**
 * Newest-first, cursor-paginated, always bounded (take: limit + 1 to detect
 * a next page) — mirrors this codebase's own established cursor-pagination
 * convention (messaging, notifications, message reports). Every filter is a
 * plain indexed-or-bounded WHERE clause; no full-JSON-metadata search is
 * ever performed (mission's own explicit instruction — the existing
 * [entityType, entityId] and [createdAt] indexes are what keep this
 * bounded, not a new index).
 */
export async function listAuditLogEntries(filters: AuditLogFilters, cursor?: string | null): Promise<AuditLogListPage> {
  const rows = await db.auditLog.findMany({
    where: {
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(filters.entityIdQuery ? { entityId: { contains: filters.entityIdQuery, mode: "insensitive" as const } } : {}),
      ...(filters.actorQuery
        ? {
            actor: {
              is: {
                OR: [
                  { name: { contains: filters.actorQuery, mode: "insensitive" as const } },
                  { email: { contains: filters.actorQuery, mode: "insensitive" as const } },
                ],
              },
            },
          }
        : {}),
      ...(filters.from || filters.to
        ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: AUDIT_LOG_PAGE_LIMIT + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      createdAt: true,
      actorUserId: true,
      actor: { select: { id: true, name: true, email: true, role: true, deactivatedAt: true } },
    },
  });

  const hasMore = rows.length > AUDIT_LOG_PAGE_LIMIT;
  const page = hasMore ? rows.slice(0, AUDIT_LOG_PAGE_LIMIT) : rows;

  return {
    items: page.map((row) => ({
      id: row.id,
      action: row.action,
      category: resolveAuditActionCategory(row.action),
      entityType: row.entityType,
      entityId: row.entityId,
      createdAt: row.createdAt,
      actor: resolveActorSummary(row.actorUserId, row.actor),
    })),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  };
}

export interface AuditLogDetail extends AuditLogListItem {
  metadata: unknown;
}

/** Single-entry detail lookup — no authorization of its own, same
 * caller-trusts-permission-check convention as listAuditLogEntries above.
 * Returns null for an unknown id (the page renders notFound()), never
 * throws. */
export async function getAuditLogEntry(id: string): Promise<AuditLogDetail | null> {
  const row = await db.auditLog.findUnique({
    where: { id },
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      createdAt: true,
      actorUserId: true,
      metadata: true,
      actor: { select: { id: true, name: true, email: true, role: true, deactivatedAt: true } },
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    action: row.action,
    category: resolveAuditActionCategory(row.action),
    entityType: row.entityType,
    entityId: row.entityId,
    createdAt: row.createdAt,
    actor: resolveActorSummary(row.actorUserId, row.actor),
    metadata: row.metadata,
  };
}
