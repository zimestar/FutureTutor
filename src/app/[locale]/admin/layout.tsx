import type { ReactNode } from "react";
import { privateSurfaceMetadata } from "@/lib/privateMetadata";

// Sits above every existing /admin/* sub-layout (admins, bookings, family,
// payments, pricing, quick-match, sessions, students, tutors, users) and
// every admin page that has none of its own (financial-ops, audit-log,
// message-reports, parents, the /admin index, and /admin/setup/[token] —
// intentionally public/token-gated, see proxy.ts's protectedSection, but
// still sensitive and never meant to be indexed or have its links
// followed). Metadata-only — does not touch or duplicate any existing
// requireAdminPermission/requireActiveAdmin authorization check.
export const metadata = privateSurfaceMetadata;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
