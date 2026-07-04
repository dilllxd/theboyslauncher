import { spawnSync } from "node:child_process";

const containerName = process.env.THEBOYS_POSTGRES_CONTAINER ?? "theboyslauncher-postgres";
const databaseUser = process.env.THEBOYS_POSTGRES_USER ?? "theboyslauncher";
const databasePassword = process.env.THEBOYS_POSTGRES_PASSWORD ?? "theboyslauncher";
const hostAddress = process.env.THEBOYS_POSTGRES_HOST ?? "127.0.0.1";
const hostPort = process.env.THEBOYS_POSTGRES_PORT ?? "55432";
const explicitDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: options.stdio ?? "pipe",
    encoding: options.encoding ?? "utf8",
    windowsHide: true,
  });
}

function runnerAvailable(command, args) {
  return run(command, args).status === 0;
}

function findDockerRunner() {
  if (runnerAvailable("docker", ["--version"])) {
    return { command: "docker", args: [] };
  }
  if (runnerAvailable("wsl", ["docker", "--version"])) {
    return { command: "wsl", args: ["docker"] };
  }
  throw new Error(
    "Docker was not found on PATH or through WSL. Run npm run postgres:up first, or set TEST_DATABASE_URL to a disposable Postgres database.",
  );
}

function docker(runner, args, options = {}) {
  return run(runner.command, [...runner.args, ...args], options);
}

function dockerInherit(runner, args) {
  const result = docker(runner, args, {
    stdio: "inherit",
    encoding: undefined,
  });
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(" ")} failed`);
  }
}

function quoteIdentifier(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`Unsafe Postgres identifier: ${identifier}`);
  }
  return `"${identifier.replaceAll('"', '""')}"`;
}

function databaseUrlFor(databaseName) {
  return `postgres://${encodeURIComponent(databaseUser)}:${encodeURIComponent(databasePassword)}@${hostAddress}:${hostPort}/${encodeURIComponent(databaseName)}`;
}

function createDisposableDatabase() {
  const runner = findDockerRunner();
  const databaseName = `theboyslauncher_test_${process.pid}_${Date.now()}`;
  const quotedName = quoteIdentifier(databaseName);
  dockerInherit(runner, [
    "exec",
    containerName,
    "psql",
    "-U",
    databaseUser,
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `DROP DATABASE IF EXISTS ${quotedName} WITH (FORCE);`,
  ]);
  dockerInherit(runner, [
    "exec",
    containerName,
    "psql",
    "-U",
    databaseUser,
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `CREATE DATABASE ${quotedName};`,
  ]);
  return {
    databaseUrl: databaseUrlFor(databaseName),
    cleanup: () => {
      try {
        dockerInherit(runner, [
          "exec",
          containerName,
          "psql",
          "-U",
          databaseUser,
          "-d",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          `DROP DATABASE IF EXISTS ${quotedName} WITH (FORCE);`,
        ]);
      } catch (error) {
        console.error(`Could not drop disposable Postgres database ${databaseName}: ${error.message}`);
      }
    },
  };
}

const disposableDatabase = explicitDatabaseUrl
  ? null
  : createDisposableDatabase();
const databaseUrl =
  explicitDatabaseUrl ?? disposableDatabase.databaseUrl;

const result = spawnSync(
  "cargo",
  [
    "test",
    "-p",
    "social-backend",
    "live_postgres",
    "--",
    "--ignored",
    "--test-threads=1",
  ],
  {
    env: {
      ...process.env,
      TEST_DATABASE_URL: databaseUrl,
    },
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

disposableDatabase?.cleanup();
process.exit(result.status ?? 1);
