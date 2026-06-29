import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const tauriConfigPath = join(repoRoot, "src-tauri", "tauri.conf.json");
const config = JSON.parse(readFileSync(tauriConfigPath, "utf8"));
const appVersion = config?.version;
const csp = config?.app?.security?.csp;
const mainWindow = config?.app?.windows?.[0];
const minimumWindow = { width: 1100, height: 720 };

if (typeof appVersion !== "string" || !/^\d+\.\d+\.\d+(?:-\d+)?$/.test(appVersion)) {
  throw new Error(
    "src-tauri/tauri.conf.json version must be MSI-compatible: major.minor.patch with an optional numeric-only prerelease",
  );
}

if (typeof csp !== "string" || csp.trim().length === 0) {
  throw new Error("src-tauri/tauri.conf.json must define a non-empty app.security.csp");
}

if (!mainWindow) {
  throw new Error("src-tauri/tauri.conf.json must define a main app window");
}

if (mainWindow.minWidth !== minimumWindow.width || mainWindow.minHeight !== minimumWindow.height) {
  throw new Error(
    `TheBoysLauncher desktop window minimum must stay ${minimumWindow.width}x${minimumWindow.height}; found ${mainWindow.minWidth}x${mainWindow.minHeight}`,
  );
}

if (mainWindow.width < mainWindow.minWidth || mainWindow.height < mainWindow.minHeight) {
  throw new Error(
    `TheBoysLauncher default window size ${mainWindow.width}x${mainWindow.height} must be at least its minimum ${mainWindow.minWidth}x${mainWindow.minHeight}`,
  );
}

const requiredFragments = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src",
  "ipc:",
  "http://ipc.localhost",
  "https://launcher.dylan.lol",
  "wss://launcher.dylan.lol",
  "http://127.0.0.1:*",
  "ws://127.0.0.1:*",
  "http://localhost:*",
  "ws://localhost:*",
  "http://[::1]:*",
  "ws://[::1]:*",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
];

const forbiddenFragments = [
  "default-src *",
  "script-src *",
  "connect-src *",
];

const missing = requiredFragments.filter((fragment) => !csp.includes(fragment));
if (missing.length > 0) {
  throw new Error(`Tauri CSP is missing required fragment(s): ${missing.join(", ")}`);
}

const forbidden = forbiddenFragments.filter((fragment) => csp.includes(fragment));
if (forbidden.length > 0) {
  throw new Error(`Tauri CSP contains forbidden broad/remote fragment(s): ${forbidden.join(", ")}`);
}

const connectDirective = csp
  .split(";")
  .map((directive) => directive.trim())
  .find((directive) => directive.startsWith("connect-src "));
if (!connectDirective) {
  throw new Error("Tauri CSP is missing a connect-src directive");
}

const connectSources = connectDirective.split(/\s+/).slice(1);
const broadConnectSchemes = connectSources.filter((source) => source === "https:" || source === "wss:");
if (broadConnectSchemes.length > 0) {
  throw new Error(
    `Tauri CSP contains forbidden broad connect-src scheme(s): ${broadConnectSchemes.join(", ")}`,
  );
}

console.log("Tauri security config verified.");
