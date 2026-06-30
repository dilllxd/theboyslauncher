import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const defaultResultLogPath = resolve("target", "live-smoke", "vanilla-compat-results.jsonl");
const defaultCompatRoot = resolve("target", "live-smoke", "vanilla-compat");

function usage() {
  console.log(`Usage:
  node scripts/summarize-vanilla-compat-results.mjs [--file <path>] [--json]

Options:
  --file <path>  Read a specific JSONL result log. Defaults to ${defaultResultLogPath}
  --json         Print machine-readable JSON instead of a text table.
`);
}

function parseArgs(argv) {
  const options = {
    file: defaultResultLogPath,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--file") {
      index += 1;
      if (!argv[index]) throw new Error("--file requires a path");
      options.file = resolve(argv[index]);
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  return options;
}

function parseRows(file) {
  if (!existsSync(file)) {
    return [];
  }

  return readFileSync(file, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return { ...JSON.parse(line), rowNumber: index + 1 };
      } catch (error) {
        throw new Error(`Invalid JSON on line ${index + 1}: ${error.message}`);
      }
    });
}

function versionKey(row) {
  return `${row.campaign ?? "unknown"}\u0000${row.version ?? "unknown"}`;
}

function safePathSegment(value) {
  return String(value)
    .replace(/[^a-zA-Z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 120) || "unknown";
}

function campaignLockNameFromCommand(commandLine) {
  const args = String(commandLine ?? "").match(/(?:[^\s"]+|"[^"]*")+/gu)?.map((arg) => arg.replace(/^"|"$/gu, "")) ?? [];
  const hasAll = args.includes("--all");
  if (!hasAll) return null;
  const types = [];
  let offset = 0;
  let limit = "end";
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--type" && args[index + 1]) {
      types.push(args[index + 1]);
      index += 1;
    } else if (args[index] === "--offset" && args[index + 1]) {
      offset = Number(args[index + 1]);
      index += 1;
    } else if (args[index] === "--limit" && args[index + 1]) {
      limit = args[index + 1];
      index += 1;
    }
  }
  return safePathSegment(`all-${types.length > 0 ? types.join("+") : "all-types"}-offset-${offset}-limit-${limit}`);
}

function expectedVersionCountFromCampaign(campaign) {
  const match = /^all-.+-offset-\d+-limit-(\d+)$/u.exec(String(campaign));
  return match ? Number(match[1]) : "";
}

function readWindowsNodeCommandsByPid() {
  if (process.platform !== "win32") return new Map();
  try {
    const output = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*run-vanilla-compat-campaign.mjs*' } | ForEach-Object { [PSCustomObject]@{ ProcessId=$_.ProcessId; CommandLine=$_.CommandLine } } | ConvertTo-Json -Compress",
      ],
      { encoding: "utf8", windowsHide: true },
    ).trim();
    if (!output) return new Map();
    const parsed = JSON.parse(output);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return new Map(rows.map((row) => [Number(row.ProcessId), row.CommandLine]));
  } catch {
    return new Map();
  }
}

function activeCampaignsByLock(compatRoot = defaultCompatRoot) {
  if (!existsSync(compatRoot)) return new Map();
  const commandsByPid = readWindowsNodeCommandsByPid();
  const active = new Map();
  for (const entry of readdirSync(compatRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.endsWith(".lock")) continue;
    const ownerPath = resolve(compatRoot, entry.name, "owner.json");
    if (!existsSync(ownerPath)) continue;
    try {
      const owner = JSON.parse(readFileSync(ownerPath, "utf8"));
      const commandLine = commandsByPid.get(Number(owner.pid));
      if (!commandLine) continue;
      const campaign = campaignLockNameFromCommand(commandLine);
      if (!campaign) continue;
      active.set(campaign, {
        pid: owner.pid,
        version: owner.version,
        startedAt: owner.startedAt,
      });
    } catch {
      // Ignore malformed transient lock owners while a runner is rotating roots.
    }
  }
  return active;
}

