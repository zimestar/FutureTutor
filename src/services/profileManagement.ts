import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import type { TutoringMode } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { closedBetaOnlineOnlyActive } from "@/lib/closedBetaConfig";
import { resolveStudentCapabilities } from "@/services/studentAuthorization";
import { NotAuthorizedError } from "@/services/familyManagement";

/**
 * Phase H.6 — Family / Student Dashboard + Profile Editing.
 *
 * This module is the ONLY place allowed to read or write StudentProfile/
 * ParentProfile "ordinary profile" fields (the fields covered by the field
 * classification below). It never reimplements authorization — every
 * capability decision for a StudentProfile defers to H.2's
 * `resolveStudentCapabilities` (src/services/studentAuthorization.ts).
 * ParentProfile self-editing needs no H.2 involvement: a Parent editing
 * their OWN profile is plain self-ownership, not a delegated-authority
 * question.
 *
 * ---------------------------------------------------------------------
 * Field classification (H.6 §6-§9, documented in full in the H.6 report):
 * ---------------------------------------------------------------------
 * A. LOW_STAKES_STUDENT_EDITABLE — STUDENT_PROFILE_LOW_STAKES_FIELDS.
 *    Only `preferredLanguage` qualifies: it has zero effect on identity,
 *    age, guardian authority, academic placement, eligibility, pricing,
 *    matching, payments, or booking behavior (confirmed by inspection: not
 *    read by any matching/pricing/eligibility code path in this repo).
 *    `User.image` (avatar) was considered — it exists on the schema, but
 *    is rendered nowhere in the current app (no avatar UI exists anywhere),
 *    so exposing it as "editable" this phase would be an orphaned control
 *    with no visible effect — excluded as scope creep, not a security
 *    concern. See the H.6 report's field-classification section.
 * B. GUARDIAN_OR_SELF_MANAGED_ONLY — STUDENT_PROFILE_GUARDIAN_FIELDS.
 *    firstName/lastName (identity), province/city (potential future
 *    in-person-matching relevance — fail-closed per H.6 §8 even though
 *    nothing currently reads StudentProfile.city/province for matching),
 *    academicLevelId/tutoringMode (both directly read by
 *    src/services/tutorEligibility.ts and the pricing engines). Superset
 *    of bucket A — full account-management authority subsumes the low-
 *    stakes exception.
 * C. SYSTEM_CONTROLLED — never accepted as input from any actor via this
 *    module: id, userId, managementMode, createdAt, updatedAt.
 * D. OUT_OF_SCOPE for H.6 editing — dateOfBirth. Neither the Phase H
 *    planning report nor H.1-H.5 ever approved a guardian DOB-correction
 *    policy; per H.6 §26's own instruction this ambiguity resolves to
 *    read-only display, not invented policy. dateOfBirth is returned by
 *    the read path (for display) but is never a member of any editable
 *    field set below, so no actor — guardian, SELF_MANAGED student, or
 *    restricted student — can change it through this module.
 */

export type StudentProfileLowStakesField = "preferredLanguage";
export type StudentProfileGuardianField =
  | "firstName"
  | "lastName"
  | "province"
  | "city"
  | "academicLevelId"
  | "tutoringMode"
  | StudentProfileLowStakesField;

export const STUDENT_PROFILE_LOW_STAKES_FIELDS: readonly StudentProfileLowStakesField[] = ["preferredLanguage"];

export const STUDENT_PROFILE_GUARDIAN_FIELDS: readonly StudentProfileGuardianField[] = [
  "firstName",
  "lastName",
  "province",
  "city",
  "academicLevelId",
  "tutoringMode",
  ...STUDENT_PROFILE_LOW_STAKES_FIELDS,
];

/** Fields NEVER accepted as input via updateStudentProfileForActor, for any
 * actor — documented explicitly (not just "absent from the allowlist") so
 * a future edit to this file can't accidentally reintroduce one of these
 * as editable without a reviewer noticing the list was touched. */
