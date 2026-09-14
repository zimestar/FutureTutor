import type { ReactNode } from "react";
import { privateSurfaceMetadata } from "@/lib/privateMetadata";

export const metadata = privateSurfaceMetadata;

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return children;
}
