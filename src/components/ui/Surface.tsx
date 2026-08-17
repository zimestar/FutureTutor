import type { ElementType, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type SurfaceProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  padding?: "none" | "sm" | "md" | "lg";
};

export function Surface({
  as: Tag = "section",
  children,
  className,
  padding = "md",
  ...props
}: SurfaceProps) {
  return (
    <Tag
      className={cn(
        "rounded-xl border border-border bg-surface shadow-surface",
        padding === "sm" && "p-4",
        padding === "md" && "p-5 sm:p-6",
        padding === "lg" && "p-6 sm:p-8",
        className
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

export const DashboardCard = Surface;
