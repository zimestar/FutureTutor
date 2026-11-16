import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { withSerializableRetry } from "./serializableRetry";

// Which error shapes withSerializableRetry treats as a retryable Postgres
// 40001 serialization conflict. RW-03 added the P2010 raw-query shape (the
// FOR SHARE tutor bookability lock); the pre-existing two shapes and the
// "everything else is rethrown immediately" rule are pinned here too.

function known(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError(`test ${code}`, { code, clientVersion: "test", meta });
}

const rawQuery40001 = () =>
  known("P2010", {
    driverAdapterError: {
      name: "DriverAdapterError",
      cause: { originalCode: "40001", originalMessage: "could not serialize access due to concurrent update", kind: "TransactionWriteConflict" },
    },
  });

const rawQueryDeadlock = () =>
  known("P2010", {
    driverAdapterError: { name: "DriverAdapterError", cause: { kind: "postgres", code: "40P01", message: "deadlock detected" } },
  });

function failingOnceWith(error: unknown) {
  let calls = 0;
  const fn = vi.fn(async () => {
    calls += 1;
    if (calls === 1) throw error;
    return "ok";
  });
  return fn;
}

describe("withSerializableRetry — retryable conflict shapes", () => {
  it.each([
    ["P2034 PrismaClientKnownRequestError", () => known("P2034")],
    ["raw DriverAdapterError TransactionWriteConflict", () => Object.assign(new Error("x"), { name: "DriverAdapterError", cause: { kind: "TransactionWriteConflict" } })],
    ["RW-03: P2010 raw-query failure wrapping a 40001 TransactionWriteConflict", rawQuery40001],
  ])("retries %s with a fresh attempt", async (_label, make) => {
    const fn = failingOnceWith(make());
    await expect(withSerializableRetry(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["P2010 raw-query deadlock (40P01)", rawQueryDeadlock],
    [
      "P2010 deadlock even if an adapter ever mislabelled it TransactionWriteConflict",
      () => known("P2010", { driverAdapterError: { cause: { originalCode: "40P01", kind: "TransactionWriteConflict" } } }),
    ],
    [
      "P2010 with originalCode 40001 but a different mapped kind",
      () => known("P2010", { driverAdapterError: { cause: { originalCode: "40001", kind: "postgres" } } }),
    ],
    [
      "P2010 unique violation (23505)",
      () => known("P2010", { driverAdapterError: { cause: { originalCode: "23505", kind: "UniqueConstraintViolation" } } }),
    ],
    ["P2010 without adapter metadata", () => known("P2010")],
    ["an unrelated Prisma error (P2002)", () => known("P2002")],
    ["a domain error", () => new Error("TutorNotBookable")],
  ])("rethrows %s immediately, never retried", async (_label, make) => {
    const error = make();
    const fn = failingOnceWith(error);
    await expect(withSerializableRetry(fn)).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after the retry budget on a persistent raw-query 40001", async () => {
    const fn = vi.fn(async () => {
      throw rawQuery40001();
    });
    await expect(withSerializableRetry(fn, 3)).rejects.toThrow("exhausted retry budget");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
