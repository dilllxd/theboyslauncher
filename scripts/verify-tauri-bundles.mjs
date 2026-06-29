import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const tauriConfigPath = join(repoRoot, "src-tauri", "tauri.conf.json");
const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, "utf8"));
const version = tauriConfig.version;
const productName = tauriConfig.productName;
const manifestName = process.env.THEBOYS_UPDATER_MANIFEST_NAME || "latest.json";

if (typeof version !== "string" || version.length === 0) {
  throw new Error("src-tauri/tauri.conf.json must define a bundle version");
}
if (typeof productName !== "string" || productName.length === 0) {
  throw new Error("src-tauri/tauri.conf.json must define a productName");
}

if (!/^latest(?:-[a-z0-9-]+)?\.json$/.test(manifestName)) {
  throw new Error(`Updater manifest name must look like latest.json or latest-dev.json; received ${manifestName}`);
}

const msiDir = join(repoRoot, "target", "release", "bundle", "msi");
const nsisDir = join(repoRoot, "target", "release", "bundle", "nsis");
const expectedManifest = join(repoRoot, "target", "release", "bundle", manifestName);
const bundlePrefix = `${productName}_${version}_`;
const msiName = existsSync(msiDir)
  ? readdirSync(msiDir).find((name) => name.startsWith(bundlePrefix) && name.endsWith(".msi"))
  : undefined;
const setupName = existsSync(nsisDir)
  ? readdirSync(nsisDir).find((name) => name.startsWith(bundlePrefix) && name.endsWith("-setup.exe"))
  : undefined;
const expectedBundles = [
  msiName ? join(msiDir, msiName) : join(msiDir, `${bundlePrefix}x64_en-US.msi`),
  setupName ? join(nsisDir, setupName) : join(nsisDir, `${bundlePrefix}x64-setup.exe`),
];

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
if (typeof manifest.url !== "string" || !setupName || !manifest.url.endsWith(setupName)) {
  throw new Error("Updater manifest must point at the Windows NSIS setup executable");
}
if (typeof manifest.signature !== "string" || manifest.signature.trim().length === 0) {
  throw new Error("Updater manifest must include the NSIS updater signature");
}

console.log(`Verified ${expectedBundles.length} Tauri release bundles and updater manifest for ${version}.`);
