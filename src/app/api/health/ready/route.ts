import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const DB_CHECK_TIMEOUT_MS = 2000;

/**
 * BETA-OPS1 — readiness probe, distinct from liveness (/api/health): this
 * one answers "can this instance actually serve real traffic right now,"
 * via a single, strictly-timed `SELECT 1`. A hung/unreachable database
 * fails this endpoint (so Railway/an operator can tell) without hanging
 * the request indefinitely — the check races against a fixed timeout,
 * never waits on Postgres's own connection-timeout default. Response body
 * is deliberately minimal: no connection string, no query detail, no stack
 * trace, no internal error message — just a boolean-shaped status.
 */
export async function GET() {
  const dbCheck = db.$queryRaw`SELECT 1`;
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("db_check_timeout")), DB_CHECK_TIMEOUT_MS);
  });

  try {
    await Promise.race([dbCheck, timeout]);
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
