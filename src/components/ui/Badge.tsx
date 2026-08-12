import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-pill px-3 py-1 text-xs font-semibold",
  {
    variants: {
      variant: {
        neutral: "bg-neutral-100 text-neutral-600",
        blue: "bg-blue/10 text-blue",
        mint: "bg-success-light text-success",
        navy: "bg-navy text-white",
        outline: "border border-neutral-300 text-neutral-600",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
);

export function Badge({
  className,
  variant,
  children,
}: {
  className?: string;
  children: React.ReactNode;
} & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)}>{children}</span>;
}
