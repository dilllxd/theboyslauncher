import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cargoTargetDir = resolve(process.env.CARGO_TARGET_DIR ?? join(repoRoot, "target"));
const defaultExePath = resolve(cargoTargetDir, "release", "theboyslauncher.exe");
const defaultRootPath = resolve(repoRoot, "target", "packaged-exe-smoke", "current");
const allowedSmokeRoot = resolve(repoRoot, "target", "packaged-exe-smoke");
const smokeRunLockPath = resolve(allowedSmokeRoot, ".active-smoke.lock");
const tauriConfigPath = resolve(repoRoot, "src-tauri", "tauri.conf.json");
const tauriLibPath = resolve(repoRoot, "src-tauri", "src", "lib.rs");
const frontendDistPath = resolve(repoRoot, "frontend", "dist");
const frontendFreshnessSourcePaths = [
  resolve(repoRoot, "frontend", "index.html"),
  resolve(repoRoot, "frontend", "vite.config.ts"),
  resolve(repoRoot, "frontend", "src", "main.tsx"),
  resolve(repoRoot, "frontend", "src", "styles.css"),
  resolve(repoRoot, "frontend", "src", "recovered-main-bundle.js"),
];
const nativeFreshnessSourcePaths = [
  resolve(repoRoot, "Cargo.lock"),
  resolve(repoRoot, "Cargo.toml"),
  resolve(repoRoot, "src-tauri", "Cargo.toml"),
  tauriConfigPath,
  resolve(repoRoot, "crates", "launcher-core", "Cargo.toml"),
  resolve(repoRoot, "crates", "shared", "Cargo.toml"),
];
const nativeFreshnessSourceDirectories = [
  resolve(repoRoot, "src-tauri", "src"),
  resolve(repoRoot, "crates", "launcher-core", "src"),
  resolve(repoRoot, "crates", "shared", "src"),
];
const socialBackendFreshnessSourcePaths = [
  resolve(repoRoot, "Cargo.lock"),
  resolve(repoRoot, "Cargo.toml"),
  resolve(repoRoot, "crates", "social-backend", "Cargo.toml"),
  resolve(repoRoot, "crates", "shared", "Cargo.toml"),
];
const socialBackendFreshnessSourceDirectories = [
  resolve(repoRoot, "crates", "social-backend", "src"),
  resolve(repoRoot, "crates", "shared", "src"),
];
const launcherStateDirNames = ["data", "config", "cache", "logs"];
const monitoredPackagedProcessNames = ["theboyslauncher.exe", "social-backend.exe", "java.exe", "javaw.exe", "cmd.exe", "ping.exe"];
const launcherGameProcessNames = ["java.exe", "javaw.exe", "cmd.exe", "ping.exe"];
const inheritedLauncherEnvOverrides = [
  "THEBOYS_LAUNCHER_DATA_DIR",
  "THEBOYS_LAUNCHER_CONFIG_DIR",
  "THEBOYS_LAUNCHER_CACHE_DIR",
  "THEBOYS_LAUNCHER_LOG_DIR",
  "THEBOYS_BACKEND_EXE",
  "THEBOYS_BACKEND_BIND",
  "THEBOYS_BACKEND_STATE_PATH",
  "THEBOYS_BACKEND_SESSION_SECRET",
  "THEBOYS_MICROSOFT_CLIENT_ID",
  "THEBOYS_JAVA_RUNTIME_MANIFEST_URL",
];
const localBackendSmokeAccountId = "11111111-2222-4333-8444-555555555555";
const localBackendSmokeSecret = "tbl-v4-packaged-smoke-local-session-secret-11111111-2222-4333-8444-555555555555";
let ownsSmokeRunLock = false;
let activePackagedProcessPid = null;
let terminationSignalHandled = false;

function usage() {
  console.error(
    "Usage: node scripts/smoke-packaged-exe.mjs [--exe <path>] [--root <path>] [--wait-ms <ms>] [--backend <hosted-default|off|local>] [--title <window title>]",
  );
}

function expectedWindowTitleFromConfig() {
  const config = JSON.parse(readFileSync(tauriConfigPath, "utf8"));
  return config?.app?.windows?.[0]?.title ?? config?.productName ?? "TheBoysLauncher";
}

function expectedExeMetadataFromConfig() {
  const config = JSON.parse(readFileSync(tauriConfigPath, "utf8"));
  const productName = config?.productName;
  const productVersion = config?.version;
  if (typeof productName !== "string" || productName.trim().length === 0) {
    throw new Error("Tauri config productName must not be blank");
  }
  if (typeof productVersion !== "string" || productVersion.trim().length === 0) {
    throw new Error("Tauri config version must not be blank");
  }
  return { productName, productVersion };
}

function parseArgs(argv) {
  const options = {
    exePath: defaultExePath,
    rootPath: defaultRootPath,
    waitMs: 30000,
    backend: "hosted-default",
    title: expectedWindowTitleFromConfig(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--exe") {
      options.exePath = resolve(argv[++index] ?? "");
    } else if (arg === "--root") {
      options.rootPath = resolve(argv[++index] ?? "");
    } else if (arg === "--wait-ms") {
      options.waitMs = Number(argv[++index]);
    } else if (arg === "--backend") {
      options.backend = argv[++index] ?? "";
    } else if (arg === "--title") {
      options.title = argv[++index] ?? "";
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.waitMs) || options.waitMs < 1000 || options.waitMs > 60000) {
    throw new Error("--wait-ms must be an integer from 1000 to 60000");
  }
  if (!["hosted-default", "off", "local"].includes(options.backend)) {
    throw new Error("--backend must be hosted-default, off, or local");
  }
  if (typeof options.title !== "string" || options.title.trim().length === 0) {
    throw new Error("--title must not be blank");
  }
  return options;
}

function assertSmokeRootIsSafe(rootPath) {
  if (rootPath !== allowedSmokeRoot && !rootPath.startsWith(`${allowedSmokeRoot}\\`) && !rootPath.startsWith(`${allowedSmokeRoot}/`)) {
    throw new Error(`Refusing to remove smoke root outside ${allowedSmokeRoot}: ${rootPath}`);
  }
  if (rootPath === allowedSmokeRoot) {
    throw new Error(`Smoke root must be a child directory of ${allowedSmokeRoot}, not the smoke parent itself`);
  }
  const leafName = basename(rootPath).toLowerCase();
  if (launcherStateDirNames.includes(leafName)) {
    throw new Error(`Smoke root must not be named like a launcher state directory: ${rootPath}`);
  }
}

function assertFile(path, label) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`Missing ${label}: ${path}`);
  }
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readSmokeRunLockOwner() {
  const ownerPath = resolve(smokeRunLockPath, "owner.json");
  if (!existsSync(ownerPath)) return null;
  try {
    return JSON.parse(readFileSync(ownerPath, "utf8"));
  } catch {
    return null;
  }
}

function acquireSmokeRunLock(options) {
  mkdirSync(allowedSmokeRoot, { recursive: true });
  try {
    mkdirSync(smokeRunLockPath);
    ownsSmokeRunLock = true;
    writeFileSync(
      resolve(smokeRunLockPath, "owner.json"),
      JSON.stringify(
        {
          pid: process.pid,
          exePath: options.exePath,
          rootPath: options.rootPath,
          backend: options.backend,
          startedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
    );
    return;
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw error;
    }
  }

  const owner = readSmokeRunLockOwner();
  if (owner?.pid && processIsAlive(Number(owner.pid))) {
    throw new Error(
      `Another packaged exe smoke is already running (pid ${owner.pid}, backend ${owner.backend ?? "unknown"}, root ${owner.rootPath ?? "unknown"}). Run packaged exe smokes serially so process-cleanup checks stay trustworthy.`,
    );
  }

  rmSync(smokeRunLockPath, { recursive: true, force: true });
  mkdirSync(smokeRunLockPath);
  ownsSmokeRunLock = true;
  writeFileSync(
    resolve(smokeRunLockPath, "owner.json"),
    JSON.stringify(
      {
        pid: process.pid,
        exePath: options.exePath,
        rootPath: options.rootPath,
        backend: options.backend,
        startedAt: new Date().toISOString(),
        replacedStaleLock: owner ?? true,
      },
      null,
      2,
    ) + "\n",
  );
}

function releaseSmokeRunLock() {
  if (!ownsSmokeRunLock) return;
  ownsSmokeRunLock = false;
  rmSync(smokeRunLockPath, { recursive: true, force: true });
}

process.on("exit", releaseSmokeRunLock);

function closeProcessSync(pid) {
  if (process.platform !== "win32" || !Number.isInteger(pid) || pid <= 0) {
    return;
  }
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$p = Get-Process -Id ${pid}`,
    "if ($p) {",
    "  $null = $p.CloseMainWindow()",
    "  Start-Sleep -Milliseconds 1500",
    "  if (-not $p.HasExited) { taskkill.exe /PID $p.Id /T /F | Out-Null }",
    "}",
  ].join("; ");
  spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    windowsHide: true,
    stdio: "ignore",
  });
}

function terminateSmokeFromSignal(signal) {
  if (terminationSignalHandled) {
    return;
  }
  terminationSignalHandled = true;
  if (activePackagedProcessPid !== null) {
    closeProcessSync(activePackagedProcessPid);
  }
  releaseSmokeRunLock();
  console.error(`Packaged exe smoke interrupted by ${signal}; cleaned up active packaged process.`);
  process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => terminateSmokeFromSignal(signal));
}

function fileSha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function latestMtime(paths, label) {
  let latest = { path: "", mtimeMs: 0 };
  for (const path of paths) {
    const stats = statSync(path);
    if (stats.mtimeMs > latest.mtimeMs) {
      latest = { path, mtimeMs: stats.mtimeMs };
    }
  }
  if (!latest.path) {
    throw new Error(`No files found while checking ${label}`);
  }
  return latest;
}

function existingFreshnessFiles(paths, directories) {
  const files = [];
  for (const path of paths) {
    if (existsSync(path) && statSync(path).isFile()) {
      files.push(path);
    }
  }
  for (const directory of directories) {
    files.push(...listFilesRecursive(directory));
  }
  return files;
}

function assertExecutableNewerThanSources(executablePath, sourceFiles, label, rebuildCommand) {
  const latestSource = latestMtime(sourceFiles, `${label} source freshness`);
  const executableStats = statSync(executablePath);
  const toleranceMs = 1000;
  if (executableStats.mtimeMs + toleranceMs < latestSource.mtimeMs) {
    throw new Error(`${label} is older than source ${latestSource.path}. Run ${rebuildCommand} before smoke:packaged-exe.`);
  }
  return latestSource;
}

function validateDefaultFrontendBuildFreshness(exePath) {
  if (resolve(exePath) !== defaultExePath) {
    return { checked: false };
  }

  const distIndexPath = resolve(frontendDistPath, "index.html");
  assertFile(distIndexPath, "frontend dist index");
  const distFiles = listFilesRecursive(frontendDistPath);
  const sourceFiles = frontendFreshnessSourcePaths.filter((path) => existsSync(path) && statSync(path).isFile());
  const latestDist = latestMtime(distFiles, "frontend/dist freshness");
  const latestSource = latestMtime(sourceFiles, "frontend source freshness");
  const exeStats = statSync(exePath);
  const toleranceMs = 1000;

  if (latestDist.mtimeMs + toleranceMs < latestSource.mtimeMs) {
    throw new Error(
      `frontend/dist is older than frontend source ${latestSource.path}. Run npm run build before packaging the default release exe.`,
    );
  }
  if (exeStats.mtimeMs + toleranceMs < latestDist.mtimeMs) {
    throw new Error(
      `Default packaged exe is older than frontend/dist (${latestDist.path}). Run npm run tauri:build before smoke:packaged-exe.`,
    );
  }
  const latestNativeSource = assertExecutableNewerThanSources(
    exePath,
    existingFreshnessFiles(nativeFreshnessSourcePaths, nativeFreshnessSourceDirectories),
    "Default packaged exe",
    "npm run tauri:build",
  );

  return {
    checked: true,
    latestDistPath: latestDist.path,
    latestSourcePath: latestSource.path,
    latestNativeSourcePath: latestNativeSource.path,
  };
}

function validateDefaultSocialBackendBuildFreshness(exePath) {
  return assertExecutableNewerThanSources(
    exePath,
    existingFreshnessFiles(socialBackendFreshnessSourcePaths, socialBackendFreshnessSourceDirectories),
    "Default adjacent social-backend.exe",
    "npm run build:social-backend",
  );
}

function validatePackagedBackendResources(exePath) {
  const appDir = dirname(exePath);
  const resourceDir = join(appDir, "resources");
  const windowsResource = join(resourceDir, "social-backend.exe");
  const portableResource = join(resourceDir, "social-backend");
  assertFile(windowsResource, "packaged Windows friends-service resource");
  assertFile(portableResource, "packaged portable friends-service resource");

  const windowsStats = statSync(windowsResource);
  const portableStats = statSync(portableResource);
  if (windowsStats.size <= 0) {
    throw new Error(`Packaged Windows friends-service resource is empty: ${windowsResource}`);
  }
  if (portableStats.size <= 0) {
    throw new Error(`Packaged portable friends-service resource is empty: ${portableResource}`);
  }

  const windowsHash = fileSha256(windowsResource);
  const portableHash = fileSha256(portableResource);
  if (windowsHash !== portableHash) {
    throw new Error("Packaged friends-service resources differ between Windows and portable names");
  }

  const adjacentBuild = join(appDir, "social-backend.exe");
  const requiresAdjacentBuild = resolve(exePath) === defaultExePath;
  let matchedAdjacentBuild = false;
  let adjacentBuildFreshnessChecked = false;
  if (!existsSync(adjacentBuild) || !statSync(adjacentBuild).isFile()) {
    if (requiresAdjacentBuild) {
      throw new Error(`Missing adjacent release social-backend.exe for default packaged smoke: ${adjacentBuild}`);
    }
  } else {
    if (requiresAdjacentBuild) {
      validateDefaultSocialBackendBuildFreshness(adjacentBuild);
      adjacentBuildFreshnessChecked = true;
    }
    const adjacentHash = fileSha256(adjacentBuild);
    if (windowsHash !== adjacentHash) {
      throw new Error("Packaged friends-service resource does not match adjacent release social-backend.exe");
    }
    matchedAdjacentBuild = true;
  }

  return {
    resourceDir,
    size: windowsStats.size,
    sha256: windowsHash,
    matchedAdjacentBuild,
    adjacentBuildFreshnessChecked,
  };
}

function readPeSubsystem(exePath) {
  const bytes = readFileSync(exePath);
  if (bytes.length < 0x100 || bytes.toString("ascii", 0, 2) !== "MZ") {
    throw new Error(`${exePath} is not a Windows PE executable`);
  }
  const peOffset = bytes.readInt32LE(0x3c);
  if (peOffset <= 0 || peOffset + 0x5c >= bytes.length || bytes.toString("ascii", peOffset, peOffset + 4) !== "PE\u0000\u0000") {
    throw new Error(`${exePath} has an invalid PE header`);
  }
  const optionalHeaderOffset = peOffset + 24;
  const magic = bytes.readUInt16LE(optionalHeaderOffset);
  if (magic !== 0x10b && magic !== 0x20b) {
    throw new Error(`${exePath} has an unsupported PE optional header magic: 0x${magic.toString(16)}`);
  }
  return bytes.readUInt16LE(optionalHeaderOffset + 0x44);
}

function readWindowsExeVersionInfo(exePath) {
  const escapedPath = exePath.replaceAll("'", "''");
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$info = (Get-Item -LiteralPath '${escapedPath}').VersionInfo`,
    "$info | Select-Object FileDescription,ProductName,ProductVersion,FileVersion,CompanyName | ConvertTo-Json -Compress",
  ].join("; ");
  const result = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`Failed to inspect packaged exe version info: ${result.stderr || result.stdout}`);
  }
  try {
    return JSON.parse(result.stdout.trim());
  } catch (error) {
    throw new Error(`Packaged exe version info was not valid JSON: ${error.message}`);
  }
}

