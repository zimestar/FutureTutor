import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { resolveEmailLocale } from "@/lib/email/emailTranslation";
import type { LifecycleJourneyState } from "../types";
import type { ReminderRecipient, ReminderRelationship } from "./types";

/**
 * LIFECYCLE-1B Phase 4 — the single authoritative recipient resolver.
 * Reads ONLY existing tables (User, NotificationPreference,
 * ParentStudentRelationship) — no new persistence. Fails closed: any
 * subject with no safely contactable recipient gets `contactAllowed: false`
 * with a reason, never a guessed or invented address. Always returns an
 * ARRAY (0, 1, or — for a STUDENT with more than one active guardian — more
 * than 1 recipient), so a guardian-managed student's reminder correctly
 * reaches every active guardian rather than an arbitrarily chosen one.
 */

async function buildRecipientFromUser(
  client: PrismaClient,
  params: { subjectId: string; recipientUserId: string; relationship: ReminderRelationship; localeCandidate: string | null }
): Promise<ReminderRecipient> {
  const [user, preference] = await Promise.all([
    client.user.findUnique({ where: { id: params.recipientUserId }, select: { email: true, deactivatedAt: true } }),
    client.notificationPreference.findUnique({ where: { userId: params.recipientUserId }, select: { emailEnabled: true } }),
  ]);

  const locale = resolveEmailLocale(params.localeCandidate);

  if (!user || !user.email) {
    return {
      subjectId: params.subjectId,
      recipientUserId: params.recipientUserId,
      recipientEmail: "",
      relationship: params.relationship,
      locale,
      contactAllowed: false,
      suppressionReason: "MISSING_EMAIL",
    };
  }

  // NotificationPreference.emailEnabled defaults true when no row exists
  // (matches the schema's own @default(true)) — but is deliberately
  // enforced here even though NO existing transactional email flow in this
  // codebase currently reads this field (confirmed: emailEnabled has zero
  // application-code readers today, grep-verified). LIFECYCLE-1B is
  // intentionally MORE conservative than existing precedent rather than
  // matching it, since this is a recurring, multi-touch communication
  // rather than a one-off transactional confirmation — see
  // docs/lifecycle/LIFECYCLE-1B-REMINDER-ENGINE.md §19 for the full
  // reasoning and the explicit note that this is a deliberate product
  // decision, not a rediscovery of existing enforced behavior.
  if (preference && preference.emailEnabled === false) {
    return {
      subjectId: params.subjectId,
      recipientUserId: params.recipientUserId,
      recipientEmail: user.email,
      relationship: params.relationship,
      locale,
      contactAllowed: false,
      suppressionReason: "EMAIL_DISABLED_BY_PREFERENCE",
    };
  }

  return {
    subjectId: params.subjectId,
    recipientUserId: params.recipientUserId,
    recipientEmail: user.email,
    relationship: params.relationship,
    locale,
    contactAllowed: true,
    suppressionReason: null,
  };
}

function noSafeRecipient(subjectId: string): ReminderRecipient {
  return {
    subjectId,
    recipientUserId: "",
    recipientEmail: "",
    relationship: "SELF",
    locale: "en",
    contactAllowed: false,
    suppressionReason: "NO_SAFE_RECIPIENT",
  };
}

/** TUTOR and PARENT are always SELF — LifecycleJourneyState.recipientUserId
 * is already the subject's own userId for both roles (see tutorLifecycle.ts
 * / parentLifecycle.ts). */
export async function resolveSelfReminderRecipient(
  client: PrismaClient,
  state: LifecycleJourneyState,
  localeCandidate: string | null
): Promise<ReminderRecipient[]> {
  if (state.status !== "USER_ACTION_REQUIRED") {
    return [{ ...noSafeRecipient(state.subjectId), suppressionReason: "NOT_USER_ACTION_REQUIRED" }];
  }
  if (!state.recipientUserId) return [noSafeRecipient(state.subjectId)];
  return [await buildRecipientFromUser(client, { subjectId: state.subjectId, recipientUserId: state.recipientUserId, relationship: "SELF", localeCandidate })];
}

/**
 * STUDENT_PROFILE_READINESS only. If the StudentProfile has its own login
 * (SELF_MANAGED, or a GUARDIAN_MANAGED child who has separately completed
 * the STUDENT_LOGIN claim), the student themselves is SELF-contactable. If
 * not (recipientUserId is null — see studentLifecycle.ts's explicit
 * subject/recipient split), every currently-ACTIVE guardian relationship is
 * resolved as a GUARDIAN recipient — never the student directly, and never
 * an arbitrarily-picked single guardian when more than one exists.
 */
export async function resolveStudentReminderRecipients(
  client: PrismaClient,
  state: LifecycleJourneyState
): Promise<ReminderRecipient[]> {
  if (state.status !== "USER_ACTION_REQUIRED") {
    return [{ ...noSafeRecipient(state.subjectId), suppressionReason: "NOT_USER_ACTION_REQUIRED" }];
  }

  if (state.recipientUserId) {
    const studentProfile = await client.studentProfile.findUnique({ where: { id: state.subjectId }, select: { preferredLanguage: true } });
    return [
      await buildRecipientFromUser(client, {
        subjectId: state.subjectId,
        recipientUserId: state.recipientUserId,
        relationship: "SELF",
        localeCandidate: studentProfile?.preferredLanguage ?? null,
      }),
    ];
  }

  const activeGuardianRelationships = await client.parentStudentRelationship.findMany({
    where: { studentProfileId: state.subjectId, status: "ACTIVE" },
    select: { parentProfile: { select: { userId: true, preferredLanguage: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (activeGuardianRelationships.length === 0) return [noSafeRecipient(state.subjectId)];

  return Promise.all(
    activeGuardianRelationships.map((r) =>
      buildRecipientFromUser(client, {
        subjectId: state.subjectId,
        recipientUserId: r.parentProfile.userId,
        relationship: "GUARDIAN",
        localeCandidate: r.parentProfile.preferredLanguage,
      })
    )
  );
}
