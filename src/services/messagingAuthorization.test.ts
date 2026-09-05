import { beforeEach, describe, expect, it, vi } from "vitest";

// MESSAGING-MVP1A — messagingAuthorization.ts re-derives every fact fresh
// from the database on every call; it never trusts a ConversationParticipant
// row. `resolveStudentCapabilities` (studentAuthorization.ts) already has
// its own dedicated, thorough test suite proving its policy matrix — these
// tests mock that module boundary and instead prove (a) this module's OWN
// new combinator correctly narrows it (never permitting a GUARDIAN_MANAGED
// student's own login, unlike the broader canActForStudent), and (b) the
// tutor-side / suspension / communication-window logic this module adds.

const mocks = vi.hoisted(() => ({
  resolveStudentCapabilities: vi.fn(),
  tutorProfileFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  bookingFindFirst: vi.fn(),
  conversationFindUnique: vi.fn(),
  studentProfileFindUnique: vi.fn(),
}));

vi.mock("@/services/studentAuthorization", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./studentAuthorization")>();
  return { ...actual, resolveStudentCapabilities: mocks.resolveStudentCapabilities };
});

const client = {
  tutorProfile: { findUnique: mocks.tutorProfileFindUnique },
  user: { findUnique: mocks.userFindUnique },
  booking: { findFirst: mocks.bookingFindFirst },
  conversation: { findUnique: mocks.conversationFindUnique },
  studentProfile: { findUnique: mocks.studentProfileFindUnique },
} as unknown as import("@/generated/prisma/client").PrismaClient;

import {
  canParticipateInTutoringConversation,
  canReadConversation,
  canSendConversationMessage,
  hasEligibleTutoringRelationship,
  resolveParticipantRole,
} from "./messagingAuthorization";

const STUDENT_ID = "student-1";
const TUTOR_PROFILE_ID = "tutor-profile-1";
const TUTOR_USER_ID = "tutor-user-1";
const GUARDIAN_USER_ID = "guardian-user-1";
const STUDENT_USER_ID = "student-user-1";
const UNRELATED_USER_ID = "unrelated-user-1";
const CONVERSATION_ID = "conv-1";

function capabilities(
  overrides: Partial<{
    managementMode: string | null;
    isLinkedStudentSelf: boolean;
    hasActiveGuardianAuthority: boolean;
    canActForStudent: boolean;
    studentExists: boolean;
  }>
) {
  return {
    studentExists: true,
    managementMode: "SELF_MANAGED",
    isLinkedStudentSelf: false,
    hasActiveGuardianAuthority: false,
    canActForStudent: true,
    canManageStudentAccount: false,
    canInitiatePaidBooking: false,
    canPayForStudent: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.conversationFindUnique.mockResolvedValue({ id: CONVERSATION_ID, studentProfileId: STUDENT_ID, tutorProfileId: TUTOR_PROFILE_ID });
  mocks.tutorProfileFindUnique.mockResolvedValue({ userId: TUTOR_USER_ID, applicationStatus: "APPROVED" });
  mocks.userFindUnique.mockResolvedValue({ deactivatedAt: null });
  mocks.bookingFindFirst.mockResolvedValue({ id: "booking-1" });
  mocks.studentProfileFindUnique.mockResolvedValue({ managementMode: "SELF_MANAGED" });
});