function validateWindowsExeMetadata(exePath) {
  const expected = expectedExeMetadataFromConfig();
  const actual = readWindowsExeVersionInfo(exePath);
  if (actual.ProductName !== expected.productName) {
    throw new Error(`Packaged exe ProductName must be ${JSON.stringify(expected.productName)}, received ${JSON.stringify(actual.ProductName)}`);
  }
  if (actual.FileDescription !== expected.productName) {
    throw new Error(`Packaged exe FileDescription must be ${JSON.stringify(expected.productName)}, received ${JSON.stringify(actual.FileDescription)}`);
  }
  if (actual.ProductVersion !== expected.productVersion) {
    throw new Error(`Packaged exe ProductVersion must be ${JSON.stringify(expected.productVersion)}, received ${JSON.stringify(actual.ProductVersion)}`);
  }
  if (actual.FileVersion !== expected.productVersion) {
    throw new Error(`Packaged exe FileVersion must be ${JSON.stringify(expected.productVersion)}, received ${JSON.stringify(actual.FileVersion)}`);
  }
  return { ...expected, companyName: actual.CompanyName ?? "" };
}

function wait(ms) {
  return new Promise((resolveWait) => {
    setTimeout(resolveWait, ms);
  });
}

function readJsonFile(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function rustStringConst(name) {
  const source = readFileSync(tauriLibPath, "utf8");
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`const\\s+${escapedName}\\s*:\\s*&str\\s*=\\s*"([^"]*)"`));
  if (!match) {
    throw new Error(`Could not find Rust string const ${name}`);
  }
  return match[1];
}

function validatePackagedAuthFlowProbe(rootPath) {
  const probePath = resolve(rootPath, "config", "packaged-auth-flow-smoke.json");
  assertFile(probePath, "packaged Microsoft auth-flow smoke probe");
  const probe = readJsonFile(probePath, "packaged-auth-flow-smoke.json");
  const expectedClientId = rustStringConst("DEFAULT_MICROSOFT_CLIENT_ID");
  const expectedRedirectUri = "http://localhost:53682/";
  if (probe?.clientId !== expectedClientId) {
    throw new Error(`Packaged auth flow clientId must be ${expectedClientId}, received ${JSON.stringify(probe?.clientId)}`);
  }
  if (probe?.redirectUri !== expectedRedirectUri) {
    throw new Error(`Packaged auth flow redirectUri must be ${expectedRedirectUri}, received ${JSON.stringify(probe?.redirectUri)}`);
  }
  if (!Array.isArray(probe?.scopes) || probe.scopes.join(" ") !== "XboxLive.signin offline_access") {
    throw new Error(`Packaged auth flow scopes must be XboxLive.signin offline_access, received ${JSON.stringify(probe?.scopes)}`);
  }
  if (probe?.stateLength !== 32) {
    throw new Error(`Packaged auth flow stateLength must be 32, received ${JSON.stringify(probe?.stateLength)}`);
  }
  if (typeof probe?.codeChallenge !== "string" || probe.codeChallenge.length < 40) {
    throw new Error("Packaged auth flow must include a PKCE code challenge");
  }
  if (probe?.codeVerifierPresent !== true) {
    throw new Error("Packaged auth flow must create a PKCE code verifier without writing it to the smoke probe");
  }
  const authUrl = new URL(probe.authUrl);
  if (authUrl.origin !== "https://login.live.com" || authUrl.pathname !== "/oauth20_authorize.srf") {
    throw new Error(`Packaged auth flow authUrl must target login.live.com authorize endpoint, received ${probe.authUrl}`);
  }
  if (authUrl.searchParams.get("client_id") !== expectedClientId) {
    throw new Error("Packaged auth flow authUrl client_id does not match the bundled client id");
  }
  if (authUrl.searchParams.get("response_type") !== "code") {
    throw new Error("Packaged auth flow authUrl must request authorization code flow");
  }
  if (authUrl.searchParams.get("redirect_uri") !== expectedRedirectUri) {
    throw new Error("Packaged auth flow authUrl redirect_uri does not match the desktop callback URI");
  }
  if (authUrl.searchParams.get("scope") !== "XboxLive.signin offline_access") {
    throw new Error("Packaged auth flow authUrl scope does not match the Minecraft sign-in scopes");
  }
  if (authUrl.searchParams.get("code_challenge") !== probe.codeChallenge) {
    throw new Error("Packaged auth flow authUrl code_challenge does not match the generated challenge");
  }
  if (authUrl.searchParams.get("code_challenge_method") !== "S256") {
    throw new Error("Packaged auth flow authUrl must use PKCE S256");
  }
  return { clientId: probe.clientId, redirectUri: probe.redirectUri };
}

function validatePackagedAccountLifecycleProbe(rootPath) {
  const probePath = resolve(rootPath, "config", "packaged-account-lifecycle-smoke.json");
  assertFile(probePath, "packaged account lifecycle smoke probe");
  const probe = readJsonFile(probePath, "packaged-account-lifecycle-smoke.json");
  const expectedIds = ["packaged-smoke-account-one", "packaged-smoke-account-two"];
  const expectedUsers = ["SmokeOne", "SmokeTwo"];
  if (!Array.isArray(probe?.savedAccountIds) || expectedIds.some((id) => !probe.savedAccountIds.includes(id))) {
    throw new Error(`Packaged account lifecycle did not save both smoke accounts, received ${JSON.stringify(probe?.savedAccountIds)}`);
  }
  if (!Array.isArray(probe.savedUsernames) || expectedUsers.some((username) => !probe.savedUsernames.includes(username))) {
    throw new Error(`Packaged account lifecycle did not preserve both usernames, received ${JSON.stringify(probe.savedUsernames)}`);
  }
  if (probe.countAfterSave !== 2) {
    throw new Error(`Packaged account lifecycle must save two accounts, received ${JSON.stringify(probe.countAfterSave)}`);
  }
  if (probe.activeAfterSave !== "packaged-smoke-account-two") {
    throw new Error(`Packaged account lifecycle must make the newest account active, received ${JSON.stringify(probe.activeAfterSave)}`);
  }
  if (probe.activeAfterSelect !== "packaged-smoke-account-one") {
    throw new Error(`Packaged account lifecycle did not switch the active account, received ${JSON.stringify(probe.activeAfterSelect)}`);
  }
  if (probe.rawSecretsAbsent !== true) {
    throw new Error("Packaged account lifecycle wrote raw Minecraft auth secrets to disk");
  }
  if (
    probe.storedSecretsProtected !== true ||
    probe.sessionAccessTokenProtected !== true ||
    probe.sessionRefreshTokenProtected !== true ||
    probe.accountSecretFieldsProtected !== true
  ) {
    throw new Error(`Packaged account lifecycle did not protect stored auth secrets, received ${JSON.stringify(probe)}`);
  }
  if (probe.countAfterInactiveRemove !== 1 || probe.activeAfterInactiveRemove !== "SmokeOne") {
    throw new Error(`Packaged account lifecycle did not preserve the selected account after inactive removal, received ${JSON.stringify(probe)}`);
  }
  if (probe.finalCount !== 0) {
    throw new Error(`Packaged account lifecycle left account summaries behind, received ${JSON.stringify(probe.finalCount)}`);
  }
  if (probe.sessionStateRemoved !== true || probe.accountStateRemoved !== true) {
    throw new Error("Packaged account lifecycle did not remove persisted session/account files");
  }
  return {
    saved: probe.countAfterSave,
    selected: probe.activeAfterSelect,
    secretsProtected: probe.storedSecretsProtected,
  };
}

function validatePackagedAuthRecoveryProbe(rootPath) {
  const probePath = resolve(rootPath, "config", "packaged-auth-recovery-smoke.json");
  assertFile(probePath, "packaged auth recovery smoke probe");
  const probe = readJsonFile(probePath, "packaged-auth-recovery-smoke.json");
  if (probe?.expiredAccountId !== "packaged-smoke-expired-account") {
    throw new Error(`Packaged auth recovery expiredAccountId must be packaged-smoke-expired-account, received ${JSON.stringify(probe?.expiredAccountId)}`);
  }
  if (probe.savedAccountCount !== 1) {
    throw new Error(`Packaged auth recovery must save one expired account before recovery, received ${JSON.stringify(probe.savedAccountCount)}`);
  }
  if (probe.refreshAttemptedLocally !== true) {
    throw new Error("Packaged auth recovery did not attempt stored-session refresh locally");
  }
  if (typeof probe.refreshFailure !== "string" || !probe.refreshFailure.includes("does not include a Microsoft refresh token")) {
    throw new Error(`Packaged auth recovery returned the wrong local refresh failure, received ${JSON.stringify(probe.refreshFailure)}`);
  }
  if (probe.refreshFailure.includes("expired-smoke-access-token-do-not-write")) {
    throw new Error("Packaged auth recovery leaked the expired access token in its refresh error");
  }
  if (probe.rawSecretAbsent !== true) {
    throw new Error("Packaged auth recovery wrote a raw expired access token to disk");
  }
  if (probe.processCountBefore !== probe.processCountAfter || probe.managedProcessStarted !== false) {
    throw new Error(`Packaged auth recovery must not start a managed process, received ${JSON.stringify(probe)}`);
  }
  if (probe.finalAccountCount !== 0 || probe.stateRemoved !== true) {
    throw new Error(`Packaged auth recovery did not clean expired session state, received ${JSON.stringify(probe)}`);
  }
  return {
    expiredAccountId: probe.expiredAccountId,
    refreshAttemptedLocally: probe.refreshAttemptedLocally,
    stateRemoved: probe.stateRemoved,
  };
}

