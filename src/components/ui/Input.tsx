import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-12 w-full rounded-md border border-neutral-300 bg-white px-4 text-[15px] text-navy placeholder:text-slate outline-none transition-colors focus:border-blue",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  containerClassName?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, containerClassName, children, ...props }, ref) => (
    <span className={cn("relative block w-full", containerClassName)}>
      <select
        ref={ref}
        className={cn(
          "h-12 w-full appearance-none rounded-md border border-neutral-300 bg-white px-4 pr-11 text-[15px] text-navy outline-none transition-colors focus:border-blue",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-slate"
        aria-hidden="true"
      />
    </span>
  )
);
Select.displayName = "Select";
