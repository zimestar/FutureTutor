import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

const LOGO_ASPECT_RATIO = 471 / 103;

export function Logo({
  variant = "light",
  className,
}: {
  variant?: "light" | "dark";
  className?: string;
}) {
  const t = useTranslations("logo");
  const src =
    variant === "light"
      ? "/brand/logo-horizontal-light.png"
      : "/brand/logo-horizontal-dark.png";

  return (
    <Link href="/" aria-label={t("homeLabel")} className="block shrink-0">
      <Image
        src={src}
        alt="FutureTutor"
        width={471}
        height={103}
        priority
        className={cn("h-11 w-auto", className)}
        style={{ aspectRatio: LOGO_ASPECT_RATIO }}
      />
    </Link>
  );
}
