import { NextResponse } from "next/server";
import { expireStaleInvitationsAndAdvance } from "@/services/quickMatchDispatch";

/**
 * Liveness backstop only — lazy expiry-on-read (triggered from the student
 * status page and the tutor invitations list) is the primary correctness
 * mechanism (see quickMatchDispatch.ts). This route just advances requests
 * nobody is actively viewing, so they don't sit abandoned indefinitely.
 * Meant to be invoked periodically by an external trigger (Vercel Cron in
 * production, a scheduled task locally) — this repo has no built-in
 * scheduler. Shared-secret header, checked before doing anything.
 */
export async function POST(request: Request) {
  const secret = process.env.QUICK_MATCH_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "QUICK_MATCH_CRON_SECRET is not configured" }, { status: 500 });
  }

  const provided = request.headers.get("x-cron-secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await expireStaleInvitationsAndAdvance();

  return NextResponse.json({ ok: true });
}
