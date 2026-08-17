import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Clock3, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "error" | "info" | "pending";

const styles: Record<Tone, string> = {
  success: "border-success/25 bg-success-light text-neutral-800",
  warning: "border-warning/30 bg-warning-light text-neutral-800",
  error: "border-error/25 bg-error-light text-neutral-800",
  info: "border-info/30 bg-info-light text-neutral-800",
  pending: "border-blue/20 bg-blue/5 text-neutral-800",
};

const icons = { success: CheckCircle2, warning: TriangleAlert, error: AlertCircle, info: Info, pending: Clock3 };

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const Icon = icons[tone];
  const liveProps = tone === "error" ? { role: "alert" as const } : { role: "status" as const, "aria-live": "polite" as const };

  return (
    <div {...liveProps} className={cn("flex gap-3 rounded-lg border p-4", styles[tone], className)}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 text-sm leading-6">
        {title && <p className="font-bold text-text-primary">{title}</p>}
        <div className={cn(title && "mt-0.5")}>{children}</div>
      </div>
    </div>
  );
}

export const StatusBanner = Alert;

export function EmptyState({
  icon: Icon = Info,
  title,
  description,
  action,
  className,
}: {
  icon?: typeof Info;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-dashed border-border-strong bg-surface px-6 py-10 text-center", className)}>
      <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-blue/10 text-blue">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <p className="mt-4 text-lg font-bold text-text-primary">{title}</p>
      {description && <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-secondary">{description}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
