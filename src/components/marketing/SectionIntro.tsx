import { cn } from "@/lib/utils";

export function SectionIntro({ eyebrow, title, description, align = "center", inverse = false }: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  inverse?: boolean;
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow && <p className={cn("text-sm font-bold uppercase tracking-[0.16em]", inverse ? "text-mint" : "text-blue")}>{eyebrow}</p>}
      <h2 className={cn("mt-3 text-balance text-3xl font-extrabold tracking-tight md:text-4xl", inverse ? "text-white" : "text-navy")}>{title}</h2>
      {description && <p className={cn("mt-4 text-lg leading-8", inverse ? "text-white/72" : "text-text-secondary")}>{description}</p>}
    </div>
  );
}
