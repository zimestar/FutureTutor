import * as React from "react";
import { Link } from "@/i18n/navigation";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-all duration-200 focus-visible:outline-2 focus-visible:outline-blue focus-visible:outline-offset-2 active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-blue text-white shadow-(--shadow-action) hover:bg-blue-hover",
        dark: "bg-navy text-white hover:bg-neutral-800",
        outline:
          "border border-neutral-200 bg-white text-navy hover:border-neutral-300 hover:bg-neutral-50",
        ghost: "bg-transparent text-navy hover:bg-neutral-100",
        "ghost-inverse": "border border-white/30 bg-transparent text-white hover:bg-white/10",
        inverse: "bg-white text-navy shadow-[0_10px_24px_-12px_rgba(0,0,0,0.45)] hover:bg-neutral-50",
        destructive: "bg-destructive text-white hover:bg-destructive-hover",
      },
      size: {
        sm: "h-10 px-4 text-sm",
        md: "h-12 px-6 text-[15px]",
        lg: "h-14 px-8 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    href?: string;
  };

export function Button({ className, variant, size, href, ...props }: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);

  if (href) {
    return (
      <Link
        href={href}
        className={classes}
        {...(props as unknown as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {props.children}
      </Link>
    );
  }

  return <button className={classes} {...props} />;
}