function validatePackagedStoredAuthLaunchProbe(rootPath) {
  const probePath = resolve(rootPath, "config", "packaged-stored-auth-launch-smoke.json");
  assertFile(probePath, "packaged stored-auth launch smoke probe");
  const probe = readJsonFile(probePath, "packaged-stored-auth-launch-smoke.json");
  if (probe?.profileId !== "packaged-smoke-stored-auth") {
    throw new Error(`Packaged stored-auth launch profileId must be packaged-smoke-stored-auth, received ${JSON.stringify(probe?.profileId)}`);
  }
  if (probe.accountId !== "packaged-smoke-stored-auth-account") {
    throw new Error(`Packaged stored-auth launch accountId must be packaged-smoke-stored-auth-account, received ${JSON.stringify(probe.accountId)}`);
  }
  if (probe.storedUsername !== "StoredSmoke" || probe.storedUuid !== "aaaaaaaa-3333-4444-8555-aaaaaaaaaaaa") {
    throw new Error(`Packaged stored-auth launch did not load the saved account identity, received ${JSON.stringify({ username: probe.storedUsername, uuid: probe.storedUuid })}`);
  }
  if (!Number.isInteger(probe.argCount) || probe.argCount < 12) {
    throw new Error(`Packaged stored-auth launch command must contain a Minecraft launch argument set, received ${JSON.stringify(probe.argCount)}`);
  }
  if (probe.accessTokenRedacted !== true || probe.accessTokenAbsentFromCommand !== true || probe.refreshTokenAbsentFromCommand !== true) {
    throw new Error(`Packaged stored-auth launch command leaked or failed to redact auth secrets, received ${JSON.stringify(probe)}`);
  }
  if (probe.rawSecretsAbsent !== true || probe.storedSecretsProtected !== true) {
    throw new Error("Packaged stored-auth launch did not protect persisted stored-session secrets");
  }
  if (probe.serverAddress !== "stored-auth.theboys.example" || probe.serverPort !== "25567") {
    throw new Error(`Packaged stored-auth launch did not include the explicit server target, received ${JSON.stringify({ server: probe.serverAddress, port: probe.serverPort })}`);
  }
  if (probe.mainClass !== "com.example.minecraft.Main" || probe.classpathHasClientJar !== true) {
    throw new Error(`Packaged stored-auth launch did not use cached launch metadata, received ${JSON.stringify(probe)}`);
  }
  if (probe.envProfileId !== probe.profileId) {
    throw new Error(`Packaged stored-auth launch env profile id must match profile id, received ${JSON.stringify(probe.envProfileId)}`);
  }
  if (probe.managedProcessStarted !== true || probe.startedState !== "running" || probe.stoppedState !== "exited") {
    throw new Error(`Packaged stored-auth launch did not start and stop a managed process, received ${JSON.stringify(probe)}`);
  }
  if (probe.activeProcessMatched !== true) {
    throw new Error("Packaged stored-auth launch did not find the active managed process");
  }
  if (probe.processCountBefore !== probe.processCountAfter) {
    throw new Error(`Packaged stored-auth launch leaked managed process state, received ${JSON.stringify({ before: probe.processCountBefore, after: probe.processCountAfter })}`);
  }
  if (!Number.isInteger(probe.launchEventCount) || probe.launchEventCount < 2) {
    throw new Error(`Packaged stored-auth launch must record launch lifecycle events, received ${JSON.stringify(probe.launchEventCount)}`);
  }
  if (probe.lastPlayedMarked !== true) {
    throw new Error("Packaged stored-auth launch did not mark the profile launched");
  }
  if (probe.deletedProfileId !== probe.profileId || probe.profileDataRemoved !== true) {
    throw new Error("Packaged stored-auth launch did not delete the temporary smoke profile");
  }
  if (probe.stateRemoved !== true || probe.finalAccountCount !== 0) {
    throw new Error("Packaged stored-auth launch did not clear stored auth state");
  }
  return {
    profileId: probe.profileId,
    storedUsername: probe.storedUsername,
    argCount: probe.argCount,
    launchEventCount: probe.launchEventCount,
  };
}

function validatePackagedModrinthArchiveInstallProbe(rootPath) {
  const probePath = resolve(rootPath, "config", "packaged-modrinth-archive-install-smoke.json");
  assertFile(probePath, "packaged Modrinth archive install smoke probe");
  const probe = readJsonFile(probePath, "packaged-modrinth-archive-install-smoke.json");
  if (probe?.profileId !== "packaged-smoke-modrinth") {
    throw new Error(`Packaged Modrinth archive install profileId must be packaged-smoke-modrinth, received ${JSON.stringify(probe?.profileId)}`);
  }
  if (probe.profileName !== "Packaged Smoke Modrinth" || probe.loader !== "Vanilla" || probe.gameVersion !== "1.21.8") {
    throw new Error(`Packaged Modrinth archive install persisted the wrong profile metadata, received ${JSON.stringify(probe)}`);
  }
  if (probe.installedPackVersion !== "packaged-modrinth-version") {
    throw new Error(`Packaged Modrinth archive install did not preserve installed pack version, received ${JSON.stringify(probe.installedPackVersion)}`);
  }
  if (probe.fileDownloadCount !== 0) {
    throw new Error(`Packaged Modrinth archive fixture should not require remote pack file downloads, received ${JSON.stringify(probe.fileDownloadCount)}`);
  }
  if (probe.extractionEventCount < 2 || probe.installEventCount < 3) {
    throw new Error(`Packaged Modrinth archive install did not record expected activity events, received ${JSON.stringify(probe)}`);
  }
  for (const key of ["overrideExtracted", "clientOverrideExtracted", "serverOverrideSkipped", "metadataStored", "persistedProfileFound"]) {
    if (probe[key] !== true) {
      throw new Error(`Packaged Modrinth archive install expected ${key}=true, received ${JSON.stringify(probe[key])}`);
    }
  }
  if (probe.deletedProfileId !== probe.profileId || probe.profileDataRemoved !== true || probe.archiveRemoved !== true) {
    throw new Error(`Packaged Modrinth archive install did not clean temporary state, received ${JSON.stringify(probe)}`);
  }
  return {
    profileId: probe.profileId,
    profileName: probe.profileName,
    installEventCount: probe.installEventCount,
  };
}

function validatePackagedCurseForgeArchiveInstallProbe(rootPath) {
  const probePath = resolve(rootPath, "config", "packaged-curseforge-archive-install-smoke.json");
  assertFile(probePath, "packaged CurseForge archive install smoke probe");
  const probe = readJsonFile(probePath, "packaged-curseforge-archive-install-smoke.json");
  if (probe?.profileId !== "packaged-smoke-curseforge") {
    throw new Error(`Packaged CurseForge archive install profileId must be packaged-smoke-curseforge, received ${JSON.stringify(probe?.profileId)}`);
  }
  if (probe.profileName !== "Packaged Smoke CurseForge" || probe.loader !== "Vanilla" || probe.gameVersion !== "1.21.8") {
    throw new Error(`Packaged CurseForge archive install persisted the wrong profile metadata, received ${JSON.stringify(probe)}`);
  }
  if (probe.installedPackVersion !== "packaged-curseforge-version") {
    throw new Error(`Packaged CurseForge archive install did not preserve installed pack version, received ${JSON.stringify(probe.installedPackVersion)}`);
  }
  if (probe.modDownloadCount !== 0) {
    throw new Error(`Packaged CurseForge archive fixture should not require remote mod downloads, received ${JSON.stringify(probe.modDownloadCount)}`);
  }
  if (probe.extractionEventCount < 2 || probe.installEventCount < 3) {
    throw new Error(`Packaged CurseForge archive install did not record expected activity events, received ${JSON.stringify(probe)}`);
  }
  for (const key of ["overrideExtracted", "nestedOverrideExtracted", "metadataStored", "persistedProfileFound"]) {
    if (probe[key] !== true) {
      throw new Error(`Packaged CurseForge archive install expected ${key}=true, received ${JSON.stringify(probe[key])}`);
    }
  }
  if (probe.deletedProfileId !== probe.profileId || probe.profileDataRemoved !== true || probe.archiveRemoved !== true) {
    throw new Error(`Packaged CurseForge archive install did not clean temporary state, received ${JSON.stringify(probe)}`);
  }
  return {
    profileId: probe.profileId,
    profileName: probe.profileName,
    installEventCount: probe.installEventCount,
  };
}

function validatePackagedFtbLegacyArchiveInstallProbe(rootPath) {
  const probePath = resolve(rootPath, "config", "packaged-ftb-legacy-archive-install-smoke.json");
  assertFile(probePath, "packaged FTB Legacy archive install smoke probe");
  const probe = readJsonFile(probePath, "packaged-ftb-legacy-archive-install-smoke.json");
  if (probe?.profileId !== "ftb-legacy-packaged-smoke-ftb-legacy") {
    throw new Error(`Packaged FTB Legacy archive install profileId must be ftb-legacy-packaged-smoke-ftb-legacy, received ${JSON.stringify(probe?.profileId)}`);
  }
  if (probe.profileName !== "Packaged Smoke FTB Legacy" || probe.loader !== "Forge" || probe.gameVersion !== "1.12.2") {
    throw new Error(`Packaged FTB Legacy archive install persisted the wrong profile metadata, received ${JSON.stringify(probe)}`);
  }
  if (probe.loaderVersion !== "14.23.5.2860") {
    throw new Error(`Packaged FTB Legacy archive install did not derive the Forge loader version, received ${JSON.stringify(probe.loaderVersion)}`);
  }
  if (probe.installedPackVersion !== "1.1.0") {
    throw new Error(`Packaged FTB Legacy archive install did not preserve installed pack version, received ${JSON.stringify(probe.installedPackVersion)}`);
  }
  if (probe.archiveDownloadCount !== 0) {
    throw new Error(`Packaged FTB Legacy archive fixture should not require remote archive downloads, received ${JSON.stringify(probe.archiveDownloadCount)}`);
  }
  if (probe.extractionEventCount < 2 || probe.installEventCount < 3) {
    throw new Error(`Packaged FTB Legacy archive install did not record expected activity events, received ${JSON.stringify(probe)}`);
  }
  for (const key of ["packJsonExtracted", "configExtracted", "scriptExtracted", "persistedProfileFound"]) {
    if (probe[key] !== true) {
      throw new Error(`Packaged FTB Legacy archive install expected ${key}=true, received ${JSON.stringify(probe[key])}`);
    }
  }
  if (probe.deletedProfileId !== probe.profileId || probe.profileDataRemoved !== true || probe.archiveRemoved !== true) {
    throw new Error(`Packaged FTB Legacy archive install did not clean temporary state, received ${JSON.stringify(probe)}`);
  }
  return {
    profileId: probe.profileId,
    profileName: probe.profileName,
    loaderVersion: probe.loaderVersion,
    installEventCount: probe.installEventCount,
  };
}

function validatePackagedFtbInstallProbe(rootPath) {
  const probePath = resolve(rootPath, "config", "packaged-ftb-install-smoke.json");
  assertFile(probePath, "packaged FTB install smoke probe");
  const probe = readJsonFile(probePath, "packaged-ftb-install-smoke.json");
  if (probe?.profileId !== "ftb-424242") {
    throw new Error(`Packaged FTB install profileId must be ftb-424242, received ${JSON.stringify(probe?.profileId)}`);
  }
  if (probe.profileName !== "Packaged Smoke FTB" || probe.loader !== "Neoforge" || probe.gameVersion !== "1.21.1") {
    throw new Error(`Packaged FTB install persisted the wrong profile metadata, received ${JSON.stringify(probe)}`);
  }
  if (probe.loaderVersion !== "21.1.51") {
    throw new Error(`Packaged FTB install did not preserve the Neoforge loader version, received ${JSON.stringify(probe.loaderVersion)}`);
  }
  if (probe.installedPackVersion !== "12482") {
    throw new Error(`Packaged FTB install did not preserve installed pack version, received ${JSON.stringify(probe.installedPackVersion)}`);
  }
  if (probe.memoryMb !== 6144) {
    throw new Error(`Packaged FTB install did not preserve recommended memory, received ${JSON.stringify(probe.memoryMb)}`);
  }
  if (probe.fileDownloadCount !== 1) {
    throw new Error(`Packaged FTB install fixture should plan one required client file, received ${JSON.stringify(probe.fileDownloadCount)}`);
  }
  if (probe.installEventCount < 1) {
    throw new Error(`Packaged FTB install did not record an install activity event, received ${JSON.stringify(probe)}`);
  }
  for (const key of ["configStaged", "serverOnlySkipped", "optionalSkipped", "persistedProfileFound"]) {
    if (probe[key] !== true) {
      throw new Error(`Packaged FTB install expected ${key}=true, received ${JSON.stringify(probe[key])}`);
    }
  }
  if (probe.deletedProfileId !== probe.profileId || probe.profileDataRemoved !== true || probe.stagedFilesRemoved !== true) {
    throw new Error(`Packaged FTB install did not clean temporary state, received ${JSON.stringify(probe)}`);
  }
  return {
    profileId: probe.profileId,
    profileName: probe.profileName,
    loaderVersion: probe.loaderVersion,
    fileDownloadCount: probe.fileDownloadCount,
    installEventCount: probe.installEventCount,
  };
}

