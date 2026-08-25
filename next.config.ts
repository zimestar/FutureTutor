import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const supabaseHostname = (() => {
  try {
    const url = process.env.SUPABASE_URL;
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHostname
      ? [{ protocol: "https", hostname: supabaseHostname, pathname: "/storage/v1/object/public/tutor-profile-images/**" }]
      : [],
  },
  turbopack: {
    root: __dirname,
  },
  // UX-404: required for src/app/global-not-found.tsx to be used for
  // genuinely unmatched URLs. Documented (node_modules/next/dist/docs/...
  // /not-found.md) as the correct mechanism specifically for apps whose root
  // layout is defined via a top-level dynamic segment (src/app/[locale]/
  // layout.tsx here) — see that file's own comment for the full reasoning.
  experimental: {
    globalNotFound: true,
    // Two independent Next.js body-size caps both default to well under
    // MAX_DOCUMENT_SIZE_BYTES (10MB, src/lib/storage.ts) and must both be
    // raised, or a Tutor document upload near 10MB is silently truncated
    // before validateDocumentFile ever runs (surfaced by real staging E2E
    // as a 500 "Unexpected end of form", not the app's friendly rejection):
    //  - serverActions.bodySizeLimit (default 1MB): the Server Action's own
    //    request body cap.
    //  - proxyClientMaxBodySize (default 10MB): src/proxy.ts runs on every
    //    request and buffers/clones the body for its own reads; anything
    //    past this limit is truncated before the Server Action body is
    //    even complete, corrupting the multipart upload.
    // Both set well past 10MB + multipart overhead for the same reason.
    serverActions: {
      bodySizeLimit: "20mb",
    },
    proxyClientMaxBodySize: "20mb",
  },
};

export default withNextIntl(nextConfig);
