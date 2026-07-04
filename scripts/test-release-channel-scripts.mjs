import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const resolverScript = join(repoRoot, "scripts", "resolve-v4-release-version.mjs");
const configureScript = join(repoRoot, "scripts", "configure-tauri-release-channel.mjs");
const generateManifestScript = join(repoRoot, "scripts", "generate-tauri-updater-manifest.mjs");
const verifyBundlesScript = join(repoRoot, "scripts", "verify-tauri-bundles.mjs");
const preflightScript = join(repoRoot, "scripts", "preflight-v4-release.mjs");
const cleanUpdaterArtifactsScript = join(repoRoot, "scripts", "clean-tauri-updater-artifacts.mjs");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    ...options,
    env: { ...process.env, ...(options.env ?? {}) },
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr}${result.stdout}`);
  }
  return result.stdout.trim();
}

function runExpectFailure(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    ...options,
    env: { ...process.env, ...(options.env ?? {}) },
  });
  if (result.status === 0) {
    throw new Error(`${command} ${args.join(" ")} unexpectedly succeeded:\n${result.stderr}${result.stdout}`);
  }
  return `${result.stderr}${result.stdout}`.trim();
}

function parseKeyValueOutput(output) {
  return Object.fromEntries(
    output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator === -1) throw new Error(`Expected key=value output, received: ${line}`);
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

function testVersionResolution() {
  const tempRepo = mkdtempSync(join(tmpdir(), "tbl-release-version-"));
  try {
    run("git", ["init"], { cwd: tempRepo });
    run("git", ["config", "user.email", "release-test@example.invalid"], { cwd: tempRepo });
    run("git", ["config", "user.name", "Release Test"], { cwd: tempRepo });
    writeFileSync(join(tempRepo, "README.md"), "release test\n");
    run("git", ["add", "README.md"], { cwd: tempRepo });
    run("git", ["commit", "-m", "seed"], { cwd: tempRepo });
    run("git", ["tag", "v4.0.0"], { cwd: tempRepo });
    run("git", ["tag", "v4.0.1"], { cwd: tempRepo });
    run("git", ["tag", "v4.0.2-dev.1"], { cwd: tempRepo });
    run("git", ["tag", "v4.0.2-dev.2"], { cwd: tempRepo });
    writeFileSync(join(tempRepo, "README.md"), "release test\nnext change\n");
    run("git", ["add", "README.md"], { cwd: tempRepo });
    run("git", ["commit", "-m", "next release candidate"], { cwd: tempRepo });

    const stable = parseKeyValueOutput(
      run("node", [resolverScript, "stable"], {
        cwd: tempRepo,
        env: { THEBOYS_SKIP_GIT_FETCH: "1" },
      }),
    );
    assertEqual(stable.channel, "stable", "stable channel");
    assertEqual(stable.version, "4.0.2", "stable version");
    assertEqual(stable.tag, "v4.0.2", "stable tag");
    assertEqual(stable.manifest_name, "latest.json", "stable manifest");
    assertEqual(stable.product_name, "TheBoysLauncher", "stable product");

    const dev = parseKeyValueOutput(
      run("node", [resolverScript, "dev"], {
        cwd: tempRepo,
        env: { THEBOYS_SKIP_GIT_FETCH: "1" },
      }),
    );
    assertEqual(dev.channel, "dev", "dev channel");
    assertEqual(dev.version, "4.0.2-3", "dev MSI-compatible version");
    assertEqual(dev.tag, "v4.0.2-dev.3", "dev immutable tag");
    assertEqual(dev.manifest_name, "latest-dev.json", "dev manifest");
    assertEqual(dev.product_name, "TheBoysLauncher Dev", "dev product");

    run("git", ["tag", "v4.0.2"], { cwd: tempRepo });
    const stableRetry = parseKeyValueOutput(
      run("node", [resolverScript, "stable"], {
        cwd: tempRepo,
        env: { THEBOYS_SKIP_GIT_FETCH: "1" },
      }),
    );
    assertEqual(stableRetry.version, "4.0.2", "stable retry reuses version tag on HEAD");
    assertEqual(stableRetry.tag, "v4.0.2", "stable retry reuses tag on HEAD");

    run("git", ["tag", "v4.0.3-dev.1"], { cwd: tempRepo });
    const devRetry = parseKeyValueOutput(
      run("node", [resolverScript, "dev"], {
        cwd: tempRepo,
        env: { THEBOYS_SKIP_GIT_FETCH: "1" },
      }),
    );
    assertEqual(devRetry.version, "4.0.3-1", "dev retry reuses dev version tag on HEAD");
    assertEqual(devRetry.tag, "v4.0.3-dev.1", "dev retry reuses dev tag on HEAD");
  } finally {
    rmSync(tempRepo, { recursive: true, force: true });
  }
}

function testTauriChannelConfiguration() {
  const tempDir = mkdtempSync(join(tmpdir(), "tbl-tauri-channel-"));
  try {
    const configPath = join(tempDir, "tauri.conf.json");
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          productName: "TheBoysLauncher",
          version: "4.0.0",
          identifier: "com.theboys.launcher",
          app: { windows: [{ title: "TheBoysLauncher" }] },
          plugins: { updater: { endpoints: [] } },
        },
        null,
        2,
      ) + "\n",
    );

    run("node", [configureScript, "dev", "4.0.2-3"], {
      env: { THEBOYS_TAURI_CONFIG_PATH: configPath },
    });
    const devConfig = JSON.parse(readFileSync(configPath, "utf8"));
    assertEqual(devConfig.productName, "TheBoysLauncher Dev", "dev product config");
    assertEqual(devConfig.version, "4.0.2-3", "dev config version");
    assertEqual(devConfig.identifier, "com.theboys.launcher.dev", "dev identifier");
    assertEqual(devConfig.app.windows[0].title, "TheBoysLauncher Dev", "dev window title");
    assertEqual(
      devConfig.plugins.updater.endpoints[0],
      "https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/latest-dev.json",
      "dev updater endpoint",
    );

    run("node", [configureScript, "stable", "4.0.2"], {
      env: { THEBOYS_TAURI_CONFIG_PATH: configPath },
    });
    const stableConfig = JSON.parse(readFileSync(configPath, "utf8"));
    assertEqual(stableConfig.productName, "TheBoysLauncher", "stable product config");
    assertEqual(stableConfig.version, "4.0.2", "stable config version");
    assertEqual(stableConfig.identifier, "com.theboys.launcher", "stable identifier");
    assertEqual(stableConfig.app.windows[0].title, "TheBoysLauncher", "stable window title");
    assertEqual(
      stableConfig.plugins.updater.endpoints[0],
      "https://github.com/dilllxd/theboyslauncher/releases/latest/download/latest.json",
      "stable updater endpoint",
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function testDevUpdaterManifestUsesEncodedSetupUrl() {
  const tempDir = mkdtempSync(join(tmpdir(), "tbl-tauri-manifest-"));
  try {
    const configPath = join(tempDir, "tauri.conf.json");
    const bundleRoot = join(tempDir, "bundle");
    const msiDir = join(bundleRoot, "msi");
    const nsisDir = join(bundleRoot, "nsis");
    mkdirSync(msiDir, { recursive: true });
    mkdirSync(nsisDir, { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          productName: "TheBoysLauncher Dev",
          version: "4.0.2-3",
          identifier: "com.theboys.launcher.dev",
        },
        null,
        2,
      ) + "\n",
    );
    writeFileSync(join(msiDir, "TheBoysLauncher Dev_4.0.2-3_x64_en-US.msi"), "fake msi\n");
    writeFileSync(join(nsisDir, "TheBoysLauncher Dev_4.0.2-3_x64-setup.exe"), "fake setup\n");
    writeFileSync(join(nsisDir, "TheBoysLauncher Dev_4.0.2-3_x64-setup.exe.sig"), "fake-signature\n");

    const env = {
      THEBOYS_TAURI_CONFIG_PATH: configPath,
      THEBOYS_BUNDLE_ROOT: bundleRoot,
      THEBOYS_UPDATER_MANIFEST_NAME: "latest-dev.json",
      GITHUB_REF_NAME: "dev-latest",
      GITHUB_REPOSITORY: "dilllxd/theboyslauncher",
    };
    run("node", [generateManifestScript], { env });
    const manifest = JSON.parse(readFileSync(join(bundleRoot, "latest-dev.json"), "utf8"));
    assertEqual(manifest.channel, "dev", "dev manifest channel");
    assertEqual(
      manifest.url,
      "https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/TheBoysLauncher%20Dev_4.0.2-3_x64-setup.exe",
      "dev manifest setup URL",
    );
    run("node", [verifyBundlesScript], { env });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function testUpdaterManifestGeneratorRequiresConfiguredSetupVersion() {
  const tempDir = mkdtempSync(join(tmpdir(), "tbl-tauri-wrong-setup-version-"));
  try {
    const configPath = join(tempDir, "tauri.conf.json");
    const bundleRoot = join(tempDir, "bundle");
    const nsisDir = join(bundleRoot, "nsis");
    mkdirSync(nsisDir, { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          productName: "TheBoysLauncher",
          version: "4.0.2",
          identifier: "com.theboys.launcher",
        },
        null,
        2,
      ) + "\n",
    );
    const wrongSetupName = "TheBoysLauncher_9.9.9_x64-setup.exe";
    writeFileSync(join(nsisDir, wrongSetupName), "wrong setup\n");
    writeFileSync(join(nsisDir, `${wrongSetupName}.sig`), "wrong-signature\n");

    const output = runExpectFailure("node", [generateManifestScript], {
      env: {
        THEBOYS_TAURI_CONFIG_PATH: configPath,
        THEBOYS_BUNDLE_ROOT: bundleRoot,
        THEBOYS_UPDATER_MANIFEST_NAME: "latest.json",
        THEBOYS_RELEASE_CHANNEL: "stable",
        GITHUB_REPOSITORY: "dilllxd/theboyslauncher",
        GITHUB_REF_NAME: "v4.0.2",
      },
    });
    if (!output.includes("No NSIS setup installer for TheBoysLauncher 4.0.2 found")) {
      throw new Error(`manifest generator failed for the wrong reason:\n${output}`);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function testUpdaterManifestGeneratorRejectsAmbiguousSetupInstallers() {
  const tempDir = mkdtempSync(join(tmpdir(), "tbl-tauri-ambiguous-setup-"));
  try {
    const configPath = join(tempDir, "tauri.conf.json");
    const bundleRoot = join(tempDir, "bundle");
    const nsisDir = join(bundleRoot, "nsis");
    mkdirSync(nsisDir, { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          productName: "TheBoysLauncher",
          version: "4.0.2",
          identifier: "com.theboys.launcher",
        },
        null,
        2,
      ) + "\n",
    );
    for (const setupName of ["TheBoysLauncher_4.0.2_x64-setup.exe", "TheBoysLauncher_4.0.2_arm64-setup.exe"]) {
      writeFileSync(join(nsisDir, setupName), "fake setup\n");
      writeFileSync(join(nsisDir, `${setupName}.sig`), "fake-signature\n");
    }

    const output = runExpectFailure("node", [generateManifestScript], {
      env: {
        THEBOYS_TAURI_CONFIG_PATH: configPath,
        THEBOYS_BUNDLE_ROOT: bundleRoot,
        THEBOYS_UPDATER_MANIFEST_NAME: "latest.json",
        THEBOYS_RELEASE_CHANNEL: "stable",
        GITHUB_REPOSITORY: "dilllxd/theboyslauncher",
        GITHUB_REF_NAME: "v4.0.2",
      },
    });
    if (!output.includes("Ambiguous NSIS setup installers for TheBoysLauncher 4.0.2")) {
      throw new Error(`manifest generator failed for the wrong reason:\n${output}`);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function testUpdaterManifestGeneratorRejectsStableTagVersionMismatch() {
  const tempDir = mkdtempSync(join(tmpdir(), "tbl-tauri-wrong-release-tag-"));
  try {
    const configPath = join(tempDir, "tauri.conf.json");
    const bundleRoot = join(tempDir, "bundle");
    const nsisDir = join(bundleRoot, "nsis");
    mkdirSync(nsisDir, { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          productName: "TheBoysLauncher",
          version: "4.0.2",
          identifier: "com.theboys.launcher",
        },
        null,
        2,
      ) + "\n",
    );
    const setupName = "TheBoysLauncher_4.0.2_x64-setup.exe";
    writeFileSync(join(nsisDir, setupName), "fake setup\n");
    writeFileSync(join(nsisDir, `${setupName}.sig`), "fake-signature\n");

    const output = runExpectFailure("node", [generateManifestScript], {
      env: {
        THEBOYS_TAURI_CONFIG_PATH: configPath,
        THEBOYS_BUNDLE_ROOT: bundleRoot,
        THEBOYS_UPDATER_MANIFEST_NAME: "latest.json",
        THEBOYS_RELEASE_CHANNEL: "stable",
        GITHUB_REPOSITORY: "dilllxd/theboyslauncher",
        THEBOYS_RELEASE_TAG: "v4.0.3",
      },
    });
    if (!output.includes("Stable updater release tag v4.0.3 must match configured Tauri version 4.0.2")) {
      throw new Error(`manifest generator failed for the wrong reason:\n${output}`);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function testBundleVerifierRejectsAmbiguousConfiguredBundles() {
  const tempDir = mkdtempSync(join(tmpdir(), "tbl-tauri-ambiguous-bundles-"));
  try {
    const configPath = join(tempDir, "tauri.conf.json");
    const bundleRoot = join(tempDir, "bundle");
    const msiDir = join(bundleRoot, "msi");
    const nsisDir = join(bundleRoot, "nsis");
    mkdirSync(msiDir, { recursive: true });
    mkdirSync(nsisDir, { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          productName: "TheBoysLauncher",
          version: "4.0.2",
          identifier: "com.theboys.launcher",
        },
        null,
        2,
      ) + "\n",
    );
    writeFileSync(join(msiDir, "TheBoysLauncher_4.0.2_x64_en-US.msi"), "fake msi\n");
    writeFileSync(join(msiDir, "TheBoysLauncher_4.0.2_arm64_en-US.msi"), "fake msi\n");
    const setupName = "TheBoysLauncher_4.0.2_x64-setup.exe";
    writeFileSync(join(nsisDir, setupName), "fake setup\n");
    writeFileSync(join(nsisDir, `${setupName}.sig`), "fake-signature\n");
    writeFileSync(
      join(bundleRoot, "latest.json"),
      JSON.stringify(
        {
          channel: "stable",
          version: "4.0.2",
          notes: "ambiguous bundle manifest",
          pub_date: "2026-01-01T00:00:00.000Z",
          url: `https://github.com/dilllxd/theboyslauncher/releases/download/v4.0.2/${encodeURIComponent(setupName)}`,
          signature: "fake-signature",
        },
        null,
        2,
      ) + "\n",
    );

    const output = runExpectFailure("node", [verifyBundlesScript], {
      env: {
        THEBOYS_TAURI_CONFIG_PATH: configPath,
        THEBOYS_BUNDLE_ROOT: bundleRoot,
        THEBOYS_UPDATER_MANIFEST_NAME: "latest.json",
        THEBOYS_RELEASE_CHANNEL: "stable",
        GITHUB_REPOSITORY: "dilllxd/theboyslauncher",
      },
    });
    if (!output.includes("Ambiguous MSI bundles for TheBoysLauncher 4.0.2")) {
      throw new Error(`bundle verifier failed for the wrong reason:\n${output}`);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function testBundleVerifierRejectsStableManifestTagVersionMismatch() {
  const tempDir = mkdtempSync(join(tmpdir(), "tbl-tauri-wrong-manifest-tag-"));
  try {
    const configPath = join(tempDir, "tauri.conf.json");
    const bundleRoot = join(tempDir, "bundle");
    const msiDir = join(bundleRoot, "msi");
    const nsisDir = join(bundleRoot, "nsis");
    mkdirSync(msiDir, { recursive: true });
    mkdirSync(nsisDir, { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          productName: "TheBoysLauncher",
          version: "4.0.2",
          identifier: "com.theboys.launcher",
        },
        null,
        2,
      ) + "\n",
    );
    const setupName = "TheBoysLauncher_4.0.2_x64-setup.exe";
    writeFileSync(join(msiDir, "TheBoysLauncher_4.0.2_x64_en-US.msi"), "fake msi\n");
    writeFileSync(join(nsisDir, setupName), "fake setup\n");
    writeFileSync(join(nsisDir, `${setupName}.sig`), "fake-signature\n");
    writeFileSync(
      join(bundleRoot, "latest.json"),
      JSON.stringify(
        {
          channel: "stable",
          version: "4.0.2",
          notes: "wrong release tag manifest",
          pub_date: "2026-01-01T00:00:00.000Z",
          url: `https://github.com/dilllxd/theboyslauncher/releases/download/v4.0.3/${encodeURIComponent(setupName)}`,
          signature: "fake-signature",
        },
        null,
        2,
      ) + "\n",
    );

    const output = runExpectFailure("node", [verifyBundlesScript], {
      env: {
        THEBOYS_TAURI_CONFIG_PATH: configPath,
        THEBOYS_BUNDLE_ROOT: bundleRoot,
        THEBOYS_UPDATER_MANIFEST_NAME: "latest.json",
        THEBOYS_RELEASE_CHANNEL: "stable",
        GITHUB_REPOSITORY: "dilllxd/theboyslauncher",
      },
    });
    if (!output.includes("Stable updater manifest tag v4.0.3 does not match Tauri version 4.0.2")) {
      throw new Error(`bundle verifier failed for the wrong reason:\n${output}`);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function testBundleVerifierRejectsUntrustedManifestUrl() {
  const tempDir = mkdtempSync(join(tmpdir(), "tbl-tauri-untrusted-manifest-"));
  try {
    const configPath = join(tempDir, "tauri.conf.json");
    const bundleRoot = join(tempDir, "bundle");
    const msiDir = join(bundleRoot, "msi");
    const nsisDir = join(bundleRoot, "nsis");
    mkdirSync(msiDir, { recursive: true });
    mkdirSync(nsisDir, { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          productName: "TheBoysLauncher Dev",
          version: "4.0.2-3",
          identifier: "com.theboys.launcher.dev",
        },
        null,
        2,
      ) + "\n",
    );
    const setupName = "TheBoysLauncher Dev_4.0.2-3_x64-setup.exe";
    writeFileSync(join(msiDir, "TheBoysLauncher Dev_4.0.2-3_x64_en-US.msi"), "fake msi\n");
    writeFileSync(join(nsisDir, setupName), "fake setup\n");
    writeFileSync(
      join(bundleRoot, "latest-dev.json"),
      JSON.stringify(
        {
          channel: "dev",
          version: "4.0.2-3",
          notes: "poisoned manifest",
          pub_date: "2026-01-01T00:00:00.000Z",
          url: `https://github.com/lookalike/theboyslauncher/releases/download/dev-latest/${encodeURIComponent(setupName)}`,
          signature: "fake-signature",
        },
        null,
        2,
      ) + "\n",
    );

    const output = runExpectFailure("node", [verifyBundlesScript], {
      env: {
        THEBOYS_TAURI_CONFIG_PATH: configPath,
        THEBOYS_BUNDLE_ROOT: bundleRoot,
        THEBOYS_UPDATER_MANIFEST_NAME: "latest-dev.json",
        GITHUB_REPOSITORY: "dilllxd/theboyslauncher",
      },
    });
    if (!output.includes("trusted dilllxd/theboyslauncher GitHub release installer")) {
      throw new Error(`bundle verifier failed for the wrong reason:\n${output}`);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function testUpdaterScriptsRejectForkedRepositoryEnvironment() {
  const tempDir = mkdtempSync(join(tmpdir(), "tbl-tauri-fork-repository-"));
  try {
    const configPath = join(tempDir, "tauri.conf.json");
    const bundleRoot = join(tempDir, "bundle");
    const msiDir = join(bundleRoot, "msi");
    const nsisDir = join(bundleRoot, "nsis");
    mkdirSync(msiDir, { recursive: true });
    mkdirSync(nsisDir, { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          productName: "TheBoysLauncher",
          version: "4.0.2",
          identifier: "com.theboys.launcher",
        },
        null,
        2,
      ) + "\n",
    );
    const setupName = "TheBoysLauncher_4.0.2_x64-setup.exe";
    writeFileSync(join(msiDir, "TheBoysLauncher_4.0.2_x64_en-US.msi"), "fake msi\n");
    writeFileSync(join(nsisDir, setupName), "fake setup\n");
    writeFileSync(join(nsisDir, `${setupName}.sig`), "fake-signature\n");
    writeFileSync(
      join(bundleRoot, "latest.json"),
      JSON.stringify(
        {
          channel: "stable",
          version: "4.0.2",
          notes: "fork repository manifest",
          pub_date: "2026-01-01T00:00:00.000Z",
          url: `https://github.com/dilllxd/theboyslauncher/releases/download/v4.0.2/${encodeURIComponent(setupName)}`,
          signature: "fake-signature",
        },
        null,
        2,
      ) + "\n",
    );

    const env = {
      THEBOYS_TAURI_CONFIG_PATH: configPath,
      THEBOYS_BUNDLE_ROOT: bundleRoot,
      THEBOYS_UPDATER_MANIFEST_NAME: "latest.json",
      THEBOYS_RELEASE_CHANNEL: "stable",
      GITHUB_REPOSITORY: "fork/theboyslauncher",
      GITHUB_REPOSITORY_OWNER: "fork",
      GITHUB_REF_NAME: "v4.0.2",
    };
    const generateOutput = runExpectFailure("node", [generateManifestScript], { env });
    if (!generateOutput.includes("must be published from dilllxd/theboyslauncher")) {
      throw new Error(`manifest generator failed for the wrong reason:\n${generateOutput}`);
    }
    const verifyOutput = runExpectFailure("node", [verifyBundlesScript], { env });
    if (!verifyOutput.includes("must target dilllxd/theboyslauncher")) {
      throw new Error(`bundle verifier failed for the wrong reason:\n${verifyOutput}`);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function testBundleVerifierRejectsDecoratedManifestUrl() {
  const tempDir = mkdtempSync(join(tmpdir(), "tbl-tauri-decorated-manifest-"));
  try {
    const configPath = join(tempDir, "tauri.conf.json");
    const bundleRoot = join(tempDir, "bundle");
    const msiDir = join(bundleRoot, "msi");
    const nsisDir = join(bundleRoot, "nsis");
    mkdirSync(msiDir, { recursive: true });
    mkdirSync(nsisDir, { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          productName: "TheBoysLauncher Dev",
          version: "4.0.2-3",
          identifier: "com.theboys.launcher.dev",
        },
        null,
        2,
      ) + "\n",
    );
    const setupName = "TheBoysLauncher Dev_4.0.2-3_x64-setup.exe";
    writeFileSync(join(msiDir, "TheBoysLauncher Dev_4.0.2-3_x64_en-US.msi"), "fake msi\n");
    writeFileSync(join(nsisDir, setupName), "fake setup\n");
    writeFileSync(
      join(nsisDir, `${setupName}.sig`),
      "fake-signature\n",
    );
    writeFileSync(
      join(bundleRoot, "latest-dev.json"),
      JSON.stringify(
        {
          channel: "dev",
          version: "4.0.2-3",
          notes: "decorated manifest",
          pub_date: "2026-01-01T00:00:00.000Z",
          url: `https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/${encodeURIComponent(setupName)}?download=1`,
          signature: "fake-signature",
        },
        null,
        2,
      ) + "\n",
    );

    const output = runExpectFailure("node", [verifyBundlesScript], {
      env: {
        THEBOYS_TAURI_CONFIG_PATH: configPath,
        THEBOYS_BUNDLE_ROOT: bundleRoot,
        THEBOYS_UPDATER_MANIFEST_NAME: "latest-dev.json",
        GITHUB_REPOSITORY: "dilllxd/theboyslauncher",
      },
    });
    if (!output.includes("trusted dilllxd/theboyslauncher GitHub release installer")) {
      throw new Error(`bundle verifier failed for the wrong reason:\n${output}`);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function testUpdaterSignatureMustNotBeOlderThanSetup() {
  const tempDir = mkdtempSync(join(tmpdir(), "tbl-tauri-stale-signature-"));
  try {
    const configPath = join(tempDir, "tauri.conf.json");
    const bundleRoot = join(tempDir, "bundle");
    const msiDir = join(bundleRoot, "msi");
    const nsisDir = join(bundleRoot, "nsis");
    mkdirSync(msiDir, { recursive: true });
    mkdirSync(nsisDir, { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          productName: "TheBoysLauncher",
          version: "4.0.2",
          identifier: "com.theboys.launcher",
        },
        null,
        2,
      ) + "\n",
    );
    const setupName = "TheBoysLauncher_4.0.2_x64-setup.exe";
    const setupPath = join(nsisDir, setupName);
    const signaturePath = join(nsisDir, `${setupName}.sig`);
    writeFileSync(join(msiDir, "TheBoysLauncher_4.0.2_x64_en-US.msi"), "fake msi\n");
    writeFileSync(setupPath, "fake setup\n");
    writeFileSync(signaturePath, "stale-signature\n");
    writeFileSync(
      join(bundleRoot, "latest.json"),
      JSON.stringify(
        {
          channel: "stable",
          version: "4.0.2",
          notes: "stale signature manifest",
          pub_date: "2026-01-01T00:00:00.000Z",
          url: `https://github.com/dilllxd/theboyslauncher/releases/download/v4.0.2/${encodeURIComponent(setupName)}`,
          signature: "stale-signature",
        },
        null,
        2,
      ) + "\n",
    );
    const stale = new Date("2026-01-01T00:00:00.000Z");
    const fresh = new Date("2026-01-02T00:00:00.000Z");
    utimesSync(signaturePath, stale, stale);
    utimesSync(setupPath, fresh, fresh);

    const env = {
      THEBOYS_TAURI_CONFIG_PATH: configPath,
      THEBOYS_BUNDLE_ROOT: bundleRoot,
      THEBOYS_UPDATER_MANIFEST_NAME: "latest.json",
      THEBOYS_RELEASE_CHANNEL: "stable",
      GITHUB_REPOSITORY: "dilllxd/theboyslauncher",
      GITHUB_REF_NAME: "v4.0.2",
    };
    const generateOutput = runExpectFailure("node", [generateManifestScript], { env });
    if (!generateOutput.includes("is older than")) {
      throw new Error(`manifest generator failed for the wrong reason:\n${generateOutput}`);
    }
    const verifyOutput = runExpectFailure("node", [verifyBundlesScript], { env });
    if (!verifyOutput.includes("is older than")) {
      throw new Error(`bundle verifier failed for the wrong reason:\n${verifyOutput}`);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function testBundleVerifierRejectsManifestSignatureMismatch() {
  const tempDir = mkdtempSync(join(tmpdir(), "tbl-tauri-signature-mismatch-"));
  try {
    const configPath = join(tempDir, "tauri.conf.json");
    const bundleRoot = join(tempDir, "bundle");
    const msiDir = join(bundleRoot, "msi");
    const nsisDir = join(bundleRoot, "nsis");
    mkdirSync(msiDir, { recursive: true });
    mkdirSync(nsisDir, { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          productName: "TheBoysLauncher",
          version: "4.0.2",
          identifier: "com.theboys.launcher",
        },
        null,
        2,
      ) + "\n",
    );
    const setupName = "TheBoysLauncher_4.0.2_x64-setup.exe";
    writeFileSync(join(msiDir, "TheBoysLauncher_4.0.2_x64_en-US.msi"), "fake msi\n");
    writeFileSync(join(nsisDir, setupName), "fake setup\n");
    writeFileSync(join(nsisDir, `${setupName}.sig`), "actual-signature\n");
    writeFileSync(
      join(bundleRoot, "latest.json"),
      JSON.stringify(
        {
          channel: "stable",
          version: "4.0.2",
          notes: "mismatched signature manifest",
          pub_date: "2026-01-01T00:00:00.000Z",
          url: `https://github.com/dilllxd/theboyslauncher/releases/download/v4.0.2/${encodeURIComponent(setupName)}`,
          signature: "stale-signature",
        },
        null,
        2,
      ) + "\n",
    );

    const output = runExpectFailure("node", [verifyBundlesScript], {
      env: {
        THEBOYS_TAURI_CONFIG_PATH: configPath,
        THEBOYS_BUNDLE_ROOT: bundleRoot,
        THEBOYS_UPDATER_MANIFEST_NAME: "latest.json",
        THEBOYS_RELEASE_CHANNEL: "stable",
        GITHUB_REPOSITORY: "dilllxd/theboyslauncher",
      },
    });
    if (!output.includes("signature does not match")) {
      throw new Error(`bundle verifier failed for the wrong reason:\n${output}`);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function testBundleVerifierRejectsWrongManifestChannel() {
  const tempDir = mkdtempSync(join(tmpdir(), "tbl-tauri-wrong-channel-manifest-"));
  try {
    const configPath = join(tempDir, "tauri.conf.json");
    const bundleRoot = join(tempDir, "bundle");
    const msiDir = join(bundleRoot, "msi");
    const nsisDir = join(bundleRoot, "nsis");
    mkdirSync(msiDir, { recursive: true });
    mkdirSync(nsisDir, { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          productName: "TheBoysLauncher Dev",
          version: "4.0.2-3",
          identifier: "com.theboys.launcher.dev",
        },
        null,
        2,
      ) + "\n",
    );
    const setupName = "TheBoysLauncher Dev_4.0.2-3_x64-setup.exe";
    writeFileSync(join(msiDir, "TheBoysLauncher Dev_4.0.2-3_x64_en-US.msi"), "fake msi\n");
    writeFileSync(join(nsisDir, setupName), "fake setup\n");
    writeFileSync(join(nsisDir, `${setupName}.sig`), "fake-signature\n");
    writeFileSync(
      join(bundleRoot, "latest-dev.json"),
      JSON.stringify(
        {
          channel: "stable",
          version: "4.0.2-3",
          notes: "wrong channel manifest",
          pub_date: "2026-01-01T00:00:00.000Z",
          url: `https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/${encodeURIComponent(setupName)}`,
          signature: "fake-signature",
        },
        null,
        2,
      ) + "\n",
    );

    const output = runExpectFailure("node", [verifyBundlesScript], {
      env: {
        THEBOYS_TAURI_CONFIG_PATH: configPath,
        THEBOYS_BUNDLE_ROOT: bundleRoot,
        THEBOYS_UPDATER_MANIFEST_NAME: "latest-dev.json",
        GITHUB_REPOSITORY: "dilllxd/theboyslauncher",
      },
    });
    if (!output.includes("manifest channel stable does not match expected dev")) {
      throw new Error(`bundle verifier failed for the wrong reason:\n${output}`);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function testUpdaterManifestNameMustBeKnownChannel() {
  const tempDir = mkdtempSync(join(tmpdir(), "tbl-tauri-unknown-manifest-"));
  try {
    const configPath = join(tempDir, "tauri.conf.json");
    const bundleRoot = join(tempDir, "bundle");
    const nsisDir = join(bundleRoot, "nsis");
    mkdirSync(nsisDir, { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          productName: "TheBoysLauncher",
          version: "4.0.2",
          identifier: "com.theboys.launcher",
        },
        null,
        2,
      ) + "\n",
    );
    const setupName = "TheBoysLauncher_4.0.2_x64-setup.exe";
    writeFileSync(join(nsisDir, setupName), "fake setup\n");
    writeFileSync(join(nsisDir, `${setupName}.sig`), "fake-signature\n");

    const env = {
      THEBOYS_TAURI_CONFIG_PATH: configPath,
      THEBOYS_BUNDLE_ROOT: bundleRoot,
      THEBOYS_UPDATER_MANIFEST_NAME: "latest-beta.json",
      THEBOYS_RELEASE_CHANNEL: "stable",
      GITHUB_REPOSITORY: "dilllxd/theboyslauncher",
    };
    const generateOutput = runExpectFailure("node", [generateManifestScript], { env });
    if (!generateOutput.includes("must be latest.json or latest-dev.json")) {
      throw new Error(`manifest generator failed for the wrong reason:\n${generateOutput}`);
    }
    const verifyOutput = runExpectFailure("node", [verifyBundlesScript], { env });
    if (!verifyOutput.includes("must be latest.json or latest-dev.json")) {
      throw new Error(`bundle verifier failed for the wrong reason:\n${verifyOutput}`);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function testUpdaterManifestNameMustMatchChannel() {
  const tempDir = mkdtempSync(join(tmpdir(), "tbl-tauri-mismatched-manifest-"));
  try {
    const configPath = join(tempDir, "tauri.conf.json");
    const bundleRoot = join(tempDir, "bundle");
    const nsisDir = join(bundleRoot, "nsis");
    mkdirSync(nsisDir, { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          productName: "TheBoysLauncher",
          version: "4.0.2",
          identifier: "com.theboys.launcher",
        },
        null,
        2,
      ) + "\n",
    );
    const setupName = "TheBoysLauncher_4.0.2_x64-setup.exe";
    writeFileSync(join(nsisDir, setupName), "fake setup\n");
    writeFileSync(join(nsisDir, `${setupName}.sig`), "fake-signature\n");

    const env = {
      THEBOYS_TAURI_CONFIG_PATH: configPath,
      THEBOYS_BUNDLE_ROOT: bundleRoot,
      THEBOYS_UPDATER_MANIFEST_NAME: "latest-dev.json",
      THEBOYS_RELEASE_CHANNEL: "stable",
      GITHUB_REPOSITORY: "dilllxd/theboyslauncher",
    };
    const generateOutput = runExpectFailure("node", [generateManifestScript], { env });
    if (!generateOutput.includes("latest-dev.json does not match release channel stable")) {
      throw new Error(`manifest generator failed for the wrong reason:\n${generateOutput}`);
    }
    const verifyOutput = runExpectFailure("node", [verifyBundlesScript], { env });
    if (!verifyOutput.includes("latest-dev.json does not match release channel stable")) {
      throw new Error(`bundle verifier failed for the wrong reason:\n${verifyOutput}`);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function testFoundationWorkflowChecksManualReleaseTagBeforeTauriBuild() {
  const workflow = readFileSync(join(repoRoot, ".github", "workflows", "v4-foundation.yml"), "utf8");
  const guardIndex = workflow.indexOf("Verify manual release tag matches Tauri version");
  const buildIndex = workflow.indexOf("Build signed Tauri bundles");
  if (guardIndex === -1) {
    throw new Error("v4 foundation workflow must verify manual release tag/version before packaging");
  }
  if (buildIndex === -1 || guardIndex > buildIndex) {
    throw new Error("v4 foundation manual release tag guard must run before signed Tauri bundles are built");
  }
  if (
    !workflow.includes("Manual publish requires release_tag or a v* tag ref") ||
    !workflow.includes("does not match Tauri config version")
  ) {
    throw new Error("v4 foundation manual release tag guard must fail mismatched or missing publish tags clearly");
  }
}

function assertOfficialRepositoryGuardBeforeSetup(workflow, setupSearchStart, label) {
  const guardIndex = workflow.indexOf("Verify official release repository", setupSearchStart);
  const setupIndex = workflow.indexOf("Set up Node.js", setupSearchStart);
  const buildIndex = workflow.indexOf("Build signed Tauri bundles", setupSearchStart);
  if (guardIndex === -1) {
    throw new Error(`${label} workflow must verify the official release repository before packaging`);
  }
  if (!workflow.includes('$env:GITHUB_REPOSITORY -ne "dilllxd/theboyslauncher"')) {
    throw new Error(`${label} workflow must reject non-official repository release runs`);
  }
  if (!workflow.includes("Release packaging is only allowed from dilllxd/theboyslauncher")) {
    throw new Error(`${label} workflow must explain why non-official release runs are refused`);
  }
  if (setupIndex === -1 || guardIndex > setupIndex) {
    throw new Error(`${label} workflow must reject non-official release runs before Node setup`);
  }
  if (buildIndex !== -1 && guardIndex > buildIndex) {
    throw new Error(`${label} workflow must reject non-official release runs before signed Tauri bundles are built`);
  }
}

function testReleaseWorkflowsRejectNonOfficialRepositoriesEarly() {
  const releaseWorkflow = readFileSync(join(repoRoot, ".github", "workflows", "v4-release-channels.yml"), "utf8");
  assertOfficialRepositoryGuardBeforeSetup(releaseWorkflow, 0, "v4 release-channel");

  const foundationWorkflow = readFileSync(join(repoRoot, ".github", "workflows", "v4-foundation.yml"), "utf8");
  const packageJobIndex = foundationWorkflow.indexOf("package-windows:");
  if (packageJobIndex === -1) {
    throw new Error("v4 foundation workflow must keep the package-windows job");
  }
  assertOfficialRepositoryGuardBeforeSetup(foundationWorkflow, packageJobIndex, "v4 foundation package");
}

function testReleaseWorkflowKeepsEfficientRetryBehavior() {
  const workflow = readFileSync(join(repoRoot, ".github", "workflows", "v4-release-channels.yml"), "utf8");
  for (const token of [
    "group: v4-release-${{ github.event_name == 'workflow_dispatch' && inputs.channel || github.ref_name }}",
    "cancel-in-progress: ${{ github.event_name == 'push' && github.ref_name == 'dev' }}",
    "existing_sha=\"$(git rev-list -n 1 \"${{ needs.resolve.outputs.tag }}\")\"",
    "not ${GITHUB_SHA}",
    "continuing publish retry",
  ]) {
    if (!workflow.includes(token)) {
      throw new Error(`v4 release-channel workflow must keep efficient retry behavior; missing ${token}`);
    }
  }
}

function testReleaseWorkflowAvoidsDuplicateFrontendBuild() {
  const workflow = readFileSync(join(repoRoot, ".github", "workflows", "v4-release-channels.yml"), "utf8");
  const tauriConfig = readFileSync(join(repoRoot, "src-tauri", "tauri.conf.json"), "utf8");
  if (!tauriConfig.includes('"beforeBuildCommand": "npm run build"')) {
    throw new Error("Tauri config must own the release frontend build through beforeBuildCommand");
  }
  if (workflow.includes("name: Build frontend") || workflow.includes("run: npm run build")) {
    throw new Error("v4 release-channel workflow must not run a duplicate standalone frontend build before tauri:build");
  }
  if (!workflow.includes("run: npm run tauri:build")) {
    throw new Error("v4 release-channel workflow must still build signed Tauri bundles through npm run tauri:build");
  }
  if (!workflow.includes("VITE_THEBOYS_RELEASE_CHANNEL: ${{ needs.resolve.outputs.channel }}")) {
    throw new Error("signed Tauri build must receive the configured release channel env for its beforeBuildCommand");
  }
}

function assertPackagedSmokeBeforeBundleVerification(workflow, searchStart, label) {
  const buildIndex = workflow.indexOf("Build signed Tauri bundles", searchStart);
  const smokeIndex = workflow.indexOf("Smoke packaged executable", searchStart);
  const verifyIndex = workflow.indexOf("Verify Windows bundles", searchStart);
  if (buildIndex === -1 || smokeIndex === -1 || verifyIndex === -1) {
    throw new Error(`${label} workflow must build, smoke, and verify Windows bundles`);
  }
  if (!(buildIndex < smokeIndex && smokeIndex < verifyIndex)) {
    throw new Error(`${label} workflow must run packaged exe smoke after signed build and before bundle verification`);
  }
  const smokeRunIndex = workflow.indexOf("run: npm run smoke:packaged-exe", smokeIndex);
  if (smokeRunIndex === -1 || smokeRunIndex > verifyIndex) {
    throw new Error(`${label} workflow must run the packaged exe smoke before verifying bundles`);
  }
}

function testReleaseWorkflowsSmokePackagedExeBeforeBundleVerification() {
  const releaseWorkflow = readFileSync(join(repoRoot, ".github", "workflows", "v4-release-channels.yml"), "utf8");
  assertPackagedSmokeBeforeBundleVerification(releaseWorkflow, 0, "v4 release-channel");

  const foundationWorkflow = readFileSync(join(repoRoot, ".github", "workflows", "v4-foundation.yml"), "utf8");
  const packageJobIndex = foundationWorkflow.indexOf("package-windows:");
  if (packageJobIndex === -1) {
    throw new Error("v4 foundation workflow must keep the package-windows job");
  }
  assertPackagedSmokeBeforeBundleVerification(foundationWorkflow, packageJobIndex, "v4 foundation package");
}

function assertWorkflowPathFiltersCoverReleasePlumbing(workflow, label) {
  for (const token of [
    "scripts/clean-tauri-updater-artifacts.mjs",
    "scripts/preflight-v4-release.mjs",
    "scripts/smoke-packaged-exe.mjs",
    "scripts/test-release-channel-scripts.mjs",
    "scripts/verify-tauri-bundles.mjs",
  ]) {
    if (!workflow.includes(token)) {
      throw new Error(`${label} workflow path filters must include ${token}`);
    }
  }
}

function testReleaseWorkflowPathFiltersCoverReleasePlumbing() {
  const releaseWorkflow = readFileSync(join(repoRoot, ".github", "workflows", "v4-release-channels.yml"), "utf8");
  assertWorkflowPathFiltersCoverReleasePlumbing(releaseWorkflow, "v4 release-channel");

  const foundationWorkflow = readFileSync(join(repoRoot, ".github", "workflows", "v4-foundation.yml"), "utf8");
  assertWorkflowPathFiltersCoverReleasePlumbing(foundationWorkflow, "v4 foundation");

  const preflightSource = readFileSync(preflightScript, "utf8");
  if (!preflightSource.includes('"scripts/preflight-v4-release.mjs"')) {
    throw new Error("v4 release preflight must require its own script on the release branch");
  }
}

function testPackageResourceScriptsKeepBackendAliasesVerified() {
  const stageSource = readFileSync(join(repoRoot, "scripts", "stage-social-backend.mjs"), "utf8");
  for (const token of [
    "copyFileSync(source, destination);",
    "copyFileSync(source, alternateDestination);",
    'executableName.endsWith(".exe") ? "social-backend" : "social-backend.exe"',
    "process.env.CARGO_TARGET_DIR",
    "join(cargoTargetDir, profile, executableName)",
    "src-tauri/resources",
  ]) {
    if (!stageSource.includes(token)) {
      throw new Error(`stage-social-backend must stage both platform resource aliases from the selected build output; missing ${token}`);
    }
  }

  const verifierSource = readFileSync(join(repoRoot, "scripts", "verify-package-resources.mjs"), "utf8");
  for (const token of [
    "portable staged social-backend resource",
    "fileSha256(source)",
    "fileSha256(stagedPrimary)",
    "fileSha256(stagedPortable)",
    "primaryStats.size !== sourceStats.size",
    "portableStats.size !== sourceStats.size",
    "primarySha256 !== sourceSha256",
    "portableSha256 !== sourceSha256",
    'resources.includes("resources")',
    "Run npm run stage:social-backend",
  ]) {
    if (!verifierSource.includes(token)) {
      throw new Error(`verify-package-resources must reject stale or incomplete packaged backend resources; missing ${token}`);
    }
  }
}

function testTauriSecurityVerifierGuardsBackendConsoleSuppression() {
  const verifier = readFileSync(join(repoRoot, "scripts", "verify-tauri-security-config.mjs"), "utf8");
  for (const token of [
    "backend_start_command",
    "hide_backend_console_window(&mut command);",
    "std::os::windows::process::CommandExt",
    "CREATE_NO_WINDOW",
    "command.creation_flags(CREATE_NO_WINDOW);",
    "packaged friends-service process console window",
  ]) {
    if (!verifier.includes(token)) {
      throw new Error(`Tauri security verifier must guard packaged backend console suppression; missing ${token}`);
    }
  }
}

function testPackagedExeSmokeClearsAmbientDirectoryOverrides() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  for (const key of [
    "THEBOYS_LAUNCHER_DATA_DIR",
    "THEBOYS_LAUNCHER_CONFIG_DIR",
    "THEBOYS_LAUNCHER_CACHE_DIR",
    "THEBOYS_LAUNCHER_LOG_DIR",
    "THEBOYS_BACKEND_EXE",
    "THEBOYS_BACKEND_STATE_PATH",
    "THEBOYS_BACKEND_SESSION_SECRET",
  ]) {
    if (!smokeScript.includes(`"${key}"`) || !smokeScript.includes(`delete env[key]`)) {
      throw new Error(`packaged exe smoke must clear inherited ${key} before launching the exe`);
    }
  }
  if (!smokeScript.includes("THEBOYS_LAUNCHER_ROOT_DIR: rootPath")) {
    throw new Error("packaged exe smoke must set the isolated launcher root after copying process env");
  }
}

function testPackagedExeSmokeChecksCleanFirstRunDefaults() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  for (const key of ["lastPlayed", "resolution", "defaultServer", "javaRuntimeOverridePath"]) {
    if (!smokeScript.includes(`"${key}"`)) {
      throw new Error(`packaged exe smoke must verify first-run profile ${key} stays empty`);
    }
  }
  if (!smokeScript.includes("settings.javaRuntimeOverridePath")) {
    throw new Error("packaged exe smoke must verify first-run settings do not include a global Java override");
  }
  if (!smokeScript.includes("First-run profile must not add custom JVM arguments")) {
    throw new Error("packaged exe smoke must verify first-run profiles do not add custom JVM arguments");
  }
  if (!smokeScript.includes("assertExactJsonKeys(profile") || !smokeScript.includes("assertExactJsonKeys(settings")) {
    throw new Error("packaged exe smoke must reject unexpected first-run profile/settings JSON keys");
  }
}

function testPackagedExeSmokeChecksWindowsMetadata() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  for (const token of [
    "validateWindowsExeMetadata",
    "readWindowsExeVersionInfo",
    "ProductName",
    "ProductVersion",
    "FileDescription",
    "FileVersion",
    "Exe metadata:",
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must verify Windows executable metadata; missing ${token}`);
    }
  }
}

function testPackagedExeSmokeChecksProcessCleanup() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  for (const token of [
    "monitoredPackagedProcessNames",
    "launcherGameProcessNames",
    "ParentProcessId",
    "isSmokeOwnedGameProcess",
    "processDescendsFromPid",
    "processCommandReferencesPath",
    '"java.exe"',
    '"javaw.exe"',
    '"cmd.exe"',
    '"ping.exe"',
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must snapshot launcher/backend/game processes before and after the smoke; missing ${token}`);
    }
  }
  if (!smokeScript.includes("processSnapshotAfterClose")) {
    throw new Error("packaged exe smoke must inspect processes after closing the app");
  }
  if (!smokeScript.includes("left launcher process(es) running after close")) {
    throw new Error("packaged exe smoke must fail when the launcher remains running after close");
  }
  if (!smokeScript.includes("left local social-backend process(es) running after close")) {
    throw new Error("hosted-default packaged exe smoke must fail when a local social-backend remains running after close");
  }
  if (!smokeScript.includes("left game process(es) running after close")) {
    throw new Error("packaged exe smoke must fail when a game process remains running after close");
  }
  if (!smokeScript.includes("Process cleanup: no new launcher, local friends-service, or game processes")) {
    throw new Error("packaged exe smoke must report successful hosted-default process cleanup");
  }
  if (!smokeScript.includes("Local packaged smoke left social-backend process(es) running after close")) {
    throw new Error("local packaged exe smoke must fail when the packaged friends service remains running after close");
  }
}

function testPackagedExeSmokeSerializesRuns() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  for (const token of [
    "smokeRunLockPath",
    "acquireSmokeRunLock(options)",
    "Another packaged exe smoke is already running",
    "Run packaged exe smokes serially",
    "processIsAlive",
    "releaseSmokeRunLock",
    'process.on("exit", releaseSmokeRunLock)',
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must serialize runs before process cleanup checks; missing ${token}`);
    }
  }
}

function testPackagedExeSmokeCleansUpOnSignals() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  for (const token of [
    "activePackagedProcessPid",
    "terminateSmokeFromSignal",
    "SIGINT",
    "SIGTERM",
    "closeProcessSync(activePackagedProcessPid)",
    "taskkill.exe /PID $p.Id /T /F",
    "cleaned up active packaged process",
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must close the release exe when interrupted; missing ${token}`);
    }
  }
}

function testPackagedExeSmokeRequiresDefaultAdjacentBackendBuild() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  if (!smokeScript.includes("requiresAdjacentBuild") || !smokeScript.includes("default packaged smoke")) {
    throw new Error("default packaged exe smoke must require an adjacent release social-backend build");
  }
  if (!smokeScript.includes("Friends-service adjacent release build matched:")) {
    throw new Error("packaged exe smoke must report whether the adjacent release backend matched");
  }
}

function testPackagedExeSmokeChecksDefaultFrontendFreshness() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  for (const token of [
    "validateDefaultFrontendBuildFreshness",
    "nativeFreshnessSourcePaths",
    "nativeFreshnessSourceDirectories",
    "assertExecutableNewerThanSources",
    "frontendDistPath",
    "frontendFreshnessSourcePaths",
    "frontend/dist is older than frontend source",
    "Default packaged exe is older than frontend/dist",
    "is older than source",
    "Run npm run tauri:build before smoke:packaged-exe",
    "Frontend dist freshness:",
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must reject stale default frontend packaging; missing ${token}`);
    }
  }
}

function testPackagedExeSmokeChecksNoSevereStartupLogs() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  for (const token of [
    "validateNoSevereStartupLogs",
    "validateNoSevereFullRunLogs",
    "captureProcessOutput",
    'stdio: ["ignore", "pipe", "pipe"]',
    "validateNoSevereProcessOutput",
    "theboysSmokeClosed",
    'child.once("close"',
    "Packaged exe did not close cleanly",
    "Packaged startup wrote severe log output",
    "Packaged full run wrote severe log output",
    "Packaged startup wrote severe process output",
    "Severe startup logs: none",
    "Severe process output: none",
    "Full-run process output: clean",
    "Full-run launcher logs: clean",
    "panicked at",
    "unhandled",
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must reject severe startup log output; missing ${token}`);
    }
  }
  const waitIndex = smokeScript.indexOf("await waitForExit(child, 5000)");
  const fullRunOutputIndex = smokeScript.indexOf("const fullRunProcessOutputLines = validateNoSevereProcessOutput(processOutput)");
  const fullRunLogsIndex = smokeScript.indexOf("const fullRunLogFiles = validateNoSevereFullRunLogs(options.rootPath)");
  if (waitIndex === -1 || fullRunOutputIndex === -1 || fullRunOutputIndex < waitIndex) {
    throw new Error("packaged exe smoke must validate captured process output again after the release exe has closed");
  }
  if (fullRunLogsIndex === -1 || fullRunLogsIndex < waitIndex) {
    throw new Error("packaged exe smoke must validate launcher logs again after the release exe has closed");
  }
}

function testPackagedExeSmokeChecksNoFirstRunMinecraftAuthState() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  for (const file of ["config/minecraft-session.json", "config/minecraft-accounts.json"]) {
    if (!smokeScript.includes(`"${file}"`)) {
      throw new Error(`packaged exe smoke must verify first-run does not create ${file}`);
    }
  }
  if (!smokeScript.includes("validateFirstRunDidNotCreateMinecraftAuthState")) {
    throw new Error("packaged exe smoke must validate that first-run auth state is absent");
  }
  if (!smokeScript.includes("Minecraft account state created: no")) {
    throw new Error("packaged exe smoke must report that first-run account state was not created");
  }
}

function testPackagedExeSmokeChecksMicrosoftAuthFlowProbe() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  const tauriSource = readFileSync(join(repoRoot, "src-tauri", "src", "lib.rs"), "utf8");
  for (const token of [
    "THEBOYS_PACKAGED_SMOKE_AUTH_FLOW",
    "validatePackagedAuthFlowProbe",
    "packaged-auth-flow-smoke.json",
    "DEFAULT_MICROSOFT_CLIENT_ID",
    "THEBOYS_MICROSOFT_CLIENT_ID",
    "https://login.live.com",
    "oauth20_authorize.srf",
    "XboxLive.signin offline_access",
    "code_challenge_method",
    "Microsoft auth flow:",
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must verify packaged Microsoft auth flow; missing ${token}`);
    }
  }
  for (const token of [
    "PACKAGED_SMOKE_AUTH_FLOW_ENV",
    "PACKAGED_SMOKE_AUTH_FLOW_FILE",
    "write_packaged_smoke_auth_flow_probe",
    "core_start_microsoft_auth_flow",
    "serde_json::json!",
  ]) {
    if (!tauriSource.includes(token)) {
      throw new Error(`Tauri app must expose a packaged Microsoft auth-flow smoke probe; missing ${token}`);
    }
  }
}

function testPackagedExeSmokeChecksAccountLifecycleProbe() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  const tauriSource = readFileSync(join(repoRoot, "src-tauri", "src", "lib.rs"), "utf8");
  for (const token of [
    "THEBOYS_PACKAGED_SMOKE_ACCOUNT_LIFECYCLE",
    "validatePackagedAccountLifecycleProbe",
    "packaged-account-lifecycle-smoke.json",
    "packaged-smoke-account-one",
    "packaged-smoke-account-two",
    "rawSecretsAbsent",
    "storedSecretsProtected",
    "sessionAccessTokenProtected",
    "sessionRefreshTokenProtected",
    "accountSecretFieldsProtected",
    "sessionStateRemoved",
    "accountStateRemoved",
    "Account lifecycle:",
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must verify account save/switch/remove lifecycle; missing ${token}`);
    }
  }
  for (const token of [
    "PACKAGED_SMOKE_ACCOUNT_LIFECYCLE_ENV",
    "PACKAGED_SMOKE_ACCOUNT_LIFECYCLE_FILE",
    "write_packaged_smoke_account_lifecycle_probe",
    "cleanup_packaged_smoke_accounts",
    "core_save_minecraft_session",
    "core_list_minecraft_accounts",
    "core_select_minecraft_account",
    "core_remove_minecraft_account",
    "raw Minecraft auth secrets on disk",
    "DPAPI-protect stored Minecraft auth secrets",
    "SmokeOne",
    "SmokeTwo",
    "left account state files behind",
  ]) {
    if (!tauriSource.includes(token)) {
      throw new Error(`Tauri app must expose a packaged account lifecycle smoke probe; missing ${token}`);
    }
  }
}

function testPackagedExeSmokeChecksAuthRecoveryProbe() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  const tauriSource = readFileSync(join(repoRoot, "src-tauri", "src", "lib.rs"), "utf8");
  for (const token of [
    "THEBOYS_PACKAGED_SMOKE_AUTH_RECOVERY",
    "validatePackagedAuthRecoveryProbe",
    "packaged-auth-recovery-smoke.json",
    "packaged-smoke-expired-account",
    "expired-smoke-access-token-do-not-write",
    "does not include a Microsoft refresh token",
    "rawSecretAbsent",
    "stateRemoved",
    "managedProcessStarted",
    "Auth recovery:",
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must verify expired stored-session recovery; missing ${token}`);
    }
  }
  for (const token of [
    "PACKAGED_SMOKE_AUTH_RECOVERY_ENV",
    "PACKAGED_SMOKE_AUTH_RECOVERY_FILE",
    "write_packaged_smoke_auth_recovery_probe",
    "load_or_refresh_stored_minecraft_session",
    "packaged-smoke-expired-account",
    "expired-smoke-access-token-do-not-write",
    "rawSecretAbsent",
    "managedProcessStarted",
    "stateRemoved",
  ]) {
    if (!tauriSource.includes(token)) {
      throw new Error(`Tauri app must expose a packaged expired-session recovery smoke probe; missing ${token}`);
    }
  }
}

function testNativeAuthAndFriendsErrorsStayPlayerFacing() {
  const tauriSource = readFileSync(join(repoRoot, "src-tauri", "src", "lib.rs"), "utf8");
  for (const token of [
    "renderer_safe_minecraft_session_error",
    "renderer_safe_friends_session_error",
    "load_or_refresh_stored_minecraft_session_for_launch",
    "load_or_refresh_stored_minecraft_session_for_friends",
    "Minecraft sign-in needs to be refreshed. Sign in again to continue.",
    "Sign in to use friends.",
    "Friends service sign-in is unavailable right now. Minecraft still works.",
    "stored_session_launch_refresh_failure_records_safe_activity_message",
    "renderer_safe_friends_session_error_hides_backend_details",
  ]) {
    if (!tauriSource.includes(token)) {
      throw new Error(`native auth/friends errors must stay player-facing; missing ${token}`);
    }
  }
}

function testPackagedExeSmokeChecksStoredAuthLaunchProbe() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  const tauriSource = readFileSync(join(repoRoot, "src-tauri", "src", "lib.rs"), "utf8");
  for (const token of [
    "THEBOYS_PACKAGED_SMOKE_STORED_AUTH_LAUNCH",
    "validatePackagedStoredAuthLaunchProbe",
    "packaged-stored-auth-launch-smoke.json",
    "packaged-smoke-stored-auth-account",
    "StoredSmoke",
    "stored-auth.theboys.example",
    "accessTokenAbsentFromCommand",
    "refreshTokenAbsentFromCommand",
    "managedProcessStarted",
    "lastPlayedMarked",
    "launchEventCount",
    "started/stopped",
    "Stored auth launch:",
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must verify stored authenticated launch preflight; missing ${token}`);
    }
  }
  for (const token of [
    "PACKAGED_SMOKE_STORED_AUTH_LAUNCH_ENV",
    "PACKAGED_SMOKE_STORED_AUTH_LAUNCH_FILE",
    "write_packaged_smoke_stored_auth_launch_probe",
    "core_build_stored_authenticated_launch_plan",
    "load_or_refresh_stored_minecraft_session_for_launch",
    "packaged-smoke-stored-auth-account",
    "stored-smoke-access-token-do-not-write",
    "stored-smoke-refresh-token-do-not-write",
    "stored-auth.theboys.example",
    "rawSecretsAbsent",
    "storedSecretsProtected",
    "start_managed_launch_plan",
    "write_packaged_smoke_long_running_java",
    "active_managed_process_summary",
    "registry.stop",
    "registry.clear_exited",
    "lastPlayedMarked",
    "launchEventCount",
    "profileDataRemoved",
  ]) {
    if (!tauriSource.includes(token)) {
      throw new Error(`Tauri app must expose a packaged stored-auth launch smoke probe; missing ${token}`);
    }
  }
}

function testPackagedExeSmokeChecksModrinthArchiveInstallProbe() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  const tauriSource = readFileSync(join(repoRoot, "src-tauri", "src", "lib.rs"), "utf8");
  for (const token of [
    "THEBOYS_PACKAGED_SMOKE_MODRINTH_ARCHIVE_INSTALL",
    "validatePackagedModrinthArchiveInstallProbe",
    "packaged-modrinth-archive-install-smoke.json",
    "packaged-smoke-modrinth",
    "Packaged Smoke Modrinth",
    "overrideExtracted",
    "serverOverrideSkipped",
    "archiveRemoved",
    "Modrinth archive install:",
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must verify Modrinth archive install; missing ${token}`);
    }
  }
  for (const token of [
    "PACKAGED_SMOKE_MODRINTH_ARCHIVE_INSTALL_ENV",
    "PACKAGED_SMOKE_MODRINTH_ARCHIVE_INSTALL_FILE",
    "write_packaged_smoke_modrinth_archive_install_probe",
    "write_packaged_smoke_modrinth_archive",
    "write_stored_zip_archive",
    "core_build_modrinth_modpack_archive_install_plan",
    "core_extract_modrinth_modpack_archive",
    "core_persist_installed_pack_profile",
    "PackagedSmokeModrinth.mrpack",
    "modrinth.index.json",
    "client-overrides/options.txt",
    "server-overrides/server.properties",
    "archiveRemoved",
  ]) {
    if (!tauriSource.includes(token)) {
      throw new Error(`Tauri app must expose a packaged Modrinth archive install smoke probe; missing ${token}`);
    }
  }
}

function testPackagedExeSmokeChecksCurseForgeArchiveInstallProbe() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  const tauriSource = readFileSync(join(repoRoot, "src-tauri", "src", "lib.rs"), "utf8");
  for (const token of [
    "THEBOYS_PACKAGED_SMOKE_CURSEFORGE_ARCHIVE_INSTALL",
    "validatePackagedCurseForgeArchiveInstallProbe",
    "packaged-curseforge-archive-install-smoke.json",
    "packaged-smoke-curseforge",
    "Packaged Smoke CurseForge",
    "nestedOverrideExtracted",
    "metadataStored",
    "archiveRemoved",
    "CurseForge archive install:",
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must verify CurseForge archive install; missing ${token}`);
    }
  }
  for (const token of [
    "PACKAGED_SMOKE_CURSEFORGE_ARCHIVE_INSTALL_ENV",
    "PACKAGED_SMOKE_CURSEFORGE_ARCHIVE_INSTALL_FILE",
    "write_packaged_smoke_curseforge_archive_install_probe",
    "write_packaged_smoke_curseforge_archive",
    "write_stored_zip_archive",
    "core_build_curseforge_modpack_archive_install_plan",
    "core_extract_curseforge_modpack_archive",
    "core_persist_installed_pack_profile",
    "PackagedSmokeCurseForge.zip",
    "manifest.json",
    "overrides/config/packaged.cfg",
    ".theboys/curseforge/manifest.json",
    "archiveRemoved",
  ]) {
    if (!tauriSource.includes(token)) {
      throw new Error(`Tauri app must expose a packaged CurseForge archive install smoke probe; missing ${token}`);
    }
  }
}

function testPackagedExeSmokeChecksFtbLegacyArchiveInstallProbe() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  const tauriSource = readFileSync(join(repoRoot, "src-tauri", "src", "lib.rs"), "utf8");
  for (const token of [
    "THEBOYS_PACKAGED_SMOKE_FTB_LEGACY_ARCHIVE_INSTALL",
    "validatePackagedFtbLegacyArchiveInstallProbe",
    "packaged-ftb-legacy-archive-install-smoke.json",
    "ftb-legacy-packaged-smoke-ftb-legacy",
    "Packaged Smoke FTB Legacy",
    "loaderVersion",
    "packJsonExtracted",
    "scriptExtracted",
    "archiveRemoved",
    "FTB Legacy archive install:",
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must verify FTB Legacy archive install; missing ${token}`);
    }
  }
  for (const token of [
    "PACKAGED_SMOKE_FTB_LEGACY_ARCHIVE_INSTALL_ENV",
    "PACKAGED_SMOKE_FTB_LEGACY_ARCHIVE_INSTALL_FILE",
    "write_packaged_smoke_ftb_legacy_archive_install_probe",
    "write_packaged_smoke_ftb_legacy_archive",
    "FtbLegacyModpackDownloadPlan",
    "core_build_ftb_legacy_modpack_archive_install_plan",
    "core_extract_ftb_legacy_modpack_archive",
    "core_persist_installed_pack_profile",
    "PackagedSmokeFTBLegacy.zip",
    "minecraft/pack.json",
    "minecraft/config/packaged.cfg",
    "net.minecraftforge:forge:1.12.2-14.23.5.2860",
    "archiveRemoved",
  ]) {
    if (!tauriSource.includes(token)) {
      throw new Error(`Tauri app must expose a packaged FTB Legacy archive install smoke probe; missing ${token}`);
    }
  }
}

function testPackagedExeSmokeChecksFtbInstallProbe() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  const tauriSource = readFileSync(join(repoRoot, "src-tauri", "src", "lib.rs"), "utf8");
  const coreSource = readFileSync(join(repoRoot, "crates", "launcher-core", "src", "lib.rs"), "utf8");
  for (const token of [
    "THEBOYS_PACKAGED_SMOKE_FTB_INSTALL",
    "validatePackagedFtbInstallProbe",
    "packaged-ftb-install-smoke.json",
    "ftb-424242",
    "Packaged Smoke FTB",
    "Neoforge",
    "fileDownloadCount",
    "serverOnlySkipped",
    "optionalSkipped",
    "stagedFilesRemoved",
    "FTB install:",
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must verify FTB install; missing ${token}`);
    }
  }
  for (const token of [
    "PACKAGED_SMOKE_FTB_INSTALL_ENV",
    "PACKAGED_SMOKE_FTB_INSTALL_FILE",
    "write_packaged_smoke_ftb_install_probe",
    "write_packaged_smoke_ftb_planned_files",
    "packaged_smoke_ftb_version_json",
    "core_build_ftb_modpack_install_plan_from_version_json",
    "core_persist_installed_pack_profile",
    "config/CoroUtil",
    "General.toml",
    "21.1.51",
    "stagedFilesRemoved",
  ]) {
    if (!tauriSource.includes(token)) {
      throw new Error(`Tauri app must expose a packaged FTB install smoke probe; missing ${token}`);
    }
  }
  for (const token of [
    "build_ftb_modpack_install_plan_from_version_json",
    "ftb_install_plan_from_version_json",
    "FtbModpackInstallPlan",
  ]) {
    if (!coreSource.includes(token)) {
      throw new Error(`launcher-core must expose deterministic FTB install planning; missing ${token}`);
    }
  }
}

function testPackagedExeSmokeChecksTechnicArchiveInstallProbe() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  const tauriSource = readFileSync(join(repoRoot, "src-tauri", "src", "lib.rs"), "utf8");
  for (const token of [
    "THEBOYS_PACKAGED_SMOKE_TECHNIC_ARCHIVE_INSTALL",
    "validatePackagedTechnicArchiveInstallProbe",
    "packaged-technic-archive-install-smoke.json",
    "technic-packaged-smoke-technic",
    "Packaged Smoke Technic",
    "loaderVersion",
    "versionJsonExtracted",
    "modExtracted",
    "archiveRemoved",
    "Technic archive install:",
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must verify Technic archive install; missing ${token}`);
    }
  }
  for (const token of [
    "PACKAGED_SMOKE_TECHNIC_ARCHIVE_INSTALL_ENV",
    "PACKAGED_SMOKE_TECHNIC_ARCHIVE_INSTALL_FILE",
    "write_packaged_smoke_technic_archive_install_probe",
    "write_packaged_smoke_technic_archive",
    "TechnicModpackDownloadPlan",
    "TechnicModpackDownloadKind::DirectZip",
    "core_build_technic_modpack_archive_install_plan",
    "core_extract_technic_modpack_archive",
    "core_persist_installed_pack_profile",
    "PackagedSmokeTechnic.zip",
    "bin/version.json",
    "mods/example.jar",
    "net.minecraftforge:forge:1.12.2-14.23.5.2860",
    "archiveRemoved",
  ]) {
    if (!tauriSource.includes(token)) {
      throw new Error(`Tauri app must expose a packaged Technic archive install smoke probe; missing ${token}`);
    }
  }
}

function testPackagedExeSmokeChecksAtlauncherInstallProbe() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  const tauriSource = readFileSync(join(repoRoot, "src-tauri", "src", "lib.rs"), "utf8");
  const coreSource = readFileSync(join(repoRoot, "crates", "launcher-core", "src", "lib.rs"), "utf8");
  for (const token of [
    "THEBOYS_PACKAGED_SMOKE_ATLAUNCHER_INSTALL",
    "validatePackagedAtlauncherInstallProbe",
    "packaged-atlauncher-install-smoke.json",
    "atlauncher-packagedsmokeatlauncher",
    "Packaged Smoke ATLauncher",
    "fileDownloadCount",
    "extractArchiveCount",
    "serverOnlySkipped",
    "stagedFilesRemoved",
    "ATLauncher install:",
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must verify ATLauncher install; missing ${token}`);
    }
  }
  for (const token of [
    "PACKAGED_SMOKE_ATLAUNCHER_INSTALL_ENV",
    "PACKAGED_SMOKE_ATLAUNCHER_INSTALL_FILE",
    "write_packaged_smoke_atlauncher_install_probe",
    "write_packaged_smoke_atlauncher_planned_files",
    "packaged_smoke_atlauncher_config_json",
    "core_build_atlauncher_modpack_install_plan_from_config_json",
    "core_extract_atlauncher_archives",
    "core_persist_installed_pack_profile",
    "PackagedSmokeATLauncher",
    "client-scripts.zip",
    "example.jar",
    "14.23.5.2860",
    "stagedFilesRemoved",
  ]) {
    if (!tauriSource.includes(token)) {
      throw new Error(`Tauri app must expose a packaged ATLauncher install smoke probe; missing ${token}`);
    }
  }
  for (const token of [
    "build_atlauncher_modpack_install_plan_from_config_json",
    "atlauncher_install_plan_from_config_json",
    "AtlauncherModpackInstallPlan",
  ]) {
    if (!coreSource.includes(token)) {
      throw new Error(`launcher-core must expose deterministic ATLauncher install planning; missing ${token}`);
    }
  }
}

