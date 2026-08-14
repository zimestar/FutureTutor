import "server-only";
import { headers } from "next/headers";

/** Derives this request's own absolute origin from its headers — used for
 * Stripe Account Link return_url/refresh_url, which must be absolute. */
export async function getAppBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${proto}://${host}`;
}
