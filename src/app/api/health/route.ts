import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * BETA-OPS1 — liveness probe. Answers only "is the process up and able to
 * handle a request at all" — no database call, no dependency check. See
 * /api/health/ready for the DB-backed readiness check. Deliberately minimal:
 * no version string, no environment name, no internal detail — nothing here
 * is useful to an attacker and nothing here is useful to an operator beyond
 * "the process responded."
 */
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