describe("canParticipateInTutoringConversation", () => {
  it("item 1 — SELF_MANAGED: the linked student's own login is authorized", async () => {
    mocks.resolveStudentCapabilities.mockResolvedValue(capabilities({ managementMode: "SELF_MANAGED", isLinkedStudentSelf: true }));
    expect(await canParticipateInTutoringConversation(client, STUDENT_USER_ID, STUDENT_ID)).toBe(true);
  });

  it("item 4 — ACTIVE guardian on a GUARDIAN_MANAGED student is authorized", async () => {
    mocks.resolveStudentCapabilities.mockResolvedValue(capabilities({ managementMode: "GUARDIAN_MANAGED", hasActiveGuardianAuthority: true }));
    expect(await canParticipateInTutoringConversation(client, GUARDIAN_USER_ID, STUDENT_ID)).toBe(true);
  });

  it("item 3 — CRITICAL: a GUARDIAN_MANAGED student's own login is DENIED even though isLinkedStudentSelf is true — never reuse canActForStudent's broader semantics", async () => {
    mocks.resolveStudentCapabilities.mockResolvedValue(
      capabilities({ managementMode: "GUARDIAN_MANAGED", isLinkedStudentSelf: true, hasActiveGuardianAuthority: false, canActForStudent: true })
    );
    expect(await canParticipateInTutoringConversation(client, STUDENT_USER_ID, STUDENT_ID)).toBe(false);
  });

  it("item 6 — a REVOKED guardian is denied (hasActiveGuardianAuthority is false for a revoked relationship)", async () => {
    mocks.resolveStudentCapabilities.mockResolvedValue(capabilities({ managementMode: "GUARDIAN_MANAGED", hasActiveGuardianAuthority: false }));
    expect(await canParticipateInTutoringConversation(client, GUARDIAN_USER_ID, STUDENT_ID)).toBe(false);
  });

  it("item 7 — an unrelated guardian (no relationship at all) is denied", async () => {
    mocks.resolveStudentCapabilities.mockResolvedValue(capabilities({ managementMode: "GUARDIAN_MANAGED", hasActiveGuardianAuthority: false }));
    expect(await canParticipateInTutoringConversation(client, UNRELATED_USER_ID, STUDENT_ID)).toBe(false);
  });

  it("item 10 — LEGACY_UNKNOWN fails closed", async () => {
    mocks.resolveStudentCapabilities.mockResolvedValue(capabilities({ managementMode: "LEGACY_UNKNOWN" }));
    expect(await canParticipateInTutoringConversation(client, STUDENT_USER_ID, STUDENT_ID)).toBe(false);
  });

  it("a nonexistent student fails closed", async () => {
    mocks.resolveStudentCapabilities.mockResolvedValue(capabilities({ managementMode: null, studentExists: false }));
    expect(await canParticipateInTutoringConversation(client, STUDENT_USER_ID, STUDENT_ID)).toBe(false);
  });
});

describe("canReadConversation", () => {
  it("item 9 — the correct tutor is authorized", async () => {
    expect(await canReadConversation(client, TUTOR_USER_ID, CONVERSATION_ID)).toBe(true);
  });

  it("item 8 — an unrelated tutor (different TutorProfile.userId) is denied", async () => {
    mocks.resolveStudentCapabilities.mockResolvedValue(capabilities({ managementMode: "SELF_MANAGED", isLinkedStudentSelf: false }));
    expect(await canReadConversation(client, "some-other-tutor-user", CONVERSATION_ID)).toBe(false);
  });

  it("item 5 — multiple ACTIVE guardians are each independently authorized", async () => {
    mocks.resolveStudentCapabilities.mockResolvedValue(capabilities({ managementMode: "GUARDIAN_MANAGED", hasActiveGuardianAuthority: true }));
    expect(await canReadConversation(client, "guardian-a", CONVERSATION_ID)).toBe(true);
    expect(await canReadConversation(client, "guardian-b", CONVERSATION_ID)).toBe(true);
  });

  it("item 35 — a nonexistent conversation is denied, same as an unauthorized one (enumeration-safe)", async () => {
    mocks.conversationFindUnique.mockResolvedValue(null);
    expect(await canReadConversation(client, TUTOR_USER_ID, "does-not-exist")).toBe(false);
  });

  it("item 12 — a suspended actor can still READ (suspension does not block historical access)", async () => {
    mocks.userFindUnique.mockResolvedValue({ deactivatedAt: new Date() });
    expect(await canReadConversation(client, TUTOR_USER_ID, CONVERSATION_ID)).toBe(true);
  });
});