function testPackagedExeSmokeChecksActivityProgressProbe() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  const tauriSource = readFileSync(join(repoRoot, "src-tauri", "src", "lib.rs"), "utf8");
  const coreSource = readFileSync(join(repoRoot, "crates", "launcher-core", "src", "lib.rs"), "utf8");
  for (const token of [
    "THEBOYS_PACKAGED_SMOKE_ACTIVITY_PROGRESS",
    "validatePackagedActivityProgressProbe",
    "packaged-activity-progress-smoke.json",
    "Downloading Minecraft client",
    "Minecraft assets ready",
    "Downloading mod loader files",
    "rawInternalTermsAbsent",
    "Activity progress:",
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must verify Activity file-progress wording; missing ${token}`);
    }
  }
  for (const token of [
    "PACKAGED_SMOKE_ACTIVITY_PROGRESS_ENV",
    "PACKAGED_SMOKE_ACTIVITY_PROGRESS_FILE",
    "write_packaged_smoke_activity_progress_probe",
    "execute_download_plan_recording_events",
    "packaged-activity-progress",
    "rawInternalTermsAbsent",
    "leaked internal download wording",
  ]) {
    if (!tauriSource.includes(token)) {
      throw new Error(`Tauri app must expose a packaged Activity progress smoke probe; missing ${token}`);
    }
  }
  for (const token of [
    "player_facing_launcher_event",
    "player_facing_download_event_message",
    "download_event_category",
    "Files are ready.",
    "Minecraft client",
    "mod loader files",
  ]) {
    if (!coreSource.includes(token)) {
      throw new Error(`launcher-core event log must store player-facing download progress; missing ${token}`);
    }
  }
}

function testPackagedExeSmokeChecksJavaRecoveryProbe() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  const tauriSource = readFileSync(join(repoRoot, "src-tauri", "src", "lib.rs"), "utf8");
  for (const token of [
    "THEBOYS_PACKAGED_SMOKE_JAVA_RECOVERY",
    "THEBOYS_JAVA_RUNTIME_MANIFEST_URL",
    "validatePackagedJavaRecoveryProbe",
    "packaged-java-recovery-smoke.json",
    "temurin-8-windows-x64",
    "temurin-17-windows-x64",
    "temurin-21-windows-x64",
    "temurin-25-windows-x64",
    "manualOverrideFailuresRecoverable",
    "downloadPlansTargetManagedRuntimes",
    "Java recovery:",
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must verify automatic Java recovery selection; missing ${token}`);
    }
  }
  for (const token of [
    "PACKAGED_SMOKE_JAVA_RECOVERY_ENV",
    "PACKAGED_SMOKE_JAVA_RECOVERY_FILE",
    "write_packaged_smoke_java_recovery_probe",
    "core_recommended_java_runtime_manifest",
    "core_required_java_major_for_minecraft",
    "recommended_java_entry_for_requirement",
    "core_build_managed_java_runtime_download_plan",
    "launch_failure_recoverable_managed_java",
    "manual Java override failures",
  ]) {
    if (!tauriSource.includes(token)) {
      throw new Error(`Tauri app must expose a packaged Java recovery smoke probe; missing ${token}`);
    }
  }
}

