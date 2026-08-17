"use client";

import type { ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items, label = "Breadcrumb" }: { items: BreadcrumbItem[]; label?: string }) {
  return (
    <nav aria-label={label} className="mb-3">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-text-muted">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
            {index > 0 && <ChevronRight className="size-4" aria-hidden="true" />}
            {item.href ? <Link href={item.href} className="font-semibold hover:text-action">{item.label}</Link> : <span aria-current="page">{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export interface TabItem {
  id: string;
  label: ReactNode;
  disabled?: boolean;
}

export function Tabs({ items, activeId, onChange, label }: { items: TabItem[]; activeId: string; onChange: (id: string) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-border">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={activeId === item.id}
          aria-controls={`${item.id}-panel`}
          disabled={item.disabled}
          onClick={() => onChange(item.id)}
          className={cn("min-h-11 shrink-0 border-b-2 px-3 text-sm font-semibold transition-colors", activeId === item.id ? "border-action text-action" : "border-transparent text-text-muted hover:text-text-primary", "disabled:cursor-not-allowed disabled:opacity-50")}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function ProgressTracker({ steps, currentIndex, label = "Progress" }: { steps: string[]; currentIndex: number; label?: string }) {
  return (
    <ol aria-label={label} className="grid gap-3 sm:grid-flow-col sm:grid-cols-none">
      {steps.map((step, index) => {
        const complete = index < currentIndex;
        const current = index === currentIndex;
        return (
          <li key={step} aria-current={current ? "step" : undefined} className="flex min-w-0 items-center gap-3">
            <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold", complete && "border-success bg-success text-white", current && "border-action bg-action text-white", !complete && !current && "border-border-strong bg-surface text-text-muted")}>
              {complete ? <Check className="size-4" aria-hidden="true" /> : index + 1}
            </span>
            <span className={cn("text-sm font-semibold", current ? "text-text-primary" : "text-text-muted")}>{step}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function Pagination({ page, pageCount, previousLabel = "Previous", nextLabel = "Next", onPageChange }: { page: number; pageCount: number; previousLabel?: string; nextLabel?: string; onPageChange: (page: number) => void }) {
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
      <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="inline-flex min-h-10 items-center gap-1 rounded-md border border-border-strong px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
        <ChevronLeft className="size-4" aria-hidden="true" /> {previousLabel}
      </button>
      <span className="text-sm text-text-muted">{page} / {pageCount}</span>
      <button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} className="inline-flex min-h-10 items-center gap-1 rounded-md border border-border-strong px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
        {nextLabel} <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </nav>
  );
}
