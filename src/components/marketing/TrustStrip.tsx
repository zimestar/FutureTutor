import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { trustMarkerIds } from "@/content/benefits";

export function TrustStrip() {
  const t = useTranslations("trustStrip");

  return (
    <div className="border-b border-neutral-200 bg-white py-6">
      <Container>
        <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-center">
          {trustMarkerIds.map((id) => (
            <li key={id} className="flex items-center gap-2 text-sm font-semibold text-neutral-600">
              <CheckCircle2 size={16} className="shrink-0 text-mint" aria-hidden="true" />
              {t(id)}
            </li>
          ))}
        </ul>
      </Container>
    </div>
  );
}
