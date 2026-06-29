import { defineConfig, devices } from "@playwright/test";

const desktopViewport = { width: 1280, height: 820 };
const tauriMinimumViewport = { width: 1100, height: 720 };

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: "http://127.0.0.1:1420",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: desktopViewport },
    },
    {
      name: "tauri-minimum-desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: tauriMinimumViewport },
    },
  ],
});
