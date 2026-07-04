const defaultLocalHealthEndpoint = "http://127.0.0.1:4074/health";
const defaultPublicHealthEndpoint = "https://launcher.dylan.lol/health";

function envFlagEnabled(value) {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

const healthEndpoints = [
  process.env.THEBOYS_PUBLIC_BACKEND_HEALTH ?? defaultPublicHealthEndpoint,
];
const localHealthEndpoint = process.env.THEBOYS_LOCAL_BACKEND_HEALTH?.trim();
if (localHealthEndpoint) {
  healthEndpoints.push(localHealthEndpoint);
} else if (envFlagEnabled(process.env.THEBOYS_CHECK_LOCAL_BACKEND)) {
  healthEndpoints.push(defaultLocalHealthEndpoint);
}

const expectedCorsOrigins = (
  process.env.THEBOYS_BACKEND_EXPECTED_CORS_ORIGINS ??
  "https://launcher.dylan.lol,tauri://localhost,http://tauri.localhost,https://tauri.localhost"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function backendOriginFromHealthUrl(endpoint) {
  const url = new URL(endpoint);
  return url.origin;
}

async function checkEndpoint(endpoint) {
  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`${endpoint} returned HTTP ${response.status}`);
  }
  const body = await response.json();
  if (body?.ok !== true || body?.service !== "social-backend") {
    throw new Error(
      `${endpoint} returned unexpected health payload: ${JSON.stringify(body)}`,
    );
  }
  console.log(`OK health ${endpoint}`);
}

async function checkCorsPreflight(backendOrigin, requestOrigin) {
  const endpoint = `${backendOrigin}/sessions/current`;
  const response = await fetch(endpoint, {
    method: "OPTIONS",
    headers: {
      Origin: requestOrigin,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization",
    },
    signal: AbortSignal.timeout(15_000),
  });
  const allowedOrigin = response.headers.get("access-control-allow-origin");
  const allowedHeaders = response.headers.get("access-control-allow-headers") ?? "";
  if (!response.ok || allowedOrigin !== requestOrigin || !/authorization/i.test(allowedHeaders)) {
    throw new Error(
      `${endpoint} rejected CORS preflight for ${requestOrigin}: HTTP ${response.status}, allow-origin=${allowedOrigin}, allow-headers=${allowedHeaders}`,
    );
  }
  console.log(`OK CORS preflight ${backendOrigin} <- ${requestOrigin}`);
}

async function checkCorsRead(backendOrigin, requestOrigin) {
  const endpoint = `${backendOrigin}/packs`;
  const response = await fetch(endpoint, {
    headers: {
      Origin: requestOrigin,
    },
    signal: AbortSignal.timeout(15_000),
  });
  const allowedOrigin = response.headers.get("access-control-allow-origin");
  if (!response.ok || allowedOrigin !== requestOrigin) {
    throw new Error(
      `${endpoint} rejected CORS read for ${requestOrigin}: HTTP ${response.status}, allow-origin=${allowedOrigin}`,
    );
  }
  const body = await response.json();
  if (!Array.isArray(body)) {
    throw new Error(`${endpoint} returned unexpected packs payload: ${JSON.stringify(body)}`);
  }
  console.log(`OK CORS read ${backendOrigin}/packs <- ${requestOrigin}`);
}

let failed = false;
for (const endpoint of healthEndpoints) {
  try {
    await checkEndpoint(endpoint);
    const backendOrigin = backendOriginFromHealthUrl(endpoint);
    for (const requestOrigin of expectedCorsOrigins) {
      await checkCorsPreflight(backendOrigin, requestOrigin);
      await checkCorsRead(backendOrigin, requestOrigin);
    }
  } catch (error) {
    failed = true;
    console.error(`FAIL ${endpoint}: ${error.message}`);
  }
}

if (failed) {
  process.exit(1);
}
