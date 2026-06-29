import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const channel = process.argv[2] ?? process.env.THEBOYS_RELEASE_CHANNEL ?? "stable";
const stableTagPattern = /^v(\d+)\.(\d+)\.(\d+)$/;

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr}${result.stdout}`);
  }
  return result.stdout.trim();
}

function parseStableTag(tag) {
  const match = stableTagPattern.exec(tag);
  if (!match) return null;
  return {
    tag,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareVersions(left, right) {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

function output(values) {
  for (const [key, value] of Object.entries(values)) {
    console.log(`${key}=${value}`);
  }
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(values)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n") + "\n",
    );
  }
}

if (!["stable", "dev"].includes(channel)) {
  throw new Error(`Release channel must be stable or dev, received ${channel}`);
}

run("git", ["fetch", "--tags", "--force"]);
const tags = run("git", ["tag", "--list", "v*"])
  .split(/\r?\n/)
  .filter(Boolean);

const stableTags = tags.map(parseStableTag).filter(Boolean).sort(compareVersions);
const latestStable = stableTags.at(-1) ?? { major: 4, minor: 0, patch: 0 };
const nextStable = {
  major: latestStable.major,
  minor: latestStable.minor,
  patch: latestStable.patch + 1,
};
const baseVersion = `${nextStable.major}.${nextStable.minor}.${nextStable.patch}`;

if (channel === "stable") {
  output({
    channel,
    version: baseVersion,
    tag: `v${baseVersion}`,
    manifest_name: "latest.json",
    prerelease: "false",
    product_name: "TheBoysLauncher",
  });
} else {
  const devTagPattern = new RegExp(`^v${baseVersion.replaceAll(".", "\\.")}-dev\\.(\\d+)$`);
  const nextDev = Math.max(
    0,
    ...tags.map((tag) => devTagPattern.exec(tag)).filter(Boolean).map((match) => Number(match[1])),
  ) + 1;
  output({
    channel,
    version: `${baseVersion}-${nextDev}`,
    tag: `v${baseVersion}-dev.${nextDev}`,
    manifest_name: "latest-dev.json",
    prerelease: "true",
    product_name: "TheBoysLauncher Dev",
  });
}
