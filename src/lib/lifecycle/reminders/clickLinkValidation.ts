/**
 * LIFECYCLE-1C schema decision §9 — before ANY `event.data.click.link` from
 * a Resend webhook is persisted, it must be parsed and validated against an
 * exact-hostname allowlist. Deliberately exact-match only (`Set.has`),
 * never `.includes()`/`.endsWith()`/substring checks — a suffix check
 * would be defeated by `https://futuretutor.ca.attacker.example/`, and a
 * substring check by `https://attacker.example/?=futuretutor.ca`. Rejects
 * any URL carrying userinfo (`https://futuretutor.ca@attacker.example/` —
 * WHATWG URL parses that as hostname `attacker.example`, which the
 * hostname check alone already defeats, but userinfo presence is rejected
 * unconditionally as defense in depth) and any non-`https:` scheme
 * (`javascript:`, `data:`, `file:`, plain `http:`).
 *
 * The CLICKED provider fact is still persisted even when the link fails
 * validation (schema decision §9: "the unsafe/unapproved link itself must
 * NOT be stored" — not "the event must not be recorded") — see
 * emailEventCorrelation.ts's buildEventMetadata, which calls this and
 * simply omits `metadata.link` on a null result.
 */

const ALLOWED_CLICK_HOSTNAMES = new Set(["futuretutor.ca"]);

export function validateClickLink(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (!ALLOWED_CLICK_HOSTNAMES.has(parsed.hostname.toLowerCase())) return null;

  return parsed.href;
}
