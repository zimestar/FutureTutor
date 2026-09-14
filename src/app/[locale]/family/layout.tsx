import type { ReactNode } from "react";
import { privateSurfaceMetadata } from "@/lib/privateMetadata";

// HYBRID classification (SEO-PRIVATE-NOINDEX1): /family/invite/[token] is
// intentionally public and unauthenticated (its security boundary is the
// unguessable, server-validated token — see previewInvitationByToken),
// not an auth-gated surface. It was already robots.txt-disallowed
// (/*/family), but never carried structural noindex metadata. There is no
// legitimate reason for this single-use invitation-claim page to be
// indexed or to have its links followed, so it gets the same treatment
// as the truly-private route groups.
export const metadata = privateSurfaceMetadata;

export default function FamilyLayout({ children }: { children: ReactNode }) {
  return children;
}
