import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const profile = args.has("--profile=debug") || args.has("--debug") ? "debug" : "release";
const executableName = process.platform === "win32" ? "social-backend.exe" : "social-backend";
const cargoTargetDir = resolve(process.env.CARGO_TARGET_DIR ?? join(repoRoot, "target"));
const source = join(cargoTargetDir, profile, executableName);
const resourcesDir = join(repoRoot, "src-tauri", "resources");
const stagedPrimary = join(resourcesDir, executableName);
const stagedPortable = join(
  resourcesDir,
  executableName.endsWith(".exe") ? "social-backend" : "social-backend.exe",
);
const tauriConfigPath = join(repoRoot, "src-tauri", "tauri.conf.json");

function requireFile(path, label) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`Missing ${label}: ${path}`);
  }
  const stats = statSync(path);
  if (stats.size <= 0) {
    throw new Error(`${label} is empty: ${path}`);
  }
  return stats;
}

function fileSha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const sourceStats = requireFile(source, `${profile} social-backend build output`);
const primaryStats = requireFile(stagedPrimary, "staged social-backend resource");
const portableStats = requireFile(stagedPortable, "portable staged social-backend resource");
const sourceSha256 = fileSha256(source);
const primarySha256 = fileSha256(stagedPrimary);
const portableSha256 = fileSha256(stagedPortable);

if (primaryStats.size !== sourceStats.size) {
  throw new Error(
    `Staged ${stagedPrimary} size ${primaryStats.size} does not match ${source} size ${sourceStats.size}. Run npm run stage:social-backend${profile === "debug" ? ":debug" : ""}.`,
  );
}

if (primarySha256 !== sourceSha256) {
  throw new Error(
    `Staged ${stagedPrimary} SHA-256 ${primarySha256} does not match ${source} SHA-256 ${sourceSha256}. Run npm run stage:social-backend${profile === "debug" ? ":debug" : ""}.`,
  );
}

if (portableStats.size !== sourceStats.size) {
  throw new Error(
    `Staged ${stagedPortable} size ${portableStats.size} does not match ${source} size ${sourceStats.size}. Run npm run stage:social-backend${profile === "debug" ? ":debug" : ""}.`,
  );
}

if (portableSha256 !== sourceSha256) {
  throw new Error(
    `Staged ${stagedPortable} SHA-256 ${portableSha256} does not match ${source} SHA-256 ${sourceSha256}. Run npm run stage:social-backend${profile === "debug" ? ":debug" : ""}.`,
  );
}

const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, "utf8"));
const resources = tauriConfig?.bundle?.resources;
if (!Array.isArray(resources) || !resources.includes("resources")) {
  throw new Error(`${tauriConfigPath} must include "resources" in bundle.resources.`);
}

console.log(
  `Verified ${profile} social-backend resources: ${stagedPrimary} and ${stagedPortable} (${sourceStats.size} bytes, sha256 ${sourceSha256}).`,
);
