import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const networkName = "theboyslauncher-social";
const postgresContainer = "theboyslauncher-hosted-postgres";
const backendContainer = "theboyslauncher-social-backend";
const backendImage =
  process.env.THEBOYS_BACKEND_IMAGE ?? "theboyslauncher/social-backend:local";
const databaseName = process.env.THEBOYS_POSTGRES_DB ?? "theboyslauncher";
const databaseUser = process.env.THEBOYS_POSTGRES_USER ?? "theboyslauncher";
const databasePassword =
  process.env.THEBOYS_POSTGRES_PASSWORD ?? "theboyslauncher";
const hostAddress = process.env.THEBOYS_BACKEND_HOST ?? "127.0.0.1";
const hostPort = process.env.THEBOYS_BACKEND_PORT ?? "4074";
const corsOrigins =
  process.env.THEBOYS_BACKEND_CORS_ORIGINS ?? "https://launcher.dylan.lol";

function usage() {
  console.error(
    "Usage: node scripts/manage-hosted-social-backend.mjs <build|up|down|restart|logs|status|secret>",
  );
}

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
  throw new Error("Docker was not found on PATH or through WSL.");
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
    process.exit(result.status ?? 1);
  }
}

function inspectExists(runner, kind, name) {
  return docker(runner, [kind, "inspect", name]).status === 0;
}

function containerRunning(runner, name) {
  const result = docker(runner, ["inspect", "-f", "{{.State.Running}}", name]);
  return result.status === 0 && result.stdout.trim() === "true";
}

function containerSummary(runner, name) {
  const result = docker(runner, [
    "inspect",
    "-f",
    "{{.State.Status}}|{{.Config.Image}}|{{.HostConfig.RestartPolicy.Name}}|{{json .NetworkSettings.Ports}}",
    name,
  ]);
  if (result.status !== 0) return null;
  const [state, image, restartPolicy, ports] = result.stdout.trim().split("|");
  return { state, image, restartPolicy, ports };
}

function ensureNetwork(runner) {
  if (!inspectExists(runner, "network", networkName)) {
    dockerInherit(runner, ["network", "create", networkName]);
  }
}

function removeContainer(runner, name) {
  if (!inspectExists(runner, "container", name)) return;
  if (containerRunning(runner, name)) {
    dockerInherit(runner, ["stop", name]);
  }
  dockerInherit(runner, ["rm", name]);
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function waitForPostgres(runner) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const result = docker(runner, [
      "exec",
      postgresContainer,
      "pg_isready",
      "-U",
      databaseUser,
      "-d",
      databaseName,
    ]);
    if (result.status === 0) {
      return;
    }
    sleep(1_000);
  }
  throw new Error(
    `${postgresContainer} did not become ready within 90 seconds.`,
  );
}

async function waitForBackendHealth() {
  const healthUrl = `http://${hostAddress}:${hostPort}/health`;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        console.log(`HEALTH_URL=${healthUrl}`);
        return;
      }
    } catch {
      // Keep polling until the container has finished startup and bound the port.
    }
    sleep(1_000);
  }
  throw new Error(
    `${backendContainer} did not become healthy at ${healthUrl} within 90 seconds.`,
  );
}

function hostedDatabaseUrl() {
  return `postgres://${encodeURIComponent(databaseUser)}:${encodeURIComponent(databasePassword)}@${postgresContainer}:5432/${encodeURIComponent(databaseName)}`;
}

function requireSessionSecret() {
  const secret = process.env.THEBOYS_BACKEND_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "Set THEBOYS_BACKEND_SESSION_SECRET to a strong 32+ character value before starting the hosted backend. Run `npm run social:secret` to generate one.",
    );
  }
  return secret;
}

function build(runner) {
  dockerInherit(runner, [
    "build",
    "-f",
    "crates/social-backend/Dockerfile",
    "-t",
    backendImage,
    ".",
  ]);
}

async function up(runner) {
  const sessionSecret = requireSessionSecret();
  ensureNetwork(runner);

  if (!inspectExists(runner, "container", postgresContainer)) {
    dockerInherit(runner, [
      "run",
      "-d",
      "--name",
      postgresContainer,
      "--restart",
      "unless-stopped",
      "--network",
      networkName,
      "-e",
      `POSTGRES_DB=${databaseName}`,
      "-e",
      `POSTGRES_USER=${databaseUser}`,
      "-e",
      `POSTGRES_PASSWORD=${databasePassword}`,
      "-v",
      "theboyslauncher-hosted-postgres-data:/var/lib/postgresql/data",
      "postgres:16-alpine",
    ]);
  } else if (!containerRunning(runner, postgresContainer)) {
    dockerInherit(runner, ["start", postgresContainer]);
  }
  waitForPostgres(runner);

  removeContainer(runner, backendContainer);
  dockerInherit(runner, [
    "run",
    "-d",
    "--name",
    backendContainer,
    "--restart",
    "unless-stopped",
    "--network",
    networkName,
    "-p",
    `${hostAddress}:${hostPort}:4074`,
    "-e",
    "THEBOYS_BACKEND_BIND=0.0.0.0:4074",
    "-e",
    `DATABASE_URL=${hostedDatabaseUrl()}`,
    "-e",
    `THEBOYS_BACKEND_SESSION_SECRET=${sessionSecret}`,
    "-e",
    `THEBOYS_BACKEND_CORS_ORIGINS=${corsOrigins}`,
    backendImage,
  ]);
  await waitForBackendHealth();
  console.log(
    `Hosted social backend is ready on http://${hostAddress}:${hostPort}`,
  );
}

function down(runner) {
  removeContainer(runner, backendContainer);
  removeContainer(runner, postgresContainer);
}

function logs(runner) {
  dockerInherit(runner, ["logs", "-f", backendContainer]);
}

function status(runner) {
  for (const name of [postgresContainer, backendContainer]) {
    const summary = containerSummary(runner, name);
    if (!summary) {
      console.log(`${name}: missing`);
      continue;
    }
    console.log(
      `${name}: ${summary.state}; image=${summary.image}; restart=${summary.restartPolicy}; ports=${summary.ports}`,
    );
  }
}

async function main() {
  const action = process.argv[2];
  if (
    !["build", "up", "down", "restart", "logs", "status", "secret"].includes(
      action,
    )
  ) {
    usage();
    process.exit(2);
  }

  if (action === "secret") {
    console.log(randomBytes(48).toString("base64url"));
    return;
  }

  const runner = findDockerRunner();
  if (action === "build") build(runner);
  if (action === "up") await up(runner);
  if (action === "down") down(runner);
  if (action === "restart") {
    build(runner);
    await up(runner);
  }
  if (action === "logs") logs(runner);
  if (action === "status") status(runner);
}

await main();
