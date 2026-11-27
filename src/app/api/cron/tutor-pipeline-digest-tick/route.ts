import { NextResponse } from "next/server";
import { isValidCronSecret } from "@/lib/cronAuth";
import { runTutorPipelineDigest } from "@/services/tutorPipelineDigest";

/**
 * TUTOR-PIPELINE1 — daily digest of tutor applications waiting for the team,
 * plus a retry of admin alert emails that failed earlier. Invoked by a
 * Railway cron service (same shared-secret pattern as the other
 * /api/cron/*-tick routes). Idempotent: at most one digest per UTC day.
 */
export async function POST(request: Request) {
  const secret = process.env.TUTOR_PIPELINE_DIGEST_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "TUTOR_PIPELINE_DIGEST_CRON_SECRET is not configured" }, { status: 500 });
  }
  if (!isValidCronSecret(request.headers.get("x-cron-secret"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runTutorPipelineDigest();
  return NextResponse.json(result);
}
