import type { ReactNode } from "react";
import { privateSurfaceMetadata } from "@/lib/privateMetadata";

// SAFETY-REPORTS1 — signed-in, never indexed.
export const metadata = privateSurfaceMetadata;

export default function ReportConcernLayout({ children }: { children: ReactNode }) {
  return children;
}
