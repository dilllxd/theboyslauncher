import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = process.env.THEBOYS_PREFLIGHT_REPO_ROOT
  ? resolve(process.env.THEBOYS_PREFLIGHT_REPO_ROOT)
  : join(fileURLToPath(new URL(".", import.meta.url)), "..");
const releaseTag = process.argv[2] ?? "v4.0.0";
const releaseBranch = process.env.THEBOYS_RELEASE_BRANCH ?? "main";
const mainBackupBranch =
  process.env.THEBOYS_MAIN_BACKUP_BRANCH ?? "backup/main-v3-2026-06-29";
const skipGithubChecks = process.env.THEBOYS_PREFLIGHT_SKIP_GITHUB === "1";
const requiredSecrets = [
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
];
const requiredFiles = [
  ".github/workflows/v4-foundation.yml",
  ".github/workflows/social-backend-image.yml",
  "src-tauri/tauri.conf.json",
  "scripts/preflight-v4-release.mjs",
  "scripts/stage-social-backend.mjs",
  "scripts/verify-package-resources.mjs",
  "scripts/clean-tauri-updater-artifacts.mjs",
  "scripts/configure-tauri-release-channel.mjs",
  "scripts/generate-tauri-updater-manifest.mjs",
  "scripts/resolve-v4-release-version.mjs",
  "scripts/verify-tauri-bundles.mjs",
  "scripts/smoke-packaged-exe.mjs",
  ".github/workflows/v4-release-channels.yml",
  "scripts/manage-hosted-social-backend.mjs",
  "scripts/test-release-channel-scripts.mjs",
];

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
}

function check(name, condition, detail = "") {
  if (!condition) {
    failures.push({ name, detail });
    console.error(`FAIL ${name}${detail ? ` - ${detail}` : ""}`);
    return;
  }
  console.log(`OK   ${name}${detail ? ` - ${detail}` : ""}`);
}

function output(command, args) {
  const result = run(command, args);
  if (result.status !== 0) {
    return { ok: false, value: `${result.stderr}${result.stdout}`.trim() };
  }
  return { ok: true, value: result.stdout.trim() };
}

const failures = [];

if (!releaseTag.startsWith("v")) {
  throw new Error(`Release tag must start with v, received ${releaseTag}`);
}

console.log(
  `Preflighting TheBoysLauncher ${releaseTag} release from ${releaseBranch}`,
);

const status = output("git", ["status", "--short"]);
check(
  "working tree is clean",
  status.ok && status.value.length === 0,
  status.value,
);

const branch = output("git", ["branch", "--show-current"]);
check(
  "current branch is release branch",
  branch.ok && branch.value === releaseBranch,
  branch.value,
);

const localHead = output("git", ["rev-parse", "HEAD"]);
const remoteRelease = output("git", ["rev-parse", `origin/${releaseBranch}`]);
check(
  "release branch is pushed",
  localHead.ok && remoteRelease.ok && localHead.value === remoteRelease.value,
  localHead.ok ? localHead.value.slice(0, 12) : localHead.value,
);

const remoteHeads = output("git", [
  "ls-remote",
  "--heads",
  "origin",
  "main",
  mainBackupBranch,
  releaseBranch,
]);
check("remote heads are readable", remoteHeads.ok, remoteHeads.value);
if (remoteHeads.ok) {
  const heads = new Map(
    remoteHeads.value
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [sha, ref] = line.split(/\s+/);
        return [ref.replace("refs/heads/", ""), sha];
      }),
  );
  check(
    "main backup branch exists",
    heads.has(mainBackupBranch),
    mainBackupBranch,
  );
  check(
    "main backup preserves old v3 main",
    heads.has("main") && heads.has(mainBackupBranch) && heads.get("main") !== heads.get(mainBackupBranch),
    heads.has("main") && heads.has(mainBackupBranch)
      ? `${heads.get("main").slice(0, 12)} != ${heads.get(mainBackupBranch).slice(0, 12)}`
      : "missing refs",
  );
  check(
    "release branch matches current main",
    heads.has("main") &&
      heads.has(releaseBranch) &&
      heads.get("main") === heads.get(releaseBranch),
    heads.has(releaseBranch)
      ? heads.get(releaseBranch).slice(0, 12)
      : releaseBranch,
  );
}

const existingTag = run("git", [
  "ls-remote",
  "--exit-code",
  "--tags",
  "origin",
  releaseTag,
]);
check("release tag is unused", existingTag.status !== 0, releaseTag);

for (const file of requiredFiles) {
  const probe = output("git", ["cat-file", "-e", `HEAD:${file}`]);
  check(`required release file exists: ${file}`, probe.ok);
}

