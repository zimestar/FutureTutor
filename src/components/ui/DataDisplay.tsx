import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DataTable({ children, caption, className }: { children: ReactNode; caption: string; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-border bg-surface", className)}>
      <table className="min-w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function ResponsiveRecordList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface", className)}>{children}</div>;
}

export function RecordRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center", className)}>{children}</div>;
}
