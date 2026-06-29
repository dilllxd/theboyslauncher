import { spawnSync } from "node:child_process";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://theboyslauncher:theboyslauncher@127.0.0.1:55432/theboyslauncher";

const result = spawnSync(
  "cargo",
  [
    "test",
    "-p",
    "social-backend",
    "live_postgres",
    "--",
    "--ignored",
    "--test-threads=1",
  ],
  {
    env: {
      ...process.env,
      TEST_DATABASE_URL: databaseUrl,
    },
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

process.exit(result.status ?? 1);
