"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { resolveCaptureOutcomeAndConverge } from "@/services/payments";
import { requireSuperAdmin } from "@/services/adminPermissions";

/**
 * The only manual admin action for a stuck payment — a strictly-scoped,
 * idempotent re-check against Stripe's own authoritative state (never a
 * raw "mark as paid" status override that bypasses Stripe, per the Phase G
 * plan's §24 explicit instruction).
 *
 * ADMIN-AUTH-HARDENING1 — authorization is now DB-fresh (requireSuperAdmin
 * re-reads current role/deactivatedAt on every call), not the stale JWT
 * role this used to trust directly. No financial behavior below this line
 * changed at all.
 */
export async function reconcilePaymentAction(paymentId: string): Promise<void> {
  const session = await auth();
  const actor = await requireSuperAdmin(session);

  await resolveCaptureOutcomeAndConverge(paymentId);
  await writeAuditLog({
    actorUserId: actor.id,
    action: "payment.admin_reconcile_triggered",
    entityType: "Payment",
    entityId: paymentId,
  });
  revalidatePath("/admin/payments");
}
