"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Periodically re-fetches the current route's Server Component data — used
 * on pages showing live Quick Match state (tutor invitations, admin
 * live-request view) since there's no push/websocket layer this phase. */
export function AutoRefresh({ intervalMs = 15000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs, router]);

  return null;
}
