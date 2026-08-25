"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { resolveCaptureOutcomeAndConverge } from "@/services/payments";

/**
 * The only manual admin action for a stuck payment — a strictly-scoped,
 * idempotent re-check against Stripe's own authoritative state (never a
 * raw "mark as paid" status override that bypasses Stripe, per the Phase G
 * plan's §24 explicit instruction).
 */
export async function reconcilePaymentAction(paymentId: string): Promise<void> {
  const session = await auth();
  if (session?.user.role !== "SUPER_ADMIN") throw new Error("FORBIDDEN");

  await resolveCaptureOutcomeAndConverge(paymentId);
  await writeAuditLog({
    actorUserId: session.user.id,
    action: "payment.admin_reconcile_triggered",
    entityType: "Payment",
    entityId: paymentId,
  });
  revalidatePath("/admin/payments");
}
