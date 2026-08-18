import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";

const messageLoaders = {
  en: () => import("../../messages/en.json").then((module) => module.default),
  fr: () => import("../../messages/fr.json").then((module) => module.default),
};

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: await messageLoaders[locale](),
  };
});