function testPackagedExeSmokeChecksDiscoverRoutingProbe() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  const tauriSource = readFileSync(join(repoRoot, "src-tauri", "src", "lib.rs"), "utf8");
  const coreSource = readFileSync(join(repoRoot, "crates", "launcher-core", "src", "lib.rs"), "utf8");
  for (const token of [
    "THEBOYS_PACKAGED_SMOKE_DISCOVER_ROUTING",
    "validatePackagedDiscoverRoutingProbe",
    "packaged-discover-routing-smoke.json",
    "curseforge_flame",
    "modrinth_prism",
    "ftb_private_prism",
    "nativeInstallProviders",
    "Discover routing:",
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must verify Discover provider routing; missing ${token}`);
    }
  }
  for (const token of [
    "PACKAGED_SMOKE_DISCOVER_ROUTING_ENV",
    "PACKAGED_SMOKE_DISCOVER_ROUTING_FILE",
    "write_packaged_smoke_discover_routing_probe",
    "core_search_discover_modpacks",
    "prismlauncher://install?platform=ftb-private&code=familycode",
    "allSourcesShortCircuited",
  ]) {
    if (!tauriSource.includes(token)) {
      throw new Error(`Tauri app must expose a packaged Discover routing smoke probe; missing ${token}`);
    }
  }
  for (const token of [
    "discover_launcher_install_result_from_url",
    "query_param_value",
    "prismlauncher",
    "multimc",
    "ftb-private",
    "familycode",
  ]) {
    if (!coreSource.includes(token)) {
      throw new Error(`launcher-core must parse pasted launcher Discover links natively; missing ${token}`);
    }
  }
}

function testPackagedExeSmokeChecksProfileLifecycleProbe() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  const tauriSource = readFileSync(join(repoRoot, "src-tauri", "src", "lib.rs"), "utf8");
  for (const token of [
    "THEBOYS_PACKAGED_SMOKE_PROFILE_LIFECYCLE",
    "validatePackagedProfileLifecycleProbe",
    "packaged-profile-lifecycle-smoke.json",
    "Packaged Smoke Profile Updated",
    "Packaged Smoke Profile Copy",
    "Profile lifecycle:",
    "duplicatedProfileDataCopied",
    "createdProfileDataRemoved",
    "duplicatedProfileDataRemoved",
    "sharedCacheRetained",
    "sharedCacheFiles",
    "shared cache retained",
    "remainingProfileIds",
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must verify profile create/update/duplicate/delete lifecycle; missing ${token}`);
    }
  }
  for (const token of [
    "PACKAGED_SMOKE_PROFILE_LIFECYCLE_ENV",
    "PACKAGED_SMOKE_PROFILE_LIFECYCLE_FILE",
    "write_packaged_smoke_profile_lifecycle_probe",
    "core_create_profile",
    "core_update_profile",
    "core_duplicate_profile",
    "core_delete_profile",
    "profile-owned packaged smoke file",
    "shared cache packaged smoke file",
    "shared_cache_retained",
  ]) {
    if (!tauriSource.includes(token)) {
      throw new Error(`Tauri app must expose a packaged profile lifecycle smoke probe; missing ${token}`);
    }
  }
}

