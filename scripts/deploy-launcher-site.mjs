import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(rootDir, "deploy", "launcher-site");
const targetDir = process.env.THEBOYS_LAUNCHER_SITE_DIR || "C:\\Tools\\Caddy\\launcher-site";

await mkdir(path.dirname(targetDir), { recursive: true });
await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });
await cp(sourceDir, targetDir, { recursive: true });

console.log(`Deployed launcher site to ${targetDir}`);
