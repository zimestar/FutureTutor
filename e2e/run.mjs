import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const target = process.argv[2] ?? "local";
if (target !== "local" && target !== "staging") {
  throw new Error("E2E runner target must be local or staging.");
}

const require = createRequire(import.meta.url);
const cli = require.resolve("@playwright/test/cli");
const result = spawnSync(process.execPath, [cli, "test", ...process.argv.slice(3)], {
  stdio: "inherit",
  env: { ...process.env, E2E_TARGET: target },
});
process.exit(result.status ?? 1);