function testPackagedExeSmokeChecksImportLifecycleProbe() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  const tauriSource = readFileSync(join(repoRoot, "src-tauri", "src", "lib.rs"), "utf8");
  for (const token of [
    "THEBOYS_PACKAGED_SMOKE_IMPORT_LIFECYCLE",
    "validatePackagedImportLifecycleProbe",
    "packaged-import-lifecycle-smoke.json",
    "packaged-import-smoke-source",
    "Packaged Smoke Import",
    "Import lifecycle:",
    "import_profile",
    "destinationRemoved",
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must verify import plan/execute/delete lifecycle; missing ${token}`);
    }
  }
  for (const token of [
    "PACKAGED_SMOKE_IMPORT_LIFECYCLE_ENV",
    "PACKAGED_SMOKE_IMPORT_LIFECYCLE_FILE",
    "write_packaged_smoke_import_lifecycle_probe",
    "core_plan_profile_import",
    "core_execute_import_plan_and_persist_profile",
    "core_delete_profile",
    "packaged-import-smoke-source",
    "left imported profile files behind",
  ]) {
    if (!tauriSource.includes(token)) {
      throw new Error(`Tauri app must expose a packaged import lifecycle smoke probe; missing ${token}`);
    }
  }
}

function testPackagedExeSmokeChecksPackwizInstallProbe() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  const tauriSource = readFileSync(join(repoRoot, "src-tauri", "src", "lib.rs"), "utf8");
  for (const token of [
    "THEBOYS_PACKAGED_SMOKE_PACKWIZ_INSTALL",
    "validatePackagedPackwizInstallProbe",
    "packaged-packwiz-install-smoke.json",
    "packaged-smoke-packwiz",
    "Packaged Smoke Packwiz",
    "auxiliaryItemCount",
    "metafileResolved",
    "serverOnlySkipped",
    "Packwiz install:",
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must verify packwiz install; missing ${token}`);
    }
  }
  for (const token of [
    "PACKAGED_SMOKE_PACKWIZ_INSTALL_ENV",
    "PACKAGED_SMOKE_PACKWIZ_INSTALL_FILE",
    "write_packaged_smoke_packwiz_install_probe",
    "core_fetch_pack_install_profile_from_catalog_entry",
    "core_fetch_install_auxiliary_download_plan_for_catalog_entry_profile",
    "execute_direct_pack_files_from_auxiliary_plan",
    "core_persist_installed_pack_profile",
    "packwiz:1.1.0",
    "mods/smoke-mod.pw.toml",
    "mods/server-only.pw.toml",
    "server-only jar",
    "profileDataRemoved",
  ]) {
    if (!tauriSource.includes(token)) {
      throw new Error(`Tauri app must expose a packaged packwiz install smoke probe; missing ${token}`);
    }
  }
}

