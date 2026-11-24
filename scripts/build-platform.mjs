import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
};
run("npm", ["ci", "--prefix", "mobile", "--no-audit", "--no-fund"]);
run(
  "npx",
  ["expo", "export", "--platform", "web", "--output-dir", "../dist/portal"],
  {
    cwd: root + "mobile",
    env: {
      ...process.env,
      EXPO_NO_TELEMETRY: "1",
      EXPO_WEB_BASE_URL: "/portal",
      EXPO_PUBLIC_APP_API_URL: process.env.EXPO_PUBLIC_APP_API_URL || "",
    },
  },
);
