"use client";

import { useTranslations } from "next-intl";

export default function LocaleError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("runtimeError");

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl items-center px-4 py-12 sm:px-6">
      <section role="alert" className="w-full rounded-2xl border border-border bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-bold uppercase tracking-wide text-blue">{t("eyebrow")}</p>
        <h1 className="mt-2 text-2xl font-extrabold text-navy sm:text-3xl">{t("title")}</h1>
        <p className="mt-3 text-text-secondary">{t("description")}</p>
        <button
          type="button"
          onClick={retry}
          className="mt-6 min-h-11 rounded-md bg-blue px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
        >
          {t("retry")}
        </button>
      </section>
    </main>
  );
}