function testPackagedExeSmokeChecksUpdateHandoffProbe() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  const tauriSource = readFileSync(join(repoRoot, "src-tauri", "src", "lib.rs"), "utf8");
  for (const token of [
    "THEBOYS_PACKAGED_SMOKE_UPDATE_HANDOFF",
    "validatePackagedUpdateHandoffProbe",
    "packaged-update-handoff-smoke.json",
    "TheBoysLauncher_4.0.2_x64-setup.exe",
    "TheBoysLauncher%20Dev_4.0.2-1_x64-setup.exe",
    "manifest_asset",
    "lookalike_owner",
    "decorated_query",
    "Update handoff:",
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must verify trusted update-installer handoff; missing ${token}`);
    }
  }
  for (const token of [
    "PACKAGED_SMOKE_UPDATE_HANDOFF_ENV",
    "PACKAGED_SMOKE_UPDATE_HANDOFF_FILE",
    "write_packaged_smoke_update_handoff_probe",
    "validate_external_download_url",
    "mismatched_stable_version",
  ]) {
    if (!tauriSource.includes(token)) {
      throw new Error(`Tauri app must expose a packaged update handoff smoke probe; missing ${token}`);
    }
  }
}

function testPackagedExeSmokeChecksLaunchPreflightProbe() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  const tauriSource = readFileSync(join(repoRoot, "src-tauri", "src", "lib.rs"), "utf8");
  for (const token of [
    "THEBOYS_PACKAGED_SMOKE_LAUNCH_PREFLIGHT",
    "validatePackagedLaunchPreflightProbe",
    "packaged-launch-preflight-smoke.json",
    "packaged-smoke-launch",
    "packaged-launch-preflight-java",
    "com.example.minecraft.Main",
    "accessTokenRedacted",
    "authenticatedAccessTokenRedacted",
    "authenticatedUsername",
    "auth.theboys.example",
    "offline/auth commands built",
    "profileDataRemoved",
    "Launch preflight:",
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must verify native launch-command preflight; missing ${token}`);
    }
  }
  for (const token of [
    "PACKAGED_SMOKE_LAUNCH_PREFLIGHT_ENV",
    "PACKAGED_SMOKE_LAUNCH_PREFLIGHT_FILE",
    "write_packaged_smoke_launch_preflight_probe",
    "build_packaged_smoke_launch_preflight_payload",
    "core_build_offline_launch_plan",
    "core_build_authenticated_launch_plan",
    "core_build_process_command_spec",
    "renderer_safe_process_command_spec",
    "SmokePlayer",
    "authStateFilesPresent",
    "left profile files behind",
    "PACKAGED_SMOKE_VERSION_JSON",
  ]) {
    if (!tauriSource.includes(token)) {
      throw new Error(`Tauri app must expose a packaged launch preflight smoke probe; missing ${token}`);
    }
  }
}

