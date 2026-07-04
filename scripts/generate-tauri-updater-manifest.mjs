import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const tauriConfigPath = process.env.THEBOYS_TAURI_CONFIG_PATH || join(repoRoot, "src-tauri", "tauri.conf.json");
const bundleRoot = process.env.THEBOYS_BUNDLE_ROOT || join(repoRoot, "target", "release", "bundle");
const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, "utf8"));
const version = tauriConfig.version;
const productName = tauriConfig.productName;
const officialRepository = "dilllxd/theboyslauncher";
const officialRepositoryOwner = "dilllxd";
const refName = process.env.GITHUB_REF_NAME;
const tag = refName?.startsWith("v") || refName === "dev-latest"
  ? refName
  : process.env.THEBOYS_RELEASE_TAG || `v${version}`;
const githubRepository = process.env.GITHUB_REPOSITORY;
const githubRepositoryOwner = process.env.GITHUB_REPOSITORY_OWNER;
if (githubRepository && githubRepository !== officialRepository) {
  throw new Error(`Updater manifests must be published from ${officialRepository}, received ${githubRepository}`);
}
if (githubRepositoryOwner && githubRepositoryOwner !== officialRepositoryOwner) {
  throw new Error(`Updater manifests must be published by ${officialRepositoryOwner}, received ${githubRepositoryOwner}`);
}
const repository = officialRepository;
const nsisDir = join(bundleRoot, "nsis");
const manifestName = process.env.THEBOYS_UPDATER_MANIFEST_NAME || "latest.json";
const channel = process.env.THEBOYS_RELEASE_CHANNEL || (manifestName.includes("dev") || tag === "dev-latest" ? "dev" : "stable");
const manifestChannel = manifestName === "latest-dev.json" ? "dev" : manifestName === "latest.json" ? "stable" : null;

if (typeof version !== "string" || version.length === 0) {
  throw new Error("src-tauri/tauri.conf.json must define a version before generating latest.json");
}
if (typeof productName !== "string" || productName.length === 0) {
  throw new Error("src-tauri/tauri.conf.json must define a productName before generating latest.json");
}

if (!["stable", "dev"].includes(channel)) {
  throw new Error(`Release channel must be stable or dev, received ${channel}`);
}

if (!tag.startsWith("v") && tag !== "dev-latest") {
  throw new Error(`Updater release tag must start with v or be dev-latest; received ${tag}`);
}
if (channel === "stable" && tag !== `v${version}`) {
  throw new Error(
    `Stable updater release tag ${tag} must match configured Tauri version ${version}; run configure:tauri-release-channel before building`,
  );
}
if (channel === "dev" && tag !== "dev-latest") {
  throw new Error(`Dev updater release tag must be dev-latest, received ${tag}`);
}

if (!existsSync(nsisDir)) {
  throw new Error(`NSIS bundle directory does not exist: ${nsisDir}`);
}

const bundlePrefix = `${productName}_${version}_`;
const matchingInstallers = readdirSync(nsisDir)
  .filter((file) => file.startsWith(bundlePrefix) && file.endsWith("-setup.exe"))
  .sort();

if (matchingInstallers.length === 0) {
  throw new Error(`No NSIS setup installer for ${productName} ${version} found in ${nsisDir}`);
}
if (matchingInstallers.length > 1) {
  throw new Error(
    `Ambiguous NSIS setup installers for ${productName} ${version} in ${nsisDir}: ${matchingInstallers.join(", ")}`,
  );
}
const installer = matchingInstallers[0];

const signaturePath = join(nsisDir, `${installer}.sig`);
if (!existsSync(signaturePath)) {
  throw new Error(`No updater signature found for ${installer}; set TAURI_SIGNING_PRIVATE_KEY for tauri build`);
}
const installerPath = join(nsisDir, installer);
const installerStats = statSync(installerPath);
const signatureStats = statSync(signaturePath);
if (!signatureStats.isFile() || signatureStats.size <= 0) {
  throw new Error(`Updater signature is empty or invalid: ${signaturePath}`);
}
if (signatureStats.mtimeMs + 1000 < installerStats.mtimeMs) {
  throw new Error(
    `Updater signature ${basename(signaturePath)} is older than ${basename(installerPath)}; rerun tauri build with TAURI_SIGNING_PRIVATE_KEY`,
  );
}

const manifest = {
  channel,
  version,
  notes: `TheBoysLauncher ${tag}`,
  pub_date: new Date().toISOString(),
  url: `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(basename(installer))}`,
  signature: readFileSync(signaturePath, "utf8").trim(),
};

if (!["latest.json", "latest-dev.json"].includes(manifestName)) {
  throw new Error(`Updater manifest name must be latest.json or latest-dev.json; received ${manifestName}`);
}
if (manifestChannel !== channel) {
  throw new Error(`Updater manifest name ${manifestName} does not match release channel ${channel}`);
}

const manifestPath = join(bundleRoot, manifestName);
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated updater manifest: ${manifestPath}`);
