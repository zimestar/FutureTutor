import { createTranslator } from "use-intl/core";
import { routing, type Locale } from "@/i18n/routing";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";

/**
 * PROD-BOOKING-NOTIFICATIONS1-I18NFIX1 — request-independent translation
 * for transactional emails.
 *
 * Root cause this replaces: next-intl/server's getTranslations() resolves
 * i18n/request.ts's config through Next.js's per-request config cache,
 * which only exists inside an active request/render — a background/
 * server-job call throws "Couldn't find next-intl config file," even
 * though `locale` is already passed in explicitly (confirmed live in the
 * BASEURLFIX1 real-delivery certification, the same class of issue as the
 * next/headers dependency that fix already closed).
 *
 * Fix: use-intl/core's createTranslator — the same primitive next-intl's
 * own request-bound APIs are built on, already proven request-independent
 * in this codebase's own tests (src/i18n/sessionI18nRuntime.test.ts) —
 * built directly from the same static messages/en.json + messages/fr.json
 * import i18n/request.ts already uses for its own (request-bound) config.
 * Pure function, no request, no headers, no I/O.
 */

const MESSAGES_BY_LOCALE: Record<Locale, Record<string, unknown>> = { en, fr };

/**
 * Deliberately reimplements next-intl's own hasLocale(locales, candidate)
 * check (`locales.includes(candidate)`) rather than importing it from the
 * top-level "next-intl" package: that barrel export transitively pulls in
 * next-intl/server's react-server request-locale module, which touches
 * next/headers at *module load* time under some bundler resolution
 * conditions (confirmed failing under this project's vitest config) — a
 * strictly stronger, load-time version of the exact class of request-bound
 * dependency this fix exists to eliminate. This function is one line of
 * real logic; reimplementing it avoids importing anything from
 * next-intl/next-intl-server at all in this module.
 */
function isSupportedLocale(candidate: string | null | undefined): candidate is Locale {
  return typeof candidate === "string" && (routing.locales as readonly string[]).includes(candidate);
}

/**
 * Same fallback policy as i18n/request.ts's own requestLocale resolution:
 * an unsupported/missing locale silently becomes routing.defaultLocale
 * ("en"). Never inferred from a request header — the caller always
 * supplies the candidate from durable data (a recipient's stored locale
 * preference) or omits it entirely.
 */
export function resolveEmailLocale(candidate: string | null | undefined): Locale {
  return isSupportedLocale(candidate) ? candidate : routing.defaultLocale;
}

/**
 * Deliberately loosely typed (namespace/key as plain `string`, not
 * createTranslator's own literal-inferred NamespaceKeys/MessageKeys) —
 * callers here select from several different, unrelated namespaces
 * ("tutorBookingEmail", "subjects.items", "gradeLevels", ...) through one
 * shared helper, the same way next-intl/server's getTranslations was used
 * before this fix. Real key coverage is still verified — by
 * bookingConfirmationEmailContent.test.ts running this against the actual
 * messages/en.json + messages/fr.json content, not by the type system.
 */
export type EmailTranslator = (key: string, values?: Record<string, string | number>) => string;

export function createEmailTranslator(locale: string, namespace: string): EmailTranslator {
  const resolvedLocale = resolveEmailLocale(locale);
  return createTranslator({
    locale: resolvedLocale,
    messages: MESSAGES_BY_LOCALE[resolvedLocale],
    namespace,
  }) as EmailTranslator;
}