function validatePackagedTechnicArchiveInstallProbe(rootPath) {
  const probePath = resolve(rootPath, "config", "packaged-technic-archive-install-smoke.json");
  assertFile(probePath, "packaged Technic archive install smoke probe");
  const probe = readJsonFile(probePath, "packaged-technic-archive-install-smoke.json");
  if (probe?.profileId !== "technic-packaged-smoke-technic") {
    throw new Error(`Packaged Technic archive install profileId must be technic-packaged-smoke-technic, received ${JSON.stringify(probe?.profileId)}`);
  }
  if (probe.profileName !== "Packaged Smoke Technic" || probe.loader !== "Forge" || probe.gameVersion !== "1.12.2") {
    throw new Error(`Packaged Technic archive install persisted the wrong profile metadata, received ${JSON.stringify(probe)}`);
  }
  if (probe.loaderVersion !== "14.23.5.2860") {
    throw new Error(`Packaged Technic archive install did not derive the Forge loader version, received ${JSON.stringify(probe.loaderVersion)}`);
  }
  if (probe.installedPackVersion !== "1.3.0") {
    throw new Error(`Packaged Technic archive install did not preserve installed pack version, received ${JSON.stringify(probe.installedPackVersion)}`);
  }
  if (probe.archiveDownloadCount !== 0) {
    throw new Error(`Packaged Technic archive fixture should not require remote archive downloads, received ${JSON.stringify(probe.archiveDownloadCount)}`);
  }
  if (probe.extractionEventCount < 2 || probe.installEventCount < 3) {
    throw new Error(`Packaged Technic archive install did not record expected activity events, received ${JSON.stringify(probe)}`);
  }
  for (const key of ["versionJsonExtracted", "modExtracted", "configExtracted", "persistedProfileFound"]) {
    if (probe[key] !== true) {
      throw new Error(`Packaged Technic archive install expected ${key}=true, received ${JSON.stringify(probe[key])}`);
    }
  }
  if (probe.deletedProfileId !== probe.profileId || probe.profileDataRemoved !== true || probe.archiveRemoved !== true) {
    throw new Error(`Packaged Technic archive install did not clean temporary state, received ${JSON.stringify(probe)}`);
  }
  return {
    profileId: probe.profileId,
    profileName: probe.profileName,
    loaderVersion: probe.loaderVersion,
    installEventCount: probe.installEventCount,
  };
}

function validatePackagedAtlauncherInstallProbe(rootPath) {
  const probePath = resolve(rootPath, "config", "packaged-atlauncher-install-smoke.json");
  assertFile(probePath, "packaged ATLauncher install smoke probe");
  const probe = readJsonFile(probePath, "packaged-atlauncher-install-smoke.json");
  if (probe?.profileId !== "atlauncher-packagedsmokeatlauncher") {
    throw new Error(`Packaged ATLauncher install profileId must be atlauncher-packagedsmokeatlauncher, received ${JSON.stringify(probe?.profileId)}`);
  }
  if (probe.profileName !== "Packaged Smoke ATLauncher" || probe.loader !== "Forge" || probe.gameVersion !== "1.12.2") {
    throw new Error(`Packaged ATLauncher install persisted the wrong profile metadata, received ${JSON.stringify(probe)}`);
  }
  if (probe.loaderVersion !== "14.23.5.2860") {
    throw new Error(`Packaged ATLauncher install did not preserve the Forge loader version, received ${JSON.stringify(probe.loaderVersion)}`);
  }
  if (probe.installedPackVersion !== "1.0.0") {
    throw new Error(`Packaged ATLauncher install did not preserve installed pack version, received ${JSON.stringify(probe.installedPackVersion)}`);
  }
  if (probe.fileDownloadCount !== 3 || probe.extractArchiveCount !== 2) {
    throw new Error(`Packaged ATLauncher install did not plan the expected file/archive set, received ${JSON.stringify(probe)}`);
  }
  if (probe.extractionEventCount < 2 || probe.installEventCount < 3) {
    throw new Error(`Packaged ATLauncher install did not record expected activity events, received ${JSON.stringify(probe)}`);
  }
  for (const key of ["modStaged", "configExtracted", "scriptExtracted", "serverOnlySkipped", "persistedProfileFound"]) {
    if (probe[key] !== true) {
      throw new Error(`Packaged ATLauncher install expected ${key}=true, received ${JSON.stringify(probe[key])}`);
    }
  }
  if (probe.deletedProfileId !== probe.profileId || probe.profileDataRemoved !== true || probe.stagedFilesRemoved !== true) {
    throw new Error(`Packaged ATLauncher install did not clean temporary state, received ${JSON.stringify(probe)}`);
  }
  return {
    profileId: probe.profileId,
    profileName: probe.profileName,
    loaderVersion: probe.loaderVersion,
    fileDownloadCount: probe.fileDownloadCount,
    installEventCount: probe.installEventCount,
  };
}

function validatePackagedActivityProgressProbe(rootPath) {
  const probePath = resolve(rootPath, "config", "packaged-activity-progress-smoke.json");
  assertFile(probePath, "packaged activity progress smoke probe");
  const probe = readJsonFile(probePath, "packaged-activity-progress-smoke.json");
  if (probe?.operation !== "download_artifacts" || probe.subjectId !== "packaged-activity-progress") {
    throw new Error(`Packaged activity progress operation must be download_artifacts for packaged-activity-progress, received ${JSON.stringify(probe)}`);
  }
  if (!Number.isInteger(probe.eventCount) || probe.eventCount < 9) {
    throw new Error(`Packaged activity progress must record a live file event stream, received ${JSON.stringify(probe.eventCount)}`);
  }
  if (!Array.isArray(probe.messages)) {
    throw new Error("Packaged activity progress messages must be an array");
  }
  for (const expected of [
    "Downloading Minecraft client",
    "Minecraft client ready",
    "Downloading Minecraft assets",
    "Minecraft assets ready",
    "Downloading mod loader files",
    "mod loader files ready",
    "Files are ready.",
  ]) {
    if (!probe.messages.includes(expected)) {
      throw new Error(`Packaged activity progress did not include ${JSON.stringify(expected)}: ${JSON.stringify(probe.messages)}`);
    }
  }
  if (probe.rawInternalTermsAbsent !== true) {
    throw new Error(`Packaged activity progress leaked internal file wording: ${JSON.stringify(probe.messages)}`);
  }
  if (probe.downloadedFileCount !== 3) {
    throw new Error(`Packaged activity progress must download three tiny files, received ${JSON.stringify(probe.downloadedFileCount)}`);
  }
  return {
    eventCount: probe.eventCount,
    downloadedFileCount: probe.downloadedFileCount,
  };
}

function validatePackagedJavaRecoveryProbe(rootPath) {
  const probePath = resolve(rootPath, "config", "packaged-java-recovery-smoke.json");
  assertFile(probePath, "packaged Java recovery smoke probe");
  const probe = readJsonFile(probePath, "packaged-java-recovery-smoke.json");
  const expectedSelections = new Map([
    ["b1.8.1", { requiredJava: 8, runtimeId: "temurin-8-windows-x64" }],
    ["1.16.5", { requiredJava: 8, runtimeId: "temurin-8-windows-x64" }],
    ["1.17.1", { requiredJava: 16, runtimeId: "temurin-17-windows-x64" }],
    ["1.20.4", { requiredJava: 17, runtimeId: "temurin-17-windows-x64" }],
    ["1.20.5", { requiredJava: 21, runtimeId: "temurin-21-windows-x64" }],
    ["1.21.8", { requiredJava: 21, runtimeId: "temurin-21-windows-x64" }],
    ["26.2", { requiredJava: 25, runtimeId: "temurin-25-windows-x64" }],
  ]);
  if (probe?.selectionCount !== expectedSelections.size || !Array.isArray(probe.selections)) {
    throw new Error(`Packaged Java recovery must report ${expectedSelections.size} selections, received ${JSON.stringify(probe)}`);
  }
  for (const [version, expected] of expectedSelections) {
    const selection = probe.selections.find((entry) => entry?.minecraftVersion === version);
    if (!selection) {
      throw new Error(`Packaged Java recovery did not report Minecraft ${version}`);
    }
    if (selection.requiredJava !== expected.requiredJava || selection.runtimeId !== expected.runtimeId) {
      throw new Error(`Packaged Java recovery selected the wrong runtime for ${version}: ${JSON.stringify(selection)}`);
    }
    if (selection.archiveKind !== "java_runtime_archive") {
      throw new Error(`Packaged Java recovery download plan for ${version} must use Java runtime archive, received ${JSON.stringify(selection.archiveKind)}`);
    }
    if (typeof selection.downloadDestination !== "string" || !selection.downloadDestination.includes(`data/runtimes/${expected.runtimeId}/downloads/`)) {
      throw new Error(`Packaged Java recovery download plan for ${version} must target managed runtimes, received ${JSON.stringify(selection.downloadDestination)}`);
    }
  }
  if (probe.recoverableManagedJavaFailures !== 2) {
    throw new Error(`Packaged Java recovery must classify managed Java launch failures as recoverable, received ${JSON.stringify(probe.recoverableManagedJavaFailures)}`);
  }
  if (probe.manualOverrideFailuresRecoverable !== false) {
    throw new Error("Packaged Java recovery must not auto-recover manual Java override failures");
  }
  if (probe.downloadPlansTargetManagedRuntimes !== true) {
    throw new Error("Packaged Java recovery download plans must target managed runtime directories");
  }
  return {
    selectionCount: probe.selectionCount,
    latestRuntimeId: probe.selections.find((entry) => entry.minecraftVersion === "1.21.8")?.runtimeId,
    futureRuntimeId: probe.selections.find((entry) => entry.minecraftVersion === "26.2")?.runtimeId,
  };
}

function validatePackagedDiscoverRoutingProbe(rootPath) {
  const probePath = resolve(rootPath, "config", "packaged-discover-routing-smoke.json");
  assertFile(probePath, "packaged Discover routing smoke probe");
  const probe = readJsonFile(probePath, "packaged-discover-routing-smoke.json");
  const expectedRoutes = new Map([
    ["curseforge_flame", { provider: "curseforge", projectId: "890405", versionId: "5650506" }],
    ["modrinth_prism", { provider: "modrinth", projectId: "fabulously-optimized", versionId: "preview" }],
    ["atlauncher_prism", { provider: "atlauncher", projectId: "SevTechAges", versionId: "3.2.3" }],
    ["ftb_prism", { provider: "ftb", projectId: "126", versionId: "12482" }],
    ["ftb_legacy_prism", { provider: "ftb_legacy", projectId: "public:FTBAcademy:FTBAcademy.zip", versionId: "1.1.0" }],
    ["ftb_private_prism", { provider: "ftb_private", projectId: "familycode", versionId: null }],
    ["technic_prism", { provider: "technic", projectId: "hexxit", versionId: "1.0.10" }],
  ]);
  if (probe?.providerCount !== expectedRoutes.size || !Array.isArray(probe.routed)) {
    throw new Error(`Packaged Discover routing must report ${expectedRoutes.size} routed providers, received ${JSON.stringify(probe)}`);
  }
  for (const [label, expected] of expectedRoutes) {
    const route = probe.routed.find((entry) => entry?.label === label);
    if (!route) {
      throw new Error(`Packaged Discover routing did not report ${label}`);
    }
    for (const [key, expectedValue] of Object.entries(expected)) {
      if ((route[key] ?? null) !== expectedValue) {
        throw new Error(`Packaged Discover routing ${label} ${key} must be ${JSON.stringify(expectedValue)}, received ${JSON.stringify(route[key])}`);
      }
    }
    if (route.installAvailable !== true) {
      throw new Error(`Packaged Discover routing ${label} must be installable, received ${JSON.stringify(route)}`);
    }
  }
  const providers = new Set(probe.routed.map((entry) => entry.provider));
  for (const provider of ["curseforge", "modrinth", "atlauncher", "ftb", "ftb_legacy", "ftb_private", "technic"]) {
    if (!providers.has(provider)) {
      throw new Error(`Packaged Discover routing missing provider ${provider}`);
    }
    if (!Array.isArray(probe.nativeInstallProviders) || !probe.nativeInstallProviders.includes(provider)) {
      throw new Error(`Packaged Discover routing native install provider list missing ${provider}`);
    }
  }
  if (
    probe.allSourcesShortCircuited !== true ||
    probe.allSourcesProvider !== "modrinth" ||
    probe.allSourcesProjectId !== "fabulously-optimized"
  ) {
    throw new Error(`Packaged Discover routing did not resolve All sources provider links locally: ${JSON.stringify(probe)}`);
  }
  return {
    providerCount: probe.providerCount,
    privateProjectId: probe.routed.find((entry) => entry.label === "ftb_private_prism")?.projectId,
  };
}

