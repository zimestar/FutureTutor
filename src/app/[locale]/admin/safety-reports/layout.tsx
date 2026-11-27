import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { requireAdminPermission } from "@/services/adminPermissions";

/** SAFETY-REPORTS1 — every page below requires ADMIN_SAFETY_REPORTS. */
export default async function SafetyReportsLayout({ children }: { children: ReactNode }) {
  await requireAdminPermission(await auth(), "ADMIN_SAFETY_REPORTS");
  return children;
}
