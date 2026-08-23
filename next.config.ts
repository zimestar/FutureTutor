import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
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
  },
};

export default withNextIntl(nextConfig);