export const STUDENT_PROFILE_SYSTEM_CONTROLLED_FIELDS = [
  "id",
  "userId",
  "managementMode",
  "createdAt",
  "updatedAt",
] as const;

export type ParentProfileEditableField = "firstName" | "lastName" | "preferredLanguage" | "province" | "city";

export const PARENT_PROFILE_EDITABLE_FIELDS: readonly ParentProfileEditableField[] = [
  "firstName",
  "lastName",
  "preferredLanguage",
  "province",
  "city",
];

/**
 * PURE, no I/O — the actual field-authorization policy (H.6 §24/§25),
 * directly unit-testable without a database. `canManageStudentAccount`
 * (SELF_MANAGED self, or an ACTIVE guardian) unlocks the full guardian
 * field set. `isLinkedStudentSelf` alone (a GUARDIAN_MANAGED student's own
 * restricted login — canActForStudent true, canManageStudentAccount false
 * per H.2) unlocks ONLY the low-stakes allowlist — this is the "narrow
 * exception layered on canActForStudent, never a change to
 * canManageStudentAccount itself" the H.6 prompt requires (§24). Anyone
 * else (unrelated actor, revoked guardian, sibling, non-linked account)
 * gets an empty set — the caller must separately deny read/write access
 * entirely for that case via NotAuthorizedError, not rely on an empty
 * field set alone to communicate "no access."
 */
export function resolveEditableStudentProfileFields(capabilities: {
  isLinkedStudentSelf: boolean;
  canManageStudentAccount: boolean;
}): readonly StudentProfileGuardianField[] {
  if (capabilities.canManageStudentAccount) return STUDENT_PROFILE_GUARDIAN_FIELDS;
  if (capabilities.isLinkedStudentSelf) return STUDENT_PROFILE_LOW_STAKES_FIELDS;
  return [];
}

export class ForbiddenFieldError extends Error {}
export class InvalidFieldValueError extends Error {}
export class ParentProfileNotFoundError extends Error {}
/** BETA-HARDEN1 — thrown instead of silently coercing a submitted
 * IN_PERSON/BOTH tutoringMode to ONLINE, so the caller gets a clear,
 * beta-specific message rather than a generic invalid-input error, and so a
 * crafted request can't silently "succeed" into a value the beta doesn't
 * actually support. */
export class BetaOnlineOnlyModeError extends Error {}

export interface StudentProfileUpdateInput {
  firstName?: string;
  lastName?: string;
  province?: string | null;
  city?: string | null;
  academicLevelId?: string | null;
  tutoringMode?: TutoringMode;
  preferredLanguage?: string;
}

const VALID_TUTORING_MODES: readonly TutoringMode[] = ["ONLINE", "IN_PERSON", "BOTH"];
const VALID_PREFERRED_LANGUAGES = ["en", "fr"] as const;

/**
 * Server-authoritative StudentProfile read for a specific actor. Returns
 * `null` (never throws) if no capability exists for this (actor, student)
 * pair — read access is denied by omission, not by a distinguishable
 * error, so an unauthorized caller can't tell "wrong student id" apart
 * from "student doesn't exist" (H.6 §41 IDOR non-enumeration).
 */
export async function getStudentProfileForActor(client: PrismaClient, actorUserId: string, studentProfileId: string) {
  const capabilities = await resolveStudentCapabilities(client, actorUserId, studentProfileId);
  if (!capabilities.canActForStudent) return null;

  const studentProfile = await client.studentProfile.findUnique({
    where: { id: studentProfileId },
    include: { academicLevel: { select: { id: true, slug: true } } },
  });
  if (!studentProfile) return null;

  return {
    studentProfile,
    capabilities,
    editableFields: resolveEditableStudentProfileFields(capabilities),
  };
}

