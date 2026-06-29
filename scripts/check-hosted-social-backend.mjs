const endpoints = [
  process.env.THEBOYS_LOCAL_BACKEND_HEALTH ?? "http://127.0.0.1:4074/health",
  process.env.THEBOYS_PUBLIC_BACKEND_HEALTH ??
    "https://launcher.dylan.lol/health",
];

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
  console.log(`OK ${endpoint}`);
}

let failed = false;
for (const endpoint of endpoints) {
  try {
    await checkEndpoint(endpoint);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${endpoint}: ${error.message}`);
  }
}

if (failed) {
  process.exit(1);
}
