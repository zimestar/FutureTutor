"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { passwordInputType } from "@/lib/passwordVisibility";

export const PasswordInput = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">>(
  ({ className, id, ...props }, ref) => {
    const t = useTranslations("auth.passwordVisibility");
    const [visible, setVisible] = React.useState(false);
    const label = visible ? t("hide") : t("show");

    return (
      <div className="relative">
        <Input {...props} ref={ref} id={id} type={passwordInputType(visible)} className={cn("pr-14", className)} />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={label}
          aria-controls={id}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 inline-flex min-h-11 min-w-11 items-center justify-center rounded-r-md text-slate transition-colors hover:text-navy focus-visible:outline-2 focus-visible:outline-blue focus-visible:outline-offset-2"
        >
          {visible ? <EyeOff aria-hidden="true" size={20} /> : <Eye aria-hidden="true" size={20} />}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";
