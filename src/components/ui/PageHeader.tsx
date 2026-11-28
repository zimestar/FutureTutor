import type { ReactNode } from "react";
import { DotCluster, Sparkle } from "@/components/marketing/Decor";
import { cn } from "@/lib/utils";

/**
 * APP-COLOR — page titles in the signed-in spaces sit on a soft, bright
 * panel with two small decorations, echoing the public site. `plain` keeps
 * the bare layout for dense surfaces (e.g. a message thread).
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  breadcrumbs,
  status,
  actions,
  className,
  variant = "panel",
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  breadcrumbs?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  className?: string;
  variant?: "panel" | "plain";
}) {
  const panel = variant === "panel";
  return (
    <header
      className={cn(
        "relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between",
        panel && "isolate overflow-hidden rounded-[28px] border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-sun-50 px-6 py-6 sm:px-8 sm:py-7",
        className
      )}
    >
      {panel && (
        <>
          <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 -z-10 size-36 rounded-full bg-sun/50" />
          <DotCluster delay={300} className="right-6 bottom-4 -z-10 hidden w-10 text-coral/70 md:block" />
          <Sparkle delay={900} className="right-[22%] top-5 -z-10 hidden w-5 text-lilac md:block" />
        </>
      )}
      <div className="min-w-0 max-w-3xl">
        {breadcrumbs}
        {eyebrow && <p className="mb-2 inline-flex rounded-full bg-blue px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-white">{eyebrow}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight text-text-primary sm:text-3xl">{title}</h1>
          {status}
        </div>
        {description && <p className="mt-2 text-sm leading-6 text-text-secondary sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
