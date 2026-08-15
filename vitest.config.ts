import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Phase H.2 — minimal permanent test runner, scoped to Phase H's own
// domain/authorization logic (see the Phase H planning report's
// "Permanent Security Regression Tests" section). Broader full-codebase
// testing/CI remains a later, separately-scheduled hardening phase.
//
// `resolve.conditions: ["react-server"]` is required because
// src/services/studentAuthorization.ts (like every other service in this
// codebase) starts with `import "server-only"` — the `server-only` package
// throws unless resolved under the "react-server" condition. This mirrors
// the exact flag this project's own disposable verification scripts have
// always needed when run via plain `node` outside Next's own dev server
// (`node --conditions=react-server --import tsx <script>`).
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  // Vitest runs test files through Vite's SSR module runner (not the
  // client-style resolver), so the "react-server" condition must be set
  // under `ssr.resolve.conditions` — `resolve.conditions` alone (the
  // client-resolution path) does not affect it.
  resolve: {
    conditions: ["react-server"],
  },
  ssr: {
    resolve: {
      conditions: ["react-server"],
    },
  },
});