function validatePackagedProfileLifecycleProbe(rootPath) {
  const probePath = resolve(rootPath, "config", "packaged-profile-lifecycle-smoke.json");
  assertFile(probePath, "packaged profile lifecycle smoke probe");
  const probe = readJsonFile(probePath, "packaged-profile-lifecycle-smoke.json");
  if (typeof probe?.createdProfileId !== "string" || !probe.createdProfileId.includes("packaged-smoke-profile")) {
    throw new Error(`Packaged profile lifecycle did not create the expected profile id, received ${JSON.stringify(probe?.createdProfileId)}`);
  }
  if (probe.updatedProfileId !== probe.createdProfileId) {
    throw new Error("Packaged profile lifecycle update did not target the created profile");
  }
  if (probe.updatedName !== "Packaged Smoke Profile Updated") {
    throw new Error(`Packaged profile lifecycle update did not persist the updated name, received ${JSON.stringify(probe.updatedName)}`);
  }
  if (probe.updatedMemoryMb !== 4096) {
    throw new Error(`Packaged profile lifecycle update did not persist memory, received ${JSON.stringify(probe.updatedMemoryMb)}`);
  }
  if (!Array.isArray(probe.updatedJvmArgs) || probe.updatedJvmArgs[0] !== "-Dtheboys.packagedSmoke=true") {
    throw new Error(`Packaged profile lifecycle update did not persist JVM args, received ${JSON.stringify(probe.updatedJvmArgs)}`);
  }
  if (probe.updatedDefaultServer?.address !== "play.theboys.example" || probe.updatedDefaultServer?.port !== 25565) {
    throw new Error(`Packaged profile lifecycle update did not persist the default server, received ${JSON.stringify(probe.updatedDefaultServer)}`);
  }
  if (typeof probe.duplicatedProfileId !== "string" || probe.duplicatedProfileId === probe.createdProfileId) {
    throw new Error("Packaged profile lifecycle did not duplicate into a distinct profile id");
  }
  if (probe.duplicatedName !== "Packaged Smoke Profile Copy") {
    throw new Error(`Packaged profile lifecycle duplicate did not persist the copy name, received ${JSON.stringify(probe.duplicatedName)}`);
  }
  if (probe.duplicatedProfileDataCopied !== true) {
    throw new Error("Packaged profile lifecycle did not copy profile-owned data into the duplicated profile");
  }
  if (probe.deletedDuplicateId !== probe.duplicatedProfileId) {
    throw new Error("Packaged profile lifecycle did not delete the duplicated profile");
  }
  if (probe.deletedOriginalId !== probe.createdProfileId) {
    throw new Error("Packaged profile lifecycle did not delete the original profile");
  }
  if (probe.createdProfileDataRemoved !== true || probe.duplicatedProfileDataRemoved !== true) {
    throw new Error(`Packaged profile lifecycle did not remove profile-owned data after delete: ${JSON.stringify(probe)}`);
  }
  if (probe.sharedCacheRetained !== true || !Array.isArray(probe.sharedCacheFiles) || probe.sharedCacheFiles.length < 3) {
    throw new Error(`Packaged profile lifecycle did not retain shared cache sentinels after delete: ${JSON.stringify(probe)}`);
  }
  if (!Array.isArray(probe.remainingProfileIds)) {
    throw new Error("Packaged profile lifecycle remainingProfileIds must be an array");
  }
  if (probe.remainingProfileIds.includes(probe.createdProfileId) || probe.remainingProfileIds.includes(probe.duplicatedProfileId)) {
    throw new Error(`Packaged profile lifecycle left smoke profiles behind: ${probe.remainingProfileIds.join(", ")}`);
  }
  return {
    createdProfileId: probe.createdProfileId,
    duplicatedProfileId: probe.duplicatedProfileId,
    sharedCacheFileCount: probe.sharedCacheFiles.length,
  };
}

function validatePackagedImportLifecycleProbe(rootPath) {
  const probePath = resolve(rootPath, "config", "packaged-import-lifecycle-smoke.json");
  assertFile(probePath, "packaged import lifecycle smoke probe");
  const probe = readJsonFile(probePath, "packaged-import-lifecycle-smoke.json");
  if (probe?.profileId !== "packaged-smoke-import") {
    throw new Error(`Packaged import lifecycle profileId must be packaged-smoke-import, received ${JSON.stringify(probe?.profileId)}`);
  }
  if (probe.profileName !== "Packaged Smoke Import") {
    throw new Error(`Packaged import lifecycle profileName was not preserved, received ${JSON.stringify(probe.profileName)}`);
  }
  if (typeof probe.sourcePath !== "string" || !probe.sourcePath.includes("packaged-import-smoke-source")) {
    throw new Error(`Packaged import lifecycle sourcePath must use the isolated smoke source, received ${JSON.stringify(probe.sourcePath)}`);
  }
  if (typeof probe.destinationPath !== "string" || !probe.destinationPath.includes("packaged-smoke-import")) {
    throw new Error(`Packaged import lifecycle destinationPath must target the imported profile, received ${JSON.stringify(probe.destinationPath)}`);
  }
  if (probe.existingItemCount < 3) {
    throw new Error(`Packaged import lifecycle must find the smoke saves/options/mods, received ${JSON.stringify(probe.existingItemCount)} item(s)`);
  }
  for (const [label, path] of Object.entries({
    copiedOptions: probe.copiedOptions,
    copiedWorld: probe.copiedWorld,
    copiedMod: probe.copiedMod,
  })) {
    if (typeof path !== "string" || !path.includes("packaged-smoke-import")) {
      throw new Error(`Packaged import lifecycle ${label} path must target the imported profile, received ${JSON.stringify(path)}`);
    }
  }
  if (probe.operation !== "import_profile") {
    throw new Error(`Packaged import lifecycle operation must be import_profile, received ${JSON.stringify(probe.operation)}`);
  }
  if (!Number.isInteger(probe.eventCount) || probe.eventCount < 4) {
    throw new Error(`Packaged import lifecycle must record import progress events, received ${JSON.stringify(probe.eventCount)}`);
  }
  if (probe.deletedProfileId !== probe.profileId) {
    throw new Error("Packaged import lifecycle did not delete the imported profile");
  }
  if (probe.destinationRemoved !== true) {
    throw new Error("Packaged import lifecycle did not remove the imported profile files");
  }
  if (!Array.isArray(probe.remainingProfileIds)) {
    throw new Error("Packaged import lifecycle remainingProfileIds must be an array");
  }
  if (probe.remainingProfileIds.includes(probe.profileId)) {
    throw new Error(`Packaged import lifecycle left the imported profile behind: ${probe.remainingProfileIds.join(", ")}`);
  }
  return { profileId: probe.profileId, itemCount: probe.existingItemCount };
}

function validatePackagedPackwizInstallProbe(rootPath) {
  const probePath = resolve(rootPath, "config", "packaged-packwiz-install-smoke.json");
  assertFile(probePath, "packaged packwiz install smoke probe");
  const probe = readJsonFile(probePath, "packaged-packwiz-install-smoke.json");
  if (probe?.profileId !== "packaged-smoke-packwiz") {
    throw new Error(`Packaged packwiz install profileId must be packaged-smoke-packwiz, received ${JSON.stringify(probe?.profileId)}`);
  }
  if (probe.profileName !== "Packaged Smoke Packwiz" || probe.loader !== "Vanilla" || probe.gameVersion !== "1.21.8") {
    throw new Error(`Packaged packwiz install persisted the wrong profile metadata, received ${JSON.stringify(probe)}`);
  }
  if (probe.installedPackVersion !== "9.8.7") {
    throw new Error(`Packaged packwiz install did not preserve pack.toml version, received ${JSON.stringify(probe.installedPackVersion)}`);
  }
  if (probe.auxiliaryItemCount !== 5) {
    throw new Error(`Packaged packwiz install should plan pack.toml, index, config, and two metafiles; received ${JSON.stringify(probe.auxiliaryItemCount)}`);
  }
  for (const key of ["packTomlDownloaded", "indexDownloaded", "configDownloaded", "metafileResolved", "serverOnlySkipped", "persistedProfileFound"]) {
    if (probe[key] !== true) {
      throw new Error(`Packaged packwiz install expected ${key}=true, received ${JSON.stringify(probe[key])}`);
    }
  }
  if (!Array.isArray(probe.requests) || !probe.requests.includes("/mods/smoke-mod.pw.toml") || !probe.requests.includes("/mods/server-only.pw.toml")) {
    throw new Error(`Packaged packwiz install did not fetch both metafiles, received ${JSON.stringify(probe.requests)}`);
  }
  if (probe.requests.includes("/mods/server-only.jar")) {
    throw new Error(`Packaged packwiz install downloaded a server-only jar, received ${JSON.stringify(probe.requests)}`);
  }
  if (probe.downloadEventCount < 6 || probe.installEventCount < 1) {
    throw new Error(`Packaged packwiz install did not record expected Activity events, received ${JSON.stringify(probe)}`);
  }
  if (probe.deletedProfileId !== probe.profileId || probe.profileDataRemoved !== true) {
    throw new Error(`Packaged packwiz install did not clean temporary profile state, received ${JSON.stringify(probe)}`);
  }
  return {
    profileId: probe.profileId,
    profileName: probe.profileName,
    auxiliaryItemCount: probe.auxiliaryItemCount,
    downloadEventCount: probe.downloadEventCount,
    installEventCount: probe.installEventCount,
  };
}

function validatePackagedUpdateHandoffProbe(rootPath) {
  const probePath = resolve(rootPath, "config", "packaged-update-handoff-smoke.json");
  assertFile(probePath, "packaged update handoff smoke probe");
  const probe = readJsonFile(probePath, "packaged-update-handoff-smoke.json");
  const expectedAccepted = [
    "https://github.com/dilllxd/theboyslauncher/releases/download/v4.0.2/TheBoysLauncher_4.0.2_x64-setup.exe",
    "https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/TheBoysLauncher%20Dev_4.0.2-1_x64-setup.exe",
  ];
  if (!Array.isArray(probe?.acceptedUrls) || probe.acceptedUrls.length !== expectedAccepted.length) {
    throw new Error(`Packaged update handoff acceptedUrls must contain the stable and dev installer URLs, received ${JSON.stringify(probe?.acceptedUrls)}`);
  }
  for (const url of expectedAccepted) {
    if (!probe.acceptedUrls.includes(url)) {
      throw new Error(`Packaged update handoff did not accept expected trusted installer URL ${url}`);
    }
  }
  if (probe.acceptedCount !== expectedAccepted.length) {
    throw new Error(`Packaged update handoff acceptedCount must be ${expectedAccepted.length}, received ${JSON.stringify(probe.acceptedCount)}`);
  }
  if (!Array.isArray(probe.rejectedUrls) || probe.rejectedUrls.length < 5) {
    throw new Error(`Packaged update handoff must reject unsafe URL shapes, received ${JSON.stringify(probe.rejectedUrls)}`);
  }
  for (const label of ["manifest_asset", "msi_asset", "lookalike_owner", "decorated_query", "mismatched_stable_version"]) {
    const result = probe.rejectedUrls.find((entry) => entry?.label === label);
    if (result?.rejected !== true) {
      throw new Error(`Packaged update handoff did not reject ${label}: ${JSON.stringify(result)}`);
    }
  }
  if (probe.rejectedCount !== probe.rejectedUrls.length) {
    throw new Error(`Packaged update handoff rejectedCount must match rejectedUrls length, received ${JSON.stringify(probe.rejectedCount)}`);
  }
  return {
    acceptedCount: probe.acceptedCount,
    rejectedCount: probe.rejectedCount,
  };
}

