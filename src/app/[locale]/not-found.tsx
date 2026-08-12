import { getTranslations } from "next-intl/server";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { ComingSoon } from "@/components/marketing/ComingSoon";

export default async function NotFound() {
  const t = await getTranslations("comingSoon.notFound");

  return (
    <MarketingShell>
      <ComingSoon title={t("title")} description={t("description")} />
    </MarketingShell>
  );
}
