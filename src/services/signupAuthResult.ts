import "server-only";

/** Auth.js v5's server-side signIn(..., { redirect: false }) returns a URL,
 * not the client-side SignInResponse shape. A credentials failure is encoded
 * in that URL's `error` query parameter. Unexpected return values fail closed. */
export function signInResultHasError(result: unknown): boolean {
  if (typeof result !== "string") return true;
  try {
    return Boolean(new URL(result, "http://localhost").searchParams.get("error"));
  } catch {
    return true;
  }
}