function validatePackagedLaunchPreflightProbe(rootPath) {
  const probePath = resolve(rootPath, "config", "packaged-launch-preflight-smoke.json");
  assertFile(probePath, "packaged launch preflight smoke probe");
  const probe = readJsonFile(probePath, "packaged-launch-preflight-smoke.json");
  if (probe?.profileId !== "packaged-smoke-launch") {
    throw new Error(`Packaged launch preflight profileId must be packaged-smoke-launch, received ${JSON.stringify(probe?.profileId)}`);
  }
  if (probe.profileName !== "Packaged Smoke Launch") {
    throw new Error(`Packaged launch preflight profileName was not preserved, received ${JSON.stringify(probe.profileName)}`);
  }
  if (probe.memoryMb !== 3584) {
    throw new Error(`Packaged launch preflight memoryMb must reflect the updated profile, received ${JSON.stringify(probe.memoryMb)}`);
  }
  if (typeof probe.executable !== "string" || !probe.executable.includes("packaged-launch-preflight-java")) {
    throw new Error(`Packaged launch preflight executable must use the isolated fake Java executable, received ${JSON.stringify(probe.executable)}`);
  }
  if (typeof probe.workingDir !== "string" || !probe.workingDir.includes("packaged-smoke-launch")) {
    throw new Error(`Packaged launch preflight workingDir must target the smoke profile, received ${JSON.stringify(probe.workingDir)}`);
  }
  if (!Number.isInteger(probe.argCount) || probe.argCount < 12) {
    throw new Error(`Packaged launch preflight command must contain a Minecraft launch argument set, received ${JSON.stringify(probe.argCount)}`);
  }
  if (probe.mainClass !== "com.example.minecraft.Main") {
    throw new Error(`Packaged launch preflight must use cached version metadata main class, received ${JSON.stringify(probe.mainClass)}`);
  }
  if (probe.classpathHasClientJar !== true || probe.classpathHasLibraryJar !== true) {
    throw new Error(`Packaged launch preflight classpath must include the client and library jars, received ${JSON.stringify(probe)}`);
  }
  if (probe.assetIndex !== "17" || typeof probe.assetsDir !== "string" || !probe.assetsDir.includes("cache")) {
    throw new Error(`Packaged launch preflight must include asset index arguments, received ${JSON.stringify({ assetIndex: probe.assetIndex, assetsDir: probe.assetsDir })}`);
  }
  if (probe.nativesConfigured !== true) {
    throw new Error("Packaged launch preflight must include the natives directory JVM argument");
  }
  if (probe.serverAddress !== "play.theboys.example") {
    throw new Error(`Packaged launch preflight must include the profile default server, received ${JSON.stringify(probe.serverAddress)}`);
  }
  if (probe.accessTokenRedacted !== true) {
    throw new Error("Packaged launch preflight command must redact the access token before writing the report");
  }
  if (probe.envProfileId !== probe.profileId) {
    throw new Error(`Packaged launch preflight env profile id must match profile id, received ${JSON.stringify(probe.envProfileId)}`);
  }
  if (!Number.isInteger(probe.authenticatedArgCount) || probe.authenticatedArgCount < 12) {
    throw new Error(`Packaged authenticated launch preflight command must contain a Minecraft launch argument set, received ${JSON.stringify(probe.authenticatedArgCount)}`);
  }
  if (probe.authenticatedUsername !== "SmokePlayer") {
    throw new Error(`Packaged authenticated launch preflight must use the in-memory session username, received ${JSON.stringify(probe.authenticatedUsername)}`);
  }
  if (probe.authenticatedUuid !== "11111111222233334444555555555555") {
    throw new Error(`Packaged authenticated launch preflight must use the compact session UUID, received ${JSON.stringify(probe.authenticatedUuid)}`);
  }
  if (probe.authenticatedServerAddress !== "auth.theboys.example" || probe.authenticatedServerPort !== "25566") {
    throw new Error(`Packaged authenticated launch preflight must include the explicit server target, received ${JSON.stringify({ server: probe.authenticatedServerAddress, port: probe.authenticatedServerPort })}`);
  }
  if (probe.authenticatedAccessTokenRedacted !== true) {
    throw new Error("Packaged authenticated launch preflight command must redact the access token before writing the report");
  }
  if (probe.authStateFilesPresent !== false) {
    throw new Error("Packaged authenticated launch preflight must not persist Minecraft session/account state");
  }
  if (probe.deletedProfileId !== probe.profileId) {
    throw new Error("Packaged launch preflight did not delete the smoke profile");
  }
  if (probe.profileDataRemoved !== true) {
    throw new Error("Packaged launch preflight did not remove the smoke profile files");
  }
  if (!Array.isArray(probe.remainingProfileIds) || probe.remainingProfileIds.includes(probe.profileId)) {
    throw new Error(`Packaged launch preflight left the smoke profile behind: ${JSON.stringify(probe.remainingProfileIds)}`);
  }
  return {
    profileId: probe.profileId,
    argCount: probe.argCount,
    authenticatedArgCount: probe.authenticatedArgCount,
    assetIndex: probe.assetIndex,
  };
}

function validatePackagedProcessLifecycleProbe(rootPath) {
  const probePath = resolve(rootPath, "config", "packaged-process-lifecycle-smoke.json");
  assertFile(probePath, "packaged process lifecycle smoke probe");
  const probe = readJsonFile(probePath, "packaged-process-lifecycle-smoke.json");
  if (probe?.profileId !== "packaged-smoke-process") {
    throw new Error(`Packaged process lifecycle profileId must be packaged-smoke-process, received ${JSON.stringify(probe?.profileId)}`);
  }
  for (const [key, expected] of Object.entries({
    startedState: "running",
    stoppedState: "exited",
    relaunchState: "running",
    secondStoppedState: "exited",
  })) {
    if (probe[key] !== expected) {
      throw new Error(`Packaged process lifecycle ${key} must be ${expected}, received ${JSON.stringify(probe[key])}`);
    }
  }
  if (probe.reusedExistingProcess !== true) {
    throw new Error("Packaged process lifecycle did not detect the active process for reuse");
  }
  if (probe.relaunchCreatedNewProcess !== true) {
    throw new Error("Packaged process lifecycle relaunch did not create a fresh managed process");
  }
  if (probe.lastPlayedMarked !== true) {
    throw new Error("Packaged process lifecycle did not mark the profile launched after startup");
  }
  if (probe.deletedProfileId !== probe.profileId || probe.profileDataRemoved !== true) {
    throw new Error(`Packaged process lifecycle did not delete profile state: ${JSON.stringify(probe)}`);
  }
  if (probe.remainingProfileProcesses !== 0) {
    throw new Error(`Packaged process lifecycle left managed processes behind, received ${JSON.stringify(probe.remainingProfileProcesses)}`);
  }
  if (!Number.isInteger(probe.launchEventCount) || probe.launchEventCount < 2) {
    throw new Error(`Packaged process lifecycle must record launch events for both starts, received ${JSON.stringify(probe.launchEventCount)}`);
  }
  if (typeof probe.fakeJava !== "string" || !probe.fakeJava.includes("packaged-process-lifecycle-java")) {
    throw new Error(`Packaged process lifecycle must use the isolated fake Java shim, received ${JSON.stringify(probe.fakeJava)}`);
  }
  return {
    profileId: probe.profileId,
    launchEventCount: probe.launchEventCount,
  };
}

function validateBootstrapJson(rootPath) {
  const profiles = readJsonFile(resolve(rootPath, "config", "profiles.json"), "profiles.json");
  const settings = readJsonFile(resolve(rootPath, "config", "settings.json"), "settings.json");
  if (!Array.isArray(profiles)) {
    throw new Error("profiles.json must contain an array");
  }
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    throw new Error("settings.json must contain an object");
  }
  if (profiles.length !== 1) {
    throw new Error(`profiles.json must contain exactly one first-run profile, found ${profiles.length}`);
  }
  const [profile] = profiles;
  assertExactJsonKeys(profile, "First-run profile", [
    "id",
    "name",
    "loader",
    "gameVersion",
    "lastPlayed",
    "memoryMb",
    "jvmArgs",
    "resolution",
    "defaultServer",
  ]);
  const expectedProfile = {
    id: "latest-release",
    name: "Latest Release",
    loader: "vanilla",
    gameVersion: "1.21.8",
    memoryMb: 4096,
  };
  for (const [key, expected] of Object.entries(expectedProfile)) {
    if (profile?.[key] !== expected) {
      throw new Error(`First-run profile ${key} must be ${JSON.stringify(expected)}, received ${JSON.stringify(profile?.[key])}`);
    }
  }
  if (!Array.isArray(profile.jvmArgs) || profile.jvmArgs.length !== 0) {
    throw new Error("First-run profile must not add custom JVM arguments");
  }
  for (const key of ["lastPlayed", "resolution", "defaultServer", "javaRuntimeOverridePath"]) {
    if (profile?.[key] !== null && profile?.[key] !== undefined) {
      throw new Error(`First-run profile ${key} must be empty, received ${JSON.stringify(profile?.[key])}`);
    }
  }
  const expectedSettings = {
    maxMemoryMb: 6144,
    minMemoryMb: 2048,
    offlineUsername: "Player",
    telemetryEnabled: false,
  };
  assertExactJsonKeys(settings, "settings.json", Object.keys(expectedSettings));
  for (const [key, expected] of Object.entries(expectedSettings)) {
    if (settings[key] !== expected) {
      throw new Error(`settings.json ${key} must be ${JSON.stringify(expected)}, received ${JSON.stringify(settings[key])}`);
    }
  }
  if (settings.javaRuntimeOverridePath !== null && settings.javaRuntimeOverridePath !== undefined) {
    throw new Error(`settings.json javaRuntimeOverridePath must be empty, received ${JSON.stringify(settings.javaRuntimeOverridePath)}`);
  }
  return { profiles: profiles.length, settingsKeys: Object.keys(settings).length };
}

function assertExactJsonKeys(value, label, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must contain an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} keys must be exactly ${expected.join(", ")}, received ${actual.join(", ")}`);
  }
}

function parentStateLeakPaths() {
  return launcherStateDirNames
    .map((name) => resolve(allowedSmokeRoot, name))
    .filter((path) => existsSync(path));
}

function cleanParentStateLeaks() {
  for (const path of parentStateLeakPaths()) {
    rmSync(path, { recursive: true, force: true });
  }
}

function validateNoParentStateLeaks() {
  const leaked = parentStateLeakPaths();
  if (leaked.length > 0) {
    throw new Error(`Packaged exe wrote launcher state outside isolated smoke root: ${leaked.join(", ")}`);
  }
}

function validateDidNotCreateLocalBackendState(rootPath, label) {
  const forbidden = [
    "data/social-backend-state.json",
    "data/social-backend-session-secret",
    "config/social-backend-state.json",
    "config/social-backend-session-secret",
  ];
  const created = forbidden.filter((relativePath) => existsSync(resolve(rootPath, relativePath)));
  if (created.length > 0) {
    throw new Error(`${label} smoke created local friends-service state unexpectedly: ${created.join(", ")}`);
  }
}

function validateLocalModeCreatedBackendState(rootPath) {
  const required = [
    "data/social-backend-state.json",
  ];
  const missing = required.filter((relativePath) => !existsSync(resolve(rootPath, relativePath)));
  if (missing.length > 0) {
    throw new Error(`Local packaged smoke did not create expected friends-service state: ${missing.join(", ")}`);
  }
  const snapshot = readJsonFile(resolve(rootPath, "data", "social-backend-state.json"), "social-backend-state.json");
  const presence = Array.isArray(snapshot?.presence) ? snapshot.presence : [];
  if (!presence.some((entry) => entry?.accountId === localBackendSmokeAccountId && entry?.state === "online")) {
    throw new Error("Local packaged smoke did not persist the expected friends-service presence probe");
  }
}

function localBackendBindAddr(backend) {
  return backend === "off" ? "127.0.0.1:4076" : "127.0.0.1:4075";
}

function localBackendHealthUrl(backend) {
  return `http://${localBackendBindAddr(backend)}/health`;
}

function localBackendOrigin(backend) {
  return `http://${localBackendBindAddr(backend)}`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${body}`);
  }
  try {
    return body ? JSON.parse(body) : null;
  } catch (error) {
    throw new Error(`${url} returned invalid JSON: ${error.message}`);
  }
}

async function healthCheckLocalBackend(backend) {
  try {
    const health = await fetchJson(localBackendHealthUrl(backend));
    return health?.ok === true && health?.service === "social-backend";
  } catch {
    return false;
  }
}

async function exerciseLocalBackendPersistence(rootPath, backend) {
  const origin = localBackendOrigin(backend);
  const session = await fetchJson(`${origin}/dev/sessions`, {
    method: "POST",
    body: JSON.stringify({ accountId: localBackendSmokeAccountId }),
  });
  if (session?.sessionKind !== "dev" || typeof session?.authorizationHeader !== "string") {
    throw new Error("Local packaged smoke did not receive a usable friends-service dev session");
  }
  await fetchJson(`${origin}/presence/${localBackendSmokeAccountId}`, {
    method: "POST",
    headers: { authorization: session.authorizationHeader },
    body: JSON.stringify({ state: "online" }),
  });
  validateLocalModeCreatedBackendState(rootPath);
}

async function waitForLocalBackendStartup(backend, child, processSnapshotBefore, waitMs) {
  const deadline = Date.now() + waitMs;
  let latestNewBackends = [];
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Packaged exe exited during local backend smoke with code ${child.exitCode}`);
    }
    const processSnapshot = windowsProcessSnapshot(["theboyslauncher.exe", "social-backend.exe"]);
    latestNewBackends = newProcesses(processSnapshotBefore, processSnapshot, "social-backend.exe");
    if (latestNewBackends.length > 0 && (await healthCheckLocalBackend(backend))) {
      return latestNewBackends;
    }
    await wait(250);
  }
  if (latestNewBackends.length === 0) {
    throw new Error("Local packaged smoke did not start a packaged social-backend.exe process");
  }
  throw new Error(`Local packaged smoke started social-backend.exe but ${localBackendHealthUrl(backend)} did not become healthy`);
}

function localBackendSmokeEnv(rootPath, backend) {
  return {
    THEBOYS_SOCIAL_BACKEND_URL: backend,
    THEBOYS_BACKEND_BIND: localBackendBindAddr(backend),
    THEBOYS_BACKEND_STATE_PATH: resolve(rootPath, "data", "social-backend-state.json"),
    THEBOYS_BACKEND_SESSION_SECRET: localBackendSmokeSecret,
  };
}

