"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { selectAuthPortrait } from "@/components/marketing/authEditorialPortraits";

export function AuthEditorialPortrait({ alt }: { alt: string }) {
  const [portrait, setPortrait] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const sample = new Uint32Array(1);
      crypto.getRandomValues(sample);
      setPortrait(selectAuthPortrait(sample[0] ?? Date.now()));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (!portrait || failed) return null;

  return (
    <Image
      src={portrait}
      alt={alt}
      fill
      sizes="54vw"
      className="object-contain object-bottom"
      onError={() => setFailed(true)}
    />
  );
}
