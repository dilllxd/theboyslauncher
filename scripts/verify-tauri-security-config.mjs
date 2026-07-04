import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const tauriConfigPath = join(repoRoot, "src-tauri", "tauri.conf.json");
const tauriMainPath = join(repoRoot, "src-tauri", "src", "main.rs");
const tauriLibPath = join(repoRoot, "src-tauri", "src", "lib.rs");
const tauriCapabilityPath = join(repoRoot, "src-tauri", "capabilities", "default.json");
const config = JSON.parse(readFileSync(tauriConfigPath, "utf8"));
const mainCapability = JSON.parse(readFileSync(tauriCapabilityPath, "utf8"));
const tauriMain = readFileSync(tauriMainPath, "utf8");
const tauriLib = readFileSync(tauriLibPath, "utf8");
const appVersion = config?.version;
const csp = config?.app?.security?.csp;
const mainWindow = config?.app?.windows?.[0];
const minimumWindow = { width: 1100, height: 720 };
const expectedHostedBackendOrigin = "https://launcher.dylan.lol";
const expectedHostedBackendWebSocket = "wss://launcher.dylan.lol";
const expectedMicrosoftCallbackBind = "localhost:53682";
const expectedMicrosoftCallbackIpv4Bind = "127.0.0.1:53682";
const expectedMicrosoftCallbackIpv6Bind = "[::1]:53682";
const expectedMicrosoftCallbackOrigin = "http://localhost:53682";
const expectedCapabilityPermissions = ["core:default", "updater:default", "process:default"];
const forbiddenCapabilityPermissionPrefixes = [
  "fs:",
  "http:",
  "opener:",
  "shell:",
  "upload:",
  "websocket:",
];

function rustStringConst(name) {
  const match = tauriLib.match(new RegExp(`const\\s+${name}\\s*:\\s*&str\\s*=\\s*"([^"]+)";`));
  if (!match) {
    throw new Error(`src-tauri/src/lib.rs must define string constant ${name}`);
  }
  return match[1];
}

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

if (mainCapability?.identifier !== "main-window") {
  throw new Error("src-tauri/capabilities/default.json must define the main-window capability");
}
if (!Array.isArray(mainCapability.windows) || mainCapability.windows.length !== 1 || mainCapability.windows[0] !== "main") {
  throw new Error("src-tauri/capabilities/default.json must scope permissions only to the main window");
}
if (!Array.isArray(mainCapability.permissions)) {
  throw new Error("src-tauri/capabilities/default.json must define a permissions array");
}
const permissions = [...mainCapability.permissions].sort();
const expectedPermissions = [...expectedCapabilityPermissions].sort();
if (JSON.stringify(permissions) !== JSON.stringify(expectedPermissions)) {
  throw new Error(
    `src-tauri/capabilities/default.json permissions must stay ${expectedCapabilityPermissions.join(", ")}; found ${mainCapability.permissions.join(", ")}`,
  );
}
const forbiddenCapabilityPermissions = mainCapability.permissions.filter((permission) =>
  forbiddenCapabilityPermissionPrefixes.some((prefix) => permission.startsWith(prefix)),
);
if (forbiddenCapabilityPermissions.length > 0) {
  throw new Error(
    `Tauri capability contains forbidden broad desktop permission(s): ${forbiddenCapabilityPermissions.join(", ")}`,
  );
}

if (!tauriMain.includes('#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]')) {
  throw new Error(
    "src-tauri/src/main.rs must set windows_subsystem = \"windows\" for release builds so packaged Windows exe launches without a console window",
  );
}

for (const fragment of [
  "fn backend_start_command",
  "hide_backend_console_window(&mut command);",
  "fn hide_backend_console_window(command: &mut Command)",
  "std::os::windows::process::CommandExt",
  "const CREATE_NO_WINDOW: u32 = 0x08000000;",
  "command.creation_flags(CREATE_NO_WINDOW);",
]) {
  if (!tauriLib.includes(fragment)) {
    throw new Error(
      `src-tauri/src/lib.rs must hide the packaged friends-service process console window; missing ${fragment}`,
    );
  }
}

const requiredFragments = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src",
  "ipc:",
  "http://ipc.localhost",
  expectedHostedBackendOrigin,
  expectedHostedBackendWebSocket,
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

const defaultReleaseBackend = rustStringConst("DEFAULT_RELEASE_SOCIAL_BACKEND_URL");
if (defaultReleaseBackend !== expectedHostedBackendOrigin) {
  throw new Error(
    `DEFAULT_RELEASE_SOCIAL_BACKEND_URL must be ${expectedHostedBackendOrigin}; found ${defaultReleaseBackend}`,
  );
}

const microsoftClientId = rustStringConst("DEFAULT_MICROSOFT_CLIENT_ID");
if (
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    microsoftClientId,
  )
) {
  throw new Error("DEFAULT_MICROSOFT_CLIENT_ID must be a concrete Microsoft app UUID");
}

const forbiddenClientIds = new Set([
  "00000000-0000-0000-0000-000000000000",
  "client-id",
  "local-client-id",
  "replace-me",
  "TODO",
]);
if (forbiddenClientIds.has(microsoftClientId)) {
  throw new Error("DEFAULT_MICROSOFT_CLIENT_ID must not be a placeholder value");
}

const callbackBind = rustStringConst("MICROSOFT_CALLBACK_BIND_ADDR");
const callbackIpv4Bind = rustStringConst("MICROSOFT_CALLBACK_IPV4_BIND_ADDR");
const callbackIpv6Bind = rustStringConst("MICROSOFT_CALLBACK_IPV6_BIND_ADDR");
const callbackOrigin = rustStringConst("MICROSOFT_CALLBACK_ORIGIN");
const callbackPath = rustStringConst("MICROSOFT_CALLBACK_PATH");
if (callbackBind !== expectedMicrosoftCallbackBind) {
  throw new Error(
    `MICROSOFT_CALLBACK_BIND_ADDR must be ${expectedMicrosoftCallbackBind}; found ${callbackBind}`,
  );
}
if (callbackIpv4Bind !== expectedMicrosoftCallbackIpv4Bind) {
  throw new Error(
    `MICROSOFT_CALLBACK_IPV4_BIND_ADDR must be ${expectedMicrosoftCallbackIpv4Bind}; found ${callbackIpv4Bind}`,
  );
}
if (callbackIpv6Bind !== expectedMicrosoftCallbackIpv6Bind) {
  throw new Error(
    `MICROSOFT_CALLBACK_IPV6_BIND_ADDR must be ${expectedMicrosoftCallbackIpv6Bind}; found ${callbackIpv6Bind}`,
  );
}
if (callbackOrigin !== expectedMicrosoftCallbackOrigin) {
  throw new Error(
    `MICROSOFT_CALLBACK_ORIGIN must be ${expectedMicrosoftCallbackOrigin}; found ${callbackOrigin}`,
  );
}
if (callbackPath !== "/") {
  throw new Error(`MICROSOFT_CALLBACK_PATH must be /; found ${callbackPath}`);
}

console.log("Tauri security config verified.");
