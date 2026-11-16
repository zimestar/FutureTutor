import { describe, expect, it, vi } from "vitest";

// RW-02 — every actual-mode persistence point refuses a non-actual mode
// (BOTH, or anything else) BEFORE touching the database. Each test hands the
// function a recording fake client/transaction: any property access that is
// called (a model method, $queryRaw, $transaction) is recorded, and the
// assertion is that nothing at all was called — i.e. no partial write is
// possible, not merely "the write was rolled back".

vi.mock("@/lib/db", () => ({ db: new Proxy({}, { get: () => { throw new Error("ambient db must not be used"); } }) }));

import { InvalidActualTutoringModeError } from "@/lib/tutoringModeResolution";
import { createCustomerPriceQuote, lockCustomerPriceQuote } from "./customerPricing";
import { createTutorPayoutQuote, createTutorPayoutQuoteWithTx } from "./tutorPayout";
import { createTutoringRequestForLearner, createTutoringRequestForLearnerInOwnTransaction } from "./tutoringRequestCreation";
import { reserveBookingPendingPayment } from "./bookingCreation";

/** A fake Prisma client/transaction that records every method call. */
function recordingClient(overrides: Record<string, Record<string, (...args: unknown[]) => unknown>> = {}) {
  const calls: string[] = [];
  const handler: ProxyHandler<object> = {
    get(_target, prop: string) {
      if (prop === "then") return undefined; // not a thenable
      if (prop.startsWith("$")) {
        return (...args: unknown[]) => {
          calls.push(prop);
          if (prop === "$transaction" && typeof args[0] === "function") return (args[0] as (tx: unknown) => unknown)(client);
          return Promise.resolve([]);
        };
      }
      return new Proxy(
        {},
        {
          get(_t, method: string) {
            return (...args: unknown[]) => {
              calls.push(`${prop}.${method}`);
              const impl = overrides[prop]?.[method];
              return Promise.resolve(impl ? impl(...args) : null);
            };
          },
        }
      );
    },
  };
  const client = new Proxy({}, handler) as never;
  return { client, calls };
}

const startAt = new Date("2027-01-10T15:00:00.000Z");
const quoteContext = {
  createdByUserId: "user-1",
  studentProfileId: "student-1",
  subjectId: "subject-1",
  academicLevelId: null,
  durationMinutes: 60,
  requestedStartAt: startAt,
};

describe("RW-02 actual-mode persistence guards — refuse before any database call", () => {
  it.each(["BOTH", "", "online", "HYBRID"])("createCustomerPriceQuote(%j) opens no transaction", async (mode) => {
    const { client, calls } = recordingClient();
    await expect(createCustomerPriceQuote({ ...quoteContext, tutoringMode: mode } as never, client)).rejects.toBeInstanceOf(
      InvalidActualTutoringModeError
    );
    expect(calls).toEqual([]);
  });

  it("createTutorPayoutQuote(BOTH) writes nothing (guard is the first statement of the shared body)", async () => {
    const { client, calls } = recordingClient();
    await expect(
      createTutorPayoutQuote(
        { tutorProfileId: "tutor-1", subjectId: "subject-1", tutoringMode: "BOTH", durationMinutes: 60, requestedStartAt: startAt } as never,
        "quote-1",
        client
      )
    ).rejects.toBeInstanceOf(InvalidActualTutoringModeError);
    expect(calls).toEqual(["$transaction"]); // the wrapper's own RepeatableRead tx — nothing inside it
  });

  it("createTutorPayoutQuoteWithTx(BOTH) — Quick Match dispatch entry point — makes no call on the transaction", async () => {
    const { client: tx, calls } = recordingClient();
    await expect(
      createTutorPayoutQuoteWithTx(
        tx,
        { tutorProfileId: "tutor-1", subjectId: "subject-1", tutoringMode: "BOTH", durationMinutes: 60, requestedStartAt: startAt } as never,
        "quote-1"
      )
    ).rejects.toBeInstanceOf(InvalidActualTutoringModeError);
    expect(calls).toEqual([]);
  });

  const requestInput = {
    actorUserId: "user-1",
    studentProfileId: "student-1",
    subjectId: "subject-1",
    academicLevelId: null,
    tutoringMode: "BOTH",
    durationMinutes: 60,
    requestedStartAt: startAt,
    currency: "CAD",
    customerPriceQuoteId: "quote-1",
  };

  it("createTutoringRequestForLearnerInOwnTransaction(BOTH) opens no transaction", async () => {
    const { client, calls } = recordingClient();
    await expect(createTutoringRequestForLearnerInOwnTransaction(client, requestInput as never)).rejects.toBeInstanceOf(
      InvalidActualTutoringModeError
    );
    expect(calls).toEqual([]);
  });

  it("createTutoringRequestForLearner(tx, BOTH) makes no call on the caller's transaction", async () => {
    const { client: tx, calls } = recordingClient();
    await expect(createTutoringRequestForLearner(tx, requestInput as never)).rejects.toBeInstanceOf(InvalidActualTutoringModeError);
    expect(calls).toEqual([]);
  });

  it("lockCustomerPriceQuote(expected BOTH) makes no read or write", async () => {
    const { client: tx, calls } = recordingClient();
    await expect(
      lockCustomerPriceQuote(tx, "quote-1", "user-1", { subjectId: "subject-1", tutoringMode: "BOTH", durationMinutes: 60, requestedStartAt: startAt } as never)
    ).rejects.toBeInstanceOf(InvalidActualTutoringModeError);
    expect(calls).toEqual([]);
  });

  it("lockCustomerPriceQuote on a stored legacy BOTH quote (expected ONLINE) never updates it", async () => {
    const { client: tx, calls } = recordingClient({
      customerPriceQuote: {
        findUnique: () => ({ id: "quote-1", createdByUserId: "user-1", status: "ACTIVE", tutoringMode: "BOTH", expiresAt: new Date(Date.now() + 3600_000) }),
      },
    });
    await expect(
      lockCustomerPriceQuote(tx, "quote-1", "user-1", { subjectId: "subject-1", tutoringMode: "ONLINE", durationMinutes: 60, requestedStartAt: startAt })
    ).rejects.toBeInstanceOf(InvalidActualTutoringModeError);
    expect(calls).toEqual(["customerPriceQuote.findUnique"]);
  });

  it("reserveBookingPendingPayment(mode BOTH) takes no lock and makes no read or write", async () => {
    const { client: tx, calls } = recordingClient();
    await expect(
      reserveBookingPendingPayment(tx, {
        actorUserId: "user-1",
        studentProfileId: "student-1",
        tutorProfileId: "tutor-1",
        subjectId: "subject-1",
        academicLevelId: null,
        startAt,
        endAt: new Date(startAt.getTime() + 3600_000),
        timezone: "UTC",
        mode: "BOTH" as never,
        paymentId: "payment-1",
        customerPriceQuoteId: "quote-1",
        tutorPayoutQuoteId: "payout-quote-1",
      })
    ).rejects.toBeInstanceOf(InvalidActualTutoringModeError);
    expect(calls).toEqual([]);
  });
});
