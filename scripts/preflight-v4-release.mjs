import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const releaseTag = process.argv[2] ?? "v4.0.0";
const rewriteBranch =
  process.env.THEBOYS_V4_BRANCH ?? "codex/fresh-foundation-rewrite";
const mainBackupBranch =
  process.env.THEBOYS_MAIN_BACKUP_BRANCH ?? "backup/main-v3-2026-06-29";
const requiredSecrets = [
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
];
const requiredFiles = [
  ".github/workflows/v4-foundation.yml",
  ".github/workflows/social-backend-image.yml",
  "src-tauri/tauri.conf.json",
  "scripts/generate-tauri-updater-manifest.mjs",
  "scripts/verify-tauri-bundles.mjs",
  "scripts/manage-hosted-social-backend.mjs",
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
  `Preflighting TheBoysLauncher ${releaseTag} release from ${rewriteBranch}`,
);

const status = output("git", ["status", "--short"]);
check(
  "working tree is clean",
  status.ok && status.value.length === 0,
  status.value,
);

const branch = output("git", ["branch", "--show-current"]);
check(
  "current branch is rewrite branch",
  branch.ok && branch.value === rewriteBranch,
  branch.value,
);

const localHead = output("git", ["rev-parse", "HEAD"]);
const remoteRewrite = output("git", ["rev-parse", `origin/${rewriteBranch}`]);
check(
  "rewrite branch is pushed",
  localHead.ok && remoteRewrite.ok && localHead.value === remoteRewrite.value,
  localHead.ok ? localHead.value.slice(0, 12) : localHead.value,
);

const remoteHeads = output("git", [
  "ls-remote",
  "--heads",
  "origin",
  "main",
  mainBackupBranch,
  rewriteBranch,
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
    "main backup matches current main",
    heads.has("main") && heads.get("main") === heads.get(mainBackupBranch),
    heads.has("main") && heads.has(mainBackupBranch)
      ? `${heads.get("main").slice(0, 12)} == ${heads.get(mainBackupBranch).slice(0, 12)}`
      : "missing refs",
  );
  check(
    "rewrite branch differs from old main",
    heads.has("main") &&
      heads.has(rewriteBranch) &&
      heads.get("main") !== heads.get(rewriteBranch),
    heads.has(rewriteBranch)
      ? heads.get(rewriteBranch).slice(0, 12)
      : rewriteBranch,
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
check(
  "tauri build script exists",
  typeof packageJson.scripts?.["tauri:build"] === "string",
);
check(
  "bundle verifier script exists",
  typeof packageJson.scripts?.["verify:tauri-bundles"] === "string",
);
check(
  "hosted social scripts exist",
  typeof packageJson.scripts?.["social:up"] === "string",
);

const tauriConfig = JSON.parse(
  readFileSync(join(repoRoot, "src-tauri", "tauri.conf.json"), "utf8"),
);
check(
  "Tauri app version matches release tag",
  `v${tauriConfig.version}` === releaseTag,
  tauriConfig.version,
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
  "main branch promotion is not blocked by protection",
  protection.status === 0 ||
    `${protection.stderr}${protection.stdout}`.includes("Branch not protected"),
  `${protection.stderr}${protection.stdout}`.trim(),
);

if (failures.length > 0) {
  console.error(
    `\nV4 release preflight failed with ${failures.length} issue(s).`,
  );
  process.exit(1);
}

console.log(`\nV4 release preflight passed for ${releaseTag}.`);
