import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const tauriConfig = JSON.parse(readFileSync(join(repoRoot, "src-tauri", "tauri.conf.json"), "utf8"));
const version = tauriConfig.version;
const tag = process.env.GITHUB_REF_NAME?.startsWith("v")
  ? process.env.GITHUB_REF_NAME
  : process.env.THEBOYS_RELEASE_TAG || `v${version}`;
const owner = process.env.GITHUB_REPOSITORY_OWNER || "dilllxd";
const repository = process.env.GITHUB_REPOSITORY || `${owner}/theboyslauncher`;
const nsisDir = join(repoRoot, "target", "release", "bundle", "nsis");
const manifestName = process.env.THEBOYS_UPDATER_MANIFEST_NAME || "latest.json";

if (typeof version !== "string" || version.length === 0) {
  throw new Error("src-tauri/tauri.conf.json must define a version before generating latest.json");
}

if (!tag.startsWith("v") && tag !== "dev-latest") {
  throw new Error(`Updater release tag must start with v or be dev-latest; received ${tag}`);
}

if (!existsSync(nsisDir)) {
  throw new Error(`NSIS bundle directory does not exist: ${nsisDir}`);
}

const installer = readdirSync(nsisDir)
  .filter((file) => file.endsWith("-setup.exe"))
  .sort()
  .at(-1);

if (!installer) {
  throw new Error(`No NSIS setup installer found in ${nsisDir}`);
}

const signaturePath = join(nsisDir, `${installer}.sig`);
if (!existsSync(signaturePath)) {
  throw new Error(`No updater signature found for ${installer}; set TAURI_SIGNING_PRIVATE_KEY for tauri build`);
}

const manifest = {
  version,
  notes: `TheBoysLauncher ${tag}`,
  pub_date: new Date().toISOString(),
  url: `https://github.com/${repository}/releases/download/${tag}/${basename(installer)}`,
  signature: readFileSync(signaturePath, "utf8").trim(),
};

if (!/^latest(?:-[a-z0-9-]+)?\.json$/.test(manifestName)) {
  throw new Error(`Updater manifest name must look like latest.json or latest-dev.json; received ${manifestName}`);
}

const manifestPath = join(repoRoot, "target", "release", "bundle", manifestName);
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated updater manifest: ${manifestPath}`);
