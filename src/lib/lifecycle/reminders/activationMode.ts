/**
 * LIFECYCLE-ACTIVATION-1 — a second, independent safety key for the
 * reminder engine, on top of LIFECYCLE_REMINDERS_CRON_SECRET. Before this,
 * activation was all-or-nothing: configuring the secret and a schedule
 * would email every currently-eligible real subject on the very first tick,
 * with no way to certify end-to-end on an owner-controlled account first.
 *
 *   disabled (default) — no recipient is ever claimed or sent to.
 *   canary             — only recipients whose email is explicitly listed
 *                        in LIFECYCLE_REMINDERS_CANARY_EMAILS.
 *   live               — every eligible recipient.
 *
 * Anything other than the exact strings "canary" / "live" (unset, typo,
 * different case) resolves to "disabled" — fail closed, never guess.
 */
export type LifecycleReminderMode = "disabled" | "canary" | "live";

export function getLifecycleReminderMode(env: Record<string, string | undefined> = process.env): LifecycleReminderMode {
  const raw = env.LIFECYCLE_REMINDERS_MODE;
  return raw === "canary" || raw === "live" ? raw : "disabled";
}

export function getCanaryEmailAllowlist(env: Record<string, string | undefined> = process.env): Set<string> {
  const raw = env.LIFECYCLE_REMINDERS_CANARY_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0)
  );
}

export interface ReminderActivationPolicy {
  mode: LifecycleReminderMode;
  isRecipientPermitted: (recipientEmail: string) => boolean;
}

export function resolveReminderActivationPolicy(env: Record<string, string | undefined> = process.env): ReminderActivationPolicy {
  const mode = getLifecycleReminderMode(env);
  const allowlist = getCanaryEmailAllowlist(env);
  return {
    mode,
    isRecipientPermitted: (recipientEmail: string) => {
      if (mode === "live") return true;
      if (mode === "canary") return allowlist.has(recipientEmail.trim().toLowerCase());
      return false;
    },
  };
}