function testPackagedExeSmokeChecksProcessLifecycleProbe() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  const tauriSource = readFileSync(join(repoRoot, "src-tauri", "src", "lib.rs"), "utf8");
  for (const token of [
    "THEBOYS_PACKAGED_SMOKE_PROCESS_LIFECYCLE",
    "validatePackagedProcessLifecycleProbe",
    "packaged-process-lifecycle-smoke.json",
    "reusedExistingProcess",
    "relaunchCreatedNewProcess",
    "lastPlayedMarked",
    "Process lifecycle:",
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must verify native process lifecycle; missing ${token}`);
    }
  }
  for (const token of [
    "PACKAGED_SMOKE_PROCESS_LIFECYCLE_ENV",
    "PACKAGED_SMOKE_PROCESS_LIFECYCLE_FILE",
    "write_packaged_smoke_process_lifecycle_probe",
    "start_managed_launch_plan",
    "active_managed_process_summary",
    "registry.stop",
    "registry.clear_exited",
    "Packaged Smoke Process",
    "packaged-process-lifecycle-java",
    "packaged smoke process started",
  ]) {
    if (!tauriSource.includes(token)) {
      throw new Error(`Tauri app must expose a packaged process lifecycle smoke probe; missing ${token}`);
    }
  }
}

function testPackagedExeSmokeChecksLocalBackendMode() {
  const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  const tauriSource = readFileSync(join(repoRoot, "src-tauri", "src", "lib.rs"), "utf8");
  const frontendSource = readFileSync(join(repoRoot, "frontend", "src", "recovered-main-bundle.js"), "utf8");
  if (packageJson.scripts?.["smoke:packaged-exe:local"] !== "node scripts/smoke-packaged-exe.mjs --backend local --root target/packaged-exe-smoke/local-mode") {
    throw new Error("package.json must expose a local packaged exe smoke script");
  }
  if (packageJson.scripts?.["smoke:packaged-exe:off"] !== "node scripts/smoke-packaged-exe.mjs --backend off --root target/packaged-exe-smoke/off-mode") {
    throw new Error("package.json must expose an off-mode packaged exe smoke script");
  }
  for (const token of [
    "validateLocalModeCreatedBackendState",
    "localBackendSmokeEnv",
    "THEBOYS_BACKEND_BIND",
    "THEBOYS_BACKEND_STATE_PATH",
    "THEBOYS_BACKEND_SESSION_SECRET",
    "/dev/sessions",
    "/presence/",
    "Local packaged smoke did not persist the expected friends-service presence probe",
    "Local packaged smoke did not start a packaged social-backend.exe process",
    "Local packaged smoke requires no pre-existing social-backend.exe process",
    "Local social-backend started: yes",
    "Local friends-service state created: yes",
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must verify local backend mode; missing ${token}`);
    }
  }
  for (const token of [
    "validateDidNotCreateLocalBackendState",
    "THEBOYS_SOCIAL_BACKEND_URL = \"off\"",
    "Off-mode packaged smoke unexpectedly started local social-backend process",
    "validateDidNotCreateLocalBackendState(options.rootPath, \"Off-mode\")",
    "smoke created local friends-service state unexpectedly",
    "Local social-backend started: no",
    "Local friends-service state created: no",
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must verify off mode does not start the local service; missing ${token}`);
    }
  }
  for (const token of [
    "BackendEndpoint::Disabled",
    "hosted_backend_url_disables_service",
    "Friends service is turned off",
    "social_backend_from_env_disabled_mode_does_not_prepare_local_service_state",
    "disabled_backend_status_never_offers_local_start",
  ]) {
    if (!tauriSource.includes(token)) {
      throw new Error(`Tauri app must treat off friends-service mode as disabled, not local fallback; missing ${token}`);
    }
  }
  for (const token of [
    'endpointKind==="disabled"?"Off"',
    'ie.endpointKind==="hosted"||ie.endpointKind==="disabled"',
    '"aria-label":`${R} game details`',
    '"View game details"',
  ]) {
    if (!frontendSource.includes(token)) {
      throw new Error(`frontend recovered bundle must preserve production-facing Settings and Activity labels; missing ${token}`);
    }
  }
}

function testPackagedExeSmokeChecksSocialBackendFreshness() {
  const smokeScript = readFileSync(join(repoRoot, "scripts", "smoke-packaged-exe.mjs"), "utf8");
  for (const token of [
    "validateDefaultSocialBackendBuildFreshness",
    "socialBackendFreshnessSourcePaths",
    "socialBackendFreshnessSourceDirectories",
    "Default adjacent social-backend.exe",
    "npm run build:social-backend",
    "before smoke:packaged-exe",
    "Friends-service release build freshness:",
  ]) {
    if (!smokeScript.includes(token)) {
      throw new Error(`packaged exe smoke must reject stale default social-backend builds; missing ${token}`);
    }
  }
}

function testVanillaCompatSmokeUsesRepresentativeSample() {
  const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const script = packageJson.scripts?.["smoke:live:vanilla:compat"];
  if (script !== "node scripts/run-vanilla-compat-campaign.mjs --sample --shared-cache --quiet") {
    throw new Error("smoke:live:vanilla:compat must run the practical representative sample by default");
  }
  if (script.includes("--all")) {
    throw new Error("smoke:live:vanilla:compat must not default to the broad all-version campaign");
  }
}

function testTauriBuildCleansStaleUpdaterArtifactsBeforePackaging() {
  const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const script = packageJson.scripts?.["tauri:build"] ?? "";
  const cleanScript = packageJson.scripts?.["clean:tauri-updater-artifacts"];
  if (cleanScript !== "node scripts/clean-tauri-updater-artifacts.mjs") {
    throw new Error("package.json must expose clean:tauri-updater-artifacts");
  }
  const cleanIndex = script.indexOf("npm run clean:tauri-updater-artifacts");
  const buildIndex = script.indexOf("tauri build");
  const generateIndex = script.indexOf("npm run generate:updater-manifest");
  if (cleanIndex === -1 || buildIndex === -1 || generateIndex === -1) {
    throw new Error("tauri:build must clean updater artifacts, run tauri build, then generate the updater manifest");
  }
  if (!(cleanIndex < buildIndex && buildIndex < generateIndex)) {
    throw new Error("tauri:build must remove stale updater artifacts before tauri build and regenerate the manifest after");
  }
  const cleanupSource = readFileSync(cleanUpdaterArtifactsScript, "utf8");
  for (const token of [
    "latest.json",
    "latest-dev.json",
    "name.endsWith(\".sig\")",
    "Removed stale updater artifact",
  ]) {
    if (!cleanupSource.includes(token)) {
      throw new Error(`clean-tauri-updater-artifacts must remove stale manifests/signatures; missing ${token}`);
    }
  }
}

function testReleasePreflightRequiresPackagedSmokeModes() {
  const preflightSource = readFileSync(preflightScript, "utf8");
  for (const token of [
    "tauri build script runs the release packaging chain",
    "scripts/stage-social-backend.mjs",
    "scripts/verify-package-resources.mjs",
    "scripts/clean-tauri-updater-artifacts.mjs",
    "scripts/configure-tauri-release-channel.mjs",
    "scripts/resolve-v4-release-version.mjs",
    "npm run verify:tauri-security && npm run build:social-backend && npm run stage:social-backend && npm run verify:package-resources && npm run clean:tauri-updater-artifacts && tauri build && npm run generate:updater-manifest",
    "package resource verifier script exists",
    "updater artifact cleanup script exists",
    "release version resolver script exists",
    "release channel configurator script exists",
    "updater manifest generator script exists",
    "packaged exe smoke script exists",
    "packaged exe local-mode smoke script exists",
    "packaged exe off-mode smoke script exists",
    '"smoke:packaged-exe"',
    '"smoke:packaged-exe:local"',
    '"smoke:packaged-exe:off"',
    "node scripts/smoke-packaged-exe.mjs",
    "node scripts/smoke-packaged-exe.mjs --backend local --root target/packaged-exe-smoke/local-mode",
    "node scripts/smoke-packaged-exe.mjs --backend off --root target/packaged-exe-smoke/off-mode",
  ]) {
    if (!preflightSource.includes(token)) {
      throw new Error(`v4 release preflight must require packaged smoke modes; missing ${token}`);
    }
  }
}

function writePreflightFixture(repoPath) {
  const files = new Map([
    [
      "package.json",
      JSON.stringify(
        {
          scripts: {
            "tauri:build": "npm run verify:tauri-security && npm run build:social-backend && npm run stage:social-backend && npm run verify:package-resources && npm run clean:tauri-updater-artifacts && tauri build && npm run generate:updater-manifest",
            "clean:tauri-updater-artifacts": "node scripts/clean-tauri-updater-artifacts.mjs",
            "resolve:v4-release-version": "node scripts/resolve-v4-release-version.mjs",
            "configure:tauri-release-channel": "node scripts/configure-tauri-release-channel.mjs",
            "verify:package-resources": "node scripts/verify-package-resources.mjs",
            "generate:updater-manifest": "node scripts/generate-tauri-updater-manifest.mjs",
            "verify:tauri-bundles": "node scripts/verify-tauri-bundles.mjs",
            "smoke:packaged-exe": "node scripts/smoke-packaged-exe.mjs",
            "smoke:packaged-exe:local": "node scripts/smoke-packaged-exe.mjs --backend local --root target/packaged-exe-smoke/local-mode",
            "smoke:packaged-exe:off": "node scripts/smoke-packaged-exe.mjs --backend off --root target/packaged-exe-smoke/off-mode",
            "social:up": "node scripts/manage-hosted-social-backend.mjs up",
          },
        },
        null,
        2,
      ) + "\n",
    ],
    [
      "src-tauri/tauri.conf.json",
      JSON.stringify(
        {
          version: "4.0.2",
          plugins: {
            updater: {
              pubkey: "fixture-pubkey",
              endpoints: ["https://github.com/dilllxd/theboyslauncher/releases/latest/download/latest.json"],
            },
          },
        },
        null,
        2,
      ) + "\n",
    ],
    [
      "src-tauri/src/main.rs",
      '#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]\nfn main() {}\n',
    ],
    [".github/workflows/v4-foundation.yml", "name: fixture\n"],
    [".github/workflows/social-backend-image.yml", "name: fixture\n"],
    [".github/workflows/v4-release-channels.yml", "name: fixture\n"],
    ["scripts/generate-tauri-updater-manifest.mjs", "console.log('fixture');\n"],
    ["scripts/resolve-v4-release-version.mjs", "console.log('fixture');\n"],
    ["scripts/configure-tauri-release-channel.mjs", "console.log('fixture');\n"],
    ["scripts/preflight-v4-release.mjs", "console.log('fixture');\n"],
    ["scripts/stage-social-backend.mjs", "console.log('fixture');\n"],
    ["scripts/verify-package-resources.mjs", "console.log('fixture');\n"],
    ["scripts/clean-tauri-updater-artifacts.mjs", "console.log('fixture');\n"],
    ["scripts/verify-tauri-bundles.mjs", "console.log('fixture');\n"],
    ["scripts/smoke-packaged-exe.mjs", "console.log('fixture');\n"],
    ["scripts/manage-hosted-social-backend.mjs", "console.log('fixture');\n"],
    ["scripts/test-release-channel-scripts.mjs", "console.log('fixture');\n"],
  ]);

  for (const [relativePath, body] of files) {
    const target = join(repoPath, relativePath);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, body);
  }
}

function testPostPromotionPreflightBranchModel() {
  const tempRoot = mkdtempSync(join(tmpdir(), "tbl-preflight-"));
  const worktree = join(tempRoot, "worktree");
  const remote = join(tempRoot, "remote.git");
  try {
    mkdirSync(worktree, { recursive: true });
    run("git", ["init", "--bare", remote]);
    run("git", ["init", "-b", "main"], { cwd: worktree });
    run("git", ["config", "user.email", "release-test@example.invalid"], { cwd: worktree });
    run("git", ["config", "user.name", "Release Test"], { cwd: worktree });
    run("git", ["remote", "add", "origin", remote], { cwd: worktree });

    writeFileSync(join(worktree, "README.md"), "old v3 main\n");
    run("git", ["add", "README.md"], { cwd: worktree });
    run("git", ["commit", "-m", "old main"], { cwd: worktree });
    run("git", ["branch", "backup/main-v3-2026-06-29"], { cwd: worktree });
    run("git", ["push", "origin", "backup/main-v3-2026-06-29"], { cwd: worktree });

    writePreflightFixture(worktree);
    run("git", ["add", "."], { cwd: worktree });
    run("git", ["commit", "-m", "v4 main"], { cwd: worktree });
    run("git", ["push", "-u", "origin", "main"], { cwd: worktree });

    const output = run("node", [preflightScript, "v4.0.2"], {
      cwd: worktree,
      env: {
        THEBOYS_PREFLIGHT_REPO_ROOT: worktree,
        THEBOYS_PREFLIGHT_SKIP_GITHUB: "1",
      },
    });
    if (!output.includes("main backup preserves old v3 main") || !output.includes("V4 release preflight passed")) {
      throw new Error(`preflight output did not prove post-promotion branch checks:\n${output}`);
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

testVersionResolution();
testTauriChannelConfiguration();
testDevUpdaterManifestUsesEncodedSetupUrl();
testUpdaterManifestGeneratorRequiresConfiguredSetupVersion();
testUpdaterManifestGeneratorRejectsAmbiguousSetupInstallers();
testUpdaterManifestGeneratorRejectsStableTagVersionMismatch();
testBundleVerifierRejectsAmbiguousConfiguredBundles();
testBundleVerifierRejectsStableManifestTagVersionMismatch();
testBundleVerifierRejectsUntrustedManifestUrl();
testUpdaterScriptsRejectForkedRepositoryEnvironment();
testBundleVerifierRejectsDecoratedManifestUrl();
testUpdaterSignatureMustNotBeOlderThanSetup();
testBundleVerifierRejectsManifestSignatureMismatch();
testBundleVerifierRejectsWrongManifestChannel();
testUpdaterManifestNameMustBeKnownChannel();
testUpdaterManifestNameMustMatchChannel();
testFoundationWorkflowChecksManualReleaseTagBeforeTauriBuild();
testReleaseWorkflowsRejectNonOfficialRepositoriesEarly();
testReleaseWorkflowKeepsEfficientRetryBehavior();
testReleaseWorkflowAvoidsDuplicateFrontendBuild();
testReleaseWorkflowsSmokePackagedExeBeforeBundleVerification();
testReleaseWorkflowPathFiltersCoverReleasePlumbing();
testPackageResourceScriptsKeepBackendAliasesVerified();
testTauriSecurityVerifierGuardsBackendConsoleSuppression();
testPackagedExeSmokeClearsAmbientDirectoryOverrides();
testPackagedExeSmokeChecksCleanFirstRunDefaults();
testPackagedExeSmokeChecksWindowsMetadata();
testPackagedExeSmokeChecksProcessCleanup();
testPackagedExeSmokeSerializesRuns();
testPackagedExeSmokeCleansUpOnSignals();
testPackagedExeSmokeRequiresDefaultAdjacentBackendBuild();
testPackagedExeSmokeChecksDefaultFrontendFreshness();
testPackagedExeSmokeChecksNoSevereStartupLogs();
testPackagedExeSmokeChecksNoFirstRunMinecraftAuthState();
testPackagedExeSmokeChecksMicrosoftAuthFlowProbe();
testPackagedExeSmokeChecksAccountLifecycleProbe();
testPackagedExeSmokeChecksAuthRecoveryProbe();
testNativeAuthAndFriendsErrorsStayPlayerFacing();
testPackagedExeSmokeChecksStoredAuthLaunchProbe();
testPackagedExeSmokeChecksModrinthArchiveInstallProbe();
testPackagedExeSmokeChecksCurseForgeArchiveInstallProbe();
testPackagedExeSmokeChecksFtbLegacyArchiveInstallProbe();
testPackagedExeSmokeChecksFtbInstallProbe();
testPackagedExeSmokeChecksTechnicArchiveInstallProbe();
testPackagedExeSmokeChecksAtlauncherInstallProbe();
testPackagedExeSmokeChecksActivityProgressProbe();
testPackagedExeSmokeChecksJavaRecoveryProbe();
testPackagedExeSmokeChecksDiscoverRoutingProbe();
testPackagedExeSmokeChecksProfileLifecycleProbe();
testPackagedExeSmokeChecksImportLifecycleProbe();
testPackagedExeSmokeChecksPackwizInstallProbe();
testPackagedExeSmokeChecksUpdateHandoffProbe();
testPackagedExeSmokeChecksLaunchPreflightProbe();
testPackagedExeSmokeChecksProcessLifecycleProbe();
testPackagedExeSmokeChecksLocalBackendMode();
testPackagedExeSmokeChecksSocialBackendFreshness();
testVanillaCompatSmokeUsesRepresentativeSample();
testTauriBuildCleansStaleUpdaterArtifactsBeforePackaging();
testReleasePreflightRequiresPackagedSmokeModes();
testPostPromotionPreflightBranchModel();
console.log("Release channel scripts verified.");