describe("canSendConversationMessage", () => {
  it("item 14 — an upcoming CONFIRMED booking enables send", async () => {
    const result = await canSendConversationMessage(client, TUTOR_USER_ID, CONVERSATION_ID, new Date("2026-09-05T00:00:00.000Z"));
    expect(result.ok).toBe(true);
    expect(mocks.bookingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "CONFIRMED" }) })
    );
  });

  it("item 15 — a booking that ended within the last 30 days still enables send", async () => {
    mocks.bookingFindFirst.mockResolvedValue({ id: "recent-booking" });
    const result = await canSendConversationMessage(client, TUTOR_USER_ID, CONVERSATION_ID);
    expect(result.ok).toBe(true);
  });

  it("item 16 — no qualifying booking (>30 days, or none at all) blocks send", async () => {
    mocks.bookingFindFirst.mockResolvedValue(null);
    const result = await canSendConversationMessage(client, TUTOR_USER_ID, CONVERSATION_ID);
    expect(result).toEqual({ ok: false, reason: "OUTSIDE_COMMUNICATION_WINDOW" });
  });

  it("item 17 — the window query itself is a live re-check (a later legitimate booking naturally reopens it, no stored flag)", async () => {
    mocks.bookingFindFirst.mockResolvedValueOnce(null);
    const first = await canSendConversationMessage(client, TUTOR_USER_ID, CONVERSATION_ID);
    expect(first.ok).toBe(false);
    mocks.bookingFindFirst.mockResolvedValueOnce({ id: "new-booking" });
    const second = await canSendConversationMessage(client, TUTOR_USER_ID, CONVERSATION_ID);
    expect(second.ok).toBe(true);
  });

  it("item 11 — a suspended actor cannot send", async () => {
    mocks.userFindUnique.mockResolvedValue({ deactivatedAt: new Date() });
    const result = await canSendConversationMessage(client, TUTOR_USER_ID, CONVERSATION_ID);
    expect(result).toEqual({ ok: false, reason: "ACTOR_SUSPENDED" });
  });

  it("item 13 — a non-APPROVED tutor cannot send", async () => {
    mocks.tutorProfileFindUnique.mockResolvedValue({ userId: TUTOR_USER_ID, applicationStatus: "SUSPENDED" });
    const result = await canSendConversationMessage(client, TUTOR_USER_ID, CONVERSATION_ID);
    expect(result).toEqual({ ok: false, reason: "TUTOR_NOT_APPROVED" });
  });

  it("an unauthorized actor cannot send", async () => {
    mocks.resolveStudentCapabilities.mockResolvedValue(capabilities({ managementMode: "GUARDIAN_MANAGED", hasActiveGuardianAuthority: false }));
    const result = await canSendConversationMessage(client, UNRELATED_USER_ID, CONVERSATION_ID);
    expect(result).toEqual({ ok: false, reason: "NOT_AUTHORIZED" });
  });

  it("a nonexistent conversation cannot be sent to", async () => {
    mocks.conversationFindUnique.mockResolvedValue(null);
    const result = await canSendConversationMessage(client, TUTOR_USER_ID, "nope");
    expect(result).toEqual({ ok: false, reason: "CONVERSATION_NOT_FOUND" });
  });
});

describe("hasEligibleTutoringRelationship", () => {
  it("a CONFIRMED booking, ever, establishes eligibility (no time window for conversation existence)", async () => {
    mocks.bookingFindFirst.mockResolvedValue({ id: "old-booking" });
    expect(await hasEligibleTutoringRelationship(client, STUDENT_ID, TUTOR_PROFILE_ID)).toBe(true);
    expect(mocks.bookingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentProfileId: STUDENT_ID, tutorProfileId: TUTOR_PROFILE_ID, status: "CONFIRMED" } })
    );
  });

  it("no CONFIRMED booking ever existing means no eligibility", async () => {
    mocks.bookingFindFirst.mockResolvedValue(null);
    expect(await hasEligibleTutoringRelationship(client, STUDENT_ID, TUTOR_PROFILE_ID)).toBe(false);
  });
});

describe("resolveParticipantRole", () => {
  it("resolves TUTOR for the conversation's own tutor", async () => {
    const role = await resolveParticipantRole(client, TUTOR_USER_ID, { conversationId: CONVERSATION_ID, studentProfileId: STUDENT_ID, tutorProfileId: TUTOR_PROFILE_ID });
    expect(role).toBe("TUTOR");
  });

  it("resolves STUDENT for a SELF_MANAGED student's own login", async () => {
    mocks.resolveStudentCapabilities.mockResolvedValue(capabilities({ managementMode: "SELF_MANAGED", isLinkedStudentSelf: true }));
    mocks.studentProfileFindUnique.mockResolvedValue({ managementMode: "SELF_MANAGED" });
    const role = await resolveParticipantRole(client, STUDENT_USER_ID, { conversationId: CONVERSATION_ID, studentProfileId: STUDENT_ID, tutorProfileId: TUTOR_PROFILE_ID });
    expect(role).toBe("STUDENT");
  });

  it("resolves GUARDIAN for an ACTIVE guardian on a GUARDIAN_MANAGED student", async () => {
    mocks.resolveStudentCapabilities.mockResolvedValue(capabilities({ managementMode: "GUARDIAN_MANAGED", hasActiveGuardianAuthority: true }));
    mocks.studentProfileFindUnique.mockResolvedValue({ managementMode: "GUARDIAN_MANAGED" });
    const role = await resolveParticipantRole(client, GUARDIAN_USER_ID, { conversationId: CONVERSATION_ID, studentProfileId: STUDENT_ID, tutorProfileId: TUTOR_PROFILE_ID });
    expect(role).toBe("GUARDIAN");
  });

  it("resolves null for an unauthorized actor — never assigns a role to someone who shouldn't have one", async () => {
    mocks.resolveStudentCapabilities.mockResolvedValue(capabilities({ managementMode: "GUARDIAN_MANAGED", hasActiveGuardianAuthority: false }));
    const role = await resolveParticipantRole(client, UNRELATED_USER_ID, { conversationId: CONVERSATION_ID, studentProfileId: STUDENT_ID, tutorProfileId: TUTOR_PROFILE_ID });
    expect(role).toBeNull();
  });
});