const packageJson = JSON.parse(
  readFileSync(join(repoRoot, "package.json"), "utf8"),
);
const tauriBuildScript = packageJson.scripts?.["tauri:build"];
check(
  "tauri build script runs the release packaging chain",
  tauriBuildScript ===
    "npm run verify:tauri-security && npm run build:social-backend && npm run stage:social-backend && npm run verify:package-resources && npm run clean:tauri-updater-artifacts && tauri build && npm run generate:updater-manifest",
  tauriBuildScript,
);
check(
  "bundle verifier script exists",
  packageJson.scripts?.["verify:tauri-bundles"] === "node scripts/verify-tauri-bundles.mjs",
  packageJson.scripts?.["verify:tauri-bundles"],
);
check(
  "package resource verifier script exists",
  packageJson.scripts?.["verify:package-resources"] === "node scripts/verify-package-resources.mjs",
  packageJson.scripts?.["verify:package-resources"],
);
check(
  "updater artifact cleanup script exists",
  packageJson.scripts?.["clean:tauri-updater-artifacts"] === "node scripts/clean-tauri-updater-artifacts.mjs",
  packageJson.scripts?.["clean:tauri-updater-artifacts"],
);
check(
  "release version resolver script exists",
  packageJson.scripts?.["resolve:v4-release-version"] === "node scripts/resolve-v4-release-version.mjs",
  packageJson.scripts?.["resolve:v4-release-version"],
);
check(
  "release channel configurator script exists",
  packageJson.scripts?.["configure:tauri-release-channel"] === "node scripts/configure-tauri-release-channel.mjs",
  packageJson.scripts?.["configure:tauri-release-channel"],
);
check(
  "updater manifest generator script exists",
  packageJson.scripts?.["generate:updater-manifest"] === "node scripts/generate-tauri-updater-manifest.mjs",
  packageJson.scripts?.["generate:updater-manifest"],
);
check(
  "packaged exe smoke script exists",
  packageJson.scripts?.["smoke:packaged-exe"] === "node scripts/smoke-packaged-exe.mjs",
  packageJson.scripts?.["smoke:packaged-exe"],
);
check(
  "packaged exe local-mode smoke script exists",
  packageJson.scripts?.["smoke:packaged-exe:local"] ===
    "node scripts/smoke-packaged-exe.mjs --backend local --root target/packaged-exe-smoke/local-mode",
  packageJson.scripts?.["smoke:packaged-exe:local"],
);
check(
  "packaged exe off-mode smoke script exists",
  packageJson.scripts?.["smoke:packaged-exe:off"] ===
    "node scripts/smoke-packaged-exe.mjs --backend off --root target/packaged-exe-smoke/off-mode",
  packageJson.scripts?.["smoke:packaged-exe:off"],
);
check(
  "hosted social scripts exist",
  typeof packageJson.scripts?.["social:up"] === "string",
);

const tauriConfig = JSON.parse(
  readFileSync(join(repoRoot, "src-tauri", "tauri.conf.json"), "utf8"),
);
const tauriMain = readFileSync(
  join(repoRoot, "src-tauri", "src", "main.rs"),
  "utf8",
);
check(
  "Tauri app version matches release tag",
  `v${tauriConfig.version}` === releaseTag,
  tauriConfig.version,
);
check(
  "Windows release exe uses GUI subsystem",
  tauriMain.includes('#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]'),
);
check(
  "Tauri updater endpoint targets GitHub latest release",
  Array.isArray(tauriConfig.plugins?.updater?.endpoints) &&
    tauriConfig.plugins.updater.endpoints.some((endpoint) =>
      endpoint.includes(
        "github.com/dilllxd/theboyslauncher/releases/latest/download/latest.json",
      ),
    ),
);
check(
  "Tauri updater public key exists",
  typeof tauriConfig.plugins?.updater?.pubkey === "string",
);

if (!skipGithubChecks) {
  const secrets = output("gh", [
    "secret",
    "list",
    "--json",
    "name",
    "--jq",
    ".[].name",
  ]);
  check("GitHub secrets are readable", secrets.ok, secrets.value);
  if (secrets.ok) {
    const names = new Set(secrets.value.split(/\r?\n/).filter(Boolean));
    for (const secret of requiredSecrets) {
      check(`GitHub secret exists: ${secret}`, names.has(secret));
    }
  }

  const repo = output("gh", [
    "repo",
    "view",
    "dilllxd/theboyslauncher",
    "--json",
    "defaultBranchRef",
    "--jq",
    ".defaultBranchRef.name",
  ]);
  check("default branch is main", repo.ok && repo.value === "main", repo.value);

  const protection = run("gh", [
    "api",
    "repos/dilllxd/theboyslauncher/branches/main/protection",
  ]);
  check(
    "main branch release is not blocked by protection",
    protection.status === 0 ||
      `${protection.stderr}${protection.stdout}`.includes("Branch not protected"),
    `${protection.stderr}${protection.stdout}`.trim(),
  );
} else {
  console.log("SKIP GitHub secrets/repository checks - THEBOYS_PREFLIGHT_SKIP_GITHUB=1");
}

if (failures.length > 0) {
  console.error(
    `\nV4 release preflight failed with ${failures.length} issue(s).`,
  );
  process.exit(1);
}

console.log(`\nV4 release preflight passed for ${releaseTag}.`);
