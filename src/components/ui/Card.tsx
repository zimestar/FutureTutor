import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-neutral-200 bg-white shadow-card transition-shadow duration-200",
        className
      )}
    >
      {children}
    </div>
  );
}
