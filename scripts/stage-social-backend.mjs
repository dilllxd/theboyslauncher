import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const profile = args.has("--profile=debug") || args.has("--debug") ? "debug" : "release";
const executableName = process.platform === "win32" ? "social-backend.exe" : "social-backend";
const source = join(repoRoot, "target", profile, executableName);
const destinationDir = join(repoRoot, "src-tauri", "resources");
const destination = join(destinationDir, executableName);
const alternateDestination = join(
  destinationDir,
  executableName.endsWith(".exe") ? "social-backend" : "social-backend.exe",
);

if (!existsSync(source) || !statSync(source).isFile()) {
  const buildCommand = profile === "release" ? "cargo build -p social-backend --release" : "cargo build -p social-backend";
  throw new Error(
    `Missing ${source}. Run "${buildCommand}" first.`,
  );
}

mkdirSync(destinationDir, { recursive: true });
copyFileSync(source, destination);
copyFileSync(source, alternateDestination);
console.log(`Staged ${executableName} from target/${profile} into src-tauri/resources.`);
