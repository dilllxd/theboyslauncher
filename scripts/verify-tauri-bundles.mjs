import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const tauriConfigPath = join(repoRoot, "src-tauri", "tauri.conf.json");
const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, "utf8"));
const version = tauriConfig.version;

if (typeof version !== "string" || version.length === 0) {
  throw new Error("src-tauri/tauri.conf.json must define a bundle version");
}

const expectedBundles = [
  join(repoRoot, "target", "release", "bundle", "msi", `TheBoysLauncher_${version}_x64_en-US.msi`),
  join(repoRoot, "target", "release", "bundle", "nsis", `TheBoysLauncher_${version}_x64-setup.exe`),
];
const expectedManifest = join(repoRoot, "target", "release", "bundle", "latest.json");

const missing = [];
for (const bundle of expectedBundles) {
  if (!existsSync(bundle)) {
    missing.push(`${bundle} (missing)`);
    continue;
  }
  const stats = statSync(bundle);
  if (!stats.isFile() || stats.size <= 0) {
    missing.push(`${bundle} (not a non-empty file)`);
  }
}

if (missing.length > 0) {
  throw new Error(`Tauri bundle verification failed:\n${missing.join("\n")}`);
}

if (!existsSync(expectedManifest)) {
  throw new Error(`Tauri updater manifest is missing: ${expectedManifest}`);
}

const manifest = JSON.parse(readFileSync(expectedManifest, "utf8"));
if (manifest.version !== version) {
  throw new Error(`Updater manifest version ${manifest.version} does not match Tauri version ${version}`);
}
if (typeof manifest.url !== "string" || !manifest.url.endsWith(`TheBoysLauncher_${version}_x64-setup.exe`)) {
  throw new Error("Updater manifest must point at the Windows NSIS setup executable");
}
if (typeof manifest.signature !== "string" || manifest.signature.trim().length === 0) {
  throw new Error("Updater manifest must include the NSIS updater signature");
}

console.log(`Verified ${expectedBundles.length} Tauri release bundles and updater manifest for ${version}.`);
