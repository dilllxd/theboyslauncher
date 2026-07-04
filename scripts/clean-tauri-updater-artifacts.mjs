import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const bundleRoot = process.env.THEBOYS_BUNDLE_ROOT || join(repoRoot, "target", "release", "bundle");
const manifestNames = ["latest.json", "latest-dev.json"];
const bundleSubdirs = ["msi", "nsis"];
const removed = [];

for (const manifestName of manifestNames) {
  const manifestPath = join(bundleRoot, manifestName);
  if (existsSync(manifestPath)) {
    rmSync(manifestPath, { force: true });
    removed.push(manifestPath);
  }
}

for (const subdir of bundleSubdirs) {
  const bundleDir = join(bundleRoot, subdir);
  if (!existsSync(bundleDir)) {
    continue;
  }
  for (const name of readdirSync(bundleDir)) {
    if (!name.endsWith(".sig")) {
      continue;
    }
    const signaturePath = join(bundleDir, name);
    rmSync(signaturePath, { force: true });
    removed.push(signaturePath);
  }
}

if (removed.length > 0) {
  console.log(`Removed stale updater artifact(s): ${removed.length}`);
} else {
  console.log("No stale updater artifacts found.");
}
