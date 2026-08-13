"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleFavoriteAction } from "@/lib/actions/favorites";

export function FavoriteButton({
  tutorProfileId,
  initialFavorited,
}: {
  tutorProfileId: string;
  initialFavorited: boolean;
}) {
  const t = useTranslations("tutorCard");
  const [favorited, setFavorited] = useState(initialFavorited);
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-pressed={favorited}
      aria-label={favorited ? t("removeFavorite") : t("addFavorite")}
      disabled={isPending}
      onClick={() => {
        const optimistic = !favorited;
        setFavorited(optimistic);
        startTransition(async () => {
          const result = await toggleFavoriteAction(tutorProfileId);
          if ("favorited" in result) {
            setFavorited(result.favorited);
          } else {
            setFavorited(!optimistic);
          }
        });
      }}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-60",
        favorited
          ? "border-error bg-error-light text-error"
          : "border-neutral-300 text-slate hover:border-navy hover:text-navy"
      )}
    >
      <Heart size={16} fill={favorited ? "currentColor" : "none"} aria-hidden="true" />
    </button>
  );
}