/**
 * The single authoritative StudentProfile update path (H.6 §23) — serves
 * BOTH a guardian editing a linked child's profile AND a Student editing
 * their own profile (SELF_MANAGED, or GUARDIAN_MANAGED's low-stakes
 * exception). The caller never decides which fields are allowed; this
 * function always re-derives that from a fresh H.2 capability read.
 *
 * Rejects the ENTIRE update atomically if ANY submitted field is outside
 * the actor's allowed set (H.6 §31: "prefer atomic rejection... document
 * the chosen behavior") — chosen over silent field-stripping because a
 * mixed valid+forbidden payload is exactly the shape a forged/malicious
 * request would send, and atomic rejection makes that attempt visibly
 * fail rather than partially succeed in a way a legitimate client might
 * not even notice.
 */
export async function updateStudentProfileForActor(
  client: PrismaClient,
  actorUserId: string,
  studentProfileId: string,
  input: StudentProfileUpdateInput
) {
  const capabilities = await resolveStudentCapabilities(client, actorUserId, studentProfileId);
  if (!capabilities.canActForStudent) throw new NotAuthorizedError();

  const allowedFields = resolveEditableStudentProfileFields(capabilities);
  const submittedFields = Object.keys(input) as (keyof StudentProfileUpdateInput)[];
  for (const field of submittedFields) {
    if (!(allowedFields as readonly string[]).includes(field)) {
      throw new ForbiddenFieldError();
    }
  }

  const data: Record<string, unknown> = {};
  if (submittedFields.includes("firstName")) {
    const value = input.firstName!.trim();
    if (value.length < 1 || value.length > 50) throw new InvalidFieldValueError();
    data.firstName = value;
  }
  if (submittedFields.includes("lastName")) {
    const value = input.lastName!.trim();
    if (value.length < 1 || value.length > 50) throw new InvalidFieldValueError();
    data.lastName = value;
  }
  if (submittedFields.includes("province")) {
    const value = input.province?.trim() || null;
    if (value !== null && value.length > 100) throw new InvalidFieldValueError();
    data.province = value;
  }
  if (submittedFields.includes("city")) {
    const value = input.city?.trim() || null;
    if (value !== null && value.length > 100) throw new InvalidFieldValueError();
    data.city = value;
  }
  if (submittedFields.includes("academicLevelId")) {
    const value = input.academicLevelId?.trim() || null;
    if (value !== null) {
      const level = await client.academicLevel.findUnique({ where: { id: value }, select: { id: true } });
      if (!level) throw new InvalidFieldValueError();
    }
    data.academicLevelId = value;
  }
  if (submittedFields.includes("tutoringMode")) {
    if (!VALID_TUTORING_MODES.includes(input.tutoringMode!)) throw new InvalidFieldValueError();
    // BETA-HARDEN1 — the Closed Beta is online-only (BETA-USER1 §20 #5:
    // IN_PERSON/BOTH were found fully live and unguarded). "BOTH" is
    // rejected alongside "IN_PERSON" because it still permits an in-person
    // match. Only a genuine CHANGE into a non-ONLINE value is rejected —
    // resubmitting a historical profile's existing non-ONLINE value
    // unchanged (e.g. saving an edit to `city` on a profile that predates
    // this gate) must not be blocked, since that would silently prevent a
    // guardian from editing any other field on that profile at all. This
    // never mass-mutates historical data — it only guards what a NEW write
    // can newly set.
    if (closedBetaOnlineOnlyActive() && input.tutoringMode !== "ONLINE") {
      const current = await client.studentProfile.findUnique({
        where: { id: studentProfileId },
        select: { tutoringMode: true },
      });
      if (current?.tutoringMode !== input.tutoringMode) {
        throw new BetaOnlineOnlyModeError();
      }
    }
    data.tutoringMode = input.tutoringMode;
  }
  if (submittedFields.includes("preferredLanguage")) {
    if (!VALID_PREFERRED_LANGUAGES.includes(input.preferredLanguage as "en" | "fr")) throw new InvalidFieldValueError();
    data.preferredLanguage = input.preferredLanguage;
  }

  if (Object.keys(data).length === 0) {
    // Nothing to do — return the current row rather than issuing a no-op
    // write (and a misleading audit entry for a change that never happened).
    const current = await client.studentProfile.findUnique({
      where: { id: studentProfileId },
      include: { academicLevel: { select: { id: true, slug: true } } },
    });
    if (!current) throw new NotAuthorizedError();
    return current;
  }

  const updated = await client.studentProfile.update({
    where: { id: studentProfileId },
    data,
    include: { academicLevel: { select: { id: true, slug: true } } },
  });

  await writeAuditLog(
    {
      actorUserId,
      action: "profile.student.updated",
      entityType: "StudentProfile",
      entityId: studentProfileId,
      metadata: {
        fields: Object.keys(data),
        actorRelation: capabilities.canManageStudentAccount
          ? capabilities.isLinkedStudentSelf
            ? "SELF_MANAGED_SELF"
            : "ACTIVE_GUARDIAN"
          : "LOW_STAKES_SELF",
      },
    },
    client
  );

  return updated;
}