function validateFirstRunDidNotCreateMinecraftAuthState(rootPath) {
  const forbidden = [
    "config/minecraft-session.json",
    "config/minecraft-accounts.json",
  ];
  const created = forbidden.filter((relativePath) => existsSync(resolve(rootPath, relativePath)));
  if (created.length > 0) {
    throw new Error(`Packaged first-run smoke created Minecraft account state unexpectedly: ${created.join(", ")}`);
  }
}

function listFilesRecursive(rootPath) {
  if (!existsSync(rootPath)) return [];
  const entries = [];
  for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
    const fullPath = resolve(rootPath, entry.name);
    if (entry.isDirectory()) {
      entries.push(...listFilesRecursive(fullPath));
    } else if (entry.isFile()) {
      entries.push(fullPath);
    }
  }
  return entries;
}

function severeLauncherLogFailures(rootPath) {
  const logDir = resolve(rootPath, "logs");
  const logFiles = listFilesRecursive(logDir).filter((path) => statSync(path).size > 0);
  const severePatterns = [
    /\bthread '[^']+' panicked at\b/i,
    /\bpanicked at\b/i,
    /\bunhandled(?:promise)?rejection\b/i,
    /\b(?:fatal|critical|error)\b/i,
  ];
  const failures = [];
  for (const path of logFiles) {
    const contents = readFileSync(path, "utf8");
    const lines = contents.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      if (severePatterns.some((pattern) => pattern.test(line))) {
        failures.push(`${path}:${index + 1}: ${line.trim()}`);
      }
    }
  }
  return { failures, logFileCount: logFiles.length };
}

function validateNoSevereStartupLogs(rootPath) {
  const { failures, logFileCount } = severeLauncherLogFailures(rootPath);
  if (failures.length > 0) {
    throw new Error(`Packaged startup wrote severe log output:\n${failures.join("\n")}`);
  }
  return logFileCount;
}

function validateNoSevereFullRunLogs(rootPath) {
  const { failures, logFileCount } = severeLauncherLogFailures(rootPath);
  if (failures.length > 0) {
    throw new Error(`Packaged full run wrote severe log output:\n${failures.join("\n")}`);
  }
  return logFileCount;
}

function captureProcessOutput(child) {
  const limit = 64 * 1024;
  const captured = {
    stdout: "",
    stderr: "",
    truncated: false,
  };
  const append = (streamName, chunk) => {
    if (captured[streamName].length >= limit) {
      captured.truncated = true;
      return;
    }
    const text = String(chunk);
    const available = limit - captured[streamName].length;
    captured[streamName] += text.slice(0, available);
    if (text.length > available) {
      captured.truncated = true;
    }
  };
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => append("stdout", chunk));
  child.stderr?.on("data", (chunk) => append("stderr", chunk));
  return captured;
}

function capturedProcessOutputLines(capturedOutput) {
  return ["stdout", "stderr"].flatMap((streamName) =>
    capturedOutput[streamName]
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({ streamName, line })),
  );
}

function validateNoSevereProcessOutput(capturedOutput) {
  if (capturedOutput.truncated) {
    throw new Error("Packaged startup wrote more than 64 KB to stdout/stderr; GUI release builds should not emit noisy console output.");
  }
  const severePatterns = [
    /\bthread '[^']+' panicked at\b/i,
    /\bpanicked at\b/i,
    /\bunhandled(?:promise)?rejection\b/i,
    /\b(?:fatal|critical|error)\b/i,
  ];
  const outputLines = capturedProcessOutputLines(capturedOutput);
  const failures = outputLines
    .filter(({ line }) => severePatterns.some((pattern) => pattern.test(line)))
    .map(({ streamName, line }) => `${streamName}: ${line}`);
  if (failures.length > 0) {
    throw new Error(`Packaged startup wrote severe process output:\n${failures.join("\n")}`);
  }
  return outputLines.length;
}

function windowsProcessSnapshot(names) {
  if (process.platform !== "win32") {
    return [];
  }
  const quotedNames = names.map((name) => `'${name.replaceAll("'", "''")}'`).join(",");
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$names = @(${quotedNames})`,
    "Get-CimInstance Win32_Process | Where-Object { $names -contains $_.Name } | Select-Object Name,ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress",
  ].join("; ");
  const result = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`Failed to inspect Windows processes: ${result.stderr || result.stdout}`);
  }
  const output = result.stdout.trim();
  if (!output) return [];
  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function processIdSet(processes) {
  return new Set(processes.map((processInfo) => Number(processInfo.ProcessId)).filter(Number.isFinite));
}

function processId(processInfo) {
  const id = Number(processInfo?.ProcessId);
  return Number.isFinite(id) ? id : null;
}

function parentProcessId(processInfo) {
  const id = Number(processInfo?.ParentProcessId);
  return Number.isFinite(id) ? id : null;
}

function newProcesses(before, after, name) {
  const beforeIds = processIdSet(before.filter((processInfo) => processInfo.Name === name));
  return after.filter((processInfo) => processInfo.Name === name && !beforeIds.has(Number(processInfo.ProcessId)));
}

function normalizedCommandFragment(value) {
  return String(value ?? "").replaceAll("\\", "/").toLowerCase();
}

function processCommandReferencesPath(processInfo, path) {
  const commandLine = normalizedCommandFragment(processInfo.CommandLine);
  if (!commandLine) return false;
  return commandLine.includes(normalizedCommandFragment(resolve(path)));
}

function processDescendsFromPid(processInfo, processes, ancestorPid) {
  const expectedAncestor = Number(ancestorPid);
  if (!Number.isFinite(expectedAncestor)) return false;
  const byId = new Map(processes.map((process) => [processId(process), process]).filter(([id]) => id !== null));
  const visited = new Set();
  let current = processInfo;
  while (current) {
    const parentId = parentProcessId(current);
    if (parentId === expectedAncestor) {
      return true;
    }
    if (parentId === null || visited.has(parentId)) {
      return false;
    }
    visited.add(parentId);
    current = byId.get(parentId);
  }
  return false;
}

function isSmokeOwnedGameProcess(processInfo, processes, rootPath, launcherPid) {
  return processCommandReferencesPath(processInfo, rootPath) || processDescendsFromPid(processInfo, processes, launcherPid);
}

function describeProcesses(processes) {
  return processes
    .map((processInfo) => `${processInfo.Name}#${processInfo.ProcessId}${processInfo.CommandLine ? ` ${processInfo.CommandLine}` : ""}`)
    .join("; ");
}

function windowTitleForProcess(pid) {
  if (process.platform !== "win32") {
    return "";
  }
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$process = Get-Process -Id ${pid}`,
    "if ($process) { $process.MainWindowTitle }",
  ].join("; ");
  const result = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`Failed to inspect packaged exe window title: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

async function waitForWindowTitle(child, expectedTitle, waitMs) {
  const deadline = Date.now() + waitMs;
  let latestTitle = "";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Packaged exe exited during window smoke with code ${child.exitCode}`);
    }
    latestTitle = windowTitleForProcess(child.pid);
    if (latestTitle === expectedTitle) {
      return latestTitle;
    }
    await wait(250);
  }
  throw new Error(`Packaged exe window title did not become ${JSON.stringify(expectedTitle)}; latest title was ${JSON.stringify(latestTitle)}`);
}

async function waitForBootstrapFiles(rootPath, child, waitMs) {
  const requiredPaths = [
    "data",
    "config",
    "cache",
    "logs",
    "config/profiles.json",
    "config/settings.json",
    "config/packaged-auth-flow-smoke.json",
    "config/packaged-account-lifecycle-smoke.json",
    "config/packaged-auth-recovery-smoke.json",
    "config/packaged-stored-auth-launch-smoke.json",
    "config/packaged-modrinth-archive-install-smoke.json",
    "config/packaged-curseforge-archive-install-smoke.json",
    "config/packaged-ftb-legacy-archive-install-smoke.json",
    "config/packaged-ftb-install-smoke.json",
    "config/packaged-technic-archive-install-smoke.json",
    "config/packaged-atlauncher-install-smoke.json",
    "config/packaged-activity-progress-smoke.json",
    "config/packaged-java-recovery-smoke.json",
    "config/packaged-discover-routing-smoke.json",
    "config/packaged-profile-lifecycle-smoke.json",
    "config/packaged-import-lifecycle-smoke.json",
    "config/packaged-packwiz-install-smoke.json",
    "config/packaged-update-handoff-smoke.json",
    "config/packaged-launch-preflight-smoke.json",
    "config/packaged-process-lifecycle-smoke.json",
  ];
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Packaged exe exited during smoke with code ${child.exitCode}`);
    }
    const missing = requiredPaths.filter((relativePath) => !existsSync(resolve(rootPath, relativePath)));
    if (missing.length === 0) {
      return requiredPaths;
    }
    await wait(250);
  }
  const missing = requiredPaths.filter((relativePath) => !existsSync(resolve(rootPath, relativePath)));
  throw new Error(`Packaged exe did not create expected launcher state: ${missing.join(", ")}`);
}

async function closeProcess(pid) {
  closeProcessSync(pid);
}

async function waitForExit(child, waitMs) {
  if (child.theboysSmokeClosed) return;
  await Promise.race([
    new Promise((resolveClose) => child.once("close", resolveClose)),
    wait(waitMs),
  ]);
  if (child.theboysSmokeClosed) return;
  if (child.exitCode === null) {
    child.kill();
  }
  await Promise.race([
    new Promise((resolveClose) => child.once("close", resolveClose)),
    wait(2000),
  ]);
  if (!child.theboysSmokeClosed) {
    throw new Error("Packaged exe did not close cleanly; stdout/stderr may still be pending");
  }
}

function smokeEnvironment(rootPath, backend) {
  const env = {
    ...process.env,
    THEBOYS_LAUNCHER_ROOT_DIR: rootPath,
    THEBOYS_PACKAGED_SMOKE_AUTH_FLOW: "1",
    THEBOYS_PACKAGED_SMOKE_ACCOUNT_LIFECYCLE: "1",
    THEBOYS_PACKAGED_SMOKE_AUTH_RECOVERY: "1",
    THEBOYS_PACKAGED_SMOKE_STORED_AUTH_LAUNCH: "1",
    THEBOYS_PACKAGED_SMOKE_MODRINTH_ARCHIVE_INSTALL: "1",
    THEBOYS_PACKAGED_SMOKE_CURSEFORGE_ARCHIVE_INSTALL: "1",
    THEBOYS_PACKAGED_SMOKE_FTB_LEGACY_ARCHIVE_INSTALL: "1",
    THEBOYS_PACKAGED_SMOKE_FTB_INSTALL: "1",
    THEBOYS_PACKAGED_SMOKE_TECHNIC_ARCHIVE_INSTALL: "1",
    THEBOYS_PACKAGED_SMOKE_ATLAUNCHER_INSTALL: "1",
    THEBOYS_PACKAGED_SMOKE_ACTIVITY_PROGRESS: "1",
    THEBOYS_PACKAGED_SMOKE_JAVA_RECOVERY: "1",
    THEBOYS_PACKAGED_SMOKE_DISCOVER_ROUTING: "1",
    THEBOYS_PACKAGED_SMOKE_PROFILE_LIFECYCLE: "1",
    THEBOYS_PACKAGED_SMOKE_IMPORT_LIFECYCLE: "1",
    THEBOYS_PACKAGED_SMOKE_PACKWIZ_INSTALL: "1",
    THEBOYS_PACKAGED_SMOKE_UPDATE_HANDOFF: "1",
    THEBOYS_PACKAGED_SMOKE_LAUNCH_PREFLIGHT: "1",
    THEBOYS_PACKAGED_SMOKE_PROCESS_LIFECYCLE: "1",
  };
  for (const key of inheritedLauncherEnvOverrides) {
    delete env[key];
  }
  if (backend === "hosted-default") {
    delete env.THEBOYS_SOCIAL_BACKEND_URL;
  } else if (backend === "local") {
    Object.assign(env, localBackendSmokeEnv(rootPath, backend));
  } else {
    env.THEBOYS_SOCIAL_BACKEND_URL = "off";
  }
  return env;
}

const options = parseArgs(process.argv.slice(2));
if (process.platform !== "win32") {
  throw new Error("Packaged Windows exe smoke must run on Windows");
}

assertSmokeRootIsSafe(options.rootPath);
acquireSmokeRunLock(options);
assertFile(options.exePath, "packaged Tauri release executable");
const frontendFreshness = validateDefaultFrontendBuildFreshness(options.exePath);
const backendResources = validatePackagedBackendResources(options.exePath);
const subsystem = readPeSubsystem(options.exePath);
if (subsystem !== 2) {
  throw new Error(`Expected ${basename(options.exePath)} to use Windows GUI subsystem 2; received ${subsystem}`);
}
const exeMetadata = validateWindowsExeMetadata(options.exePath);
const processSnapshotBefore = windowsProcessSnapshot(monitoredPackagedProcessNames);
if (options.backend === "local" && processSnapshotBefore.some((processInfo) => processInfo.Name === "social-backend.exe")) {
  throw new Error("Local packaged smoke requires no pre-existing social-backend.exe process so it can prove the packaged service starts and stops");
}