function summarize(rows, activeCampaigns = new Map()) {
  const campaigns = new Map();
  const finalByVersion = new Map();

  for (const row of rows) {
    const campaign = row.campaign ?? "unknown";
    const campaignSummary = campaigns.get(campaign) ?? {
      campaign,
      rows: 0,
      versions: new Map(),
      last: row,
    };
    campaignSummary.rows += 1;
    campaignSummary.last = row;
    campaignSummary.versions.set(row.version ?? "unknown", row);
    campaigns.set(campaign, campaignSummary);
    finalByVersion.set(versionKey(row), row);
  }

  for (const [campaign, active] of activeCampaigns.entries()) {
    if (!campaigns.has(campaign)) {
      campaigns.set(campaign, {
        campaign,
        rows: 0,
        versions: new Map(),
        last: {
          version: "",
          status: "running",
          attempt: "",
        },
        activeOnly: true,
      });
    }
  }

  const campaignSummaries = [...campaigns.values()]
    .map((campaign) => {
      const finalRows = [...campaign.versions.values()];
      return {
        campaign: campaign.campaign,
        rows: campaign.rows,
        versions: finalRows.length,
        expected: expectedVersionCountFromCampaign(campaign.campaign),
        passed: finalRows.filter((row) => row.status === "passed").length,
        failed: finalRows.filter((row) => row.status !== "passed").length,
        lastVersion: campaign.last.version,
        lastStatus: campaign.last.status,
        lastAttempt: campaign.last.attempt ?? "unknown",
        activeVersion: activeCampaigns.get(campaign.campaign)?.version ?? "",
        activePid: activeCampaigns.get(campaign.campaign)?.pid ?? "",
      };
    })
    .sort((left, right) => left.campaign.localeCompare(right.campaign));

  const finalFailures = [...finalByVersion.values()]
    .filter((row) => row.status !== "passed")
    .sort((left, right) => {
      const campaignCompare = String(left.campaign).localeCompare(String(right.campaign));
      return campaignCompare || String(left.version).localeCompare(String(right.version));
    });

  return {
    campaigns: campaignSummaries,
    totals: {
      rows: rows.length,
      versions: finalByVersion.size,
      passed: [...finalByVersion.values()].filter((row) => row.status === "passed").length,
      failed: finalFailures.length,
    },
    finalFailures,
  };
}

function pad(value, width) {
  return String(value).padEnd(width, " ");
}

function printTable(summary) {
  if (summary.campaigns.length === 0) {
    console.log("No vanilla compatibility results found.");
    return;
  }

  const columns = [
    ["Campaign", "campaign"],
    ["Rows", "rows"],
    ["Versions", "versions"],
    ["Expected", "expected"],
    ["Passed", "passed"],
    ["Failed", "failed"],
    ["Last", "lastVersion"],
    ["Status", "lastStatus"],
    ["Attempt", "lastAttempt"],
    ["Active", "activeVersion"],
    ["PID", "activePid"],
  ];
  const widths = columns.map(([header, key]) =>
    Math.max(header.length, ...summary.campaigns.map((row) => String(row[key] ?? "").length)),
  );

  console.log(columns.map(([header], index) => pad(header, widths[index])).join("  "));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of summary.campaigns) {
    console.log(columns.map(([, key], index) => pad(row[key] ?? "", widths[index])).join("  "));
  }

  console.log(
    `\nFinal status: ${summary.totals.passed}/${summary.totals.versions} passed, ${summary.totals.failed} failed across ${summary.totals.rows} result rows.`,
  );
  if (summary.finalFailures.length > 0) {
    console.log("Final failures:");
    for (const row of summary.finalFailures) {
      console.log(`- ${row.campaign}: ${row.version} (${row.status}, exit ${row.exitCode ?? "unknown"})`);
    }
  }
}

const options = parseArgs(process.argv.slice(2));
const rows = parseRows(options.file);
const summary = summarize(rows, activeCampaignsByLock());
if (options.json) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  printTable(summary);
}
