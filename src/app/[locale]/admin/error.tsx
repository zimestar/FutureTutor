"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) { const t = useTranslations("admin.shared"); return <div role="alert" className="mx-auto max-w-xl rounded-xl border border-border bg-surface p-8 text-center"><h1 className="text-xl font-extrabold text-navy">{t("errorTitle")}</h1><p className="mt-2 text-sm text-text-secondary">{t("errorDescription")}</p><Button className="mt-5" onClick={reset}>{t("retry")}</Button></div>; }
