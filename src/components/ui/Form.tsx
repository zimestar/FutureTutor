import * as React from "react";
import { cn } from "@/lib/utils";

export function FormField({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-1.5", className)}>{children}</div>;
}

export function FormLabel({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("block text-sm font-semibold text-text-primary", className)} {...props} />;
}

export function FormHelp({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm leading-5 text-text-muted", className)} {...props} />;
}

export function FormError({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p role="alert" className={cn("text-sm font-semibold text-error", className)} {...props} />;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "min-h-28 w-full resize-y rounded-md border border-border-strong bg-surface px-4 py-3 text-[15px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-action disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-text-muted",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn("h-4 w-4 rounded border-border-strong accent-action disabled:cursor-not-allowed disabled:opacity-50", className)}
      {...props}
    />
  )
);
Checkbox.displayName = "Checkbox";

export const Radio = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="radio"
      className={cn("h-4 w-4 border-border-strong accent-action disabled:cursor-not-allowed disabled:opacity-50", className)}
      {...props}
    />
  )
);
Radio.displayName = "Radio";
