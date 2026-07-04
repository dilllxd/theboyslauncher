import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const tauriConfigPath = process.env.THEBOYS_TAURI_CONFIG_PATH || join(repoRoot, "src-tauri", "tauri.conf.json");
const bundleRoot = process.env.THEBOYS_BUNDLE_ROOT || join(repoRoot, "target", "release", "bundle");
const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, "utf8"));
const version = tauriConfig.version;
const productName = tauriConfig.productName;
const manifestName = process.env.THEBOYS_UPDATER_MANIFEST_NAME || "latest.json";
const expectedRepository = "dilllxd/theboyslauncher";
const expectedRepositoryOwner = "dilllxd";
if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY !== expectedRepository) {
  throw new Error(`Tauri updater bundles must target ${expectedRepository}, received ${process.env.GITHUB_REPOSITORY}`);
}
if (process.env.GITHUB_REPOSITORY_OWNER && process.env.GITHUB_REPOSITORY_OWNER !== expectedRepositoryOwner) {
  throw new Error(`Tauri updater bundles must be verified by ${expectedRepositoryOwner}, received ${process.env.GITHUB_REPOSITORY_OWNER}`);
}
const expectedChannel = process.env.THEBOYS_RELEASE_CHANNEL || (manifestName.includes("dev") ? "dev" : "stable");
const manifestChannel = manifestName === "latest-dev.json" ? "dev" : manifestName === "latest.json" ? "stable" : null;

if (typeof version !== "string" || version.length === 0) {
  throw new Error("src-tauri/tauri.conf.json must define a bundle version");
}
if (typeof productName !== "string" || productName.length === 0) {
  throw new Error("src-tauri/tauri.conf.json must define a productName");
}

if (!["latest.json", "latest-dev.json"].includes(manifestName)) {
  throw new Error(`Updater manifest name must be latest.json or latest-dev.json; received ${manifestName}`);
}
if (!["stable", "dev"].includes(expectedChannel)) {
  throw new Error(`Release channel must be stable or dev, received ${expectedChannel}`);
}
if (manifestChannel !== expectedChannel) {
  throw new Error(`Updater manifest name ${manifestName} does not match release channel ${expectedChannel}`);
}

const msiDir = join(bundleRoot, "msi");
const nsisDir = join(bundleRoot, "nsis");
const expectedManifest = join(bundleRoot, manifestName);
const bundlePrefix = `${productName}_${version}_`;
const matchingMsiNames = existsSync(msiDir)
  ? readdirSync(msiDir).filter((name) => name.startsWith(bundlePrefix) && name.endsWith(".msi")).sort()
  : [];
const matchingSetupNames = existsSync(nsisDir)
  ? readdirSync(nsisDir).filter((name) => name.startsWith(bundlePrefix) && name.endsWith("-setup.exe")).sort()
  : [];

if (matchingMsiNames.length > 1) {
  throw new Error(`Ambiguous MSI bundles for ${productName} ${version}: ${matchingMsiNames.join(", ")}`);
}
if (matchingSetupNames.length > 1) {
  throw new Error(`Ambiguous NSIS setup bundles for ${productName} ${version}: ${matchingSetupNames.join(", ")}`);
}

const msiName = matchingMsiNames[0];
const setupName = matchingSetupNames[0];
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
const setupPath = setupName ? join(nsisDir, setupName) : undefined;
const setupSignaturePath = setupPath ? `${setupPath}.sig` : undefined;
if (manifest.version !== version) {
  throw new Error(`Updater manifest version ${manifest.version} does not match Tauri version ${version}`);
}
if (manifest.channel !== expectedChannel) {
  throw new Error(`Updater manifest channel ${manifest.channel ?? "(missing)"} does not match expected ${expectedChannel}`);
}
let manifestSetupName = "";
let manifestTrustedReleasePath = false;
let manifestReleaseTag = "";
try {
  const manifestUrl = new URL(manifest.url);
  const pathParts = manifestUrl.pathname.split("/").filter(Boolean);
  manifestSetupName = decodeURIComponent(pathParts.at(-1) ?? "");
  const [owner, repository, releases, download, tag] = pathParts;
  manifestReleaseTag = tag ?? "";
  manifestTrustedReleasePath =
    manifestUrl.protocol === "https:" &&
    manifestUrl.hostname === "github.com" &&
    manifestUrl.search === "" &&
    manifestUrl.hash === "" &&
    `${owner}/${repository}` === expectedRepository &&
    releases === "releases" &&
    download === "download" &&
    (tag === "dev-latest" || /^v\d+\.\d+\.\d+(?:-.+)?$/.test(tag ?? ""));
} catch {
  manifestSetupName = "";
}
if (typeof manifest.url !== "string" || !setupName || manifestSetupName !== setupName) {
  throw new Error("Updater manifest must point at the Windows NSIS setup executable");
}
if (!manifestTrustedReleasePath) {
  throw new Error(`Updater manifest must point at a trusted ${expectedRepository} GitHub release installer`);
}
if (expectedChannel === "stable" && manifestReleaseTag !== `v${version}`) {
  throw new Error(`Stable updater manifest tag ${manifestReleaseTag} does not match Tauri version ${version}`);
}
if (expectedChannel === "dev" && manifestReleaseTag !== "dev-latest") {
  throw new Error(`Dev updater manifest tag must be dev-latest, received ${manifestReleaseTag}`);
}
if (typeof manifest.signature !== "string" || manifest.signature.trim().length === 0) {
  throw new Error("Updater manifest must include the NSIS updater signature");
}
if (!setupPath || !setupSignaturePath || !existsSync(setupSignaturePath)) {
  throw new Error("Updater manifest must have a matching NSIS setup signature file");
}
const manifestStats = statSync(expectedManifest);
const setupStats = statSync(setupPath);
const signatureStats = statSync(setupSignaturePath);
if (!signatureStats.isFile() || signatureStats.size <= 0) {
  throw new Error(`Updater signature is empty or invalid: ${setupSignaturePath}`);
}
if (signatureStats.mtimeMs + 1000 < setupStats.mtimeMs) {
  throw new Error(
    `Updater signature ${setupName}.sig is older than ${setupName}; rerun tauri build with TAURI_SIGNING_PRIVATE_KEY`,
  );
}
if (manifestStats.mtimeMs + 1000 < signatureStats.mtimeMs || manifestStats.mtimeMs + 1000 < setupStats.mtimeMs) {
  throw new Error(`Updater manifest ${manifestName} is older than the verified NSIS setup artifacts; regenerate it`);
}
const signature = readFileSync(setupSignaturePath, "utf8").trim();
if (manifest.signature.trim() !== signature) {
  throw new Error("Updater manifest signature does not match the NSIS setup signature file");
}

console.log(`Verified ${expectedBundles.length} Tauri release bundles and updater manifest for ${version}.`);
