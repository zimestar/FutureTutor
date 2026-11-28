import { cn } from "@/lib/utils";

export function SectionIntro({ eyebrow, title, description, align = "center", inverse = false }: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  inverse?: boolean;
}) {
  return (
    <div className={cn("reveal max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow && <p className={cn("text-[13px] font-bold uppercase tracking-[0.14em]", inverse ? "text-mint" : "text-blue")}>{eyebrow}</p>}
      <h2 className={cn("mt-4 text-balance text-[2rem] font-extrabold leading-[1.12] md:text-[2.6rem]", inverse ? "text-white" : "text-navy")}>{title}</h2>
      {description && <p className={cn("mt-5 text-lg leading-8", inverse ? "text-white/72" : "text-neutral-600")}>{description}</p>}
    </div>
  );
}
