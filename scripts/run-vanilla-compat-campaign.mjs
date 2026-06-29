import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const manifestUrl = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const testName = "live_vanilla_compat_version_launch_process_survives_startup_and_can_stop";
const defaultRoot = resolve("target", "live-smoke", "vanilla-compat");
const defaultSharedCacheRoot = resolve("target", "live-smoke", "vanilla-compat-shared-cache");

function usage() {
  console.log(`Usage:
  node scripts/run-vanilla-compat-campaign.mjs --sample [--keep] [--dry-run]
  node scripts/run-vanilla-compat-campaign.mjs --matrix [--keep] [--dry-run]
  node scripts/run-vanilla-compat-campaign.mjs --version <id> [--version <id> ...] [--keep] [--dry-run]
  node scripts/run-vanilla-compat-campaign.mjs --all [--type <release|snapshot|old_beta|old_alpha>] [--offset <n>] [--limit <n>] [--keep] [--dry-run]

Options:
  --auth-session-file <path>
                  Copy an existing minecraft-accounts.json into each isolated root and use stored-auth launch.
  --sample        Test latest release, latest snapshot, latest old_beta, and latest old_alpha.
  --matrix        Test a broader representative vanilla matrix across release eras, snapshots, beta, and alpha.
  --version <id> Test one explicit Minecraft version id. Repeatable.
  --all           Test every version from Mojang's manifest. This is very slow.
  --type <type>   With --all, restrict to one Mojang version type. Repeatable.
  --offset <n>    With --all, skip the first n selected versions for resumable chunks.
  --limit <n>     With --all, test at most n selected versions for resumable chunks.
  --keep          Keep each per-version launcher root after the run.
  --jobs <n>      Run up to n isolated version smokes at once. Defaults to 1.
  --shared-cache  Reuse one shared launcher cache across versions. Serial only for now.
  --quiet         Capture cargo output and print only concise progress plus failure tails.
  --dry-run       Print selected versions without downloading or launching Minecraft.
`);
}

function parseNonNegativeInteger(value, name) {
  if (!/^\d+$/.test(value ?? "")) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return Number(value);
}

function parseArgs(argv) {
  const options = {
    all: false,
    authSessionFile: null,
    dryRun: false,
    keep: false,
    jobs: 1,
    matrix: false,
    limit: null,
    offset: 0,
    quiet: false,
    sample: false,
    sharedCache: false,
    types: [],
    versions: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--all") {
      options.all = true;
    } else if (arg === "--auth-session-file") {
      index += 1;
      options.authSessionFile = argv[index] ? resolve(argv[index]) : null;
      if (!options.authSessionFile) throw new Error("--auth-session-file requires a path");
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--keep") {
      options.keep = true;
    } else if (arg === "--jobs") {
      index += 1;
      options.jobs = parseNonNegativeInteger(argv[index], "--jobs");
      if (options.jobs < 1) throw new Error("--jobs must be at least 1");
    } else if (arg === "--matrix") {
      options.matrix = true;
    } else if (arg === "--limit") {
      index += 1;
      options.limit = parseNonNegativeInteger(argv[index], "--limit");
    } else if (arg === "--offset") {
      index += 1;
      options.offset = parseNonNegativeInteger(argv[index], "--offset");
    } else if (arg === "--quiet") {
      options.quiet = true;
    } else if (arg === "--sample") {
      options.sample = true;
    } else if (arg === "--shared-cache") {
      options.sharedCache = true;
    } else if (arg === "--type") {
      index += 1;
      const type = argv[index];
      if (!["release", "snapshot", "old_beta", "old_alpha"].includes(type)) {
        throw new Error("--type must be one of release, snapshot, old_beta, or old_alpha");
      }
      options.types.push(type);
    } else if (arg === "--version") {
      index += 1;
      const version = argv[index];
      if (!version) throw new Error("--version requires a Minecraft version id");
      options.versions.push(version);
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  const modeCount =
    Number(options.all) +
    Number(options.matrix) +
    Number(options.sample) +
    Number(options.versions.length > 0);
  if (modeCount !== 1) {
    usage();
    throw new Error("Choose exactly one of --sample, --matrix, --all, or --version");
  }
  if (!options.all && (options.types.length > 0 || options.offset !== 0 || options.limit !== null)) {
    throw new Error("--type, --offset, and --limit can only be used with --all");
  }
  if (options.authSessionFile && !existsSync(options.authSessionFile)) {
    throw new Error(`--auth-session-file does not exist: ${options.authSessionFile}`);
  }
  if (options.sharedCache && options.jobs > 1) {
    throw new Error("--shared-cache is serial-only for now; use --jobs 1 or omit --shared-cache");
  }

  return options;
}

function createTailBuffer(maxLines = 220) {
  const lines = [];
  let carry = "";

  return {
    append(chunk) {
      carry += chunk.toString();
      const parts = carry.split(/\r?\n/);
      carry = parts.pop() ?? "";
      for (const line of parts) {
        lines.push(line);
        if (lines.length > maxLines) {
          lines.shift();
        }
      }
    },
    text() {
      const output = carry ? [...lines, carry] : lines;
      return output.join("\n");
    },
  };
}

function safePathSegment(input) {
  const segment = input.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!segment) throw new Error(`Version id is not safe for a path: ${input}`);
  return segment;
}

