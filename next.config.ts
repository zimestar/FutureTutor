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
    // Next.js defaults the Server Action request body to 1MB, which silently
    // rejects any Tutor verification document upload above that size before
    // MAX_DOCUMENT_SIZE_BYTES (10MB, src/lib/storage.ts) is ever evaluated.
    // Raised past 10MB + multipart overhead per the framework's own guidance.
    serverActions: {
      bodySizeLimit: "11mb",
    },
  },
};

export default withNextIntl(nextConfig);