cleanParentStateLeaks();
rmSync(options.rootPath, { recursive: true, force: true });
mkdirSync(options.rootPath, { recursive: true });

const child = spawn(options.exePath, [], {
  env: smokeEnvironment(options.rootPath, options.backend),
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
const processOutput = captureProcessOutput(child);
activePackagedProcessPid = child.pid;
child.theboysSmokeClosed = false;
child.once("close", () => {
  child.theboysSmokeClosed = true;
});
child.once("exit", () => {
  if (activePackagedProcessPid === child.pid) {
    activePackagedProcessPid = null;
  }
});

try {
  const windowTitle = await waitForWindowTitle(child, options.title, options.waitMs);
  const created = await waitForBootstrapFiles(options.rootPath, child, options.waitMs);
  validateNoParentStateLeaks();
  const bootstrapJson = validateBootstrapJson(options.rootPath);
  const authFlowProbe = validatePackagedAuthFlowProbe(options.rootPath);
  const accountLifecycleProbe = validatePackagedAccountLifecycleProbe(options.rootPath);
  const authRecoveryProbe = validatePackagedAuthRecoveryProbe(options.rootPath);
  const storedAuthLaunchProbe = validatePackagedStoredAuthLaunchProbe(options.rootPath);
  const modrinthArchiveInstallProbe = validatePackagedModrinthArchiveInstallProbe(options.rootPath);
  const curseForgeArchiveInstallProbe = validatePackagedCurseForgeArchiveInstallProbe(options.rootPath);
  const ftbLegacyArchiveInstallProbe = validatePackagedFtbLegacyArchiveInstallProbe(options.rootPath);
  const ftbInstallProbe = validatePackagedFtbInstallProbe(options.rootPath);
  const technicArchiveInstallProbe = validatePackagedTechnicArchiveInstallProbe(options.rootPath);
  const atlauncherInstallProbe = validatePackagedAtlauncherInstallProbe(options.rootPath);
  const activityProgressProbe = validatePackagedActivityProgressProbe(options.rootPath);
  const javaRecoveryProbe = validatePackagedJavaRecoveryProbe(options.rootPath);
  const discoverRoutingProbe = validatePackagedDiscoverRoutingProbe(options.rootPath);
  const profileLifecycleProbe = validatePackagedProfileLifecycleProbe(options.rootPath);
  const importLifecycleProbe = validatePackagedImportLifecycleProbe(options.rootPath);
  const packwizInstallProbe = validatePackagedPackwizInstallProbe(options.rootPath);
  const updateHandoffProbe = validatePackagedUpdateHandoffProbe(options.rootPath);
  const launchPreflightProbe = validatePackagedLaunchPreflightProbe(options.rootPath);
  const processLifecycleProbe = validatePackagedProcessLifecycleProbe(options.rootPath);
  validateFirstRunDidNotCreateMinecraftAuthState(options.rootPath);
  const startupLogFiles = validateNoSevereStartupLogs(options.rootPath);
  const processSnapshotAfterBootstrap = windowsProcessSnapshot(monitoredPackagedProcessNames);
  let newSocialBackends = newProcesses(processSnapshotBefore, processSnapshotAfterBootstrap, "social-backend.exe");
  if (options.backend === "hosted-default" && newSocialBackends.length > 0) {
    throw new Error(
      `Hosted-default packaged smoke unexpectedly started local social-backend process(es): ${newSocialBackends
        .map((processInfo) => processInfo.ProcessId)
        .join(", ")}`,
    );
  }
  if (options.backend === "hosted-default") {
    validateDidNotCreateLocalBackendState(options.rootPath, "Hosted-default");
  } else if (options.backend === "local") {
    newSocialBackends = await waitForLocalBackendStartup(options.backend, child, processSnapshotBefore, options.waitMs);
    await exerciseLocalBackendPersistence(options.rootPath, options.backend);
  } else {
    if (newSocialBackends.length > 0) {
      throw new Error(
        `Off-mode packaged smoke unexpectedly started local social-backend process(es): ${newSocialBackends
          .map((processInfo) => processInfo.ProcessId)
          .join(", ")}`,
      );
    }
    validateDidNotCreateLocalBackendState(options.rootPath, "Off-mode");
  }
  if (child.exitCode !== null) {
    throw new Error(`Packaged exe exited during smoke with code ${child.exitCode}`);
  }
  const startupProcessOutputLines = validateNoSevereProcessOutput(processOutput);
  console.log(`Packaged exe smoke passed for ${options.exePath}`);
  console.log(`- PE subsystem: Windows GUI (${subsystem})`);
  console.log(`- Exe metadata: ${exeMetadata.productName} ${exeMetadata.productVersion}`);
  console.log(`- Window title: ${windowTitle}`);
  console.log(`- Frontend dist freshness: ${frontendFreshness.checked ? "current" : "not required"}`);
  console.log(`- Backend mode: ${options.backend}`);
  console.log(`- Friends-service resource: ${backendResources.resourceDir} (${backendResources.size} bytes, sha256 ${backendResources.sha256})`);
  console.log(`- Friends-service adjacent release build matched: ${backendResources.matchedAdjacentBuild ? "yes" : "not required"}`);
  console.log(`- Friends-service release build freshness: ${backendResources.adjacentBuildFreshnessChecked ? "current" : "not required"}`);
  console.log(`- Isolated root: ${options.rootPath}`);
  console.log("- Parent smoke root state leak: no");
  console.log(`- Created: ${created.join(", ")}`);
  console.log(`- profiles.json entries: ${bootstrapJson.profiles}`);
  console.log(`- settings.json keys: ${bootstrapJson.settingsKeys}`);
  console.log(`- Microsoft auth flow: ${authFlowProbe.clientId} -> ${authFlowProbe.redirectUri}`);
  console.log(`- Account lifecycle: saved/switched/removed ${accountLifecycleProbe.saved} smoke accounts; stored secrets protected: ${accountLifecycleProbe.secretsProtected ? "yes" : "no"}`);
  console.log(`- Auth recovery: ${authRecoveryProbe.expiredAccountId} rejected locally; state cleaned: ${authRecoveryProbe.stateRemoved ? "yes" : "no"}`);
  console.log(`- Stored auth launch: ${storedAuthLaunchProbe.profileId} used ${storedAuthLaunchProbe.storedUsername}, started/stopped (${storedAuthLaunchProbe.argCount} args, ${storedAuthLaunchProbe.launchEventCount} launch events)`);
  console.log(`- Modrinth archive install: ${modrinthArchiveInstallProbe.profileName} installed/deleted (${modrinthArchiveInstallProbe.installEventCount} events)`);
  console.log(`- CurseForge archive install: ${curseForgeArchiveInstallProbe.profileName} installed/deleted (${curseForgeArchiveInstallProbe.installEventCount} events)`);
  console.log(`- FTB Legacy archive install: ${ftbLegacyArchiveInstallProbe.profileName} installed/deleted (${ftbLegacyArchiveInstallProbe.loaderVersion}, ${ftbLegacyArchiveInstallProbe.installEventCount} events)`);
  console.log(`- FTB install: ${ftbInstallProbe.profileName} planned ${ftbInstallProbe.fileDownloadCount} files, installed/deleted (${ftbInstallProbe.loaderVersion}, ${ftbInstallProbe.installEventCount} events)`);
  console.log(`- Technic archive install: ${technicArchiveInstallProbe.profileName} installed/deleted (${technicArchiveInstallProbe.loaderVersion}, ${technicArchiveInstallProbe.installEventCount} events)`);
  console.log(`- ATLauncher install: ${atlauncherInstallProbe.profileName} planned ${atlauncherInstallProbe.fileDownloadCount} files, installed/deleted (${atlauncherInstallProbe.loaderVersion}, ${atlauncherInstallProbe.installEventCount} events)`);
  console.log(`- Activity progress: ${activityProgressProbe.eventCount} categorized file events for ${activityProgressProbe.downloadedFileCount} downloads`);
  console.log(`- Java recovery: ${javaRecoveryProbe.selectionCount} Minecraft versions mapped; 1.21.8 -> ${javaRecoveryProbe.latestRuntimeId}, 26.2 -> ${javaRecoveryProbe.futureRuntimeId}`);
  console.log(`- Discover routing: ${discoverRoutingProbe.providerCount} provider link formats resolved; FTB Private code -> ${discoverRoutingProbe.privateProjectId}`);
  console.log(`- Profile lifecycle: created/deleted ${profileLifecycleProbe.createdProfileId}, duplicated/deleted ${profileLifecycleProbe.duplicatedProfileId}; shared cache retained (${profileLifecycleProbe.sharedCacheFileCount} files)`);
  console.log(`- Import lifecycle: imported/deleted ${importLifecycleProbe.profileId} (${importLifecycleProbe.itemCount} item groups)`);
  console.log(`- Packwiz install: ${packwizInstallProbe.profileName} planned ${packwizInstallProbe.auxiliaryItemCount} files, installed/deleted (${packwizInstallProbe.downloadEventCount} download events)`);
  console.log(`- Update handoff: ${updateHandoffProbe.acceptedCount} trusted installer URLs accepted, ${updateHandoffProbe.rejectedCount} unsafe URLs rejected`);
  console.log(`- Launch preflight: ${launchPreflightProbe.profileId} offline/auth commands built (${launchPreflightProbe.argCount}/${launchPreflightProbe.authenticatedArgCount} args, asset index ${launchPreflightProbe.assetIndex})`);
  console.log(`- Process lifecycle: ${processLifecycleProbe.profileId} started/stopped/relaunched (${processLifecycleProbe.launchEventCount} launch events)`);
  console.log("- Minecraft account state created: no");
  console.log(`- Severe startup logs: none (${startupLogFiles} log file${startupLogFiles === 1 ? "" : "s"} checked)`);
  console.log(`- Severe process output: none (${startupProcessOutputLines} stdout/stderr line${startupProcessOutputLines === 1 ? "" : "s"} checked)`);
  if (options.backend === "hosted-default") {
    console.log("- Local social-backend started: no");
    console.log("- Local friends-service state created: no");
  } else if (options.backend === "local") {
    console.log("- Local social-backend started: yes");
    console.log("- Local friends-service state created: yes");
  } else {
    console.log("- Local social-backend started: no");
    console.log("- Local friends-service state created: no");
  }
} finally {
  await closeProcess(child.pid);
  await waitForExit(child, 5000);
  if (activePackagedProcessPid === child.pid) {
    activePackagedProcessPid = null;
  }
}

const fullRunLogFiles = validateNoSevereFullRunLogs(options.rootPath);
const fullRunProcessOutputLines = validateNoSevereProcessOutput(processOutput);
const processSnapshotAfterClose = windowsProcessSnapshot(monitoredPackagedProcessNames);
const leakedLaunchers = newProcesses(processSnapshotBefore, processSnapshotAfterClose, "theboyslauncher.exe");
if (leakedLaunchers.length > 0) {
  throw new Error(`Packaged exe smoke left launcher process(es) running after close: ${describeProcesses(leakedLaunchers)}`);
}
const leakedGameProcesses = launcherGameProcessNames
  .flatMap((name) => newProcesses(processSnapshotBefore, processSnapshotAfterClose, name))
  .filter((processInfo) => isSmokeOwnedGameProcess(processInfo, processSnapshotAfterClose, options.rootPath, child.pid));
if (leakedGameProcesses.length > 0) {
  throw new Error(`Packaged exe smoke left game process(es) running after close: ${describeProcesses(leakedGameProcesses)}`);
}
if (options.backend !== "local") {
  const leakedSocialBackends = newProcesses(processSnapshotBefore, processSnapshotAfterClose, "social-backend.exe");
  if (leakedSocialBackends.length > 0) {
    throw new Error(`${options.backend} packaged smoke left local social-backend process(es) running after close: ${describeProcesses(leakedSocialBackends)}`);
  }
  console.log("- Process cleanup: no new launcher, local friends-service, or game processes");
} else {
  const leakedSocialBackends = newProcesses(processSnapshotBefore, processSnapshotAfterClose, "social-backend.exe");
  if (leakedSocialBackends.length > 0) {
    throw new Error(`Local packaged smoke left social-backend process(es) running after close: ${describeProcesses(leakedSocialBackends)}`);
  }
  console.log("- Process cleanup: no new launcher, local friends-service, or game processes");
}
console.log(`- Full-run process output: clean (${fullRunProcessOutputLines} stdout/stderr line${fullRunProcessOutputLines === 1 ? "" : "s"} checked after close)`);
console.log(`- Full-run launcher logs: clean (${fullRunLogFiles} log file${fullRunLogFiles === 1 ? "" : "s"} checked after close)`);
