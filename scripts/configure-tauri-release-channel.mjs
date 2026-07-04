import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const configPath = process.env.THEBOYS_TAURI_CONFIG_PATH || join(repoRoot, "src-tauri", "tauri.conf.json");
const channel = process.argv[2] ?? process.env.THEBOYS_RELEASE_CHANNEL ?? "stable";
const version = process.argv[3] ?? process.env.THEBOYS_RELEASE_VERSION;

if (!["stable", "dev"].includes(channel)) {
  throw new Error(`Release channel must be stable or dev, received ${channel}`);
}
if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-\d+)?$/.test(version)) {
  throw new Error(`Release version must be MSI-compatible semver, received ${version}`);
}

const config = JSON.parse(readFileSync(configPath, "utf8"));
config.version = version;
config.productName = channel === "dev" ? "TheBoysLauncher Dev" : "TheBoysLauncher";
config.identifier = channel === "dev" ? "com.theboys.launcher.dev" : "com.theboys.launcher";
if (Array.isArray(config.app?.windows)) {
  for (const windowConfig of config.app.windows) {
    if (windowConfig && typeof windowConfig === "object") {
      windowConfig.title = config.productName;
    }
  }
}
config.plugins ??= {};
config.plugins.updater ??= {};
config.plugins.updater.endpoints = [
  channel === "dev"
    ? "https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/latest-dev.json"
    : "https://github.com/dilllxd/theboyslauncher/releases/latest/download/latest.json",
];

writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Configured ${config.productName} ${version} (${channel})`);
