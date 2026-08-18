import { describe, it, expect } from "vitest";
import { SessionStatus } from "@/generated/prisma/enums";

// Session Lifecycle Phase 1 — fast, no-IO unit test confirming the generated
// Prisma client recognizes the new SessionStatus.INTERRUPTED value at the
// type/enum level (the DB-level acceptance/persistence proof lives in
// sessionLifecyclePhase1.integration.test.ts). No business logic exists yet
// that produces this value — this only confirms the schema foundation.

describe("SessionStatus — Phase 1 schema foundation", () => {
  it("INTERRUPTED is a recognized SessionStatus value, distinct from every existing value", () => {
    expect(SessionStatus.INTERRUPTED).toBe("INTERRUPTED");
    const values = Object.values(SessionStatus);
    expect(values).toContain("INTERRUPTED");
    // Distinct from the pre-existing five values — never a rename/collision.
    expect(values).toEqual(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "NO_SHOW", "CANCELLED", "INTERRUPTED"]);
  });
});
