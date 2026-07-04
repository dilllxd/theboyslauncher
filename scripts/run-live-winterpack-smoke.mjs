import { spawn } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const smokeTests = {
  metadata: "live_dylan_catalog_and_winterpack_packwiz_metadata_parse",
  plan: "live_remote_winterpack_install_planning_uses_packwiz_and_forge_metadata",
  install: "live_winterpack_install_artifacts_pass_launch_preflight",
  repair: "live_winterpack_repair_restores_deleted_launch_dependency",
  authCommand: "live_winterpack_stored_authenticated_command_uses_saved_session",
  authLaunch: "live_winterpack_stored_authenticated_launch_process_survives_startup_and_can_stop",
  launch: "live_winterpack_launch_process_survives_startup_and_can_stop",
  delete: "live_winterpack_delete_removes_profile_data_but_keeps_shared_cache",
  fabricPlan: "live_public_fabric_packwiz_install_planning_uses_standard_pack_metadata",
  fabricInstall: "live_public_fabric_packwiz_install_artifacts_pass_launch_preflight",
  fabricLaunch: "live_public_fabric_packwiz_launch_process_survives_startup_and_can_stop",
  modrinthDiscover: "live_modrinth_discover_search_resolves_installable_archive",
  curseforgeArchivePlan: "live_curseforge_archive_plan_reads_enigmatica_export",
  modrinthArchiveInstall: "live_public_modrinth_mrpack_install_artifacts_pass_launch_preflight",
  vanillaLaunch: "live_vanilla_launch_process_survives_startup_and_can_stop",
  vanillaDelete: "live_vanilla_delete_removes_profile_data_but_keeps_shared_cache",
  neoforgeInstaller: "live_neoforge_installer_extracts_launch_metadata_and_dependencies",
  neoforgeProcessors: "live_neoforge_installer_processors_resolve_command_specs_from_real_jars",
  neoforgeInstall: "live_neoforge_install_artifacts_pass_launch_preflight",
  neoforgeLaunch: "live_neoforge_launch_process_survives_startup_and_can_stop",
};

function usage() {
  const names = Object.keys(smokeTests).join("|");
  console.error(`Usage: node scripts/run-live-winterpack-smoke.mjs <${names}> [--fresh] [--root <path>]`);
}

function parseArgs(argv) {
  const options = {
    mode: undefined,
    fresh: false,
    root: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--fresh") {
      options.fresh = true;
    } else if (arg === "--root") {
      index += 1;
      options.root = argv[index];
      if (!options.root) {
        throw new Error("--root requires a path");
      }
    } else if (!options.mode) {
      options.mode = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!options.mode || !smokeTests[options.mode]) {
    usage();
    process.exit(2);
  }

  return options;
}

function assertFreshRootIsSafe(rootPath) {
  const resolvedRoot = resolve(rootPath);
  const allowedRoot = resolve("target", "live-smoke");
  if (resolvedRoot !== allowedRoot && !resolvedRoot.startsWith(`${allowedRoot}\\`) && !resolvedRoot.startsWith(`${allowedRoot}/`)) {
    throw new Error(`Refusing --fresh outside target/live-smoke: ${resolvedRoot}`);
  }
}

const options = parseArgs(process.argv.slice(2));
const testName = smokeTests[options.mode];
const rootPath = resolve(options.root ?? "target/live-smoke/winterpack");
const lockPath = `${rootPath}.lock`;

function acquireRootLock() {
  try {
    mkdirSync(lockPath, { recursive: false });
    writeFileSync(
      resolve(lockPath, "owner.json"),
      `${JSON.stringify({ pid: process.pid, mode: options.mode, rootPath, startedAt: new Date().toISOString() }, null, 2)}\n`,
    );
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(
        `Live smoke root is already in use: ${rootPath}. ` +
          `Wait for the other smoke to finish, or remove ${lockPath} if no smoke is running.`,
      );
    }
    throw error;
  }
}

function releaseRootLock() {
  rmSync(lockPath, { recursive: true, force: true });
}

acquireRootLock();

if (options.fresh) {
  assertFreshRootIsSafe(rootPath);
  rmSync(rootPath, { recursive: true, force: true });
}
mkdirSync(rootPath, { recursive: true });

const command = "cargo";
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

console.log(`Running live WinterPack ${options.mode} smoke`);
console.log(`THEBOYS_LAUNCHER_LIVE_TEST_ROOT=${rootPath}`);
console.log(`${command} ${args.join(" ")}`);

const child = spawn(command, args, {
  env: {
    ...process.env,
    THEBOYS_LAUNCHER_LIVE_TEST_ROOT: rootPath,
  },
  stdio: "inherit",
  windowsHide: true,
});

let finished = false;

function finish(code) {
  if (finished) return;
  finished = true;
  releaseRootLock();
  process.exit(code);
}

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Live WinterPack smoke terminated by ${signal}`);
    finish(1);
    return;
  }
  finish(code ?? 1);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
    finish(1);
  });
}
