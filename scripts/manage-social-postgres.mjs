import { spawnSync } from "node:child_process";

const containerName = "theboyslauncher-postgres";
const volumeName = "theboyslauncher-postgres-data";
const databaseName = process.env.THEBOYS_POSTGRES_DB ?? "theboyslauncher";
const databaseUser = process.env.THEBOYS_POSTGRES_USER ?? "theboyslauncher";
const databasePassword = process.env.THEBOYS_POSTGRES_PASSWORD ?? "theboyslauncher";
const hostAddress = process.env.THEBOYS_POSTGRES_HOST ?? "127.0.0.1";
const hostPort = process.env.THEBOYS_POSTGRES_PORT ?? "55432";
const containerPort = "5432";

function usage() {
  console.error("Usage: node scripts/manage-social-postgres.mjs <up|down|logs|url>");
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: options.stdio ?? "pipe",
    encoding: options.encoding ?? "utf8",
    windowsHide: true,
  });
}

function runnerAvailable(command, args) {
  const result = run(command, args);
  return result.status === 0;
}

function findDockerRunner() {
  if (runnerAvailable("docker", ["--version"])) {
    return { command: "docker", args: [] };
  }
  if (runnerAvailable("wsl", ["docker", "--version"])) {
    return { command: "wsl", args: ["docker"] };
  }
  throw new Error("Docker was not found on PATH or through WSL. Install Docker or enable WSL Docker first.");
}

function docker(runner, args, options = {}) {
  return run(runner.command, [...runner.args, ...args], options);
}

function dockerInherit(runner, args) {
  const result = docker(runner, args, { stdio: "inherit", encoding: undefined });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function hasCompose(runner) {
  return docker(runner, ["compose", "version"]).status === 0;
}

function compose(runner, args) {
  dockerInherit(runner, ["compose", "-f", "docker-compose.social.yml", ...args]);
}

function containerExists(runner) {
  const result = docker(runner, ["inspect", containerName]);
  return result.status === 0;
}

function containerRunning(runner) {
  const result = docker(runner, ["inspect", "-f", "{{.State.Running}}", containerName]);
  return result.status === 0 && result.stdout.trim() === "true";
}

function directUp(runner) {
  if (containerExists(runner)) {
    if (containerRunning(runner)) {
      console.log(`${containerName} is already running.`);
      return;
    }
    dockerInherit(runner, ["start", containerName]);
    return;
  }

  dockerInherit(runner, [
    "run",
    "-d",
    "--name",
    containerName,
    "-e",
    `POSTGRES_DB=${databaseName}`,
    "-e",
    `POSTGRES_USER=${databaseUser}`,
    "-e",
    `POSTGRES_PASSWORD=${databasePassword}`,
    "-p",
    `${hostAddress}:${hostPort}:${containerPort}`,
    "-v",
    `${volumeName}:/var/lib/postgresql/data`,
    "postgres:16-alpine",
  ]);
}

function waitForPostgres(runner) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const result = docker(runner, [
      "exec",
      containerName,
      "pg_isready",
      "-U",
      databaseUser,
      "-d",
      databaseName,
    ]);
    if (result.status === 0) {
      console.log(result.stdout.trim());
      console.log(`DATABASE_URL=${postgresDatabaseUrl()}`);
      return;
    }
    sleep(1_000);
  }
  console.error(`${containerName} did not become ready within 90 seconds.`);
  process.exit(1);
}

function postgresDatabaseUrl() {
  return `postgres://${encodeURIComponent(databaseUser)}:${encodeURIComponent(databasePassword)}@${hostAddress}:${hostPort}/${encodeURIComponent(databaseName)}`;
}

function directDown(runner) {
  if (!containerExists(runner)) {
    console.log(`${containerName} is not created.`);
    return;
  }
  if (containerRunning(runner)) {
    dockerInherit(runner, ["stop", containerName]);
  }
  dockerInherit(runner, ["rm", containerName]);
}

function directLogs(runner) {
  if (!containerExists(runner)) {
    console.error(`${containerName} is not created.`);
    process.exit(1);
  }
  dockerInherit(runner, ["logs", "-f", containerName]);
}

function main() {
  const action = process.argv[2];
  if (!["up", "down", "logs", "url"].includes(action)) {
    usage();
    process.exit(2);
  }

  if (action === "url") {
    console.log(postgresDatabaseUrl());
    return;
  }

  const runner = findDockerRunner();
  if (hasCompose(runner)) {
    if (action === "up") {
      compose(runner, ["up", "-d"]);
      waitForPostgres(runner);
    } else if (action === "down") {
      compose(runner, ["down"]);
    } else {
      compose(runner, ["logs", "-f", "postgres"]);
    }
    return;
  }

  if (action === "up") {
    directUp(runner);
    waitForPostgres(runner);
  } else if (action === "down") {
    directDown(runner);
  } else {
    directLogs(runner);
  }
}

main();