export interface ParentProfileUpdateInput {
  firstName?: string;
  lastName?: string;
  province?: string | null;
  city?: string | null;
  preferredLanguage?: string;
}

/** A Parent's own ParentProfile, resolved strictly from their own userId —
 * never a client-supplied parentProfileId of any kind. Returns `null` if
 * the actor has no ParentProfile at all (not the expected steady state for
 * a PARENT-role session, but fails closed rather than throwing). */
export async function getParentProfileForActor(client: PrismaClient, actorUserId: string) {
  return client.parentProfile.findUnique({ where: { userId: actorUserId } });
}

/** The single authoritative ParentProfile update path — self-ownership
 * only, no delegated authority concept exists for a Parent's own profile.
 * Same atomic-rejection-on-unknown-field and explicit-value-validation
 * shape as updateStudentProfileForActor, for one consistent policy style
 * across both profile kinds (H.6 §25). */
export async function updateParentProfileForActor(
  client: PrismaClient,
  actorUserId: string,
  input: ParentProfileUpdateInput
) {
  const parentProfile = await client.parentProfile.findUnique({ where: { userId: actorUserId } });
  if (!parentProfile) throw new ParentProfileNotFoundError();

  const submittedFields = Object.keys(input) as (keyof ParentProfileUpdateInput)[];
  for (const field of submittedFields) {
    if (!(PARENT_PROFILE_EDITABLE_FIELDS as readonly string[]).includes(field)) {
      throw new ForbiddenFieldError();
    }
  }

  const data: Record<string, unknown> = {};
  if (submittedFields.includes("firstName")) {
    const value = input.firstName!.trim();
    if (value.length < 1 || value.length > 50) throw new InvalidFieldValueError();
    data.firstName = value;
  }
  if (submittedFields.includes("lastName")) {
    const value = input.lastName!.trim();
    if (value.length < 1 || value.length > 50) throw new InvalidFieldValueError();
    data.lastName = value;
  }
  if (submittedFields.includes("province")) {
    const value = input.province?.trim() || null;
    if (value !== null && value.length > 100) throw new InvalidFieldValueError();
    data.province = value;
  }
  if (submittedFields.includes("city")) {
    const value = input.city?.trim() || null;
    if (value !== null && value.length > 100) throw new InvalidFieldValueError();
    data.city = value;
  }
  if (submittedFields.includes("preferredLanguage")) {
    if (!VALID_PREFERRED_LANGUAGES.includes(input.preferredLanguage as "en" | "fr")) throw new InvalidFieldValueError();
    data.preferredLanguage = input.preferredLanguage;
  }

  if (Object.keys(data).length === 0) return parentProfile;

  const updated = await client.parentProfile.update({ where: { id: parentProfile.id }, data });

  await writeAuditLog(
    {
      actorUserId,
      action: "profile.parent.updated",
      entityType: "ParentProfile",
      entityId: parentProfile.id,
      metadata: { fields: Object.keys(data) },
    },
    client
  );

  return updated;
}
