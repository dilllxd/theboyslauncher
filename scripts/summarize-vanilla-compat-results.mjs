import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const defaultResultLogPath = resolve("target", "live-smoke", "vanilla-compat-results.jsonl");

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

function summarize(rows) {
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

  const campaignSummaries = [...campaigns.values()]
    .map((campaign) => {
      const finalRows = [...campaign.versions.values()];
      return {
        campaign: campaign.campaign,
        rows: campaign.rows,
        versions: finalRows.length,
        passed: finalRows.filter((row) => row.status === "passed").length,
        failed: finalRows.filter((row) => row.status !== "passed").length,
        lastVersion: campaign.last.version,
        lastStatus: campaign.last.status,
        lastAttempt: campaign.last.attempt ?? "unknown",
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
    ["Passed", "passed"],
    ["Failed", "failed"],
    ["Last", "lastVersion"],
    ["Status", "lastStatus"],
    ["Attempt", "lastAttempt"],
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
const summary = summarize(rows);
if (options.json) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  printTable(summary);
}