function assertRootIsSafe(rootPath) {
  const resolvedRoot = resolve(rootPath);
  if (resolvedRoot !== defaultRoot && !resolvedRoot.startsWith(`${defaultRoot}\\`) && !resolvedRoot.startsWith(`${defaultRoot}/`)) {
    throw new Error(`Refusing to clean outside ${defaultRoot}: ${resolvedRoot}`);
  }
}

function assertSharedCacheRootIsSafe(rootPath) {
  const resolvedRoot = resolve(rootPath);
  if (resolvedRoot !== defaultSharedCacheRoot) {
    throw new Error(`Refusing to use unexpected shared cache root: ${resolvedRoot}`);
  }
}

async function fetchManifest() {
  const response = await fetch(manifestUrl);
  if (!response.ok) {
    throw new Error(`Mojang manifest request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function selectSampleVersions(manifest) {
  const byType = new Map();
  for (const version of manifest.versions ?? []) {
    if (!byType.has(version.type)) byType.set(version.type, version.id);
  }
  return ["release", "snapshot", "old_beta", "old_alpha"]
    .map((type) => byType.get(type))
    .filter(Boolean);
}

function versionExists(manifest, id) {
  return (manifest.versions ?? []).some((version) => version.id === id);
}

function firstVersionId(manifest, predicate) {
  return (manifest.versions ?? []).find(predicate)?.id;
}

function addUniqueVersion(versions, id) {
  if (id && !versions.includes(id)) {
    versions.push(id);
  }
}

function selectMatrixVersions(manifest) {
  const versions = [];
  const add = (id) => {
    if (versionExists(manifest, id)) {
      addUniqueVersion(versions, id);
    }
  };

  for (const sample of selectSampleVersions(manifest)) {
    addUniqueVersion(versions, sample);
  }

  add(firstVersionId(manifest, (version) => version.type === "release" && /^1\.21\./.test(version.id)));
  add(firstVersionId(manifest, (version) => version.type === "release" && /^1\.20\./.test(version.id)));
  add(firstVersionId(manifest, (version) => version.type === "release" && /^1\.18\./.test(version.id)));
  add(firstVersionId(manifest, (version) => version.type === "release" && /^1\.16\./.test(version.id)));
  add(firstVersionId(manifest, (version) => version.type === "release" && /^1\.13\./.test(version.id)));
  add(firstVersionId(manifest, (version) => version.type === "release" && /^1\.7\./.test(version.id)));
  add(firstVersionId(manifest, (version) => version.type === "release" && version.id === "1.0"));

  add(firstVersionId(manifest, (version) => version.type === "snapshot" && /^1\.21/.test(version.id)));
  add(firstVersionId(manifest, (version) => version.type === "snapshot" && /^1\.13/.test(version.id)));
  add(firstVersionId(manifest, (version) => version.type === "snapshot" && /^1\.7/.test(version.id)));

  add(firstVersionId(manifest, (version) => version.type === "old_beta" && version.id === "b1.7.3"));
  add(firstVersionId(manifest, (version) => version.type === "old_alpha" && version.id === "a1.1.2_01"));

  return versions;
}

function runVersion(version, options) {
  const versionRoot = resolve(defaultRoot, safePathSegment(version));
  const lockPath = `${versionRoot}.lock`;
  const sharedCacheRoot = options.sharedCache ? defaultSharedCacheRoot : null;

  mkdirSync(defaultRoot, { recursive: true });
  if (sharedCacheRoot) {
    assertSharedCacheRootIsSafe(sharedCacheRoot);
    mkdirSync(sharedCacheRoot, { recursive: true });
  }
  try {
    mkdirSync(lockPath, { recursive: false });
    writeFileSync(
      resolve(lockPath, "owner.json"),
      `${JSON.stringify({ pid: process.pid, version, versionRoot, startedAt: new Date().toISOString() }, null, 2)}\n`,
    );
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`Vanilla compatibility root is already in use: ${versionRoot}`);
    }
    throw error;
  }

  assertRootIsSafe(versionRoot);
  rmSync(versionRoot, { recursive: true, force: true });
  mkdirSync(versionRoot, { recursive: true });
  if (options.authSessionFile) {
    const configRoot = resolve(versionRoot, "config");
    mkdirSync(configRoot, { recursive: true });
    copyFileSync(options.authSessionFile, resolve(configRoot, "minecraft-accounts.json"));
  }

  const args = [
    "test",
    "-p",
    "launcher-core",
    testName,
    "--",
    "--ignored",
    "--test-threads=1",
    "--nocapture",
  ];

  console.log(`\n== Vanilla compatibility: ${version} ==`);
  console.log(`THEBOYS_LAUNCHER_LIVE_TEST_ROOT=${versionRoot}`);
  if (sharedCacheRoot) {
    console.log(`THEBOYS_LAUNCHER_LIVE_TEST_CACHE=${sharedCacheRoot}`);
  }
  console.log(`cargo ${args.join(" ")}`);

  return new Promise((resolveRun) => {
    const outputTail = options.quiet ? createTailBuffer() : null;
    const child = spawn("cargo", args, {
      env: {
        ...process.env,
        THEBOYS_LAUNCHER_LIVE_TEST_ROOT: versionRoot,
        ...(sharedCacheRoot ? { THEBOYS_LAUNCHER_LIVE_TEST_CACHE: sharedCacheRoot } : {}),
        THEBOYS_VANILLA_COMPAT_AUTH: options.authSessionFile ? "stored" : "offline",
        THEBOYS_VANILLA_COMPAT_VERSION: version,
      },
      stdio: options.quiet ? ["ignore", "pipe", "pipe"] : "inherit",
      windowsHide: true,
    });

    if (outputTail) {
      child.stdout?.on("data", (chunk) => outputTail.append(chunk));
      child.stderr?.on("data", (chunk) => outputTail.append(chunk));
    }

    child.on("exit", (code, signal) => {
      rmSync(lockPath, { recursive: true, force: true });
      if (!options.keep) {
        rmSync(versionRoot, { recursive: true, force: true });
      }
      resolveRun({
        version,
        code: signal ? 1 : code ?? 1,
        signal,
        outputTail: outputTail?.text() ?? "",
      });
    });
  });
}

async function runVersions(versions, options) {
  if (options.jobs === 1) {
    const results = [];
    for (const version of versions) {
      results.push(await runVersion(version, options));
    }
    return results;
  }

  const results = new Array(versions.length);
  let nextIndex = 0;
  const workerCount = Math.min(options.jobs, versions.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < versions.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await runVersion(versions[currentIndex], options);
      }
    }),
  );
  return results;
}

const options = parseArgs(process.argv.slice(2));
const manifest = await fetchManifest();
const manifestVersions = options.all
  ? manifest.versions
      .filter((version) => options.types.length === 0 || options.types.includes(version.type))
      .slice(options.offset, options.limit === null ? undefined : options.offset + options.limit)
  : [];
const versions = options.all
  ? manifestVersions.map((version) => version.id)
  : options.matrix
    ? selectMatrixVersions(manifest)
  : options.sample
    ? selectSampleVersions(manifest)
    : options.versions;

if (versions.length === 0) {
  throw new Error("No Minecraft versions selected");
}

console.log(`Selected ${versions.length} Minecraft version(s): ${versions.join(", ")}`);
if (!options.dryRun) {
  console.log(
    `Runner settings: jobs=${options.jobs}, sharedCache=${options.sharedCache ? defaultSharedCacheRoot : "disabled"}, quiet=${options.quiet}`,
  );
}

if (options.dryRun) {
  process.exit(0);
}

const results = await runVersions(versions, options);

const failed = results.filter((result) => result.code !== 0);
console.log("\nVanilla compatibility results:");
for (const result of results) {
  console.log(`- ${result.version}: ${result.code === 0 ? "passed" : `failed (${result.signal ?? result.code})`}`);
}

for (const result of failed) {
  if (result.outputTail) {
    console.log(`\n--- ${result.version} failure output tail ---`);
    console.log(result.outputTail);
  }
}

if (failed.length > 0) {
  process.exit(1);
}
