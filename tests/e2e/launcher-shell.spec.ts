import { expect, test, type Locator, type Page } from "@playwright/test";

async function openProfileCustomize(profile: Locator) {
  const directButton = profile.getByRole("button", { name: "Customize" });
  if (await directButton.isVisible()) {
    await directButton.click();
    return;
  }

  await profile.locator(".profile-more-menu > button").click();
  await profile.getByRole("menuitem", { name: "Customize" }).click();
}

async function openProfileAdvancedCustomize(profile: Locator) {
  await openProfileCustomize(profile);
  await profile.getByRole("button", { name: "Advanced" }).click();
}

async function clickProfileSetupCheck(profile: Locator) {
  await openProfileAdvancedCustomize(profile);
  await profile.getByRole("button", { name: "Check launch" }).click();
}

async function installNativeSocialPresenceStub(
  page: Page,
  options: {
    accountId: string;
    accessToken: string;
    authorizationHeader: string;
    username?: string;
  },
) {
  await page.addInitScript(({ accountId, accessToken, authorizationHeader, username }) => {
    const minecraftSession = {
      session: {
        username,
        uuid: accountId,
        accessToken: "[redacted]",
      },
      accountId,
      expiresAtUnixSeconds: Math.floor(Date.now() / 1000) + 3600,
      storedAtUnixSeconds: Math.floor(Date.now() / 1000),
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      minecraftSession,
      friends: [],
      packs: [
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Cozy survival with friends.",
          version: "2.3.7",
          status: "installed",
          accent: "#67e8b9",
          installedPlayers: 0,
          defaultServer: "The Cabin",
        },
      ],
      profiles: [],
      imports: [],
    });

    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "load_minecraft_session") return minecraftSession;
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "scan_imports") return [];
          if (cmd === "social_backend_status") {
            return {
              endpointKind: "hosted",
              endpointUrl: "https://launcher.dylan.lol",
              bindAddr: "https://launcher.dylan.lol",
              healthUrl: "http://127.0.0.1:4074/health",
              running: true,
              managed: false,
              canStart: false,
              message: "Friends service is online",
            };
          }
          if (cmd === "exchange_stored_minecraft_session_for_backend_session") {
            return {
              accountId,
              tokenType: "Bearer",
              sessionKind: "minecraft",
              minecraftUuid: accountId,
              minecraftName: username,
              accessToken,
              authorizationHeader,
              issuedAtUnixSeconds: Math.floor(Date.now() / 1000),
              expiresAtUnixSeconds: Math.floor(Date.now() / 1000) + 3600,
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        listen: async () => () => undefined,
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  }, { username: "Dilll", ...options });
}

async function installEmptyLauncherStub(page: Page) {
  await page.addInitScript(() => {
    const snapshot = {
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: [],
      imports: [],
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") return snapshot;
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "list_minecraft_versions") {
            return [
              { id: "1.21.8", type: "release", url: "https://example.invalid/1.21.8.json" },
              { id: "25w26a", type: "snapshot", url: "https://example.invalid/25w26a.json" },
            ];
          }
          if (cmd === "scan_imports") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        listen: async () => () => undefined,
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });
}

async function installPastedDiscoverProviderStub(
  page: Page,
  profile: {
    id: string;
    name: string;
    loader: string;
    gameVersion: string;
    installedPackVersion?: string;
  },
) {
  await page.addInitScript((installedProfile) => {
    let installed = false;
    let installRequest: unknown = null;
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: installed ? [{ ...installedProfile, memoryMb: 6144, jvmArgs: [] }] : [],
      imports: [],
    });

    Object.defineProperty(window, "__pastedDiscoverProviderInstallRequest", {
      get: () => installRequest,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { request?: unknown }) => {
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "install_discover_modpack") {
            installRequest = args?.request ?? null;
            installed = true;
            return {
              action: "install_modpack_archive",
              subjectId: installedProfile.id,
              message: `${installedProfile.name} installed successfully.`,
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  }, profile);
}

test("home screen renders the social launcher shell", async ({ page }) => {
  let devSessionRequests = 0;
  await page.route("http://127.0.0.1:4074/dev/sessions", async (route) => {
    devSessionRequests += 1;
    await route.fulfill({ status: 403, body: "Dev sessions unavailable" });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "WinterPack" })).toBeVisible();
  expect(devSessionRequests).toBe(0);
  await expect(page.getByRole("heading", { level: 2, name: "Friends Online" })).toBeVisible();
  await expect(page.getByLabel("Home party panel")).toContainText(/0 parties|1 party/);
  await expect(page.getByLabel("Home party panel")).toContainText(/1 friend online or away|2 friends online or away/);
  await expect(page.getByLabel("Primary pack status")).toContainText("Update");
  await expect(page.getByLabel("Primary pack actions").getByRole("button", { name: "Update" })).toBeVisible();
  await expect(page.getByLabel("Primary pack actions").getByRole("button", { name: "Details" })).toBeVisible();
  await expect(page.getByLabel("Launcher quick status")).toContainText("Account");
  await expect(page.getByLabel("Launcher quick status")).toContainText("Offline ready");
  await expect(page.getByLabel("Launcher quick status")).toContainText("No games running");
  await expect(page.getByLabel("Launcher quick status")).toContainText("No tasks yet");
  await expect(page.getByLabel("Launcher status", { exact: true })).toContainText("Web preview");
  await expect(page.getByLabel("Launcher status message")).toContainText(/Launcher ready|Native bootstrap failed/);
  await expect(page.getByRole("button", { name: "Play" }).first()).toBeVisible();

  await page.getByLabel("Launcher quick status").getByRole("button", { name: /Account/ }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

test("home screen fits the configured desktop minimum width", async ({ page }) => {
  await page.goto("/");

  const metrics = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth);
});

test("pack details chrome clears when navigating to another screen", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Primary pack actions").getByRole("button", { name: "Details" }).click();
  await expect(page.locator(".page-title")).toContainText("Pack Details");
  await expect(page.getByRole("button", { name: "Back to Home" })).toBeVisible();

  await page.getByRole("navigation").getByRole("button", { name: "Library" }).click();

  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.locator(".page-title")).toContainText("Library");
  await expect(page.locator(".page-title")).not.toContainText("Pack Details");
  await expect(page.getByRole("button", { name: "Back to Home" })).toHaveCount(0);
});

test("native shell shows the installed release channel instead of alpha branding", async ({ page }) => {
  await installEmptyLauncherStub(page);
  await page.goto("/");

  const playerCard = page.getByRole("button", { name: /Player (Stable desktop|Dev desktop)/ });
  await expect(playerCard).toBeVisible();
  await expect(playerCard).not.toContainText("Desktop alpha");
});

test("empty launcher guides first profile setup from home and library", async ({ page }) => {
  await installEmptyLauncherStub(page);
  await page.goto("/");

  await expect(page.getByLabel("Primary pack actions")).toBeVisible();
  await expect(page.getByLabel("Primary pack actions").getByRole("button", { name: "Import profiles" })).toBeEnabled();

  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await expect(page.getByRole("heading", { name: "Discover Modpacks" })).toBeVisible();
  await page.getByRole("navigation").getByRole("button", { name: "Home" }).click();
  await page.getByLabel("Primary pack actions").getByRole("button", { name: "Import profiles" }).click();
  await expect(page.getByRole("heading", { name: "Import Profiles" })).toBeVisible();

  await page.getByRole("navigation").getByRole("button", { name: "Library" }).click();
  await expect(page.getByRole("heading", { name: "No profiles yet" })).toBeVisible();
  await page.getByRole("button", { name: "Import profiles" }).click();
  await expect(page.getByRole("heading", { name: "Import Profiles" })).toBeVisible();
  await page.getByRole("navigation").getByRole("button", { name: "Library" }).click();
  await page.getByRole("button", { name: "Create profile" }).click();
  await expect(page.getByLabel("New profile name")).toHaveValue("Minecraft 1.21.8");
  await expect(page.getByLabel("New profile game version")).toHaveValue("1.21.8");
  await expect(page.getByLabel("New profile actions").getByRole("button", { name: "Create profile", exact: true })).toBeVisible();
});

test("empty native launcher checks for importable profiles on first run", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    const snapshot = {
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: [],
      imports: [],
    };
    Object.defineProperty(window, "__firstRunImportInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot;
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "list_minecraft_versions") {
            return [{ id: "1.21.8", type: "release", url: "https://example.invalid/1.21.8.json" }];
          }
          if (cmd === "scan_imports") {
            return [
              {
                id: "prism-family-world",
                source: "Prism Launcher",
                name: "Family World",
                path: "D:/Games/PrismLauncher/instances/FamilyWorld",
                kind: "prism",
                detectedName: "Family World",
                detectedSummary: "Prism profile with saves and options.",
                detectedGameVersion: "1.21.8",
                detectedLoader: "vanilla",
                importableFileCount: 12,
                importableTotalBytes: 4096,
              },
            ];
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        listen: async () => () => undefined,
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");

  await expect(page.getByLabel("Primary pack actions").getByRole("button", { name: "Review found profiles" })).toBeVisible();
  await expect(page.getByLabel("Launcher status message")).toContainText("Found 1 profile to import");
  await page.getByLabel("Primary pack actions").getByRole("button", { name: "Review found profiles" }).click();
  await expect(page.getByRole("heading", { name: "Import Profiles" })).toBeVisible();
  const importRow = page.locator(".import-row").filter({ hasText: "Family World" });
  await expect(importRow).toContainText("1.21.8 - Vanilla");
  await expect(importRow).toContainText("12 files to copy");
  const invoked = await page.evaluate(
    () => (window as typeof window & { __firstRunImportInvokes: string[] }).__firstRunImportInvokes,
  );
  expect(invoked.filter((cmd) => cmd === "scan_imports")).toHaveLength(1);
});

test("empty native launcher explains automatic import check failures", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    const snapshot = {
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: [],
      imports: [],
    };
    Object.defineProperty(window, "__failedFirstRunImportInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot;
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "list_minecraft_versions") {
            return [{ id: "1.21.8", type: "release", url: "https://example.invalid/1.21.8.json" }];
          }
          if (cmd === "scan_imports") throw new Error("scan failed");
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        listen: async () => () => undefined,
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");

  await expect(page.getByLabel("Launcher status message")).toContainText("Could not check for existing profiles automatically");
  await expect(page.getByLabel("Launcher status message")).not.toContainText("Import scan skipped");
  await expect(page.getByLabel("Primary pack actions").getByRole("button", { name: "Import profiles" })).toBeVisible();
  await expect(page.getByLabel("Primary pack actions").getByRole("button", { name: "Review found profiles" })).toHaveCount(0);
  const invoked = await page.evaluate(
    () => (window as typeof window & { __failedFirstRunImportInvokes: string[] }).__failedFirstRunImportInvokes,
  );
  expect(invoked.filter((cmd) => cmd === "scan_imports")).toHaveLength(1);
});

test("settings exposes stable and dev launcher update channels", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Launcher updates" })).toBeVisible();
  await expect(page.getByLabel("Launcher update channel").getByRole("button", { name: "Stable" })).toBeVisible();
  await page.getByLabel("Launcher update channel").getByRole("button", { name: "Dev" }).click();
  await expect(page.getByText("Dev gets fixes and new features first. Use it when you are helping test something.")).toBeVisible();
  await expect(
    page.getByText("Dev installs alongside Stable, so you can test fixes without replacing your main launcher."),
  ).toBeVisible();
  await expect(page.getByText("You can check either channel first. Nothing changes until you install the launcher setup.")).toBeVisible();
  await expect(page.getByText("Installed now: Stable. Checking: Dev.")).toBeVisible();
});

test("settings dev channel check opens trusted dev installer", async ({ page }) => {
  let openedUrl = "";
  await page.route("https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/latest-dev.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        version: "4.0.2-1",
        url: "https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/TheBoysLauncher%20Dev_4.0.2-1_x64-setup.exe",
      }),
    });
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "__openedDevInstallerUrl", {
      value: "",
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "__openedDevInstallerCount", {
      value: 0,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { url?: string }) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "open_external_url") {
            (window as typeof window & { __openedDevInstallerCount: number }).__openedDevInstallerCount += 1;
            (window as typeof window & { __openedDevInstallerUrl: string }).__openedDevInstallerUrl = args?.url ?? "";
            await new Promise((resolve) => window.setTimeout(resolve, 200));
            return undefined;
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Launcher update channel").getByRole("button", { name: "Dev" }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByLabel("Settings overview")).toContainText(
    "Dev build 4.0.2-1 is ready. Installing will open the launcher setup.",
  );
  const installButton = page.getByRole("button", { name: "Get Dev build" });
  await installButton.click();
  await expect(page.getByRole("button", { name: "Opening..." })).toBeDisabled();
  await page.getByRole("button", { name: "Opening..." }).click({ force: true });
  await expect(page.getByText("Dev installer opened")).toBeVisible();
  openedUrl = await page.evaluate(() => (window as typeof window & { __openedDevInstallerUrl: string }).__openedDevInstallerUrl);
  expect(openedUrl).toBe(
    "https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/TheBoysLauncher%20Dev_4.0.2-1_x64-setup.exe",
  );
  const openedCount = await page.evaluate(() => (window as typeof window & { __openedDevInstallerCount: number }).__openedDevInstallerCount);
  expect(openedCount).toBe(1);
});

test("settings dev channel hides native trusted-download opener failures", async ({ page }) => {
  await page.route("https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/latest-dev.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        version: "4.0.2-1",
        url: "https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/TheBoysLauncher%20Dev_4.0.2-1_x64-setup.exe",
      }),
    });
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "open_external_url") {
            throw new Error("Only TheBoysLauncher installer downloads can be opened.");
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Launcher update channel").getByRole("button", { name: "Dev" }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByRole("button", { name: "Get Dev build" }).click();

  await expect(page.getByLabel("Settings overview")).toContainText(
    "Launcher update download could not be verified. Check again before installing.",
  );
  await expect(page.getByLabel("Settings overview")).not.toContainText("Only TheBoysLauncher installer downloads");
});

test("settings dev channel rejects lookalike dev installer URLs", async ({ page }) => {
  await page.route("https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/latest-dev.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        version: "4.0.2-1",
        url: "https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/TheBoysLauncherDev_4.0.2-1_x64-setup.exe",
      }),
    });
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "__openedLookalikeDevInstallerUrl", {
      value: "",
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { url?: string }) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "open_external_url") {
            (window as typeof window & { __openedLookalikeDevInstallerUrl: string }).__openedLookalikeDevInstallerUrl =
              args?.url ?? "";
            return undefined;
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Launcher update channel").getByRole("button", { name: "Dev" }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByLabel("Settings overview")).toContainText("Update information is missing a trusted launcher download");
  await expect(page.getByRole("button", { name: "Get Dev build" })).toHaveCount(0);
  const openedUrl = await page.evaluate(
    () => (window as typeof window & { __openedLookalikeDevInstallerUrl: string }).__openedLookalikeDevInstallerUrl,
  );
  expect(openedUrl).toBe("");
});

test("settings dev channel rejects manifests for the wrong release channel", async ({ page }) => {
  await page.route("https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/latest-dev.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        channel: "stable",
        version: "4.0.2-1",
        url: "https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/TheBoysLauncher%20Dev_4.0.2-1_x64-setup.exe",
      }),
    });
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "__openedWrongChannelDevInstallerUrl", {
      value: "",
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { url?: string }) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "open_external_url") {
            (window as typeof window & { __openedWrongChannelDevInstallerUrl: string }).__openedWrongChannelDevInstallerUrl =
              args?.url ?? "";
            return undefined;
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Launcher update channel").getByRole("button", { name: "Dev" }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByLabel("Settings overview")).toContainText("Dev update information points at the Stable channel");
  await expect(page.getByRole("button", { name: "Get Dev build" })).toHaveCount(0);
  const openedUrl = await page.evaluate(
    () => (window as typeof window & { __openedWrongChannelDevInstallerUrl: string }).__openedWrongChannelDevInstallerUrl,
  );
  expect(openedUrl).toBe("");
});

test("settings dev channel rejects non-installer update manifest URLs", async ({ page }) => {
  let openedUrl = "";
  await page.route("https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/latest-dev.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        version: "4.0.2-1",
        url: "https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/latest-dev.json",
      }),
    });
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "__openedRejectedDevInstallerUrl", {
      value: "",
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { url?: string }) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "open_external_url") {
            (window as typeof window & { __openedRejectedDevInstallerUrl: string }).__openedRejectedDevInstallerUrl =
              args?.url ?? "";
            return undefined;
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Launcher update channel").getByRole("button", { name: "Dev" }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByLabel("Settings overview")).toContainText("Update information is missing a trusted launcher download");
  await expect(page.getByRole("button", { name: "Get Dev build" })).toHaveCount(0);
  openedUrl = await page.evaluate(
    () => (window as typeof window & { __openedRejectedDevInstallerUrl: string }).__openedRejectedDevInstallerUrl,
  );
  expect(openedUrl).toBe("");
});

test("settings dev channel rejects decorated installer update URLs", async ({ page }) => {
  let openedUrl = "";
  await page.route("https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/latest-dev.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        version: "4.0.2-1",
        url: "https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/TheBoysLauncher%20Dev_4.0.2-1_x64-setup.exe?download=1",
      }),
    });
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "__openedDecoratedDevInstallerUrl", {
      value: "",
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { url?: string }) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "open_external_url") {
            (window as typeof window & { __openedDecoratedDevInstallerUrl: string }).__openedDecoratedDevInstallerUrl =
              args?.url ?? "";
            return undefined;
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Launcher update channel").getByRole("button", { name: "Dev" }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByLabel("Settings overview")).toContainText("Update information is missing a trusted launcher download");
  await expect(page.getByRole("button", { name: "Get Dev build" })).toHaveCount(0);
  openedUrl = await page.evaluate(
    () => (window as typeof window & { __openedDecoratedDevInstallerUrl: string }).__openedDecoratedDevInstallerUrl,
  );
  expect(openedUrl).toBe("");
});

test("settings dev channel hides raw HTTP update failures", async ({ page }) => {
  await page.route("https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/latest-dev.json", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "text/plain",
      body: "temporarily unavailable",
    });
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Launcher update channel").getByRole("button", { name: "Dev" }).click();
  await page.getByRole("button", { name: "Check" }).click();

  await expect(page.getByLabel("Settings overview")).toContainText("Update check is unavailable right now. Try again later.");
  await expect(page.getByLabel("Settings overview")).not.toContainText("HTTP 503");
  await expect(page.getByLabel("Settings overview")).not.toContainText("503");
});

test("discover shows provider plan and pack-link install entry point", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();

  await expect(page.getByRole("heading", { name: "Discover Modpacks" })).toBeVisible();
  await expect(page.getByText("Browse providers, install packs, and keep setup automatic.")).toBeVisible();
  await expect(page.getByText("Install from link")).toBeVisible();
  await expect(page.getByText("Install from archive")).toHaveCount(0);
  const discoverProviders = page.getByLabel("Discover providers", { exact: true });
  await expect(discoverProviders).toContainText("All sources");
  await expect(discoverProviders).toContainText("CurseForge");
  await expect(discoverProviders).toContainText("Modrinth");
  await expect(discoverProviders).toContainText("ATLauncher");
  await expect(discoverProviders).toContainText("FTB");
  await expect(discoverProviders).toContainText("FTB Legacy");
  await expect(discoverProviders).toContainText("FTB Private");
  await expect(discoverProviders).toContainText("Technic");
  await expect(discoverProviders.getByText("Search the public pack sources together.")).toBeVisible();
  await expect(page.getByText("Search the recommended providers first, then compatible sources for packs they can prepare automatically.")).toBeVisible();
  await expect(page.getByText("Recommended for pack pages, project files, and zip exports.")).toBeVisible();
  await expect(discoverProviders).toContainText("Recommended");
  await expect(discoverProviders).toContainText("Compatible packs");
  await expect(discoverProviders).toContainText("Code lookup");
  await expect(page.getByLabel("Additional discover providers")).toHaveCount(0);
  await expect(page.getByLabel("Pack name")).toHaveValue("");
  await expect(page.getByLabel("Pack link")).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "Search", exact: true })).toHaveValue("");
  await expect(page.getByText("Search every public source together, or press Browse to see a mixed starter list.")).toBeVisible();
  await expect(page.getByText("Paste a pack link first.")).toBeVisible();
  await expect(page.getByText("Paste CurseForge, Modrinth, ATLauncher, FTB, FTB Legacy, or Technic links")).toBeVisible();
  await expect(page.getByText("Private FTB packs can use the code lookup below or private:code in All sources.")).toBeVisible();
  await expect(page.getByText("Provider pages, .zip, .mrpack")).toBeVisible();
  await expect(page.getByText("Recommended first", { exact: true })).toBeVisible();

  await expect(page.getByLabel("All sources search")).toContainText("Search ready");
  await page.getByLabel("All sources search").getByRole("button", { name: "Browse" }).click();
  await expect(page.getByText("Showing preview All sources results.")).toBeVisible();
  await expect(page.getByText("Enigmatica 9 Expert")).toBeVisible();
  await expect(page.getByText("Fabulously Optimized")).toBeVisible();

  await discoverProviders.getByRole("button", { name: /^CurseForge Recommended/ }).click();
  await expect(page.getByText("Search CurseForge here, or paste a CurseForge pack page, project file, or zip link above.")).toBeVisible();
  await expect(page.getByText("Search CurseForge, or press Browse to see public packs.")).toBeVisible();
  await expect(page.getByLabel("CurseForge search")).toContainText("Recommended");
  await page.getByLabel("CurseForge search").getByRole("button", { name: "Browse" }).click();
  await expect(page.getByText("Showing preview CurseForge results.")).toBeVisible();
  await expect(page.getByText("Enigmatica 9 Expert")).toBeVisible();
  await expect(page.getByLabel("CurseForge search")).not.toContainText("preview result");
  await expect(page.getByLabel("CurseForge search")).not.toContainText("automatic zip importer");
  await expect(page.getByText("The launcher can prepare this CurseForge pack automatically.")).toBeVisible();
  await expect(page.getByText("An expert progression pack with deep automation, quests, and long-term goals.")).toBeVisible();
  await expect(page.getByText("Search CurseForge here when search is available")).toHaveCount(0);
  await page
    .getByLabel("CurseForge search")
    .getByRole("button", { name: "Install" })
    .first()
    .click();
  await expect(page.getByText("CurseForge installs require the desktop app")).toBeVisible();

  await discoverProviders.getByRole("button", { name: /^Modrinth Recommended/ }).click();
  await expect(page.getByText("Search Modrinth here, or paste a Modrinth pack page or direct .mrpack link above.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Search", exact: true })).toHaveValue("");
  await expect(page.getByText("Search Modrinth, or press Browse to see public packs.")).toBeVisible();
  await expect(page.getByLabel("Modrinth search")).toContainText("Recommended");
  await page.getByLabel("Modrinth search").getByRole("button", { name: "Browse" }).click();
  await expect(page.getByText("Showing preview Modrinth results.")).toBeVisible();
  await expect(page.getByText("Fabulously Optimized")).toBeVisible();
  await page
    .getByLabel("Modrinth search")
    .getByRole("button", { name: "Install" })
    .first()
    .click();
  await expect(page.getByText("Modrinth installs require the desktop app")).toBeVisible();

  await discoverProviders.getByRole("button", { name: /^ATLauncher Compatible packs/ }).click();
  await expect(page.getByText("Search public ATLauncher packs here, or paste an ATLauncher pack page above.")).toBeVisible();
  await page.getByLabel("ATLauncher search").getByRole("button", { name: "Browse" }).click();
  await expect(page.getByText("Showing preview ATLauncher results.")).toBeVisible();
  await expect(page.getByText("SevTech: Ages")).toBeVisible();
  await expect(page.getByLabel("ATLauncher search")).toContainText("Compatible packs");

  await discoverProviders.getByRole("button", { name: /^FTB Compatible packs/ }).click();
  await expect(page.getByText("Search current FTB app packs here, or paste an FTB pack page above.")).toBeVisible();
  await expect(page.getByText("Compatible packs install automatically when the pack provides the files the launcher needs.")).toBeVisible();
  await expect(page.getByText("provider metadata exposes")).toHaveCount(0);
  await page.getByLabel("FTB search").getByRole("button", { name: "Browse" }).click();
  await expect(page.getByText("Showing preview FTB results.")).toBeVisible();
  await expect(page.getByText("FTB Presents Direwolf20 1.21")).toBeVisible();

  await discoverProviders.getByRole("button", { name: /^FTB Legacy Compatible packs/ }).click();
  await expect(page.getByText("Search the legacy FTB feeds here.")).toBeVisible();
  await page.getByLabel("FTB Legacy search").getByRole("button", { name: "Browse" }).click();
  await expect(page.getByText("Showing preview FTB Legacy results.")).toBeVisible();
  await expect(page.getByText("FTB Academy")).toBeVisible();
  await expect(page.getByLabel("FTB Legacy search")).toContainText("Compatible packs");

  await discoverProviders.getByRole("button", { name: /^FTB Private Code lookup/ }).click();
  await expect(page.getByText("Enter a private FTB code here.")).toBeVisible();
  await expect(page.getByText("Enter a private FTB code to look up a shared pack.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Look up a private pack" })).toBeVisible();
  await page.getByLabel("FTB Private search").getByRole("button", { name: "Look up" }).click();
  await expect(page.getByText("Showing preview FTB Private results.")).toBeVisible();
  await expect(page.getByText("Family Pack")).toBeVisible();
  await expect(page.getByLabel("FTB Private search")).toContainText("Code lookup");

  await discoverProviders.getByRole("button", { name: /^Technic Compatible packs/ }).click();
  await expect(
    page.getByText("Direct zip, Solder, and readable legacy Forge packs install automatically."),
  ).toBeVisible();
  await page.getByLabel("Technic search").getByRole("button", { name: "Browse" }).click();
  await expect(page.getByText("Showing preview Technic results.")).toBeVisible();
  await expect(page.locator(".discover-result-row").filter({ hasText: "Tekxit 3 [Official]" })).toContainText(
    "Forge - 1.12.2",
  );
  await expect(page.getByLabel("Technic search")).toContainText("Compatible packs");

  await page.getByLabel("Pack link").fill("https://i.dylan.lol/dylan/Enigmatica9Expert-1.27.0.zip");
  await expect(page.getByText("Will install as Enigmatica 9 Expert 1.27.0.")).toBeVisible();
  await expect(page.getByText("Pack .zip link detected.")).toBeVisible();
  await page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true }).click();
  await expect(page.getByText("Discover installs require the desktop app")).toBeVisible();
});

test("discover installs stay available while another profile task is running", async ({ page }) => {
  await page.addInitScript(() => {
    let discoverInstalled = false;
    const invoked: string[] = [];
    let installRequest: unknown = null;
    const pendingPackInstall = new Promise(() => undefined);
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Cozy survival with friends.",
          version: "2.3.7",
          status: "update_available",
          accent: "#67e8b9",
          installedPlayers: 0,
          defaultServer: "The Cabin",
        },
      ],
      profiles: discoverInstalled
        ? [
            {
              id: "fabulously-optimized",
              name: "Fabulously Optimized",
              loader: "fabric",
              gameVersion: "1.21.8",
              memoryMb: 4096,
              jvmArgs: [],
            },
          ]
        : [],
      imports: [],
    });

    Object.defineProperty(window, "__concurrentDiscoverInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__concurrentDiscoverInstallRequest", {
      get: () => installRequest,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { request?: unknown }) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "list_minecraft_versions") {
            return [{ id: "1.21.8", type: "release", url: "https://example.invalid/1.21.8.json" }];
          }
          if (cmd === "plan_install_pack") return pendingPackInstall;
          if (cmd === "search_discover_modpacks") {
            return [
              {
                provider: "modrinth",
                projectId: "1KVo5zza",
                slug: "fabulously-optimized",
                title: "Fabulously Optimized",
                description: "A fast client modpack focused on performance and smooth play.",
                author: "robotkoer",
                downloads: 12_000_000,
                follows: 18_000,
                gameVersions: ["1.21.8"],
                loaders: ["fabric"],
                latestVersionId: "modrinth-version-1",
                installAvailable: true,
              },
            ];
          }
          if (cmd === "install_discover_modpack") {
            installRequest = args?.request ?? null;
            discoverInstalled = true;
            return {
              action: "install_modpack_archive",
              subjectId: "fabulously-optimized",
              status: "completed",
              message: "Fabulously Optimized installed successfully.",
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByLabel("Primary pack actions").getByRole("button", { name: "Update" }).click();
  await expect(page.getByLabel("Launcher quick status")).toContainText("Installing...");

  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await page.getByLabel("Discover providers", { exact: true }).getByRole("button", { name: /^Modrinth Recommended/ }).click();
  await page.getByRole("textbox", { name: "Search", exact: true }).fill("fabulously optimized");
  await page.getByLabel("Modrinth search").getByRole("button", { name: "Search" }).click();
  const result = page.locator(".discover-result-row").filter({ hasText: "Fabulously Optimized" });
  await expect(result).toBeVisible();
  await expect(result.getByRole("button", { name: "Install" })).toBeEnabled();
  await result.getByRole("button", { name: "Install" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText("Fabulously Optimized installed successfully.");
  const invoked = await page.evaluate(
    () => (window as typeof window & { __concurrentDiscoverInvokes: string[] }).__concurrentDiscoverInvokes,
  );
  const request = await page.evaluate(
    () =>
      (window as typeof window & { __concurrentDiscoverInstallRequest: { provider?: string; projectId?: string } | null })
        .__concurrentDiscoverInstallRequest,
  );
  expect(invoked).toContain("plan_install_pack");
  expect(invoked).toContain("install_discover_modpack");
  expect(request?.provider).toBe("modrinth");
  expect(request?.projectId).toBe("1KVo5zza");
});

test("discover all sources uses native aggregate search and installs selected provider result", async ({ page }) => {
  await page.addInitScript(() => {
    let installed = false;
    const searchedProviders: string[] = [];
    let installRequest: unknown = null;
    const installedProfile = {
      id: "fabulously-optimized",
      name: "Fabulously Optimized",
      loader: "fabric",
      gameVersion: "1.21.8",
      installedPackVersion: "preview",
      memoryMb: 6144,
      jvmArgs: [],
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: installed ? [installedProfile] : [],
      imports: [],
    });

    Object.defineProperty(window, "__discoverAllSourcesState", {
      get: () => ({ searchedProviders, installRequest }),
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { provider?: string; request?: unknown }) => {
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "search_discover_modpacks") {
            searchedProviders.push(args?.provider ?? "");
            if (args?.provider === "all") {
              return [
                {
                  provider: "modrinth",
                  projectId: "1KVo5zza",
                  slug: "fabulously-optimized",
                  title: "Fabulously Optimized",
                  description: "A fast client modpack focused on performance and smooth play.",
                  author: "robotkoer",
                  downloads: 12_000_000,
                  follows: 18_000,
                  gameVersions: ["1.21.8"],
                  loaders: ["fabric"],
                  iconUrl: null,
                  latestVersionId: "preview",
                  installAvailable: true,
                },
                {
                  provider: "curseforge",
                  projectId: "890405",
                  slug: "enigmatica9expert",
                  title: "Enigmatica 9 Expert",
                  description: "An expert progression pack.",
                  author: "EnigmaticaModpacks",
                  downloads: 2_400_000,
                  follows: 0,
                  gameVersions: ["1.19.2"],
                  loaders: ["forge"],
                  iconUrl: null,
                  latestVersionId: "5650506",
                  installAvailable: true,
                },
              ];
            }
            return [];
          }
          if (cmd === "install_discover_modpack") {
            installRequest = args?.request ?? null;
            installed = true;
            return {
              action: "install_modpack_archive",
              subjectId: "fabulously-optimized",
              message: "Profile repair completed.",
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await page.getByLabel("All sources search").getByRole("button", { name: "Browse" }).click();
  await expect(page.getByText("Found 2 All sources modpacks.")).toBeVisible();
  await expect(page.locator(".discover-result-row").filter({ hasText: "Fabulously Optimized" })).toContainText("Modrinth");
  await expect(page.locator(".discover-result-row").filter({ hasText: "Enigmatica 9 Expert" })).toContainText("CurseForge");

  await page.locator(".discover-result-row").filter({ hasText: "Fabulously Optimized" }).getByRole("button", { name: "Install" }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.locator(".profile-row").filter({ hasText: "Fabulously Optimized" })).toContainText("1.21.8");

  const state = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __discoverAllSourcesState: { searchedProviders: string[]; installRequest: unknown };
        }
      ).__discoverAllSourcesState,
  );
  expect(state.searchedProviders).toEqual(["all"]);
  expect(state.installRequest).toEqual({
    provider: "modrinth",
    projectId: "1KVo5zza",
    versionId: "preview",
    name: "Fabulously Optimized",
  });
});

test("discover all sources can look up FTB private codes with a shortcut", async ({ page }) => {
  await page.addInitScript(() => {
    let installed = false;
    let installRequest: unknown = null;
    let searchedProvider = "";
    let searchedQuery = "";
    const installedProfile = {
      id: "ftb-private-family-pack",
      name: "Family Pack",
      loader: "forge",
      gameVersion: "1.12.2",
      installedPackVersion: "1.0.0",
      memoryMb: 6144,
      jvmArgs: [],
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: installed ? [installedProfile] : [],
      imports: [],
    });

    Object.defineProperty(window, "__discoverAllPrivateCodeState", {
      get: () => ({ installRequest, searchedProvider, searchedQuery }),
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { provider?: string; query?: string; request?: unknown }) => {
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "search_discover_modpacks") {
            searchedProvider = args?.provider ?? "";
            searchedQuery = args?.query ?? "";
            return [
              {
                provider: "ftb_private",
                projectId: "private:familycode:FamilyPack:FamilyPack.zip",
                slug: "FamilyPack",
                title: "Family Pack",
                description: "A shared private FTB Legacy pack.",
                author: "Private FTB Legacy",
                downloads: 0,
                follows: 0,
                gameVersions: ["1.12.2"],
                loaders: [],
                iconUrl: null,
                latestVersionId: "1.0.0",
                installAvailable: true,
              },
            ];
          }
          if (cmd === "install_discover_modpack") {
            installRequest = args?.request ?? null;
            installed = true;
            return {
              action: "install_modpack_archive",
              subjectId: "ftb-private-family-pack",
              message: "Family Pack installed successfully.",
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await page.getByLabel("All sources search").getByRole("textbox", { name: "Search" }).fill("private:familycode");
  await page.getByLabel("All sources search").getByRole("button", { name: "Search" }).click();
  const result = page.locator(".discover-result-row").filter({ hasText: "Family Pack" });
  await expect(result).toContainText("FTB Private");
  await result.getByRole("button", { name: "Install" }).click();

  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.locator(".profile-row").filter({ hasText: "Family Pack" })).toContainText("1.12.2");
  const state = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __discoverAllPrivateCodeState: { installRequest: unknown; searchedProvider: string; searchedQuery: string };
        }
      ).__discoverAllPrivateCodeState,
  );
  expect(state.searchedProvider).toBe("all");
  expect(state.searchedQuery).toBe("private:familycode");
  expect(state.installRequest).toEqual({
    provider: "ftb_private",
    projectId: "private:familycode:FamilyPack:FamilyPack.zip",
    versionId: "1.0.0",
    name: "Family Pack",
  });
});

test("discover pack-link form explains invalid links before install", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();

  const installButton = page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true });
  await expect(page.getByLabel("Pack name")).toHaveValue("");
  await expect(page.getByLabel("Pack link")).toHaveValue("");
  await expect(page.getByText("Paste a pack link first.")).toBeVisible();
  await expect(installButton).toBeDisabled();

  await page.getByLabel("Pack link").fill("https://i.dylan.lol/dylan/Enigmatica9Expert-1.27.0.zip");
  await expect(page.getByText("Will install as Enigmatica 9 Expert 1.27.0.")).toBeVisible();
  await expect(installButton).toBeEnabled();

  await page.getByLabel("Pack link").fill("http://example.com/pack.zip");
  await expect(
    page.getByText("Use a direct https:// link to a pack download or provider page."),
  ).toBeVisible();
  await expect(installButton).toBeDisabled();

  await page.getByLabel("Pack link").fill("https://example.com/download");
  await expect(page.getByText("Use a pack download ending in .zip/.mrpack, or a supported provider page link.")).toBeVisible();
  await expect(installButton).toBeDisabled();

  await page.getByLabel("Pack link").fill("https://example.com/KitchenSink.mrpack");
  await expect(page.getByText("Will install as Kitchen Sink.")).toBeVisible();
  await expect(page.getByText("Modrinth .mrpack link detected.")).toBeVisible();
  await expect(installButton).toBeEnabled();
});

test("discover CurseForge search explains missing catalog configuration", async ({ page }) => {
  await page.addInitScript(() => {
    const snapshot = {
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: [],
      imports: [],
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { provider?: string }) => {
          if (cmd === "bootstrap_snapshot") return snapshot;
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "list_minecraft_versions") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "search_discover_modpacks" && args?.provider === "curseforge") {
            throw new Error(
              "CurseForge search needs THEBOYS_CURSEFORGE_API_KEY configured in the launcher build or environment",
            );
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        listen: async () => () => undefined,
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await page.getByLabel("Discover providers", { exact: true }).getByRole("button", { name: /^CurseForge Recommended/ }).click();
  await page.getByLabel("CurseForge search").getByRole("button", { name: "Browse" }).click();

  await expect(page.getByText("CurseForge search is unavailable right now.")).toBeVisible();
  await expect(page.getByText("THEBOYS_CURSEFORGE_API_KEY")).toHaveCount(0);
});

test("discover native search failure clears stale results", async ({ page }) => {
  await page.addInitScript(() => {
    const snapshot = {
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: [],
      imports: [],
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { provider?: string }) => {
          if (cmd === "bootstrap_snapshot") return snapshot;
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "list_minecraft_versions") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "search_discover_modpacks" && args?.provider === "all") {
            return [
              {
                provider: "modrinth",
                projectId: "1KVo5zza",
                slug: "fabulously-optimized",
                title: "Fabulously Optimized",
                description: "A fast client modpack focused on performance and smooth play.",
                author: "robotkoer",
                downloads: 12_000_000,
                follows: 18_000,
                gameVersions: ["1.21.8"],
                loaders: ["fabric"],
                iconUrl: null,
                latestVersionId: "preview",
                installAvailable: true,
              },
            ];
          }
          if (cmd === "search_discover_modpacks" && args?.provider === "curseforge") {
            throw new Error(
              "CurseForge search needs THEBOYS_CURSEFORGE_API_KEY configured in the launcher build or environment",
            );
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        listen: async () => () => undefined,
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await page.getByLabel("All sources search").getByRole("button", { name: "Browse" }).click();
  await expect(page.getByText("Fabulously Optimized")).toBeVisible();

  await page.getByLabel("Discover providers", { exact: true }).getByRole("button", { name: /^CurseForge Recommended/ }).click();
  await page.getByLabel("CurseForge search").getByRole("button", { name: "Browse" }).click();

  await expect(page.getByText("CurseForge search is unavailable right now.")).toBeVisible();
  await expect(page.getByText("THEBOYS_CURSEFORGE_API_KEY")).toHaveCount(0);
  await expect(page.getByText("Fabulously Optimized")).toHaveCount(0);
});

test("discover archive install refreshes the library profile list", async ({ page }) => {
  await page.addInitScript(() => {
    let installed = false;
    let archiveRequest: unknown = null;
    const installedProfile = {
      id: "enigmatica-9-expert",
      name: "Enigmatica 9 Expert",
      loader: "forge",
      gameVersion: "1.19.2",
      installedPackVersion: "1.27.0",
      memoryMb: 6144,
      jvmArgs: [],
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: installed ? [installedProfile] : [],
      imports: [],
    });

    Object.defineProperty(window, "__discoverArchiveInstallRequest", {
      get: () => archiveRequest,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { request?: unknown }) => {
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") {
            return installed
              ? [
                  {
                    id: "enigmatica-installed",
                    operationId: "00000000-0000-4000-8000-000000000301",
                    operation: "install_modpack_archive",
                    subjectId: "enigmatica-9-expert",
                    kind: "completed",
                    message: "Enigmatica 9 Expert installed successfully.",
                    progressPercent: 100,
                    occurredAtUnixSeconds: 1_710_000_000,
                  },
                ]
              : [];
          }
          if (cmd === "list_managed_processes") return [];
          if (cmd === "install_modpack_archive") {
            archiveRequest = args?.request ?? null;
            installed = true;
            return {
              action: "install_modpack_archive",
              subjectId: "enigmatica-9-expert",
              message: "Enigmatica 9 Expert installed successfully.",
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await page.getByLabel("Pack name").fill("");
  await page.getByLabel("Pack link").fill("https://i.dylan.lol/dylan/Enigmatica9Expert-1.27.0.zip");
  await expect(page.getByText("Will install as Enigmatica 9 Expert 1.27.0.")).toBeVisible();
  await page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.getByLabel("Library filters")).toContainText('Searching "Enigmatica 9 Expert"');
  const installedProfileRow = page.locator(".profile-row").filter({ hasText: "Enigmatica 9 Expert" });
  await expect(installedProfileRow).toContainText("1.19.2");
  await expect(installedProfileRow).toContainText("Forge");
  await page.getByRole("button", { name: "Activity" }).click();
  await expect(page.getByLabel("Recent activity")).toContainText("Install modpack - enigmatica 9 expert");
  await expect(page.getByLabel("Recent activity")).toContainText("Enigmatica 9 Expert installed successfully.");
  const request = await page.evaluate(
    () => (window as typeof window & { __discoverArchiveInstallRequest: unknown }).__discoverArchiveInstallRequest,
  );
  expect(request).toEqual({
    name: "Enigmatica 9 Expert 1.27.0",
    url: "https://i.dylan.lol/dylan/Enigmatica9Expert-1.27.0.zip",
  });
});

test("discover Modrinth search install uses native provider installer and refreshes library", async ({ page }) => {
  await page.addInitScript(() => {
    let installed = false;
    let installRequest: unknown = null;
    const installedProfile = {
      id: "fabulously-optimized",
      name: "Fabulously Optimized",
      loader: "fabric",
      gameVersion: "1.21.8",
      installedPackVersion: "7.1.0",
      memoryMb: 6144,
      jvmArgs: [],
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: installed ? [installedProfile] : [],
      imports: [],
    });

    Object.defineProperty(window, "__discoverModrinthInstallState", {
      get: () => ({ installRequest }),
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { query?: string; request?: unknown }) => {
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") {
            return installed
              ? [
                  {
                    id: "modrinth-installed",
                    operationId: "00000000-0000-4000-8000-000000000302",
                    operation: "install_modpack_archive",
                    subjectId: "fabulously-optimized",
                    kind: "completed",
                    message: "Fabulously Optimized installed successfully.",
                    progressPercent: 100,
                    occurredAtUnixSeconds: 1_710_000_001,
                  },
                ]
              : [];
          }
          if (cmd === "list_managed_processes") return [];
          if (cmd === "search_discover_modpacks") {
            return [
              {
                provider: "modrinth",
                projectId: "1KVo5zza",
                slug: "fabulously-optimized",
                title: "Fabulously Optimized",
                description: "A fast client modpack focused on performance and smooth play.",
                author: "robotkoer",
                downloads: 12_000_000,
                follows: 18_000,
                gameVersions: ["1.21.8", "1.21.7"],
                loaders: ["fabric"],
                iconUrl: null,
                latestVersionId: "preview",
                installAvailable: true,
              },
            ];
          }
          if (cmd === "install_discover_modpack") {
            installRequest = args?.request ?? null;
            installed = true;
            return {
              action: "install_modpack_archive",
              subjectId: "fabulously-optimized",
              message: "Fabulously Optimized installed successfully.",
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await page.getByLabel("Discover providers", { exact: true }).getByRole("button", { name: /^Modrinth Recommended/ }).click();
  await page.getByLabel("Modrinth search").getByRole("button", { name: "Browse" }).click();
  const result = page.locator(".discover-result-row").filter({ hasText: "Fabulously Optimized" });
  await expect(result).toContainText("Fabric - 1.21.8, 1.21.7");
  await result.getByRole("button", { name: "Install" }).click();

  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.getByLabel("Library filters")).toContainText('Searching "Fabulously Optimized"');
  const installedProfileRow = page.locator(".profile-row").filter({ hasText: "Fabulously Optimized" });
  await expect(installedProfileRow).toContainText("1.21.8");
  await expect(installedProfileRow).toContainText("Fabric");
  await expect(page.getByText("Profile repair completed")).toHaveCount(0);
  const state = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __discoverModrinthInstallState: { installRequest: unknown };
        }
      ).__discoverModrinthInstallState,
  );
  expect(state).toEqual({
    installRequest: {
      provider: "modrinth",
      projectId: "1KVo5zza",
      versionId: "preview",
      name: "Fabulously Optimized",
    },
  });
});

test("discover CurseForge search install uses native provider installer and refreshes library", async ({ page }) => {
  await page.addInitScript(() => {
    let installed = false;
    let installRequest: unknown = null;
    let searchedProvider = "";
    const installedProfile = {
      id: "enigmatica-9-expert",
      name: "Enigmatica 9 Expert",
      loader: "forge",
      gameVersion: "1.19.2",
      installedPackVersion: "5650506",
      memoryMb: 6144,
      jvmArgs: [],
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: installed ? [installedProfile] : [],
      imports: [],
    });

    Object.defineProperty(window, "__discoverCurseForgeInstallRequest", {
      get: () => ({ installRequest, searchedProvider }),
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { provider?: string; query?: string; request?: unknown }) => {
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") {
            return installed
              ? [
                  {
                    id: "curseforge-installed",
                    operationId: "00000000-0000-4000-8000-000000000313",
                    operation: "install_modpack_archive",
                    subjectId: "enigmatica-9-expert",
                    kind: "completed",
                    message: "Enigmatica 9 Expert installed successfully.",
                    progressPercent: 100,
                    occurredAtUnixSeconds: 1_710_000_002,
                  },
                ]
              : [];
          }
          if (cmd === "list_managed_processes") return [];
          if (cmd === "search_discover_modpacks") {
            searchedProvider = args?.provider ?? "";
            return [
              {
                provider: "curseforge",
                projectId: "890405",
                slug: "enigmatica9expert",
                title: "Enigmatica 9 Expert",
                description: "An expert pack from CurseForge.",
                author: "EnigmaticaModpacks",
                downloads: 2_400_000,
                follows: 0,
                gameVersions: ["1.19.2"],
                loaders: ["forge"],
                iconUrl: null,
                latestVersionId: "5650506",
                installAvailable: true,
                installNote: "The launcher can prepare this CurseForge pack automatically.",
              },
            ];
          }
          if (cmd === "install_discover_modpack") {
            installRequest = args?.request ?? null;
            installed = true;
            return {
              action: "install_modpack_archive",
              subjectId: "enigmatica-9-expert",
              message: "Enigmatica 9 Expert installed successfully.",
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await page.getByLabel("Discover providers", { exact: true }).getByRole("button", { name: /^CurseForge Recommended/ }).click();
  await page.getByLabel("CurseForge search").getByRole("button", { name: "Browse" }).click();
  const result = page.locator(".discover-result-row").filter({ hasText: "Enigmatica 9 Expert" });
  await expect(result).toContainText("Forge - 1.19.2");
  await result.getByRole("button", { name: "Install" }).click();

  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  const installedProfileRow = page.locator(".profile-row").filter({ hasText: "Enigmatica 9 Expert" });
  await expect(installedProfileRow).toContainText("1.19.2");
  await expect(installedProfileRow).toContainText("Forge");
  const state = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __discoverCurseForgeInstallRequest: { installRequest: unknown; searchedProvider: string };
        }
      ).__discoverCurseForgeInstallRequest,
  );
  expect(state.searchedProvider).toBe("curseforge");
  expect(state.installRequest).toEqual({
    provider: "curseforge",
    projectId: "890405",
    versionId: "5650506",
    name: "Enigmatica 9 Expert",
  });
});

test("discover FTB search install uses native provider installer and refreshes library", async ({ page }) => {
  await page.addInitScript(() => {
    let installed = false;
    let installRequest: unknown = null;
    let searchedProvider = "";
    const installedProfile = {
      id: "ftb-126",
      name: "FTB Presents Direwolf20 1.21",
      loader: "neoforge",
      gameVersion: "1.21.1",
      installedPackVersion: "12482",
      memoryMb: 6144,
      jvmArgs: [],
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: installed ? [installedProfile] : [],
      imports: [],
    });

    Object.defineProperty(window, "__discoverFtbInstallRequest", {
      get: () => ({ installRequest, searchedProvider }),
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { provider?: string; query?: string; request?: unknown }) => {
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") {
            return installed
              ? [
                  {
                    id: "ftb-installed",
                    operationId: "00000000-0000-4000-8000-000000000303",
                    operation: "install_modpack_archive",
                    subjectId: "ftb-126",
                    kind: "completed",
                    message: "FTB Presents Direwolf20 1.21 installed successfully.",
                    progressPercent: 100,
                    occurredAtUnixSeconds: 1_710_000_002,
                  },
                ]
              : [];
          }
          if (cmd === "list_managed_processes") return [];
          if (cmd === "search_discover_modpacks") {
            searchedProvider = args?.provider ?? "";
            return [
              {
                provider: "ftb",
                projectId: "126",
                slug: "126",
                title: "FTB Presents Direwolf20 1.21",
                description: "Join Direwolf20 for an immersive Minecraft journey.",
                author: "FTB Team",
                downloads: 47_091,
                follows: 239_067,
                gameVersions: ["1.21.1"],
                loaders: ["neoforge"],
                iconUrl: null,
                latestVersionId: "12482",
                installAvailable: true,
              },
            ];
          }
          if (cmd === "install_discover_modpack") {
            installRequest = args?.request ?? null;
            installed = true;
            return {
              action: "install_modpack_archive",
              subjectId: "ftb-126",
              message: "FTB Presents Direwolf20 1.21 installed successfully.",
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await page.getByLabel("Discover providers", { exact: true }).getByRole("button", { name: /^FTB Compatible packs/ }).click();
  await page.getByLabel("FTB search").getByRole("button", { name: "Browse" }).click();
  const result = page.locator(".discover-result-row").filter({ hasText: "FTB Presents Direwolf20 1.21" });
  await expect(result).toContainText("NeoForge - 1.21.1");
  await result.getByRole("button", { name: "Install" }).click();

  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  const installedProfileRow = page.locator(".profile-row").filter({ hasText: "FTB Presents Direwolf20 1.21" });
  await expect(installedProfileRow).toContainText("1.21.1");
  await expect(installedProfileRow).toContainText("NeoForge");
  const state = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __discoverFtbInstallRequest: { installRequest: unknown; searchedProvider: string };
        }
      ).__discoverFtbInstallRequest,
  );
  expect(state.searchedProvider).toBe("ftb");
  expect(state.installRequest).toEqual({
    provider: "ftb",
    projectId: "126",
    versionId: "12482",
    name: "FTB Presents Direwolf20 1.21",
  });
});

test("discover ATLauncher search install uses native provider installer and refreshes library", async ({ page }) => {
  await page.addInitScript(() => {
    let installed = false;
    let installRequest: unknown = null;
    let searchedProvider = "";
    const installedProfile = {
      id: "atlauncher-sevtechages",
      name: "SevTech: Ages",
      loader: "forge",
      gameVersion: "1.12.2",
      installedPackVersion: "3.2.3",
      memoryMb: 6144,
      jvmArgs: [],
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: installed ? [installedProfile] : [],
      imports: [],
    });

    Object.defineProperty(window, "__discoverAtlauncherInstallRequest", {
      get: () => ({ installRequest, searchedProvider }),
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { provider?: string; query?: string; request?: unknown }) => {
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") {
            return installed
              ? [
                  {
                    id: "atlauncher-installed",
                    operationId: "00000000-0000-4000-8000-000000000404",
                    operation: "install_modpack_archive",
                    subjectId: "atlauncher-sevtechages",
                    kind: "completed",
                    message: "SevTech: Ages installed successfully.",
                    progressPercent: 100,
                    occurredAtUnixSeconds: 1_710_000_003,
                  },
                ]
              : [];
          }
          if (cmd === "list_managed_processes") return [];
          if (cmd === "search_discover_modpacks") {
            searchedProvider = args?.provider ?? "";
            return [
              {
                provider: "atlauncher",
                projectId: "SevTechAges",
                slug: "SevTechAges",
                title: "SevTech: Ages",
                description: "ATLauncher progression pack.",
                author: "ATLauncher",
                downloads: 0,
                follows: 0,
                gameVersions: ["1.12.2"],
                loaders: ["forge"],
                iconUrl: null,
                latestVersionId: "3.2.3",
                installAvailable: true,
              },
            ];
          }
          if (cmd === "install_discover_modpack") {
            installRequest = args?.request ?? null;
            installed = true;
            return {
              action: "install_modpack_archive",
              subjectId: "atlauncher-sevtechages",
              message: "SevTech: Ages installed successfully.",
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await page.getByLabel("Discover providers", { exact: true }).getByRole("button", { name: /^ATLauncher Compatible packs/ }).click();
  await page.getByLabel("ATLauncher search").getByRole("button", { name: "Browse" }).click();
  const result = page.locator(".discover-result-row").filter({ hasText: "SevTech: Ages" });
  await expect(result).toContainText("Forge - 1.12.2");
  await result.getByRole("button", { name: "Install" }).click();

  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  const installedProfileRow = page.locator(".profile-row").filter({ hasText: "SevTech: Ages" });
  await expect(installedProfileRow).toContainText("1.12.2");
  await expect(installedProfileRow).toContainText("Forge");
  const state = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __discoverAtlauncherInstallRequest: { installRequest: unknown; searchedProvider: string };
        }
      ).__discoverAtlauncherInstallRequest,
  );
  expect(state.searchedProvider).toBe("atlauncher");
  expect(state.installRequest).toEqual({
    provider: "atlauncher",
    projectId: "SevTechAges",
    versionId: "3.2.3",
    name: "SevTech: Ages",
  });
});

test("discover pasted ATLauncher provider link uses native provider installer", async ({ page }) => {
  await page.addInitScript(() => {
    let installed = false;
    let installRequest: unknown = null;
    const installedProfile = {
      id: "atlauncher-sevtechages",
      name: "Sev Tech Ages",
      loader: "forge",
      gameVersion: "1.12.2",
      installedPackVersion: "3.2.3",
      memoryMb: 6144,
      jvmArgs: [],
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: installed ? [installedProfile] : [],
      imports: [],
    });

    Object.defineProperty(window, "__pastedAtlauncherInstallRequest", {
      get: () => installRequest,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { request?: unknown }) => {
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "install_discover_modpack") {
            installRequest = args?.request ?? null;
            installed = true;
            return {
              action: "install_modpack_archive",
              subjectId: "atlauncher-sevtechages",
              message: "Sev Tech Ages installed successfully.",
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await page.getByLabel("Pack link").fill("https://atlauncher.com/pack/SevTechAges");
  await expect(page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true })).toBeEnabled();
  await page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.locator(".profile-row").filter({ hasText: "Sev Tech Ages" })).toContainText("1.12.2");
  const request = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __pastedAtlauncherInstallRequest: unknown;
        }
      ).__pastedAtlauncherInstallRequest,
  );
  expect(request).toEqual({
    provider: "atlauncher",
    projectId: "SevTechAges",
    versionId: undefined,
    name: "Sev Tech Ages",
  });
});

test("discover pasted CurseForge provider link uses native provider installer", async ({ page }) => {
  await page.addInitScript(() => {
    let installed = false;
    let installRequest: unknown = null;
    const installedProfile = {
      id: "curseforge-enigmatica9expert",
      name: "Enigmatica 9 Expert",
      loader: "forge",
      gameVersion: "1.19.2",
      installedPackVersion: "5650506",
      memoryMb: 6144,
      jvmArgs: [],
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: installed ? [installedProfile] : [],
      imports: [],
    });

    Object.defineProperty(window, "__pastedCurseForgeInstallRequest", {
      get: () => installRequest,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { request?: unknown }) => {
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "install_discover_modpack") {
            installRequest = args?.request ?? null;
            installed = true;
            return {
              action: "install_modpack_archive",
              subjectId: "curseforge-enigmatica9expert",
              message: "Enigmatica 9 Expert installed successfully.",
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await page.getByLabel("Pack link").fill("https://www.curseforge.com/minecraft/modpacks/enigmatica9expert/files/5650506");
  await expect(page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true })).toBeEnabled();
  await page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.locator(".profile-row").filter({ hasText: "Enigmatica 9 Expert" })).toContainText("1.19.2");
  const request = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __pastedCurseForgeInstallRequest: unknown;
        }
      ).__pastedCurseForgeInstallRequest,
  );
  expect(request).toEqual({
    provider: "curseforge",
    projectId: "enigmatica9expert",
    versionId: "5650506",
    name: "Enigmatica 9 Expert",
  });
});

test("discover plain CurseForge pack page uses native provider installer", async ({ page }) => {
  await installPastedDiscoverProviderStub(page, {
    id: "curseforge-enigmatica9expert",
    name: "Enigmatica 9 Expert",
    loader: "forge",
    gameVersion: "1.19.2",
    installedPackVersion: "5650506",
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await page.getByLabel("Pack link").fill("https://www.curseforge.com/minecraft/modpacks/enigmatica9expert");
  await expect(page.getByText("Open the CurseForge pack's Files page and paste a specific download link")).toHaveCount(0);
  await expect(page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true })).toBeEnabled();
  await page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();

  const request = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __pastedDiscoverProviderInstallRequest: unknown;
        }
      ).__pastedDiscoverProviderInstallRequest,
  );
  expect(request).toEqual({
    provider: "curseforge",
    projectId: "enigmatica9expert",
    versionId: undefined,
    name: "Enigmatica 9 Expert",
  });
});

test("discover pasted CurseForge project file link keeps exact file id", async ({ page }) => {
  await installPastedDiscoverProviderStub(page, {
    id: "curseforge-890405",
    name: "Enigmatica 9 Expert",
    loader: "forge",
    gameVersion: "1.19.2",
    installedPackVersion: "5650506",
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await page.getByLabel("Pack link").fill("https://www.curseforge.com/projects/890405/files/5650506");
  await expect(page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true })).toBeEnabled();
  await page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.locator(".profile-row").filter({ hasText: "Enigmatica 9 Expert" })).toContainText("1.19.2");
  const request = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __pastedDiscoverProviderInstallRequest: unknown;
        }
      ).__pastedDiscoverProviderInstallRequest,
  );
  expect(request).toEqual({
    provider: "curseforge",
    projectId: "890405",
    versionId: "5650506",
    name: "CurseForge project 890405",
  });
});

test("discover pasted CurseForge download link keeps exact file id", async ({ page }) => {
  await installPastedDiscoverProviderStub(page, {
    id: "curseforge-enigmatica9expert",
    name: "Enigmatica 9 Expert",
    loader: "forge",
    gameVersion: "1.19.2",
    installedPackVersion: "5650506",
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await page.getByLabel("Pack link").fill("https://www.curseforge.com/minecraft/modpacks/enigmatica9expert/download/5650506");
  await expect(page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true })).toBeEnabled();
  await page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.locator(".profile-row").filter({ hasText: "Enigmatica 9 Expert" })).toContainText("1.19.2");
  const request = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __pastedDiscoverProviderInstallRequest: unknown;
        }
      ).__pastedDiscoverProviderInstallRequest,
  );
  expect(request).toEqual({
    provider: "curseforge",
    projectId: "enigmatica9expert",
    versionId: "5650506",
    name: "Enigmatica 9 Expert",
  });
});

test("discover pasted CurseForge app install link uses exact project and file ids", async ({ page }) => {
  await installPastedDiscoverProviderStub(page, {
    id: "curseforge-890405",
    name: "Enigmatica 9 Expert",
    loader: "forge",
    gameVersion: "1.19.2",
    installedPackVersion: "5650506",
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await page.getByLabel("Pack link").fill("curseforge://install?addonId=890405&fileId=5650506");
  await expect(page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true })).toBeEnabled();
  await page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.locator(".profile-row").filter({ hasText: "Enigmatica 9 Expert" })).toContainText("1.19.2");
  const request = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __pastedDiscoverProviderInstallRequest: unknown;
        }
      ).__pastedDiscoverProviderInstallRequest,
  );
  expect(request).toEqual({
    provider: "curseforge",
    projectId: "890405",
    versionId: "5650506",
    name: "CurseForge project 890405",
  });
});

test("discover pasted launcher CurseForge install link uses exact project and file ids", async ({ page }) => {
  await installPastedDiscoverProviderStub(page, {
    id: "curseforge-890405",
    name: "Enigmatica 9 Expert",
    loader: "forge",
    gameVersion: "1.19.2",
    installedPackVersion: "5650506",
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await page
    .getByLabel("Pack link")
    .fill("prismlauncher://install?platform=curseforge&addonId=890405&fileId=5650506");
  await expect(page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true })).toBeEnabled();
  await page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.locator(".profile-row").filter({ hasText: "Enigmatica 9 Expert" })).toContainText("1.19.2");
  const request = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __pastedDiscoverProviderInstallRequest: unknown;
        }
      ).__pastedDiscoverProviderInstallRequest,
  );
  expect(request).toEqual({
    provider: "curseforge",
    projectId: "890405",
    versionId: "5650506",
    name: "CurseForge project 890405",
  });
});

[
  {
    title: "CurseForge Flame",
    link: "multimc://install?platform=flame&addonId=890405&fileId=5650506",
    profile: {
      id: "curseforge-890405",
      name: "Enigmatica 9 Expert",
      loader: "forge",
      gameVersion: "1.19.2",
      installedPackVersion: "5650506",
    },
    expectedRequest: {
      provider: "curseforge",
      projectId: "890405",
      versionId: "5650506",
      name: "CurseForge project 890405",
    },
  },
  {
    title: "Modrinth",
    link: "prismlauncher://install?platform=modrinth&projectId=fabulously-optimized&versionId=preview",
    profile: {
      id: "fabulously-optimized",
      name: "Fabulously Optimized",
      loader: "fabric",
      gameVersion: "1.21.8",
      installedPackVersion: "preview",
    },
    expectedRequest: {
      provider: "modrinth",
      projectId: "fabulously-optimized",
      versionId: "preview",
      name: "Fabulously Optimized",
    },
  },
  {
    title: "Modrinth pack alias",
    link: "multimc://install?platform=modrinth&pack=fabulously-optimized&version=preview",
    profile: {
      id: "fabulously-optimized",
      name: "Fabulously Optimized",
      loader: "fabric",
      gameVersion: "1.21.8",
      installedPackVersion: "preview",
    },
    expectedRequest: {
      provider: "modrinth",
      projectId: "fabulously-optimized",
      versionId: "preview",
      name: "Fabulously Optimized",
    },
  },
  {
    title: "ATLauncher",
    link: "prismlauncher://install?platform=atlauncher&pack=SevTechAges&version=3.2.3",
    profile: {
      id: "atlauncher-sevtechages",
      name: "SevTech: Ages",
      loader: "forge",
      gameVersion: "1.12.2",
      installedPackVersion: "3.2.3",
    },
    expectedRequest: {
      provider: "atlauncher",
      projectId: "SevTechAges",
      versionId: "3.2.3",
      name: "Sev Tech Ages",
    },
  },
  {
    title: "FTB",
    link: "prismlauncher://install?platform=ftb&packId=126&versionId=12482",
    profile: {
      id: "ftb-126",
      name: "Direwolf20 1.21",
      loader: "neoforge",
      gameVersion: "1.21.1",
      installedPackVersion: "12482",
    },
    expectedRequest: {
      provider: "ftb",
      projectId: "126",
      versionId: "12482",
      name: "FTB pack 126",
    },
  },
  {
    title: "Technic",
    link: "prismlauncher://install?platform=technic&slug=hexxit&build=1.0.10",
    profile: {
      id: "technic-hexxit",
      name: "Hexxit",
      loader: "forge",
      gameVersion: "1.5.2",
      installedPackVersion: "1.0.10",
    },
    expectedRequest: {
      provider: "technic",
      projectId: "hexxit",
      versionId: "1.0.10",
      name: "Hexxit",
    },
  },
  {
    title: "FTB Legacy dashed alias",
    link: "prismlauncher://install?platform=ftb-legacy&pack=FTBAcademy&file=FTBAcademy.zip&version=1.1.0",
    profile: {
      id: "ftb-legacy-ftb-academy",
      name: "FTB Academy",
      loader: "forge",
      gameVersion: "1.12.2",
      installedPackVersion: "1.1.0",
    },
    expectedRequest: {
      provider: "ftb_legacy",
      projectId: "public:FTBAcademy:FTBAcademy.zip",
      versionId: "1.1.0",
      name: "FTB Academy",
    },
  },
  {
    title: "FTB Private dashed alias",
    link: "prismlauncher://install?platform=ftb-private&code=familycode",
    profile: {
      id: "ftb-private-family-pack",
      name: "Familycode",
      loader: "forge",
      gameVersion: "1.12.2",
      installedPackVersion: "1.0.0",
    },
    expectedRequest: {
      provider: "ftb_private",
      projectId: "familycode",
      versionId: undefined,
      name: "Familycode",
    },
  },
].forEach(({ title, link, profile, expectedRequest }) => {
  test(`discover pasted launcher ${title} install link uses native provider installer`, async ({ page }) => {
    await installPastedDiscoverProviderStub(page, profile);

    await page.goto("/");
    await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
    await page.getByLabel("Pack link").fill(link);
    await expect(
      page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true }),
    ).toBeEnabled();
    await page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
    await expect(page.locator(".profile-row").filter({ hasText: profile.name })).toContainText(profile.gameVersion);
    const request = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __pastedDiscoverProviderInstallRequest: unknown;
          }
        ).__pastedDiscoverProviderInstallRequest,
    );
    expect(request).toEqual(expectedRequest);
  });
});

[
  {
    title: "ATLauncher versioned website",
    link: "https://atlauncher.com/pack/SevTechAges/version/3.2.3",
    profile: {
      id: "atlauncher-sevtechages",
      name: "SevTech: Ages",
      loader: "forge",
      gameVersion: "1.12.2",
      installedPackVersion: "3.2.3",
    },
    expectedRequest: {
      provider: "atlauncher",
      projectId: "SevTechAges",
      versionId: "3.2.3",
      name: "Sev Tech Ages",
    },
  },
  {
    title: "FTB versioned website",
    link: "https://feed-the-beast.com/modpacks/126-ftb-presents-direwolf20-1-21/versions/12482",
    profile: {
      id: "ftb-126",
      name: "Direwolf20 1.21",
      loader: "neoforge",
      gameVersion: "1.21.1",
      installedPackVersion: "12482",
    },
    expectedRequest: {
      provider: "ftb",
      projectId: "126",
      versionId: "12482",
      name: "Ftb Presents Direwolf 20 1 21",
    },
  },
  {
    title: "Technic versioned website",
    link: "https://www.technicpack.net/modpack/hexxit.552552/version/1.0.10",
    profile: {
      id: "technic-hexxit",
      name: "Hexxit",
      loader: "forge",
      gameVersion: "1.5.2",
      installedPackVersion: "1.0.10",
    },
    expectedRequest: {
      provider: "technic",
      projectId: "hexxit",
      versionId: "1.0.10",
      name: "Hexxit",
    },
  },
].forEach(({ title, link, profile, expectedRequest }) => {
  test(`discover pasted ${title} link keeps provider version`, async ({ page }) => {
    await installPastedDiscoverProviderStub(page, profile);

    await page.goto("/");
    await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
    await page.getByLabel("Pack link").fill(link);
    await expect(
      page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true }),
    ).toBeEnabled();
    await page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
    await expect(page.locator(".profile-row").filter({ hasText: profile.name })).toContainText(profile.gameVersion);
    const request = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __pastedDiscoverProviderInstallRequest: unknown;
          }
        ).__pastedDiscoverProviderInstallRequest,
    );
    expect(request).toEqual(expectedRequest);
  });
});

test("discover pasted Modrinth provider link uses native provider installer", async ({ page }) => {
  await installPastedDiscoverProviderStub(page, {
    id: "fabulously-optimized",
    name: "Fabulously Optimized",
    loader: "fabric",
    gameVersion: "1.21.8",
    installedPackVersion: "preview",
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await page.getByLabel("Pack link").fill("https://modrinth.com/modpack/fabulously-optimized/version/preview");
  await expect(page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true })).toBeEnabled();
  await page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.locator(".profile-row").filter({ hasText: "Fabulously Optimized" })).toContainText("1.21.8");
  const request = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __pastedDiscoverProviderInstallRequest: unknown;
        }
      ).__pastedDiscoverProviderInstallRequest,
  );
  expect(request).toEqual({
    provider: "modrinth",
    projectId: "fabulously-optimized",
    versionId: "preview",
    name: "Fabulously Optimized",
  });
});

test("discover pasted FTB provider link uses native provider installer", async ({ page }) => {
  await installPastedDiscoverProviderStub(page, {
    id: "ftb-126",
    name: "Direwolf20 1.21",
    loader: "neoforge",
    gameVersion: "1.21.1",
    installedPackVersion: "12482",
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await page.getByLabel("Pack link").fill("https://feed-the-beast.com/modpacks/126-ftb-presents-direwolf20-1-21");
  await expect(page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true })).toBeEnabled();
  await page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.locator(".profile-row").filter({ hasText: "Direwolf20 1.21" })).toContainText("1.21.1");
  const request = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __pastedDiscoverProviderInstallRequest: unknown;
        }
      ).__pastedDiscoverProviderInstallRequest,
  );
  expect(request).toEqual({
    provider: "ftb",
    projectId: "126",
    versionId: undefined,
    name: "Ftb Presents Direwolf 20 1 21",
  });
});

test("discover pasted FTB Legacy CDN link uses native legacy provider installer", async ({ page }) => {
  await installPastedDiscoverProviderStub(page, {
    id: "ftb-legacy-ftb-academy",
    name: "FTB Academy",
    loader: "forge",
    gameVersion: "1.12.2",
    installedPackVersion: "1.1.0",
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await page.getByLabel("Pack link").fill("https://dist.creeper.host/FTB2/modpacks/FTBAcademy/1_1_0/FTBAcademy.zip");
  await expect(page.getByText("Pack .zip link detected.")).toBeVisible();
  await expect(page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true })).toBeEnabled();
  await page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.locator(".profile-row").filter({ hasText: "FTB Academy" })).toContainText("1.12.2");
  const request = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __pastedDiscoverProviderInstallRequest: unknown;
        }
      ).__pastedDiscoverProviderInstallRequest,
  );
  expect(request).toEqual({
    provider: "ftb_legacy",
    projectId: "public:FTBAcademy:FTBAcademy.zip",
    versionId: "1.1.0",
    name: "FTB Academy",
  });
});

test("discover pasted Technic dotted provider link uses native provider installer", async ({ page }) => {
  await installPastedDiscoverProviderStub(page, {
    id: "technic-hexxit",
    name: "Hexxit",
    loader: "forge",
    gameVersion: "1.5.2",
    installedPackVersion: "1.0.10",
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await page.getByLabel("Pack link").fill("https://www.technicpack.net/modpack/hexxit.552552");
  await expect(page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true })).toBeEnabled();
  await page.locator(".discover-install-form").getByRole("button", { name: "Install", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.locator(".profile-row").filter({ hasText: "Hexxit" })).toContainText("1.5.2");
  const request = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __pastedDiscoverProviderInstallRequest: unknown;
        }
      ).__pastedDiscoverProviderInstallRequest,
  );
  expect(request).toEqual({
    provider: "technic",
    projectId: "hexxit",
    versionId: undefined,
    name: "Hexxit",
  });
});

test("discover provider install failures hide raw unsupported pack-format errors", async ({ page }) => {
  await page.addInitScript(() => {
    let installAttempts = 0;
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events" || cmd === "list_managed_processes") return [];
          if (cmd === "search_discover_modpacks") {
            return [
              {
                provider: "atlauncher",
                projectId: "LegacyJarPack",
                slug: "LegacyJarPack",
                title: "Legacy Jar Pack",
                description: "An older ATLauncher pack format.",
                author: "ATLauncher",
                downloads: 0,
                follows: 0,
                gameVersions: ["1.6.4"],
                loaders: ["forge"],
                iconUrl: null,
                latestVersionId: "1.0.0",
                installAvailable: true,
              },
            ];
          }
          if (cmd === "install_discover_modpack") {
            installAttempts += 1;
            if (installAttempts === 2) {
              throw new Error("another launcher lifecycle operation is already running: installing WinterPack");
            }
            throw new Error("Modpack install failed: ATLauncher required file type 'jar' is not supported by automatic install yet");
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await page.getByLabel("Discover providers", { exact: true }).getByRole("button", { name: /^ATLauncher/ }).click();
  await page.getByLabel("ATLauncher search").getByRole("button", { name: "Browse" }).click();
  await page.locator(".discover-result-row").filter({ hasText: "Legacy Jar Pack" }).getByRole("button", { name: "Install" }).click();

  await expect(page.getByRole("heading", { name: "Activity", exact: true })).toBeVisible();
  await expect(page.getByLabel("Launcher status message")).toContainText(
    "This ATLauncher pack uses an older install format the launcher cannot prepare automatically.",
  );
  await expect(page.getByLabel("Launcher status message")).not.toContainText("not supported by automatic install yet");
  await page.getByLabel("Activity views").getByRole("button", { name: "Overview" }).click();
  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await page.locator(".discover-result-row").filter({ hasText: "Legacy Jar Pack" }).getByRole("button", { name: "Install" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText(
    "Another launcher task is already running. Try again when it finishes.",
  );
  await expect(page.getByLabel("Launcher status message")).not.toContainText("lifecycle operation");
});

test("discover FTB Legacy search install uses native provider installer and refreshes library", async ({ page }) => {
  await page.addInitScript(() => {
    let installed = false;
    let installRequest: unknown = null;
    let searchedProvider = "";
    const installedProfile = {
      id: "ftb-legacy-ftb-academy",
      name: "FTB Academy",
      loader: "forge",
      gameVersion: "1.12.2",
      installedPackVersion: "1.1.0",
      memoryMb: 6144,
      jvmArgs: [],
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: installed ? [installedProfile] : [],
      imports: [],
    });

    Object.defineProperty(window, "__discoverFtbLegacyInstallRequest", {
      get: () => ({ installRequest, searchedProvider }),
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { provider?: string; query?: string; request?: unknown }) => {
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") {
            return installed
              ? [
                  {
                    id: "ftb-legacy-installed",
                    operationId: "00000000-0000-4000-8000-000000000505",
                    operation: "install_modpack_archive",
                    subjectId: "ftb-legacy-ftb-academy",
                    kind: "completed",
                    message: "FTB Academy installed successfully.",
                    progressPercent: 100,
                    occurredAtUnixSeconds: 1_710_000_004,
                  },
                ]
              : [];
          }
          if (cmd === "list_managed_processes") return [];
          if (cmd === "search_discover_modpacks") {
            searchedProvider = args?.provider ?? "";
            return [
              {
                provider: "ftb_legacy",
                projectId: "public:FTBAcademy:FTBAcademy.zip",
                slug: "FTBAcademy",
                title: "FTB Academy",
                description: "Learn modded Minecraft with quests.",
                author: "The FTB Team",
                downloads: 0,
                follows: 0,
                gameVersions: ["1.12.2"],
                loaders: [],
                iconUrl: null,
                latestVersionId: "1.1.0",
                installAvailable: true,
              },
            ];
          }
          if (cmd === "install_discover_modpack") {
            installRequest = args?.request ?? null;
            installed = true;
            return {
              action: "install_modpack_archive",
              subjectId: "ftb-legacy-ftb-academy",
              message: "FTB Academy installed successfully.",
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await page.getByLabel("Discover providers", { exact: true }).getByRole("button", { name: /^FTB Legacy Compatible packs/ }).click();
  await page.getByLabel("FTB Legacy search").getByRole("button", { name: "Browse" }).click();
  const result = page.locator(".discover-result-row").filter({ hasText: "FTB Academy" });
  await expect(result).toContainText("1.12.2");
  await result.getByRole("button", { name: "Install" }).click();

  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  const installedProfileRow = page.locator(".profile-row").filter({ hasText: "FTB Academy" });
  await expect(installedProfileRow).toContainText("1.12.2");
  await expect(installedProfileRow).toContainText("Forge");
  const state = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __discoverFtbLegacyInstallRequest: { installRequest: unknown; searchedProvider: string };
        }
      ).__discoverFtbLegacyInstallRequest,
  );
  expect(state.searchedProvider).toBe("ftb_legacy");
  expect(state.installRequest).toEqual({
    provider: "ftb_legacy",
    projectId: "public:FTBAcademy:FTBAcademy.zip",
    versionId: "1.1.0",
    name: "FTB Academy",
  });
});

test("discover FTB Private code install uses native provider installer and refreshes library", async ({ page }) => {
  await page.addInitScript(() => {
    let installed = false;
    let installRequest: unknown = null;
    let searchedProvider = "";
    let searchedQuery = "";
    const installedProfile = {
      id: "ftb-private-family-pack",
      name: "Family Pack",
      loader: "forge",
      gameVersion: "1.12.2",
      installedPackVersion: "1.0.0",
      memoryMb: 6144,
      jvmArgs: [],
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: installed ? [installedProfile] : [],
      imports: [],
    });

    Object.defineProperty(window, "__discoverFtbPrivateInstallRequest", {
      get: () => ({ installRequest, searchedProvider, searchedQuery }),
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { provider?: string; query?: string; request?: unknown }) => {
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "search_discover_modpacks") {
            searchedProvider = args?.provider ?? "";
            searchedQuery = args?.query ?? "";
            return [
              {
                provider: "ftb_private",
                projectId: "private:familycode:FamilyPack:FamilyPack.zip",
                slug: "FamilyPack",
                title: "Family Pack",
                description: "A shared private pack.",
                author: "Private FTB Legacy",
                downloads: 0,
                follows: 0,
                gameVersions: ["1.12.2"],
                loaders: [],
                iconUrl: null,
                latestVersionId: "1.0.0",
                installAvailable: true,
              },
            ];
          }
          if (cmd === "install_discover_modpack") {
            installRequest = args?.request ?? null;
            installed = true;
            return {
              action: "install_modpack_archive",
              subjectId: "ftb-private-family-pack",
              message: "Family Pack installed successfully.",
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await page.getByLabel("Discover providers", { exact: true }).getByRole("button", { name: /^FTB Private Code lookup/ }).click();
  await page.getByRole("textbox", { name: "Private code", exact: true }).fill("familycode");
  await page.getByLabel("FTB Private search").getByRole("button", { name: "Look up" }).click();
  const result = page.locator(".discover-result-row").filter({ hasText: "Family Pack" });
  await expect(result).toContainText("1.12.2");
  await result.getByRole("button", { name: "Install" }).click();

  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  const installedProfileRow = page.locator(".profile-row").filter({ hasText: "Family Pack" });
  await expect(installedProfileRow).toContainText("1.12.2");
  await expect(installedProfileRow).toContainText("Forge");
  const state = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __discoverFtbPrivateInstallRequest: { installRequest: unknown; searchedProvider: string; searchedQuery: string };
        }
      ).__discoverFtbPrivateInstallRequest,
  );
  expect(state.searchedProvider).toBe("ftb_private");
  expect(state.searchedQuery).toBe("familycode");
  expect(state.installRequest).toEqual({
    provider: "ftb_private",
    projectId: "private:familycode:FamilyPack:FamilyPack.zip",
    versionId: "1.0.0",
    name: "Family Pack",
  });
});

test("discover Technic search install uses native provider installer and refreshes library", async ({ page }) => {
  await page.addInitScript(() => {
    let installed = false;
    let installRequest: unknown = null;
    let searchedProvider = "";
    const installedProfile = {
      id: "technic-tekxit-3-official-1122",
      name: "Tekxit 3 [Official]",
      loader: "forge",
      gameVersion: "1.12.2",
      installedPackVersion: "1.3",
      memoryMb: 6144,
      jvmArgs: [],
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: installed ? [installedProfile] : [],
      imports: [],
    });

    Object.defineProperty(window, "__discoverTechnicInstallRequest", {
      get: () => ({ installRequest, searchedProvider }),
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { provider?: string; query?: string; request?: unknown }) => {
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") {
            return installed
              ? [
                  {
                    id: "technic-installed",
                    operationId: "00000000-0000-4000-8000-000000000606",
                    operation: "install_modpack_archive",
                    subjectId: "technic-tekxit-3-official-1122",
                    kind: "completed",
                    message: "Tekxit 3 [Official] installed successfully.",
                    progressPercent: 100,
                    occurredAtUnixSeconds: 1_710_000_005,
                  },
                ]
              : [];
          }
          if (cmd === "list_managed_processes") return [];
          if (cmd === "search_discover_modpacks") {
            searchedProvider = args?.provider ?? "";
            return [
              {
                provider: "technic",
                projectId: "tekxit-3-official-1122",
                slug: "tekxit-3-official-1122",
                title: "Tekxit 3 [Official]",
                description: "1.12.2 - Tekxit with a direct zip URL.",
                author: "SlayerTheChikken",
                downloads: 0,
                follows: 0,
                gameVersions: ["1.12.2"],
                loaders: [],
                iconUrl: null,
                latestVersionId: "1.3",
                installAvailable: true,
              },
            ];
          }
          if (cmd === "install_discover_modpack") {
            installRequest = args?.request ?? null;
            installed = true;
            return {
              action: "install_modpack_archive",
              subjectId: "technic-tekxit-3-official-1122",
              message: "Tekxit 3 [Official] installed successfully.",
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await page.getByLabel("Discover providers", { exact: true }).getByRole("button", { name: /^Technic Compatible packs/ }).click();
  await page.getByLabel("Technic search").getByRole("button", { name: "Browse" }).click();
  const result = page.locator(".discover-result-row").filter({ hasText: "Tekxit 3 [Official]" });
  await expect(result).toContainText("1.12.2");
  await result.getByRole("button", { name: "Install" }).click();

  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  const installedProfileRow = page.locator(".profile-row").filter({ hasText: "Tekxit 3 [Official]" });
  await expect(installedProfileRow).toContainText("1.12.2");
  await expect(installedProfileRow).toContainText("Forge");
  const state = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __discoverTechnicInstallRequest: { installRequest: unknown; searchedProvider: string };
        }
      ).__discoverTechnicInstallRequest,
  );
  expect(state.searchedProvider).toBe("technic");
  expect(state.installRequest).toEqual({
    provider: "technic",
    projectId: "tekxit-3-official-1122",
    versionId: "1.3",
    name: "Tekxit 3 [Official]",
  });
});

test("discover Technic browse result resolves exact install details before installing", async ({ page }) => {
  await page.addInitScript(() => {
    let installed = false;
    let installRequest: unknown = null;
    const searchQueries: string[] = [];
    const installedProfile = {
      id: "technic-the-1122-pack",
      name: "The 1.12.2 Pack",
      loader: "forge",
      gameVersion: "1.12.2",
      installedPackVersion: "1.6.6",
      memoryMb: 6144,
      jvmArgs: [],
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: installed ? [installedProfile] : [],
      imports: [],
    });

    Object.defineProperty(window, "__discoverTechnicExactInstallState", {
      get: () => ({ installRequest, searchQueries }),
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { provider?: string; query?: string; request?: unknown }) => {
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") {
            return installed
              ? [
                  {
                    id: "technic-solder-installed",
                    operationId: "00000000-0000-4000-8000-000000000607",
                    operation: "install_modpack_archive",
                    subjectId: "technic-the-1122-pack",
                    kind: "completed",
                    message: "The 1.12.2 Pack installed successfully.",
                    progressPercent: 100,
                    occurredAtUnixSeconds: 1_710_000_006,
                  },
                ]
              : [];
          }
          if (cmd === "list_managed_processes") return [];
          if (cmd === "search_discover_modpacks") {
            searchQueries.push(args?.query ?? "");
            if (args?.query === "#the-1122-pack") {
              return [
                {
                  provider: "technic",
                  projectId: "the-1122-pack",
                  slug: "the-1122-pack",
                  title: "The 1.12.2 Pack",
                  description: "Technic Solder pack with exact install metadata.",
                  author: "xJon",
                  downloads: 762_404,
                  follows: 4_334_986,
                  gameVersions: ["1.12.2"],
                  loaders: [],
                  iconUrl: null,
                  latestVersionId: "1.6.6",
                  installAvailable: true,
                  installNote: "Installs Technic Solder packs automatically from the selected build.",
                },
              ];
            }
            return [
              {
                provider: "technic",
                projectId: "the-1122-pack",
                slug: "the-1122-pack",
                title: "The 1.12.2 Pack",
                description: "Technic search result without exact metadata yet.",
                author: "Technic",
                downloads: 0,
                follows: 0,
                gameVersions: [],
                loaders: [],
                iconUrl: null,
                latestVersionId: null,
                installAvailable: false,
                installNote: "Check details so the launcher can see whether this pack can be prepared automatically.",
              },
            ];
          }
          if (cmd === "install_discover_modpack") {
            installRequest = args?.request ?? null;
            installed = true;
            return {
              action: "install_modpack_archive",
              subjectId: "technic-the-1122-pack",
              message: "The 1.12.2 Pack installed successfully.",
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Discover" }).click();
  await page.getByLabel("Discover providers", { exact: true }).getByRole("button", { name: /^Technic Compatible packs/ }).click();
  await page.getByLabel("Technic search").getByLabel("Search").fill("1.12.2 pack");
  await page.getByLabel("Technic search").getByRole("button", { name: "Search" }).click();
  const result = page.locator(".discover-result-row").filter({ hasText: "The 1.12.2 Pack" });
  await expect(result.getByRole("button", { name: "Check details" })).toBeVisible();
  await result.getByRole("button", { name: "Check details" }).click();

  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.locator(".profile-row").filter({ hasText: "The 1.12.2 Pack" })).toContainText("Forge");
  const state = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __discoverTechnicExactInstallState: { installRequest: unknown; searchQueries: string[] };
        }
      ).__discoverTechnicExactInstallState,
  );
  expect(state.searchQueries).toEqual(["1.12.2 pack", "#the-1122-pack"]);
  expect(state.installRequest).toEqual({
    provider: "technic",
    projectId: "the-1122-pack",
    versionId: "1.6.6",
    name: "The 1.12.2 Pack",
  });
});

test("online pack refresh preserves native installed pack state", async ({ page }) => {
  await page.route("**/packs", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Backend catalog copy",
          version: "10/19/2025",
          status: "not_installed",
          accent: "#67e8b9",
          installedPlayers: 12,
          defaultServer: "The Cabin",
        },
      ]),
    });
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  tagline: "Local packwiz copy",
                  version: "2.3.7",
                  status: "installed",
                  accent: "#67e8b9",
                  installedPlayers: 4,
                  defaultServer: "The Cabin",
                },
              ],
              profiles: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  loader: "forge",
                  gameVersion: "1.20.1",
                  installedPackVersion: "2.3.7",
                  memoryMb: 6144,
                  jvmArgs: ["-Dtheboyslauncher.pack=winterpack"],
                  defaultServer: { name: "The Cabin", address: "play.theboys.example", port: 25565 },
                },
              ],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: true,
              managed: true,
              message: "Online",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        listen: async () => () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");

  await expect(page.getByLabel("Primary pack status")).toContainText("Ready");
  await expect(page.getByLabel("Primary pack status")).toContainText("2.3.7");
  await expect(page.getByLabel("Primary pack actions").getByRole("button", { name: "Play" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "ExamplePack" })).toHaveCount(0);
  const winterPackCard = page.locator(".pack-card").filter({ has: page.getByRole("heading", { level: 3, name: "WinterPack" }) });
  await expect(winterPackCard).toContainText("2.3.7");
  await expect(winterPackCard).toContainText("Ready");
  await expect(winterPackCard.getByRole("button", { name: "Play" })).toBeVisible();
  await expect(winterPackCard.getByRole("button", { name: "Install" })).toHaveCount(0);
});

test("launcher status card fits long native backend messages at desktop minimum", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 720 });
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [
                {
                  id: "status-fit-profile",
                  name: "Status Fit Profile",
                  loader: "vanilla",
                  gameVersion: "1.21.8",
                  memoryMb: 4096,
                  jvmArgs: [],
                },
              ],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Friends service is not reachable; packaged service can be started from Settings.",
            };
          }
          if (cmd === "scan_imports") return [];
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");

  await expect(page.getByLabel("Launcher status message")).toContainText("packaged service can be started");
  const metrics = await page.evaluate(() => {
    const card = document.querySelector(".connection-card");
    const message = document.querySelector('[aria-label="Launcher status message"]');
    if (!card || !message) {
      throw new Error("launcher status card was not rendered");
    }
    const cardRect = card.getBoundingClientRect();
    return {
      viewportHeight: window.innerHeight,
      cardBottom: cardRect.bottom,
      cardScrollHeight: card.scrollHeight,
      cardClientHeight: card.clientHeight,
      messageScrollHeight: message.scrollHeight,
      messageClientHeight: message.clientHeight,
    };
  });

  expect(metrics.cardBottom).toBeLessThanOrEqual(metrics.viewportHeight);
  expect(metrics.cardScrollHeight).toBeLessThanOrEqual(metrics.cardClientHeight);
  expect(metrics.messageScrollHeight).toBeLessThanOrEqual(metrics.messageClientHeight);
});

test("dense desktop panels fit the configured minimum width", async ({ page }) => {
  await page.goto("/");

  for (const view of ["Settings", "Activity", "Library"]) {
    await page.getByRole("button", { name: view }).click();
    await expect(page.getByRole("heading", { name: view })).toBeVisible();

    const metrics = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      workspaceWidth: document.querySelector(".workspace")?.clientWidth ?? 0,
      workspaceScrollWidth: document.querySelector(".workspace")?.scrollWidth ?? 0,
    }));

    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth);
    expect(metrics.workspaceScrollWidth).toBeLessThanOrEqual(metrics.workspaceWidth);
  }

  await page.getByRole("button", { name: "Library" }).click();
  const profileActionMetrics = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll(".profile-action-group .compact")].map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        text: button.textContent?.trim() ?? "",
        height: rect.height,
      };
    });
    return {
      buttons,
      tallestButton: Math.max(...buttons.map((button) => button.height)),
    };
  });

  expect(profileActionMetrics.buttons.length).toBeGreaterThan(0);
  expect(profileActionMetrics.tallestButton).toBeLessThanOrEqual(46);
});

test("activity game actions stay visible with long Java paths", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [
                {
                  id: "modern-vanilla",
                  name: "Modern Vanilla",
                  loader: "vanilla",
                  gameVersion: "1.21.8",
                  memoryMb: 4096,
                  jvmArgs: [],
                },
              ],
              imports: [],
            };
          }
          if (cmd === "list_managed_processes") {
            return [
              {
                id: "long-java-path-process",
                processId: 4242,
                command: {
                  executable:
                    "C:/Users/test/AppData/Roaming/TheBoysLauncher/data/runtimes/temurin-21-windows-x64/jdk-21.0.11+10/bin/java.exe",
                  args: ["-Xmx4096M", "net.minecraft.client.main.Main"],
                  workingDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/data/profiles/modern-vanilla",
                  env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "modern-vanilla" }],
                },
                state: "running",
                startedAtUnixSeconds: 1_710_000_000,
                runtimeSeconds: 42,
                totalOutputLineCount: 1,
                droppedOutputLineCount: 0,
                output: [{ stream: "stdout", line: "Minecraft 1.21.8 is running", timestampUnixSeconds: 1_710_000_001 }],
              },
            ];
          }
          if (cmd === "list_launcher_events") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Activity" }).click();
  await page.getByLabel("Activity views").getByRole("button", { name: "Games", exact: true }).click();

  const processRow = page.locator(".process-row").filter({ hasText: "Modern Vanilla" });
  await expect(processRow).toContainText("Minecraft 1.21.8 is running");
  await expect(processRow).toContainText("2 launch options");
  await expect(processRow.getByLabel("Modern Vanilla game details")).toBeHidden();
  await expect(processRow.getByRole("button", { name: "Stop" })).toBeVisible();
  await processRow.getByText("View game details").click();
  await expect(processRow.getByLabel("Modern Vanilla game details")).toContainText("jdk-21.0.11");

  const metrics = await page.evaluate(() => {
    const workspace = document.querySelector(".workspace");
    const row = document.querySelector(".process-row");
    const actions = document.querySelector(".process-actions");
    if (!workspace || !row || !actions) {
      throw new Error("process row was not rendered");
    }
    const workspaceRect = workspace.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    return {
      viewportWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      workspaceWidth: workspace.clientWidth,
      workspaceScrollWidth: workspace.scrollWidth,
      rowRight: rowRect.right,
      actionsRight: actionsRect.right,
      workspaceRight: workspaceRect.right,
    };
  });

  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.workspaceScrollWidth).toBeLessThanOrEqual(metrics.workspaceWidth);
  expect(metrics.rowRight).toBeLessThanOrEqual(metrics.workspaceRight);
  expect(metrics.actionsRight).toBeLessThanOrEqual(metrics.workspaceRight);
});

test("sign in action explains desktop app requirement in web preview", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Microsoft sign-in requires the desktop app")).toBeVisible();
  await expect(page.getByText("Microsoft sign-in is mocked in web preview")).toHaveCount(0);
  await expect(page.getByText("Microsoft login is mocked in web preview")).toHaveCount(0);
});

test("sign in action waits for native Microsoft callback and stores session", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    Object.defineProperty(window, "__authInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: Record<string, unknown>) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "start_microsoft_auth_flow") {
            return {
              authUrl: "https://login.live.com/oauth20_authorize.srf?client_id=client-123",
              state: "state-abc",
              codeVerifier: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_",
              codeChallenge: "challenge",
              clientId: "client-123",
              redirectUri: "http://localhost:53682/",
              scopes: ["XboxLive.signin", "offline_access"],
            };
          }
          if (cmd === "open_microsoft_auth_url") {
            Object.defineProperty(window, "__openedAuthUrl", {
              value: args?.authUrl,
              configurable: true,
            });
            return undefined;
          }
          if (cmd === "complete_microsoft_login_with_local_callback") {
            await new Promise((resolve) => setTimeout(resolve, 200));
            return {
              session: {
                username: "Builder",
                uuid: "00000000-0000-4000-8000-000000000001",
                accessToken: "preview-access-token",
              },
              accountId: "00000000-0000-4000-8000-000000000001",
              expiresAtUnixSeconds: 1_900_003_600,
              storedAtUnixSeconds: 1_710_000_000,
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        listen: async () => () => undefined,
      },
      configurable: true,
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(".topbar").getByRole("button", { name: "Opening..." })).toBeDisabled();
  await page.locator(".topbar").getByRole("button", { name: "Opening..." }).click({ force: true });

  await expect(page.getByText("Signed in as Builder")).toBeVisible();
  await expect(page.locator(".topbar").getByRole("button", { name: "Minecraft account Builder signed in" })).toBeVisible();
  await expect(page.locator(".topbar").getByRole("button", { name: "Minecraft account Builder signed in" })).toContainText("Signed in");
  await expect(page.locator(".topbar").getByRole("button", { name: "Minecraft account Builder signed in" })).toContainText("Builder");
  await expect(page.locator(".topbar").getByRole("button", { name: "Sign in" })).toHaveCount(0);
  await expect(page.getByLabel("Launcher quick status")).toContainText("Builder signed in");
  await expect(page.getByLabel("Launcher quick status")).not.toContainText("expires");
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.locator(".account-card")).toContainText("Builder");
  await expect(page.getByLabel("Settings account actions")).not.toContainText("Finish sign in");
  const invoked = await page.evaluate(() => (window as typeof window & { __authInvokes: string[] }).__authInvokes);
  expect(invoked.filter((cmd) => cmd === "start_microsoft_auth_flow")).toHaveLength(1);
  expect(invoked).toContain("open_microsoft_auth_url");
  expect(invoked).toContain("complete_microsoft_login_with_local_callback");
  const openedAuthUrl = await page.evaluate(() => (window as typeof window & { __openedAuthUrl: string }).__openedAuthUrl);
  expect(openedAuthUrl).toContain("https://login.live.com/oauth20_authorize.srf");
});

test("sign in action surfaces native Microsoft auth setup errors", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    Object.defineProperty(window, "__authSetupInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "start_microsoft_auth_flow") {
            throw new Error("THEBOYS_MICROSOFT_CLIENT_ID is required");
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        listen: async () => () => undefined,
      },
      configurable: true,
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Microsoft sign-in is not configured for this launcher build.")).toBeVisible();
  await expect(page.getByText("THEBOYS_MICROSOFT_CLIENT_ID is required")).toHaveCount(0);
  const invoked = await page.evaluate(
    () => (window as typeof window & { __authSetupInvokes: string[] }).__authSetupInvokes,
  );
  expect(invoked).toContain("start_microsoft_auth_flow");
  expect(invoked).not.toContain("start_microsoft_login");
});

test("sign in action hides native Microsoft browser-open login wording", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "start_microsoft_auth_flow") {
            return {
              authUrl: "https://login.live.com/oauth20_authorize.srf?client_id=client-123",
              state: "state-123",
              codeVerifier: "verifier-123",
              clientId: "client-123",
              callbackUrl: "http://localhost:53682/",
            };
          }
          if (cmd === "complete_microsoft_login_with_local_callback") {
            return new Promise(() => undefined);
          }
          if (cmd === "open_microsoft_auth_url") {
            throw new Error("failed to open Microsoft login in browser: shell open failed");
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        listen: async () => () => undefined,
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText("failed to open Microsoft sign-in in browser");
  await expect(page.getByLabel("Launcher status message")).not.toContainText("Microsoft login");
});

test("sign in action hides native Microsoft auth URL validation wording", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "start_microsoft_auth_flow") {
            return {
              authUrl: "https://example.invalid/oauth",
              state: "state-123",
              codeVerifier: "verifier-123",
              clientId: "client-123",
              callbackUrl: "http://localhost:53682/",
            };
          }
          if (cmd === "complete_microsoft_login_with_local_callback") {
            return new Promise(() => undefined);
          }
          if (cmd === "open_microsoft_auth_url") {
            throw new Error("Microsoft auth URL host is not supported");
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        listen: async () => () => undefined,
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText("Microsoft sign-in could not start. Check the launcher setup and try again.");
  await expect(page.getByLabel("Launcher status message")).not.toContainText("not supported");
});

test("sign in action hides native Microsoft callback request validation wording", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "start_microsoft_auth_flow") {
            return {
              authUrl: "https://login.live.com/oauth20_authorize.srf?client_id=client-123",
              state: "state-123",
              codeVerifier: "verifier-123",
              clientId: "client-123",
              callbackUrl: "http://localhost:53682/",
            };
          }
          if (cmd === "open_microsoft_auth_url") return undefined;
          if (cmd === "complete_microsoft_login_with_local_callback") {
            throw new Error("Microsoft OAuth callback request target path is not supported");
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        listen: async () => () => undefined,
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText(
    "Microsoft sign-in received an unexpected browser response. Start sign-in again from TheBoysLauncher.",
  );
  await expect(page.getByLabel("Launcher status message")).not.toContainText("not supported");
});

test("settings shows Microsoft callback completion guard", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Advanced" }).click();
  await page
    .getByLabel("Microsoft callback URL")
    .fill("http://127.0.0.1:53682/auth/microsoft/callback?code=abc&state=state");
  await page.getByRole("button", { name: "Finish sign in" }).click();

  await expect(page.getByText("Start Microsoft sign-in first")).toBeVisible();
  await expect(page.getByText("Start Microsoft login first")).toHaveCount(0);
});

test("settings callback completion surfaces native Microsoft token errors", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    Object.defineProperty(window, "__callbackCompletionInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "open", {
      value: () => null,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "start_microsoft_auth_flow") {
            return {
              authUrl: "https://login.live.com/oauth20_authorize.srf?client_id=client-123",
              state: "state-abc",
              codeVerifier: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_",
              codeChallenge: "challenge",
              clientId: "client-123",
              redirectUri: "http://127.0.0.1:53682/auth/microsoft/callback",
              scopes: ["XboxLive.signin", "offline_access"],
            };
          }
          if (cmd === "open_microsoft_auth_url") return undefined;
          if (cmd === "complete_microsoft_login_with_local_callback") {
            throw new Error("local callback timed out");
          }
          if (cmd === "plan_microsoft_token_exchange") {
            await new Promise((resolve) => setTimeout(resolve, 200));
            return {
              tokenUrl: "https://login.live.com/oauth20_token.srf",
              method: "POST",
              clientId: "client-123",
              redirectUri: "http://127.0.0.1:53682/auth/microsoft/callback",
              code: "abc",
              codeVerifier: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_",
              scopes: ["XboxLive.signin", "offline_access"],
              formFields: [],
              nextStep: "Exchange Microsoft authorization code",
            };
          }
          if (cmd === "exchange_microsoft_authorization_code") {
            throw new Error("Microsoft token exchange failed: invalid_grant");
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        listen: async () => () => undefined,
      },
      configurable: true,
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Microsoft sign-in timed out. Start sign-in again from TheBoysLauncher.")).toBeVisible();
  await expect(page.getByText("local callback timed out")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: "Advanced" }).click();
  await page
    .getByLabel("Microsoft callback URL")
    .fill("http://127.0.0.1:53682/auth/microsoft/callback?code=abc&state=state-abc");
  await page.getByLabel("Settings account actions").getByRole("button", { name: "Finish sign in" }).click();
  await expect(page.getByLabel("Settings account actions").getByRole("button", { name: "Finishing..." })).toBeDisabled();
  await page.getByLabel("Settings account actions").getByRole("button", { name: "Finishing..." }).click({ force: true });

  await expect(page.getByText("Microsoft sign-in needs to be refreshed. Sign in again to continue.")).toBeVisible();
  await expect(page.getByText("invalid_grant")).toHaveCount(0);
  const invoked = await page.evaluate(
    () => (window as typeof window & { __callbackCompletionInvokes: string[] }).__callbackCompletionInvokes,
  );
  expect(invoked.filter((cmd) => cmd === "plan_microsoft_token_exchange")).toHaveLength(1);
  expect(invoked).toContain("exchange_microsoft_authorization_code");
  expect(invoked).not.toContain("authenticate_and_save_minecraft_session");
});

test("settings callback completion explains localhost redirect mismatch", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    Object.defineProperty(window, "__callbackRedirectInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { callback?: { callbackUrl?: string } }) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "start_microsoft_auth_flow") {
            return {
              authUrl: "https://login.live.com/oauth20_authorize.srf?client_id=client-123",
              state: "state-abc",
              codeVerifier: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_",
              codeChallenge: "challenge",
              clientId: "client-123",
              redirectUri: "http://localhost:53682/",
              scopes: ["XboxLive.signin", "offline_access"],
            };
          }
          if (cmd === "open_microsoft_auth_url") return undefined;
          if (cmd === "complete_microsoft_login_with_local_callback") {
            throw new Error("local callback timed out");
          }
          if (cmd === "plan_microsoft_token_exchange") {
            if (args?.callback?.callbackUrl?.startsWith("http://127.0.0.1:53682/")) {
              throw new Error("Microsoft OAuth callback URL does not match the configured redirect URI");
            }
            throw new Error("Unexpected callback URL");
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        listen: async () => () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Microsoft sign-in timed out. Start sign-in again from TheBoysLauncher.")).toBeVisible();
  await page.getByRole("button", { name: "Advanced" }).click();
  await page
    .getByLabel("Microsoft callback URL")
    .fill("http://127.0.0.1:53682/?code=abc&state=state-abc");
  await page.getByLabel("Settings account actions").getByRole("button", { name: "Finish sign in" }).click();

  await expect(page.getByText("Use the localhost Microsoft callback URL from the browser tab, then try Finish sign in again.")).toBeVisible();
  await expect(page.getByText("configured redirect URI")).toHaveCount(0);
  const invoked = await page.evaluate(
    () => (window as typeof window & { __callbackRedirectInvokes: string[] }).__callbackRedirectInvokes,
  );
  expect(invoked.filter((cmd) => cmd === "plan_microsoft_token_exchange")).toHaveLength(1);
  expect(invoked).not.toContain("exchange_microsoft_authorization_code");
});

test("search filters featured packs", async ({ page }) => {
  await page.goto("/");

  await page.getByPlaceholder("Search packs, profiles, friends...").fill("vanilla");

  await expect(page.getByRole("heading", { name: "Vanilla Plus" })).toBeVisible();
  await expect(page.locator(".pack-card").filter({ hasText: "WinterPack" })).toHaveCount(0);
});

test("home screen can refresh pack metadata from the social backend scaffold", async ({ page }) => {
  await page.route("http://127.0.0.1:4074/packs", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
      body: JSON.stringify([
        {
          id: "sky-cabin",
          name: "Sky Cabin",
          tagline: "Backend-hosted metadata for a test pack.",
          version: "2.0.0",
          status: "not_installed",
          accent: "#f472b6",
          installedPlayers: 7,
          defaultServer: "Sky Server",
        },
      ]),
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Refresh" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Sky Cabin" })).toBeVisible();
  await expect(page.locator(".pack-card").filter({ hasText: "Sky Cabin" })).toContainText("Backend-hosted metadata");
  await expect(page.locator(".pack-card").filter({ hasText: "WinterPack" })).toBeVisible();
});

test("home screen can refresh a single pack from backend details", async ({ page }) => {
  await page.route("http://127.0.0.1:4074/packs/winterpack", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: "winterpack",
        name: "WinterPack",
        tagline: "Detailed backend metadata for WinterPack.",
        version: "1.0.4",
        status: "repair_needed",
        accent: "#67e8b9",
        installedPlayers: 5,
        defaultServer: "The Cabin",
      }),
    });
  });
  await page.goto("/");

  await page.getByLabel("Primary pack actions").getByRole("button", { name: "Details" }).click();

  await expect(page.getByText("Loaded WinterPack details")).toBeVisible();
  const detailPanel = page.getByLabel("WinterPack pack details");
  await expect(detailPanel).toBeVisible();
  await expect(detailPanel).toContainText("Detailed backend metadata");
  await expect(detailPanel.getByLabel("WinterPack metadata")).toContainText("1.0.3");
  await expect(detailPanel.getByLabel("WinterPack metadata")).toContainText("Update");
  const card = page.locator(".pack-card").filter({ hasText: "WinterPack" });
  await expect(card).toContainText("Detailed backend metadata");
  await expect(card).toContainText("1.0.3");
  await expect(card).toContainText("Update");
});

test("installing a pack refreshes the native bootstrap snapshot status", async ({ page }) => {
  await page.addInitScript(() => {
    let installed = false;
    let launched = false;
    const launchedProfileIds: string[] = [];
    let callbackId = 1;
    const callbacks = new Map<number, (...args: unknown[]) => unknown>();
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Cozy survival with friends.",
          version: "10/30/2025",
          status: installed ? "installed" : "not_installed",
          accent: "#67e8b9",
          installedPlayers: 0,
          defaultServer: "The Cabin",
        },
      ],
      profiles: installed
        ? [
            {
              id: "winterpack",
              name: "WinterPack",
              loader: "forge",
              gameVersion: "1.20.1",
              installedPackVersion: "2.3.7",
              memoryMb: 6144,
              jvmArgs: [],
            },
          ]
        : [],
      imports: [],
    });

    Object.defineProperty(window, "__installedPackLaunchProfileIds", {
      value: launchedProfileIds,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { profileId?: string }) => {
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "plan_install_pack") {
            return {
              operationId: "00000000-0000-4000-8000-000000000080",
              operation: "install_pack",
              subjectId: "winterpack",
              events: [
                { kind: "queued", message: "Install queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Install plan is ready to execute.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "install_pack") {
            installed = true;
            return {
              action: "install_pack",
              subjectId: "winterpack",
              status: "completed",
              message: "Pack installed successfully.",
            };
          }
          if (cmd === "start_launch_process") {
            launchedProfileIds.push(args?.profileId ?? "");
            launched = true;
            return {
              id: "managed-winterpack",
              processId: 4242,
              command: {
                executable: "javaw.exe",
                args: ["-Xmx6144M", "net.minecraft.client.main.Main"],
                workingDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/profiles/winterpack",
                env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
              },
              state: "running",
              startedAtUnixSeconds: 1_710_000_000,
              runtimeSeconds: 1,
              totalOutputLineCount: 1,
              droppedOutputLineCount: 0,
              output: [{ stream: "stdout", line: "Launching WinterPack" }],
            };
          }
          if (cmd === "list_managed_processes") {
            return launched
              ? [
                  {
                    id: "managed-winterpack",
                    processId: 4242,
                    command: {
                      executable: "javaw.exe",
                      args: ["-Xmx6144M", "net.minecraft.client.main.Main"],
                      workingDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/profiles/winterpack",
                      env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
                    },
                    state: "running",
                    startedAtUnixSeconds: 1_710_000_000,
                    runtimeSeconds: 1,
                    totalOutputLineCount: 1,
                    droppedOutputLineCount: 0,
                    output: [{ stream: "stdout", line: "Launching WinterPack" }],
                  },
                ]
              : [];
          }
          if (cmd === "list_launcher_events") {
            return [
              {
                id: "install-completed",
                operationId: "00000000-0000-4000-8000-000000000081",
                operation: "install_pack",
                subjectId: "winterpack",
                kind: "completed",
                message: "Pack installed successfully.",
                progressPercent: 100,
                occurredAtUnixSeconds: 1_710_000_000,
              },
            ];
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: (callback: (...args: unknown[]) => unknown) => {
          const id = callbackId++;
          callbacks.set(id, callback);
          return id;
        },
        unregisterCallback: (id: number) => {
          callbacks.delete(id);
        },
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");

  const card = page.locator(".pack-card").filter({ hasText: "WinterPack" });
  await expect(card.getByRole("button", { name: "Install" })).toBeVisible();
  await card.getByRole("button", { name: "Install" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "History", exact: true })).toHaveClass(/active/);
  const installEvent = page.locator(".event-row").filter({ hasText: "Pack installed successfully." });
  await expect(installEvent).toBeVisible();
  await expect(page.locator(".event-row").filter({ hasText: "Install plan is ready to execute." })).toHaveCount(0);
  await installEvent.getByRole("button", { name: "Play" }).click();
  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Games" })).toHaveClass(/active/);
  await expect(page.locator(".process-row").filter({ hasText: "javaw.exe" })).toContainText("Running");
  await expect
    .poll(() => page.evaluate(() => (window as typeof window & { __installedPackLaunchProfileIds: string[] }).__installedPackLaunchProfileIds))
    .toEqual(["winterpack"]);
  await page.locator("nav").getByRole("button", { name: "Play" }).click();
  await expect(card.getByRole("button", { name: "Running" })).toBeDisabled();
  await page.getByRole("button", { name: "Library" }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.getByLabel("WinterPack profile summary")).not.toContainText("Java");
});

test("pending native pack install stays visibly in progress after planning", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  tagline: "Cozy survival with friends.",
                  version: "10/30/2025",
                  status: "not_installed",
                  accent: "#67e8b9",
                  installedPlayers: 0,
                  defaultServer: "The Cabin",
                },
              ],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "plan_install_pack") {
            return {
              operationId: "00000000-0000-4000-8000-000000000090",
              operation: "install_pack",
              subjectId: "winterpack",
              events: [
                { kind: "queued", message: "Install queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Install plan is ready to execute.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "install_pack") {
            return new Promise(() => undefined);
          }
          if (cmd === "list_launcher_events" || cmd === "list_managed_processes") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");

  const card = page.locator(".pack-card").filter({ hasText: "WinterPack" });
  await card.getByRole("button", { name: "Install" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByLabel("Launcher quick status")).toContainText("Installing...");
  await expect(page.locator(".event-row").filter({ hasText: "Installing pack is running" })).toContainText("Working - 95%");
  await expect(page.locator(".event-row").filter({ hasText: "Install plan is ready to execute." })).toBeVisible();
  await page.locator("nav").getByRole("button", { name: "Play" }).click();
  await expect(card.getByRole("button", { name: "Installing..." })).toBeDisabled();
});

test("failed native pack install surfaces the failed launcher event", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    let callbackId = 1;
    const callbacks = new Map<number, (...args: unknown[]) => unknown>();
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Cozy survival with friends.",
          version: "10/30/2025",
          status: "not_installed",
          accent: "#67e8b9",
          installedPlayers: 0,
          defaultServer: "The Cabin",
        },
      ],
      profiles: [],
      imports: [],
    });

    Object.defineProperty(window, "__failedInstallInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "plan_install_pack") {
            return {
              operationId: "00000000-0000-4000-8000-000000000082",
              operation: "install_pack",
              subjectId: "winterpack",
              events: [
                { kind: "queued", message: "Install queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Install plan is ready to execute.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "install_pack") {
            throw new Error("Pack install failed: missing mod artifact");
          }
          if (cmd === "list_launcher_events") {
            return [
              {
                id: "install-failed",
                operationId: "00000000-0000-4000-8000-000000000083",
                operation: "install_pack",
                subjectId: "winterpack",
                kind: "failed",
                message: "Pack install failed: missing mod artifact",
                progressPercent: 100,
                occurredAtUnixSeconds: 1_710_000_000,
              },
            ];
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: (callback: (...args: unknown[]) => unknown) => {
          const id = callbackId++;
          callbacks.set(id, callback);
          return id;
        },
        unregisterCallback: (id: number) => {
          callbacks.delete(id);
        },
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");

  const card = page.locator(".pack-card").filter({ hasText: "WinterPack" });
  await card.getByRole("button", { name: "Install" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "History", exact: true })).toHaveClass(/active/);
  await expect(page.getByRole("complementary")).toContainText("Pack install failed: missing mod file");
  await expect(page.getByRole("complementary")).not.toContainText("missing mod artifact");
  const failedEvent = page.locator(".event-row").filter({ hasText: "Pack install failed: missing mod file" });
  await expect(failedEvent).toBeVisible();
  await expect(failedEvent).toContainText("Install pack - winterpack");
  await expect(failedEvent.getByRole("button", { name: "Play" })).toHaveCount(0);
  await expect(failedEvent.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.locator(".event-row").filter({ hasText: "Install plan is ready to execute." })).toHaveCount(0);
  await page.getByRole("button", { name: "Overview" }).click();
  await expect(page.getByLabel("Launcher tasks").locator(".operation-row").filter({ hasText: "Pack install failed" })).toHaveClass(
    /failed/,
  );
  await expect(page.getByLabel("Latest task breakdown")).toContainText("1 failed");
  await expect(page.getByLabel("Latest task breakdown")).toContainText("0 done");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await failedEvent.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("complementary")).toContainText("Pack install failed: missing mod file");

  const invoked = await page.evaluate(
    () => (window as typeof window & { __failedInstallInvokes: string[] }).__failedInstallInvokes,
  );
  expect(invoked.filter((cmd) => cmd === "plan_install_pack")).toHaveLength(2);
  expect(invoked.filter((cmd) => cmd === "install_pack")).toHaveLength(2);
  expect(invoked.indexOf("list_launcher_events", invoked.indexOf("install_pack"))).toBeGreaterThan(
    invoked.indexOf("install_pack"),
  );
});

test("updating a pack plans native install workflow before refreshing status", async ({ page }) => {
  await page.addInitScript(() => {
    let updated = false;
    const invoked: string[] = [];
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Cozy survival with friends.",
          version: "2.3.8",
          status: updated ? "installed" : "update_available",
          accent: "#67e8b9",
          installedPlayers: 0,
          defaultServer: "The Cabin",
        },
        {
          id: "skypack",
          name: "SkyPack",
          tagline: "A second pack for lifecycle guard coverage.",
          version: "1.0.0",
          status: "not_installed",
          accent: "#60a5fa",
          installedPlayers: 0,
          defaultServer: "Sky Base",
        },
      ],
      profiles: [
        {
          id: "winterpack",
          name: "WinterPack",
          loader: "forge",
          gameVersion: "1.20.1",
          installedPackVersion: updated ? "2.3.8" : "2.3.7",
          memoryMb: 8192,
          jvmArgs: ["-Dtheboys.custom=true", "-Dpack.update=keeps-settings"],
          resolution: { width: 1600, height: 900 },
          defaultServer: {
            name: "The Custom Cabin",
            address: "play.custom-cabin.local",
            port: 25566,
          },
        },
        {
          id: "latest-release",
          name: "Latest Release",
          loader: "vanilla",
          gameVersion: "1.21.8",
          memoryMb: 4096,
          jvmArgs: [],
        },
      ],
      imports: [],
    });

    Object.defineProperty(window, "__packUpdateInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "plan_install_pack") {
            return {
              operationId: "00000000-0000-4000-8000-000000000082",
              operation: "install_pack",
              subjectId: "winterpack",
              events: [
                { kind: "queued", message: "Update queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Update plan is ready to execute.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "install_pack") {
            updated = true;
            return {
              action: "install_pack",
              subjectId: "winterpack",
              status: "completed",
              message: "Pack updated successfully.",
            };
          }
          if (cmd === "list_launcher_events") {
            return [
              {
                id: "update-completed",
                operationId: "00000000-0000-4000-8000-000000000082",
                operation: "install_pack",
                subjectId: "winterpack",
                kind: "completed",
                message: "Pack updated successfully.",
                progressPercent: 100,
                occurredAtUnixSeconds: 1_710_000_000,
              },
            ];
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");

  const card = page.locator(".pack-card").filter({ hasText: "WinterPack" });
  await expect(card.getByRole("button", { name: "Update" })).toBeVisible();
  await expect(page.getByLabel("Primary pack actions").getByRole("button", { name: "Update" })).toBeVisible();
  await page.getByRole("button", { name: "Library" }).click();
  await expect(page.getByLabel("Library filters")).toContainText("All profiles");
  await page.getByPlaceholder("Search packs, profiles, friends...").fill("winter");
  await expect(page.getByLabel("Library filters")).toContainText('Searching "winter"');
  await expect(page.locator(".profile-row").filter({ hasText: "WinterPack" })).toBeVisible();
  await page.getByPlaceholder("Search packs, profiles, friends...").fill("");
  const profile = page.locator(".profile-row").filter({ hasText: "WinterPack" });
  await expect(profile.getByLabel("WinterPack profile summary")).toContainText("8 GB RAM");
  await expect(profile.getByLabel("WinterPack profile summary")).toContainText("1600x900");
  await expect(profile.getByLabel("WinterPack profile summary")).toContainText("The Custom Cabin");
  await expect(profile.getByLabel("WinterPack profile summary")).not.toContainText("Java launch options");
  await expect(profile.getByLabel("WinterPack launch actions").getByRole("button", { name: "Update" })).toBeVisible();
  await profile.getByLabel("WinterPack launch actions").getByRole("button", { name: "Update" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "History", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".event-row").filter({ hasText: "Pack updated successfully." })).toBeVisible();
  await page.getByRole("button", { name: "Library" }).click();
  await expect(profile.getByLabel("WinterPack launch actions").getByRole("button", { name: "Update" })).toHaveCount(0);
  await expect(profile.getByLabel("WinterPack profile summary")).toContainText("8 GB RAM");
  await expect(profile.getByLabel("WinterPack profile summary")).toContainText("1600x900");
  await expect(profile.getByLabel("WinterPack profile summary")).toContainText("The Custom Cabin");
  await expect(profile.getByLabel("WinterPack profile summary")).not.toContainText("Java launch options");
  await page.locator("nav").getByRole("button", { name: "Play" }).click();
  await expect(card.getByRole("button", { name: "Play" })).toBeEnabled();
  const invoked = await page.evaluate(() => (window as typeof window & { __packUpdateInvokes: string[] }).__packUpdateInvokes);
  expect(invoked.indexOf("plan_install_pack")).toBeLessThan(invoked.indexOf("install_pack"));
  expect(invoked.filter((cmd) => cmd === "bootstrap_snapshot").length).toBeGreaterThanOrEqual(2);
});

test("successful pack update clears stale launch repair recovery", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    let updated = false;
    Object.defineProperty(window, "__updateClearsRecoveryInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  tagline: "Cozy survival with friends.",
                  version: "2.3.8",
                  status: updated ? "installed" : "update_available",
                  accent: "#67e8b9",
                  installedPlayers: 0,
                  defaultServer: "The Cabin",
                },
              ],
              profiles: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  loader: "forge",
                  gameVersion: "1.20.1",
                  installedPackVersion: updated ? "2.3.8" : "2.3.7",
                  memoryMb: 6144,
                  jvmArgs: [],
                },
              ],
              imports: [],
            };
          }
          if (cmd === "build_launch_command") {
            throw new Error("asset index is missing: C:/TheBoysLauncher/cache/assets/indexes/1.20.1.json");
          }
          if (cmd === "plan_install_pack") {
            return {
              operationId: "update-plan",
              operation: "install_pack",
              subjectId: "winterpack",
              events: [
                { kind: "queued", message: "Update queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Update plan is ready to execute.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "install_pack") {
            updated = true;
            return {
              action: "install_pack",
              subjectId: "winterpack",
              message: "Pack updated successfully.",
            };
          }
          if (cmd === "list_launcher_events") {
            return updated
              ? [
                  {
                    id: "update-completed",
                    operationId: "update-plan",
                    operation: "install_pack",
                    subjectId: "winterpack",
                    kind: "completed",
                    message: "Pack updated successfully.",
                    progressPercent: 100,
                    occurredAtUnixSeconds: 1_710_000_100,
                  },
                ]
              : [];
          }
          if (cmd === "list_managed_processes") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Library" }).click();
  const profile = page.locator(".profile-row").filter({ hasText: "WinterPack" });
  await clickProfileSetupCheck(profile);

  await expect(page.getByLabel("Launcher status message")).toContainText("Game files are missing");
  await expect(page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Try play again" })).toBeVisible();

  await profile.getByLabel("WinterPack launch actions").getByRole("button", { name: "Update" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText("Pack updated successfully.");
  await expect(page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Try play again" })).toHaveCount(0);
  const invoked = await page.evaluate(
    () => (window as typeof window & { __updateClearsRecoveryInvokes: string[] }).__updateClearsRecoveryInvokes,
  );
  expect(invoked).toContain("build_launch_command");
  expect(invoked).toContain("install_pack");
});

test("terminal repair event clears stuck native repair busy state", async ({ page }) => {
  await page.addInitScript(() => {
    const callbacks = new Map<number, (event: unknown) => unknown>();
    let callbackId = 1;
    Object.defineProperty(window, "__emitRepairCompletedEvent", {
      value: () => {
        callbacks.values().next().value?.({
          event: "launcher-event",
          payload: {
            id: "repair-completed",
            operationId: "repair-plan",
            operation: "repair_profile",
            subjectId: "winterpack",
            kind: "completed",
            message: "Profile repair completed.",
            progressPercent: 100,
            occurredAtUnixSeconds: 1_710_000_000,
          },
        });
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  tagline: "Cozy survival with friends.",
                  version: "10/30/2025",
                  status: "installed",
                  accent: "#67e8b9",
                  installedPlayers: 0,
                  defaultServer: "The Cabin",
                },
              ],
              profiles: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  loader: "forge",
                  gameVersion: "1.20.1",
                  installedPackVersion: "2.3.7",
                  memoryMb: 6144,
                  jvmArgs: [],
                },
              ],
              imports: [],
            };
          }
          if (cmd === "plan_repair_profile") {
            return {
              operationId: "repair-plan",
              operation: "repair_profile",
              subjectId: "winterpack",
              events: [
                { kind: "queued", message: "Setup queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Setup is ready to start.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "repair_profile") {
            return new Promise(() => undefined);
          }
          if (cmd === "start_launch_process") {
            throw new Error("launch artifact is missing: asset index is missing. Install or repair the profile before launching.");
          }
          if (cmd === "list_launcher_events" || cmd === "list_managed_processes") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: (callback: (event: unknown) => unknown) => {
          const id = callbackId++;
          callbacks.set(id, callback);
          return id;
        },
        unregisterCallback: (id: number) => {
          callbacks.delete(id);
        },
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");

  await page.getByLabel("Primary pack actions").getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByLabel("Launcher quick status")).toContainText("Setting up...");

  await page.evaluate(() =>
    (window as typeof window & { __emitRepairCompletedEvent: () => void }).__emitRepairCompletedEvent(),
  );

  await expect(page.getByLabel("Launcher quick status")).toContainText("Game setup - Done");
  await page.getByRole("button", { name: "Library" }).click();
  const profile = page.locator(".profile-row").filter({ hasText: "WinterPack" });
  await expect(profile.getByRole("button", { name: "Play" })).toBeEnabled();
  await expect(profile.getByRole("button", { name: "Repair" })).toHaveCount(0);
});

test("live file download events surface in the sidebar status card", async ({ page }) => {
  await page.addInitScript(() => {
    const callbacks = new Map<number, (event: unknown) => unknown>();
    let callbackId = 1;
    Object.defineProperty(window, "__emitDownloadEvent", {
      value: () => {
        const event = {
          event: "launcher-event",
          payload: {
            id: "download-started",
            operationId: "download-plan",
            operation: "download_artifacts",
            subjectId: "winterpack-modloader-artifacts",
            kind: "downloading",
            message: "Downloading file: forge-bootstrap (library, 2.4 MB)",
            progressPercent: 42,
            occurredAtUnixSeconds: 1_710_000_000,
          },
        };
        callbacks.forEach((callback) => {
          try {
            callback(event);
          } catch {
            // Other Tauri listeners may receive a different payload shape in this test.
          }
        });
      },
      configurable: true,
    });
    Object.defineProperty(window, "__emitDownloadQueuedEvent", {
      value: () => {
        const event = {
          event: "launcher-event",
          payload: {
            id: "download-queued",
            operationId: "download-plan",
            operation: "download_artifacts",
            subjectId: "winterpack-modloader-artifacts",
            kind: "queued",
            message: "File pending: forge-bootstrap (library, 2.4 MB)",
            progressPercent: 0,
            occurredAtUnixSeconds: 1_710_000_000,
          },
        };
        callbacks.forEach((callback) => {
          try {
            callback(event);
          } catch {
            // Other Tauri listeners may receive a different payload shape in this test.
          }
        });
      },
      configurable: true,
    });
    Object.defineProperty(window, "__emitDownloadWithoutPercentEvent", {
      value: () => {
        const event = {
          event: "launcher-event",
          payload: {
            id: "download-started-without-percent",
            operationId: "download-plan",
            operation: "download_artifacts",
            subjectId: "winterpack-modloader-artifacts",
            kind: "downloading",
            message: "Downloading file: forge-bootstrap (library, 2.4 MB)",
            occurredAtUnixSeconds: 1_710_000_000,
          },
        };
        callbacks.forEach((callback) => {
          try {
            callback(event);
          } catch {
            // Other Tauri listeners may receive a different payload shape in this test.
          }
        });
      },
      configurable: true,
    });
    Object.defineProperty(window, "__emitDownloadCompletedEvent", {
      value: () => {
        const event = {
          event: "launcher-event",
          payload: {
            id: "download-completed",
            operationId: "download-plan",
            operation: "download_artifacts",
            subjectId: "winterpack-modloader-artifacts",
            kind: "completed",
            message: "File download completed",
            progressPercent: 100,
            occurredAtUnixSeconds: 1_710_000_001,
          },
        };
        callbacks.forEach((callback) => {
          try {
            callback(event);
          } catch {
            // Other Tauri listeners may receive a different payload shape in this test.
          }
        });
      },
      configurable: true,
    });
    Object.defineProperty(window, "__emitProcessorVerifiedEvent", {
      value: () => {
        const event = {
          event: "launcher-event",
          payload: {
            id: "processor-verified",
            operationId: "processor-plan",
            operation: "download_artifacts",
            subjectId: "1.20.1",
            kind: "verifying",
            message: "Verified modloader installer processor 6/6 outputs.",
            progressPercent: 95,
            occurredAtUnixSeconds: 1_710_000_002,
          },
        };
        callbacks.forEach((callback) => {
          try {
            callback(event);
          } catch {
            // Other Tauri listeners may receive a different payload shape in this test.
          }
        });
      },
      configurable: true,
    });
    Object.defineProperty(window, "__emitArchiveInstallCompletedEvent", {
      value: () => {
        const event = {
          event: "launcher-event",
          payload: {
            id: "archive-install-completed",
            operationId: "archive-install",
            operation: "install_modpack_archive",
            subjectId: "winterpack",
            kind: "completed",
            message: "WinterPack installed successfully.",
            progressPercent: 100,
            occurredAtUnixSeconds: 1_710_000_003,
          },
        };
        callbacks.forEach((callback) => {
          try {
            callback(event);
          } catch {
            // Other Tauri listeners may receive a different payload shape in this test.
          }
        });
      },
      configurable: true,
    });
    Object.defineProperty(window, "__downloadListenerCount", {
      value: () => callbacks.size,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "list_launcher_events" || cmd === "list_managed_processes") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: (callback: (event: unknown) => unknown) => {
          const id = callbackId++;
          callbacks.set(id, callback);
          return id;
        },
        unregisterCallback: (id: number) => {
          callbacks.delete(id);
        },
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as typeof window & { __downloadListenerCount: () => number }).__downloadListenerCount(),
      ),
    )
    .toBeGreaterThan(0);
  await page.evaluate(() =>
    (window as typeof window & { __emitDownloadQueuedEvent: () => void }).__emitDownloadQueuedEvent(),
  );

  await expect(page.getByLabel("Launcher status", { exact: true })).toContainText("Preparing files");
  await expect(page.getByLabel("Launcher status message")).toContainText("winterpack - Waiting to download mod loader files");
  await expect(page.getByLabel("Launcher status progress")).toBeVisible();
  await expect(page.getByLabel("Launcher status progress")).toHaveAttribute("aria-valuenow", "0");

  await page.evaluate(() =>
    (window as typeof window & { __emitDownloadEvent: () => void }).__emitDownloadEvent(),
  );

  await expect(page.getByLabel("Launcher status", { exact: true })).toContainText("Preparing files");
  await expect(page.getByLabel("Launcher status message")).toContainText("winterpack - Downloading mod loader files");
  await expect(page.getByLabel("Launcher status progress")).toBeVisible();
  await expect(page.getByLabel("Launcher status progress")).toHaveAttribute("aria-valuenow", "42");

  await page.evaluate(() =>
    (window as typeof window & { __emitDownloadWithoutPercentEvent: () => void }).__emitDownloadWithoutPercentEvent(),
  );

  await expect(page.getByLabel("Launcher status", { exact: true })).toContainText("Preparing files");
  await expect(page.getByLabel("Launcher status message")).toContainText("winterpack - Downloading mod loader files");
  await expect(page.getByLabel("Launcher status progress")).toBeVisible();
  await expect(page.getByLabel("Launcher status progress")).not.toHaveAttribute("aria-valuenow", /.+/);

  await page.evaluate(() =>
    (window as typeof window & { __emitDownloadCompletedEvent: () => void }).__emitDownloadCompletedEvent(),
  );

  await expect(page.getByLabel("Launcher status", { exact: true })).toContainText("Desktop connected");
  await expect(page.getByLabel("Launcher status", { exact: true })).not.toContainText("Preparing files");
  await expect(page.getByLabel("Launcher status message")).toContainText("Files are ready.");
  await expect(page.getByLabel("Launcher status message")).not.toContainText("File download completed");
  await expect(page.getByLabel("Launcher status progress")).toHaveCount(0);

  await page.evaluate(() =>
    (window as typeof window & { __emitProcessorVerifiedEvent: () => void }).__emitProcessorVerifiedEvent(),
  );

  await expect(page.getByLabel("Launcher status", { exact: true })).toContainText("Preparing files");
  await expect(page.getByLabel("Launcher status message")).toContainText("1.20.1 - Verifying mod loader setup");

  await page.evaluate(() =>
    (window as typeof window & { __emitArchiveInstallCompletedEvent: () => void }).__emitArchiveInstallCompletedEvent(),
  );

  await expect(page.getByLabel("Launcher status", { exact: true })).toContainText("Desktop connected");
  await expect(page.getByLabel("Launcher status", { exact: true })).not.toContainText("Preparing files");
  await expect(page.getByLabel("Launcher status message")).toContainText("WinterPack installed successfully.");
  await expect(page.getByLabel("Launcher status progress")).toHaveCount(0);
});

test("sidebar ignores stale active setup after a later completed lifecycle event", async ({ page }) => {
  await page.addInitScript(() => {
    const events = [
      {
        id: "setup-running",
        operationId: "setup-operation",
        operation: "repair_profile",
        subjectId: "winterpack",
        kind: "running",
        message: "Setting up profile files",
        progressPercent: 55,
        occurredAtUnixSeconds: 1_710_000_000,
      },
      {
        id: "pack-installed",
        operationId: "install-operation",
        operation: "install_pack",
        subjectId: "winterpack",
        kind: "completed",
        message: "Pack installed successfully.",
        progressPercent: 100,
        occurredAtUnixSeconds: 1_710_000_001,
      },
    ];
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "list_launcher_events") return events;
          if (cmd === "list_managed_processes") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Activity" }).click();

  await expect(page.getByLabel("Launcher status", { exact: true })).toContainText("Desktop connected");
  await expect(page.getByLabel("Launcher status", { exact: true })).not.toContainText("Game setup");
  await expect(page.getByLabel("Launcher quick status")).toContainText("Install pack - Done");
  await expect(page.getByLabel("Launcher status progress")).toHaveCount(0);
});

test("activity play stays available during an unrelated install", async ({ page }) => {
  await page.addInitScript(() => {
    const callbacks = new Map<number, (event: unknown) => unknown>();
    let callbackId = 1;
    const invoked: Array<{ cmd: string; profileId?: string; packId?: string }> = [];
    Object.defineProperty(window, "__activityConcurrentInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__emitReadyPackCompletedEvent", {
      value: () => {
        const event = {
          event: "launcher-event",
          payload: {
            id: "ready-pack-completed",
            operationId: "ready-pack-install",
            operation: "install_pack",
            subjectId: "ready-pack",
            kind: "completed",
            message: "Pack installed successfully.",
            progressPercent: 100,
            occurredAtUnixSeconds: 1_710_000_002,
          },
        };
        callbacks.forEach((callback) => {
          try {
            callback(event);
          } catch {
            // Other Tauri listeners may receive a different payload shape in this test.
          }
        });
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { profileId?: string; packId?: string }) => {
          invoked.push({ cmd, profileId: args?.profileId, packId: args?.packId });
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  tagline: "Cozy survival with friends.",
                  version: "10/30/2025",
                  status: "not_installed",
                  accent: "#67e8b9",
                  installedPlayers: 0,
                  defaultServer: "The Cabin",
                },
                {
                  id: "ready-pack",
                  name: "Ready Pack",
                  tagline: "Already installed.",
                  version: "1.0.0",
                  status: "installed",
                  accent: "#6ee7f9",
                  installedPlayers: 0,
                  defaultServer: "Ready Server",
                },
              ],
              profiles: [
                {
                  id: "ready-pack",
                  name: "Ready Pack",
                  loader: "vanilla",
                  gameVersion: "1.21.8",
                  memoryMb: 4096,
                  jvmArgs: [],
                },
              ],
              imports: [],
            };
          }
          if (cmd === "plan_install_pack") {
            return {
              operationId: "winterpack-install",
              operation: "install_pack",
              subjectId: "winterpack",
              events: [
                { kind: "queued", message: "Install queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Install plan is ready to execute.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "install_pack") {
            return new Promise(() => undefined);
          }
          if (cmd === "start_launch_process") {
            return {
              id: "ready-process",
              processId: 4400,
              command: {
                executable: "javaw.exe",
                args: ["net.minecraft.client.main.Main"],
                workingDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/profiles/ready-pack",
                env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: args?.profileId ?? "ready-pack" }],
              },
              state: "running",
              startedAtUnixSeconds: 1_710_000_003,
              runtimeSeconds: 0,
              totalOutputLineCount: 0,
              droppedOutputLineCount: 0,
              output: [],
            };
          }
          if (cmd === "list_launcher_events" || cmd === "list_managed_processes") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: (callback: (event: unknown) => unknown) => {
          const id = callbackId++;
          callbacks.set(id, callback);
          return id;
        },
        unregisterCallback: (id: number) => {
          callbacks.delete(id);
        },
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.locator(".pack-card").filter({ hasText: "WinterPack" }).getByRole("button", { name: "Install" }).click();
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await page.evaluate(() =>
    (window as typeof window & { __emitReadyPackCompletedEvent: () => void }).__emitReadyPackCompletedEvent(),
  );

  const readyEvent = page.locator(".event-row").filter({ hasText: "Ready Pack" });
  await expect(readyEvent.getByRole("button", { name: "Play" })).toBeEnabled();
  await readyEvent.getByRole("button", { name: "Play" }).click();

  const invoked = await page.evaluate(
    () => (window as typeof window & { __activityConcurrentInvokes: Array<{ cmd: string; profileId?: string }> }).__activityConcurrentInvokes,
  );
  expect(invoked).toContainEqual(expect.objectContaining({ cmd: "start_launch_process", profileId: "ready-pack" }));
});

test("pending native install polls launcher events into the sidebar without refresh", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    let installStarted = false;
    Object.defineProperty(window, "__pendingInstallPollInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  tagline: "Cozy survival with friends.",
                  version: "2.3.7",
                  status: "not_installed",
                  accent: "#67e8b9",
                  installedPlayers: 0,
                  defaultServer: "The Cabin",
                },
              ],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "plan_install_pack") {
            return {
              operationId: "install-plan",
              operation: "install_pack",
              subjectId: "winterpack",
              events: [
                { kind: "queued", message: "Install queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Install plan is ready to execute.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "install_pack") {
            installStarted = true;
            return new Promise(() => undefined);
          }
          if (cmd === "list_launcher_events") {
            return installStarted
              ? [
                  {
                    id: "download-active",
                    operationId: "download-plan",
                    operation: "download_artifacts",
                    subjectId: "winterpack",
                    kind: "downloading",
                    message: "Downloading file: asset-object-minecraft/sounds/random/click.ogg (asset object, 4.2 KB)",
                    progressPercent: 42,
                    occurredAtUnixSeconds: 1_710_000_000,
                  },
                ]
              : [];
          }
          if (cmd === "list_managed_processes") return [];
          if (cmd === "load_minecraft_session") return null;
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByLabel("Primary pack actions").getByRole("button", { name: "Install" }).click();

  await expect(page.getByLabel("Launcher status", { exact: true })).toContainText("Preparing files", {
    timeout: 5000,
  });
  await expect(page.getByLabel("Launcher status message")).toContainText("winterpack - Downloading Minecraft assets");
  await expect(page.getByLabel("Launcher status progress")).toBeVisible();
  const invoked = await page.evaluate(
    () => (window as typeof window & { __pendingInstallPollInvokes: string[] }).__pendingInstallPollInvokes,
  );
  expect(invoked.filter((cmd) => cmd === "list_launcher_events").length).toBeGreaterThanOrEqual(2);
});

test("pending native install plan surfaces operation progress before file events", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  tagline: "Cozy survival with friends.",
                  version: "2.3.7",
                  status: "not_installed",
                  accent: "#67e8b9",
                  installedPlayers: 0,
                  defaultServer: "The Cabin",
                },
              ],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "plan_install_pack") {
            return {
              operationId: "install-plan",
              operation: "install_pack",
              subjectId: "winterpack",
              events: [
                { kind: "queued", message: "Install queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Install plan is ready to execute.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "install_pack") return new Promise(() => undefined);
          if (cmd === "list_launcher_events" || cmd === "list_managed_processes") return [];
          if (cmd === "load_minecraft_session") return null;
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByLabel("Primary pack actions").getByRole("button", { name: "Install" }).click();

  await expect(page.getByLabel("Launcher status", { exact: true })).toContainText("Install pack");
  await expect(page.getByLabel("Launcher status message")).toContainText("Installing pack is running");
  await expect(page.getByLabel("Launcher status progress")).toBeVisible();
  await expect(page.getByLabel("Launcher status progress")).toHaveAttribute("aria-valuenow", "95");
});

test("pack update action is disabled while native install is pending", async ({ page }) => {
  await page.addInitScript(() => {
    let updated = false;
    let releaseInstall: (() => void) | undefined;
    const invoked: string[] = [];
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Cozy survival with friends.",
          version: "2.3.8",
          status: updated ? "installed" : "update_available",
          accent: "#67e8b9",
          installedPlayers: 0,
          defaultServer: "The Cabin",
        },
      ],
      profiles: [
        {
          id: "winterpack",
          name: "WinterPack",
          loader: "forge",
          gameVersion: "1.20.1",
          installedPackVersion: updated ? "2.3.8" : "2.3.7",
          memoryMb: 6144,
          jvmArgs: [],
        },
      ],
      imports: [],
    });

    Object.defineProperty(window, "__packPendingInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__releasePendingPackInstall", {
      value: () => releaseInstall?.(),
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "plan_install_pack") {
            return {
              operationId: "00000000-0000-4000-8000-000000000083",
              operation: "install_pack",
              subjectId: "winterpack",
              events: [
                { kind: "queued", message: "Update queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Update plan is ready to execute.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "install_pack") {
            await new Promise<void>((resolve) => {
              releaseInstall = resolve;
            });
            updated = true;
            return {
              action: "install_pack",
              subjectId: "winterpack",
              status: "completed",
              message: "Pack updated successfully.",
            };
          }
          if (cmd === "list_launcher_events") {
            return updated
              ? [
                  {
                    id: "update-completed",
                    operationId: "00000000-0000-4000-8000-000000000083",
                    operation: "install_pack",
                    subjectId: "winterpack",
                    kind: "completed",
                    message: "Pack updated successfully.",
                    progressPercent: 100,
                    occurredAtUnixSeconds: 1_710_000_000,
                  },
                ]
              : [];
          }
          if (cmd === "start_launch_process") {
            return {
              id: "winterpack-process",
              profileId: "winterpack",
              profileName: "WinterPack",
              command: "java",
              args: [],
              startedAtUnixSeconds: 1_710_000_001,
              state: "running",
              output: [],
              exitCode: null,
              exitedAtUnixSeconds: null,
              stopRequested: false,
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");

  const card = page.locator(".pack-card").filter({ hasText: "WinterPack" });
  await page.evaluate(() => {
    const button = [...document.querySelectorAll<HTMLButtonElement>(".pack-card button")].find((candidate) =>
      candidate.textContent?.includes("Update"),
    );
    button?.click();
    button?.click();
  });
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "History", exact: true })).toHaveClass(/active/);
  const pendingPlanEvent = page.locator(".event-row").filter({ hasText: "Update plan is ready to execute." });
  await expect(pendingPlanEvent).toBeVisible();
  await expect(pendingPlanEvent.getByRole("button", { name: "Play" })).toHaveCount(0);
  let invoked = await page.evaluate(() => (window as typeof window & { __packPendingInvokes: string[] }).__packPendingInvokes);
  expect(invoked.filter((cmd) => cmd === "plan_install_pack")).toHaveLength(1);
  expect(invoked.filter((cmd) => cmd === "install_pack")).toHaveLength(1);
  expect(invoked).not.toContain("start_launch_process");

  await page.locator("nav").getByRole("button", { name: "Play" }).click();
  await expect(page.getByLabel("Primary pack actions").getByRole("button", { name: "Updating..." })).toBeDisabled();
  await expect(page.getByLabel("Primary pack actions").getByRole("button", { name: "Busy" })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Updating..." })).toBeDisabled();
  await page.getByRole("button", { name: "Library" }).click();
  const pendingProfileActions = page.getByLabel("WinterPack launch actions");
  await expect(pendingProfileActions.getByRole("button", { name: "Busy" })).toHaveCount(0);
  await expect(pendingProfileActions.getByRole("button", { name: "Updating..." })).toBeDisabled();
  await pendingProfileActions.getByRole("button", { name: "Updating..." }).click({ force: true });
  invoked = await page.evaluate(() => (window as typeof window & { __packPendingInvokes: string[] }).__packPendingInvokes);
  expect(invoked.filter((cmd) => cmd === "install_pack")).toHaveLength(1);
  expect(invoked).not.toContain("start_launch_process");

  await page.evaluate(() => (window as typeof window & { __releasePendingPackInstall: () => void }).__releasePendingPackInstall());
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "History", exact: true })).toHaveClass(/active/);
  const completedUpdateEvent = page.locator(".event-row").filter({ hasText: "Pack updated successfully." });
  await expect(completedUpdateEvent).toBeVisible();
  await expect(completedUpdateEvent.getByRole("button", { name: "Play" })).toBeEnabled();
  invoked = await page.evaluate(() => (window as typeof window & { __packPendingInvokes: string[] }).__packPendingInvokes);
  expect(invoked.filter((cmd) => cmd === "install_pack")).toHaveLength(1);
});

test("archiving a profile refreshes the native bootstrap snapshot status", async ({ page }) => {
  await page.addInitScript(() => {
    let installed = true;
    let callbackId = 1;
    const callbacks = new Map<number, (...args: unknown[]) => unknown>();
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Cozy survival with friends.",
          version: "10/30/2025",
          status: installed ? "installed" : "not_installed",
          accent: "#67e8b9",
          installedPlayers: 0,
          defaultServer: "The Cabin",
        },
      ],
      profiles: installed
        ? [
            {
              id: "winterpack",
              name: "WinterPack",
              loader: "forge",
              gameVersion: "1.20.1",
              installedPackVersion: "10/30/2025",
              memoryMb: 6144,
              jvmArgs: [],
            },
          ]
        : [],
      imports: [],
    });

    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "archive_profile") {
            installed = false;
            return {
              id: "winterpack",
              name: "WinterPack",
              loader: "forge",
              gameVersion: "1.20.1",
              installedPackVersion: "10/30/2025",
              memoryMb: 6144,
              jvmArgs: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: (callback: (...args: unknown[]) => unknown) => {
          const id = callbackId++;
          callbacks.set(id, callback);
          return id;
        },
        unregisterCallback: (id: number) => {
          callbacks.delete(id);
        },
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");

  const card = page.locator(".pack-card").filter({ hasText: "WinterPack" });
  await expect(card.getByRole("button", { name: "Play" })).toBeVisible();
  await page.getByRole("button", { name: "Library" }).click();
  const profile = page.locator(".profile-row").filter({ hasText: "WinterPack" });
  await openProfileCustomize(profile);
  await profile.getByRole("button", { name: "Hide from Library" }).click();

  await expect(page.getByText("WinterPack hidden from Library")).toBeVisible();
  await page.locator("nav").getByRole("button", { name: "Play" }).click();
  await expect(card.getByRole("button", { name: "Install" })).toBeVisible();
});

test("creating a profile refreshes the native bootstrap snapshot", async ({ page }) => {
  await page.addInitScript(() => {
    let createdProfile: {
      name: string;
      loader: "vanilla" | "fabric" | "quilt" | "forge" | "neoforge";
      gameVersion: string;
      memoryMb: number;
    } | null = null;
    const invoked: string[] = [];
    const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    let prepared = false;
    let callbackId = 1;
    const callbacks = new Map<number, (...args: unknown[]) => unknown>();
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: createdProfile
        ? [
            {
              id: "native-created",
              name: createdProfile.name,
              loader: createdProfile.loader,
              gameVersion: createdProfile.gameVersion,
              memoryMb: createdProfile.memoryMb,
              jvmArgs: [],
            },
          ]
        : [],
      imports: [],
    });

    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { request?: typeof createdProfile }) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "list_minecraft_versions") {
            return [
              {
                id: "1.21.8",
                type: "release",
                url: "https://example.invalid/1.21.8.json",
                releaseTime: "2025-07-17T12:00:00+00:00",
              },
              {
                id: "1.21.4",
                type: "release",
                url: "https://example.invalid/1.21.4.json",
                releaseTime: "2024-12-03T12:00:00+00:00",
              },
              {
                id: "26w01a",
                type: "snapshot",
                url: "https://example.invalid/26w01a.json",
                releaseTime: "2026-01-07T12:00:00+00:00",
              },
            ];
          }
          if (cmd === "create_profile") {
            await delay(200);
            createdProfile = args?.request ?? null;
            return {
              id: "native-created",
              name: createdProfile?.name ?? "Native Created",
              loader: createdProfile?.loader ?? "vanilla",
              gameVersion: createdProfile?.gameVersion ?? "1.21.8",
              memoryMb: createdProfile?.memoryMb ?? 6144,
              jvmArgs: [],
            };
          }
          if (cmd === "prepare_profile") {
            prepared = true;
            return {
              id: "receipt-prepare-native-created",
              action: "repair_profile",
              subjectId: "native-created",
              status: "completed",
              message: "Profile setup completed.",
            };
          }
          if (cmd === "list_launcher_events") {
            return prepared
              ? [
                  {
                    id: "setup-completed",
                    operationId: "setup-native-created",
                    operation: "repair_profile",
                    subjectId: "native-created",
                    kind: "completed",
                    message: "Profile setup completed.",
                    progressPercent: 100,
                    occurredAtUnixSeconds: Math.floor(Date.now() / 1000),
                  },
                ]
              : [];
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: (callback: (...args: unknown[]) => unknown) => {
          const id = callbackId++;
          callbacks.set(id, callback);
          return id;
        },
        unregisterCallback: (id: number) => {
          callbacks.delete(id);
        },
      },
      configurable: true,
    });
    Object.defineProperty(window, "__nativeCreateProfileInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");

  await page.getByRole("button", { name: "Library" }).click();
  await expect(page.locator(".profile-row")).toHaveCount(0);
  await page.getByRole("button", { name: "New Instance" }).click();
  await expect(page.locator(".new-profile-row")).toBeVisible();
  const creatorLayout = await page.locator(".new-profile-row").evaluate((row) => {
    const editor = row.querySelector(".profile-editor") as HTMLElement | null;
    const createButton = row.querySelector('[aria-label="New profile actions"] button') as HTMLElement | null;
    if (!editor || !createButton) {
      return null;
    }
    return {
      buttonOverflowPx: createButton.scrollWidth - createButton.clientWidth,
      buttonWidth: createButton.getBoundingClientRect().width,
      editorWidth: editor.getBoundingClientRect().width,
      rowOverflowPx: row.scrollWidth - row.clientWidth,
    };
  });
  expect(creatorLayout?.rowOverflowPx ?? 999).toBeLessThanOrEqual(2);
  expect(creatorLayout?.buttonOverflowPx ?? 999).toBeLessThanOrEqual(2);
  expect(creatorLayout?.buttonWidth ?? 0).toBeGreaterThanOrEqual(170);
  expect(creatorLayout?.editorWidth ?? 0).toBeGreaterThanOrEqual(440);
  await expect(page.getByLabel("New profile name")).toHaveValue("Minecraft 1.21.8");
  await page.getByLabel("New profile version channel").selectOption("snapshot");
  await expect(page.getByLabel("New profile game version")).toHaveValue("26w01a");
  await expect(page.getByLabel("New profile name")).toHaveValue("Minecraft 26w01a");
  await page.getByLabel("New profile name").fill("Native Fabric");
  await page.getByLabel("New profile version channel").selectOption("release");
  await expect(page.getByLabel("New profile name")).toHaveValue("Native Fabric");
  await page.getByLabel("New profile version channel").selectOption("snapshot");
  await expect(page.getByLabel("New profile name")).toHaveValue("Native Fabric");
  await page.getByLabel("New profile game version").selectOption("26w01a");
  await expect(page.getByLabel("New profile memory")).toBeVisible();
  await page.getByLabel("New profile memory").fill("256");
  await expect(page.getByLabel("New profile actions")).toContainText("Use at least 512 MB of memory.");
  await page.getByLabel("New profile memory").fill("8192");
  await expect(page.getByLabel("New profile actions")).not.toContainText("Use at least 512 MB of memory.");
  await expect(page.getByLabel("New profile advanced settings")).toHaveCount(0);
  await expect(page.getByLabel("New profile loader")).toHaveCount(0);
  await page.getByRole("button", { name: "Advanced" }).click();
  await expect(page.getByLabel("New profile advanced settings")).toBeVisible();
  await expect(page.getByLabel("New profile advanced settings")).toContainText(
    "Only loaders the launcher can prepare for this Minecraft version are shown.",
  );
  await expect(page.getByLabel("New profile loader").locator("option", { hasText: "Forge" })).toHaveCount(0);
  await expect(page.getByLabel("New profile loader").locator("option", { hasText: "NeoForge" })).toHaveCount(0);
  await page.getByLabel("New profile loader").selectOption("fabric");
  const createButton = page.getByLabel("New profile actions").getByRole("button", { name: "Create profile", exact: true });
  await createButton.click();
  await expect(page.getByRole("button", { name: "Creating...", exact: true })).toBeDisabled();
  await expect(page.getByLabel("New profile actions").getByRole("button", { name: "Cancel" })).toBeDisabled();

  await expect(page.getByText("Native Fabric created and ready")).toBeVisible();
  const createdProfile = page.locator(".profile-row").filter({ hasText: "Native Fabric" });
  await expect(createdProfile.getByLabel("Native Fabric profile summary")).toContainText("26w01a");
  await expect(createdProfile.getByLabel("Native Fabric profile summary")).toContainText("Fabric");
  await expect(createdProfile.getByLabel("Native Fabric profile summary")).toContainText("8 GB RAM");
  await expect(page.getByLabel("Launcher quick status")).toContainText("Game setup - Done");
  const invoked = await page.evaluate(() => (window as typeof window & { __nativeCreateProfileInvokes: string[] }).__nativeCreateProfileInvokes);
  expect(invoked.filter((cmd) => cmd === "create_profile")).toHaveLength(1);
  expect(invoked.indexOf("create_profile")).toBeLessThan(invoked.indexOf("prepare_profile"));
  expect(invoked.indexOf("bootstrap_snapshot", invoked.indexOf("prepare_profile"))).toBeGreaterThan(invoked.indexOf("prepare_profile"));
});

test("profile creator explains setup can finish on Play after a native setup fallback failure", async ({ page }) => {
  await page.addInitScript(() => {
    let created = false;
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { request?: { name: string; loader: string; gameVersion: string; memoryMb: number } }) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: created
                ? [
                    {
                      id: "native-created",
                      name: args?.request?.name ?? "Native Created",
                      loader: "vanilla",
                      gameVersion: "1.21.8",
                      memoryMb: 4096,
                      jvmArgs: [],
                    },
                  ]
                : [],
              imports: [],
            };
          }
          if (cmd === "list_minecraft_versions") {
            return [
              {
                id: "1.21.8",
                versionType: "release",
                url: "https://example.invalid/1.21.8.json",
                releaseTime: "2025-07-17T12:00:00+00:00",
              },
            ];
          }
          if (cmd === "create_profile") {
            created = true;
            return {
              id: "native-created",
              name: args?.request?.name ?? "Native Created",
              loader: "vanilla",
              gameVersion: "1.21.8",
              memoryMb: 4096,
              jvmArgs: [],
            };
          }
          if (cmd === "prepare_profile") throw "";
          if (cmd === "list_launcher_events" || cmd === "list_managed_processes" || cmd === "list_minecraft_accounts") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Library" }).click();
  await page.getByRole("button", { name: "New Instance" }).click();
  await page.getByLabel("New profile name").fill("Native Created");
  await page.getByLabel("New profile actions").getByRole("button", { name: "Create profile", exact: true }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText(
    "Native Created was created, but game setup needs another try.",
  );
  await expect(page.getByLabel("Launcher status message")).not.toContainText("Press Try play again");
  await expect(page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Try play again" })).toBeEnabled();
});

test("profile creator falls back to common releases when Minecraft versions fail to load", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    let createdProfile: {
      id: string;
      name: string;
      loader: string;
      gameVersion: string;
      memoryMb: number;
      jvmArgs: string[];
    } | null = null;
    let callbackId = 1;
    const callbacks = new Map<number, (...args: unknown[]) => unknown>();

    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { request?: { name: string; loader: string; gameVersion: string; memoryMb: number }; profileId?: string }) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: createdProfile ? [createdProfile] : [],
              imports: [],
            };
          }
          if (cmd === "list_minecraft_versions") {
            throw new Error("Mojang manifest unavailable");
          }
          if (cmd === "create_profile") {
            const request = args?.request;
            if (!request) throw new Error("missing create profile request");
            createdProfile = {
              id: request.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
              name: request.name,
              loader: request.loader,
              gameVersion: request.gameVersion,
              memoryMb: request.memoryMb,
              jvmArgs: [],
            };
            return createdProfile;
          }
          if (cmd === "prepare_profile") {
            return {
              profileId: args?.profileId ?? createdProfile?.id ?? "minecraft-1-21-8",
              message: "Profile setup completed.",
            };
          }
          if (cmd === "list_launcher_events") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: (callback: (...args: unknown[]) => unknown) => {
          const id = callbackId++;
          callbacks.set(id, callback);
          return id;
        },
        unregisterCallback: (id: number) => {
          callbacks.delete(id);
        },
      },
      configurable: true,
    });
    Object.defineProperty(window, "__nativeVersionFailureInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");

  await page.getByRole("button", { name: "Library" }).click();
  await page.getByRole("button", { name: "New Instance" }).click();

  await expect(page.getByText("Live versions could not load. Showing common releases you can still use.")).toBeVisible();
  await expect(page.getByLabel("New profile game version")).toBeEnabled();
  await expect(page.getByLabel("New profile game version")).toHaveValue("1.21.8");
  const createAndSetupButton = page.getByLabel("New profile actions").getByRole("button", { name: "Create profile", exact: true });
  await expect(createAndSetupButton).toBeEnabled();
  await expect(page.getByLabel("Launcher status message")).toContainText("Live Minecraft versions unavailable; showing common releases");

  await createAndSetupButton.click();
  await expect(page.getByText("Minecraft 1.21.8 created and ready")).toBeVisible();
  await expect(page.getByLabel("Minecraft 1.21.8 profile summary")).toContainText("1.21.8");

  const invoked = await page.evaluate(
    () => (window as typeof window & { __nativeVersionFailureInvokes: string[] }).__nativeVersionFailureInvokes,
  );
  expect(invoked).toContain("list_minecraft_versions");
  expect(invoked).toContain("create_profile");
  expect(invoked).toContain("prepare_profile");
});

test("home screen replaces preview friends with social backend presence", async ({ page }) => {
  const accountId = "00000000-0000-4000-8000-000000000001";
  const expiresAtUnixSeconds = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = `minecraft-session:${accountId}:${expiresAtUnixSeconds}`;
  const authorizationHeader = `Bearer ${accessToken}`;
  let presenceAuthorization = "";
  let devSessionRequests = 0;
  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
  };

  await installNativeSocialPresenceStub(page, { accountId, accessToken, authorizationHeader });
  await page.route("http://127.0.0.1:4074/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (request.url().endsWith("/dev/sessions")) {
      devSessionRequests += 1;
      await route.fulfill({ status: 403, headers: corsHeaders });
      return;
    }
    if (request.url().endsWith("/presence")) {
      presenceAuthorization = request.headers()["authorization"] ?? "";
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify([
          {
            accountId: "00000000-0000-4000-8000-000000000007",
            state: "playing",
            packId: "winterpack",
            serverId: "The Cabin",
            updatedAtUnixSeconds: 1234,
          },
        ]),
      });
      return;
    }
    await route.fulfill({ status: 404, headers: corsHeaders });
  });
  await page.goto("/");

  const backendFriend = page.locator(".friend-row").filter({ hasText: "Player 0007" });
  await expect(backendFriend).toContainText("WinterPack - The Cabin");
  await expect(backendFriend.getByRole("button", { name: "Join" })).toBeVisible();
  await expect(page.locator(".friend-row").filter({ hasText: "Dylan" })).toHaveCount(0);
  expect(presenceAuthorization).toBe(authorizationHeader);
  expect(devSessionRequests).toBe(0);
});

test("home screen clears stale preview friends when backend presence is empty", async ({ page }) => {
  const accountId = "00000000-0000-4000-8000-000000000001";
  const expiresAtUnixSeconds = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = `minecraft-session:${accountId}:${expiresAtUnixSeconds}`;
  const authorizationHeader = `Bearer ${accessToken}`;
  let devSessionRequests = 0;
  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
  };

  await installNativeSocialPresenceStub(page, { accountId, accessToken, authorizationHeader });
  await page.route("http://127.0.0.1:4074/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (request.url().endsWith("/dev/sessions")) {
      devSessionRequests += 1;
      await route.fulfill({ status: 403, headers: corsHeaders });
      return;
    }
    if (request.url().endsWith("/presence")) {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: "[]",
      });
      return;
    }
    await route.fulfill({ status: 404, headers: corsHeaders });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "WinterPack" })).toBeVisible();
  await expect(page.getByLabel("Home party panel")).toContainText("0 parties");
  await expect(page.locator(".friend-row").filter({ hasText: "Dylan" })).toHaveCount(0);
  await expect(page.getByLabel("Home party panel")).not.toContainText("friends online or away");
  expect(devSessionRequests).toBe(0);
});

test("home screen hides current account and stale preview presence from backend snapshot", async ({ page }) => {
  const accountId = "11111111-1111-4111-8111-111111111111";
  const accessToken = "native-minecraft-session-token";
  const authorizationHeader = `Bearer ${accessToken}`;
  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
  };

  await page.route("http://127.0.0.1:4074/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (request.url().endsWith("/presence")) {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify([
          {
            accountId,
            state: "playing",
            packId: "winterpack",
            serverId: "The Cabin",
            updatedAtUnixSeconds: 1234,
          },
          {
            accountId: "00000000-0000-4000-8000-000000000001",
            state: "playing",
            packId: "winterpack",
            serverId: "The Cabin",
            updatedAtUnixSeconds: 1234,
          },
        ]),
      });
      return;
    }
    await route.fulfill({ status: 404, headers: corsHeaders });
  });

  await page.addInitScript(({ accountId, accessToken, authorizationHeader }) => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/TheBoysLauncher/data",
                configDir: "C:/TheBoysLauncher/config",
                cacheDir: "C:/TheBoysLauncher/cache",
                logDir: "C:/TheBoysLauncher/logs",
              },
              minecraftSession: {
                session: {
                  username: "Dilll",
                  uuid: accountId,
                  accessToken: "[redacted]",
                },
                accountId,
                expiresAtUnixSeconds: 1_710_003_600,
                storedAtUnixSeconds: 1_710_000_000,
              },
              friends: [],
              packs: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  tagline: "Cozy survival with friends.",
                  version: "2.3.7",
                  status: "installed",
                  accent: "#67e8b9",
                  installedPlayers: 0,
                  defaultServer: "The Cabin",
                },
              ],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: true,
              managed: true,
              message: "Online",
            };
          }
          if (cmd === "exchange_stored_minecraft_session_for_backend_session") {
            return {
              accountId,
              tokenType: "Bearer",
              sessionKind: "minecraft",
              minecraftUuid: accountId,
              minecraftName: "Dilll",
              accessToken,
              authorizationHeader,
              issuedAtUnixSeconds: 1_710_000_000,
              expiresAtUnixSeconds: 1_710_003_600,
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        listen: async () => () => undefined,
      },
      configurable: true,
    });
  }, { accountId, accessToken, authorizationHeader });

  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "WinterPack" })).toBeVisible();
  await expect(page.getByLabel("Home party panel")).toContainText("0 parties");
  await expect(page.locator(".friend-row").filter({ hasText: "Dilll" })).toHaveCount(0);
  await expect(page.locator(".friend-row").filter({ hasText: "Player 0001" })).toHaveCount(0);
});

test("home screen streams friend presence from the social backend websocket", async ({ page }) => {
  const accountId = "00000000-0000-4000-8000-000000000001";
  const expiresAtUnixSeconds = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = `minecraft-session:${accountId}:${expiresAtUnixSeconds}`;
  const authorizationHeader = `Bearer ${accessToken}`;
  let devSessionRequests = 0;
  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
  };

  await installNativeSocialPresenceStub(page, { accountId, accessToken, authorizationHeader });
  await page.route("http://127.0.0.1:4074/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (request.url().endsWith("/presence")) {
      expect(request.headers()["authorization"]).toBe(authorizationHeader);
      await route.fulfill({
        status: 200,
        headers: {
          ...corsHeaders,
          "content-type": "application/json",
        },
        body: "[]",
      });
      return;
    }
    if (request.url().endsWith("/dev/sessions")) {
      devSessionRequests += 1;
      await route.fulfill({ status: 403, headers: corsHeaders });
      return;
    }
    await route.fulfill({
      status: 404,
      headers: {
        ...corsHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({ error: "not found" }),
    });
  });
  await page.addInitScript(() => {
    const sockets: Array<{
      emitPresence: (payload: unknown) => void;
      close: () => void;
    }> = [];

    class MockPresenceWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      url: string;
      readyState = MockPresenceWebSocket.CONNECTING;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor(url: string | URL) {
        super();
        this.url = String(url);
        if (this.url.includes("/presence/ws")) {
          sockets.push(this);
        }
        window.setTimeout(() => {
          this.readyState = MockPresenceWebSocket.OPEN;
          const event = new Event("open");
          this.dispatchEvent(event);
          this.onopen?.(event);
        }, 0);
      }

      send() {}

      close() {
        this.readyState = MockPresenceWebSocket.CLOSED;
        const event = new CloseEvent("close");
        this.dispatchEvent(event);
        this.onclose?.(event);
      }

      emitPresence(payload: unknown) {
        const event = new MessageEvent("message", { data: JSON.stringify(payload) });
        this.dispatchEvent(event);
        this.onmessage?.(event);
      }
    }

    window.WebSocket = MockPresenceWebSocket as typeof WebSocket;
    (window as typeof window & {
      __presenceSocketCount?: () => number;
      __pushPresenceUpdate?: (payload: unknown) => void;
    }).__presenceSocketCount = () => sockets.length;
    (window as typeof window & {
      __presenceSocketCount?: () => number;
      __pushPresenceUpdate?: (payload: unknown) => void;
    }).__pushPresenceUpdate = (payload) => {
      sockets.forEach((socket) => socket.emitPresence(payload));
    };
  });
  await page.goto("/");
  await expect.poll(async () => {
    return page.evaluate(() => {
      return (window as typeof window & { __presenceSocketCount?: () => number }).__presenceSocketCount?.() ?? 0;
    });
  }).toBeGreaterThan(0);

  await page.evaluate(() => {
    (window as typeof window & { __pushPresenceUpdate?: (payload: unknown) => void }).__pushPresenceUpdate?.({
      accountId: "00000000-0000-4000-8000-000000000008",
      state: "playing",
      packId: "winterpack",
      serverId: "The Cabin",
      updatedAtUnixSeconds: 1235,
    });
  });

  const streamedFriend = page.locator(".friend-row").filter({ hasText: "Player 0008" });
  await expect(streamedFriend).toContainText("WinterPack - The Cabin");
  await expect(streamedFriend.getByRole("button", { name: "Join" })).toBeVisible();
  expect(devSessionRequests).toBe(0);
});

test("home screen does not open presence websocket when presence fetch fails", async ({ page }) => {
  const accountId = "00000000-0000-4000-8000-000000000001";
  const expiresAtUnixSeconds = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = `minecraft-session:${accountId}:${expiresAtUnixSeconds}`;
  const authorizationHeader = `Bearer ${accessToken}`;
  let presenceAuthorization = "";
  let devSessionRequests = 0;
  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
  };

  await installNativeSocialPresenceStub(page, { accountId, accessToken, authorizationHeader });
  await page.route("http://127.0.0.1:4074/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (request.url().endsWith("/dev/sessions")) {
      devSessionRequests += 1;
      await route.fulfill({ status: 403, headers: corsHeaders });
      return;
    }
    if (request.url().endsWith("/presence")) {
      presenceAuthorization = request.headers()["authorization"] ?? "";
      await route.fulfill({
        status: 503,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({ error: "offline" }),
      });
      return;
    }
    await route.fulfill({ status: 404, headers: corsHeaders });
  });
  await page.addInitScript(() => {
    (window as typeof window & { __openedPresenceSockets?: string[] }).__openedPresenceSockets = [];

    class CountingWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      url: string;
      readyState = CountingWebSocket.CONNECTING;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor(url: string | URL) {
        super();
        this.url = String(url);
        if (this.url.includes("/presence/ws")) {
          (window as typeof window & { __openedPresenceSockets?: string[] }).__openedPresenceSockets?.push(this.url);
        }
      }

      send() {}

      close() {
        this.readyState = CountingWebSocket.CLOSED;
      }
    }

    window.WebSocket = CountingWebSocket as typeof WebSocket;
  });
  await page.goto("/");
  await page.waitForTimeout(300);

  await expect.poll(async () => {
    return page.evaluate(() => {
      return (window as typeof window & { __openedPresenceSockets?: string[] }).__openedPresenceSockets ?? [];
    });
  }).toEqual([]);
  expect(presenceAuthorization).toBe(authorizationHeader);
  expect(devSessionRequests).toBe(0);
});

test("launching a profile can publish local presence to the social backend scaffold", async ({ page }) => {
  const accountId = "00000000-0000-4000-8000-000000000001";
  let presenceBody = "";
  let presenceAuthorization = "";
  let devSessionRequests = 0;
  const issuedAtUnixSeconds = Math.floor(Date.now() / 1000);
  const expiresAtUnixSeconds = issuedAtUnixSeconds + 3600;
  const accessToken = `dev-session:${accountId}:${expiresAtUnixSeconds}`;

  await page.route("http://127.0.0.1:4074/**", async (route) => {
    const request = route.request();
    const corsHeaders = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (request.url().endsWith("/dev/sessions")) {
      devSessionRequests += 1;
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          tokenType: "Bearer",
          sessionKind: "dev",
          accessToken,
          authorizationHeader: `Bearer ${accessToken}`,
          issuedAtUnixSeconds,
          expiresAtUnixSeconds,
        }),
      });
      return;
    }
    if (request.url().endsWith("/sessions/current")) {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          tokenType: "Bearer",
          sessionKind: "dev",
          expiresAtUnixSeconds,
          secondsRemaining: 3600,
        }),
      });
      return;
    }
    if (request.url().endsWith("/presence")) {
      await route.fulfill({
        status: 503,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: "{}",
      });
      return;
    }
    if (request.url().endsWith(`/presence/${accountId}`)) {
      presenceBody = request.postData() ?? "";
      presenceAuthorization = request.headers()["authorization"] ?? "";
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          state: "playing",
          packId: "winterpack",
          serverId: null,
          updatedAt: "2026-06-25T12:00:00Z",
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, headers: corsHeaders });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Library" }).click();
  await page.locator(".profile-row").filter({ hasText: "WinterPack" }).getByRole("button", { name: "Play" }).click();

  await expect(page.getByText("Presence shared for WinterPack")).toBeVisible();
  expect(presenceAuthorization).toBe(`Bearer ${accessToken}`);
  expect(JSON.parse(presenceBody)).toEqual({
    state: "playing",
    packId: "winterpack",
  });

  await page.getByRole("button", { name: "Library" }).click();
  await page.locator(".profile-row").filter({ hasText: "WinterPack" }).getByRole("button", { name: "Play" }).click();
  await expect(page.getByText("Presence shared for WinterPack")).toBeVisible();
  expect(devSessionRequests).toBe(1);
});

test("launching a profile refreshes cached dev session after backend rejection", async ({ page }) => {
  const accountId = "00000000-0000-4000-8000-000000000001";
  const issuedAtUnixSeconds = Math.floor(Date.now() / 1000);
  const staleToken = `dev-session:${accountId}:${issuedAtUnixSeconds + 3600}`;
  const freshToken = `dev-session:${accountId}:${issuedAtUnixSeconds + 7200}`;
  let devSessionRequests = 0;
  let presenceAttempts = 0;
  let finalPresenceAuthorization = "";

  await page.route("http://127.0.0.1:4074/**", async (route) => {
    const request = route.request();
    const corsHeaders = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (request.url().endsWith("/dev/sessions")) {
      devSessionRequests += 1;
      const accessToken = devSessionRequests === 1 ? staleToken : freshToken;
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          tokenType: "Bearer",
          sessionKind: "dev",
          accessToken,
          authorizationHeader: `Bearer ${accessToken}`,
          issuedAtUnixSeconds,
          expiresAtUnixSeconds: issuedAtUnixSeconds + 3600,
        }),
      });
      return;
    }
    if (request.url().endsWith("/sessions/current")) {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          tokenType: "Bearer",
          sessionKind: "dev",
          expiresAtUnixSeconds: issuedAtUnixSeconds + 3600,
          secondsRemaining: 3600,
        }),
      });
      return;
    }
    if (request.url().endsWith("/presence")) {
      await route.fulfill({
        status: 503,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: "{}",
      });
      return;
    }
    if (request.url().endsWith(`/presence/${accountId}`)) {
      presenceAttempts += 1;
      const authorization = request.headers()["authorization"] ?? "";
      if (authorization === `Bearer ${staleToken}`) {
        await route.fulfill({
          status: 401,
          headers: { ...corsHeaders, "content-type": "application/json" },
          body: JSON.stringify({ error: "expired" }),
        });
        return;
      }
      finalPresenceAuthorization = authorization;
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          state: "playing",
          packId: "winterpack",
          serverId: null,
          updatedAt: "2026-06-25T12:00:00Z",
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, headers: corsHeaders });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Library" }).click();
  await page.locator(".profile-row").filter({ hasText: "WinterPack" }).getByRole("button", { name: "Play" }).click();

  await expect(page.getByText("Presence shared for WinterPack")).toBeVisible();
  expect(devSessionRequests).toBe(2);
  expect(presenceAttempts).toBe(2);
  expect(finalPresenceAuthorization).toBe(`Bearer ${freshToken}`);
});

test("library play action explains desktop app requirement in web preview", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.locator(".account-card")).toContainText("Sign in once, then play without extra setup.");
  await page.getByRole("button", { name: "Library" }).click();
  await page.locator(".profile-row").filter({ hasText: "WinterPack" }).getByRole("button", { name: "Play" }).click();

  await expect(page.getByText("Game launches require the desktop app")).toBeVisible();
});

test("library play action opens native process supervisor after launch", async ({ page }) => {
  await page.addInitScript(() => {
    let launched = false;
    let callbackId = 1;
    const invoked: string[] = [];
    const callbacks = new Map<number, (...args: unknown[]) => unknown>();
    const process = {
      id: "minecraft-winterpack",
      processId: 4242,
      command: {
        executable: "javaw.exe",
        args: ["-Xmx6144M", "cpw.mods.bootstraplauncher.BootstrapLauncher"],
        workingDir: "C:/TheBoysLauncher/data/profiles/winterpack",
        env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
      },
      state: "running",
      startedAtUnixSeconds: 1_710_000_000,
      runtimeSeconds: 3,
      totalOutputLineCount: 1,
      droppedOutputLineCount: 0,
      output: [{ stream: "stdout", line: "Minecraft client starting" }],
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/TheBoysLauncher/data",
        configDir: "C:/TheBoysLauncher/config",
        cacheDir: "C:/TheBoysLauncher/cache",
        logDir: "C:/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Cozy survival with friends.",
          version: "2.3.7",
          status: "installed",
          accent: "#67e8b9",
          installedPlayers: 0,
          defaultServer: "The Cabin",
        },
      ],
      profiles: [
        {
          id: "winterpack",
          name: "WinterPack",
          loader: "forge",
          gameVersion: "1.20.1",
          installedPackVersion: "2.3.7",
          memoryMb: 6144,
          jvmArgs: [],
        },
      ],
      imports: [],
    });

    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "start_launch_process") {
            launched = true;
            return process;
          }
          if (cmd === "list_managed_processes") return launched ? [process] : [];
          if (cmd === "list_launcher_events") {
            return launched
              ? [
                  {
                    id: "launch-started-event",
                    operationId: "launch-winterpack",
                    operation: "launch_profile",
                    subjectId: "winterpack",
                    kind: "verifying",
                    message: "Launch process started for WinterPack",
                    progressPercent: 75,
                    occurredAtUnixSeconds: 1_710_000_010,
                  },
                ]
              : [];
          }
          if (cmd === "load_minecraft_session") return null;
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: (callback: (...args: unknown[]) => unknown) => {
          const id = callbackId++;
          callbacks.set(id, callback);
          return id;
        },
        unregisterCallback: (id: number) => {
          callbacks.delete(id);
        },
      },
      configurable: true,
    });
    Object.defineProperty(window, "__nativeLaunchProcessInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Library" }).click();
  await page.locator(".profile-row").filter({ hasText: "WinterPack" }).getByRole("button", { name: "Play" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByLabel("Launcher quick status")).toContainText("1 game running");
  await expect(page.getByLabel("Launcher status message")).not.toContainText("javaw.exe");
  await expect(page.getByLabel("Launcher status message")).not.toContainText("Minecraft client starting");
  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Games" })).toHaveClass(/active/);
  await expect(page.getByLabel("Activity controls").getByRole("button", { name: "Auto refresh" })).toHaveClass(/active/);
  const processRow = page.locator(".process-row").filter({ hasText: "Minecraft client starting" });
  await expect(processRow).toBeVisible();
  await expect(processRow).toContainText("Running");
  await expect(processRow.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(processRow.getByRole("button", { name: "Save log" })).toBeVisible();
  await page.getByRole("button", { name: "Overview" }).click();
  await expect(page.getByLabel("Launcher tasks")).toContainText("Start game - winterpack");
  await expect(page.getByLabel("Launcher tasks")).toContainText("Game started for WinterPack");
  await page.getByLabel("Activity controls").getByRole("button", { name: "Auto refresh" }).click();
  await expect(page.getByLabel("Activity controls").getByRole("button", { name: "Auto refresh" })).not.toHaveClass(/active/);
  const invoked = await page.evaluate(() => (window as typeof window & { __nativeLaunchProcessInvokes: string[] }).__nativeLaunchProcessInvokes);
  expect(invoked.indexOf("list_launcher_events", invoked.indexOf("start_launch_process"))).toBeGreaterThan(
    invoked.indexOf("start_launch_process"),
  );
});

test("library play action is disabled while native launch is pending", async ({ page }) => {
  await page.addInitScript(() => {
    let launched = false;
    let latestReleaseLaunched = false;
    let resolveLaunch: ((process: unknown) => void) | undefined;
    const invoked: Array<{ cmd: string; profileId?: string }> = [];
    const process = {
      id: "minecraft-winterpack",
      processId: 4242,
      command: {
        executable: "javaw.exe",
        args: ["-Xmx6144M", "cpw.mods.bootstraplauncher.BootstrapLauncher"],
        workingDir: "C:/TheBoysLauncher/data/profiles/winterpack",
        env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
      },
      state: "running",
      startedAtUnixSeconds: 1_710_000_000,
      runtimeSeconds: 1,
      totalOutputLineCount: 1,
      droppedOutputLineCount: 0,
      output: [{ stream: "stdout", line: "Launch resolved after pending guard" }],
    };
    const latestReleaseProcess = {
      id: "minecraft-latest-release",
      processId: 4343,
      command: {
        executable: "javaw.exe",
        args: ["-Xmx4096M", "net.minecraft.client.main.Main"],
        workingDir: "C:/TheBoysLauncher/data/profiles/latest-release",
        env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "latest-release" }],
      },
      state: "running",
      startedAtUnixSeconds: 1_710_000_010,
      runtimeSeconds: 1,
      totalOutputLineCount: 1,
      droppedOutputLineCount: 0,
      output: [{ stream: "stdout", line: "Latest Release launched while WinterPack was still starting" }],
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/TheBoysLauncher/data",
        configDir: "C:/TheBoysLauncher/config",
        cacheDir: "C:/TheBoysLauncher/cache",
        logDir: "C:/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [
        {
          id: "otherpack",
          name: "Other Pack",
          tagline: "An unrelated install lane.",
          version: "1.0.0",
          status: "not_installed",
          accent: "#38bdf8",
          installedPlayers: 0,
          defaultServer: "Other Server",
        },
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Cozy survival with friends.",
          version: "2.3.7",
          status: "installed",
          accent: "#67e8b9",
          installedPlayers: 0,
          defaultServer: "The Cabin",
        },
      ],
      profiles: [
        {
          id: "latest-release",
          name: "Latest Release",
          loader: "vanilla",
          gameVersion: "1.21.8",
          memoryMb: 4096,
          jvmArgs: [],
        },
        {
          id: "winterpack",
          name: "WinterPack",
          loader: "forge",
          gameVersion: "1.20.1",
          installedPackVersion: "2.3.7",
          memoryMb: 6144,
          jvmArgs: [],
        },
      ],
      imports: [],
    });

    Object.defineProperty(window, "__resolvePendingNativeLaunch", {
      value: () => {
        launched = true;
        resolveLaunch?.(process);
      },
      configurable: true,
    });
    Object.defineProperty(window, "__pendingNativeLaunchInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { profileId?: string }) => {
          invoked.push({ cmd, profileId: args?.profileId });
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "start_launch_process") {
            if (args?.profileId === "latest-release") {
              latestReleaseLaunched = true;
              return latestReleaseProcess;
            }
            return new Promise((resolve) => {
              resolveLaunch = resolve;
            });
          }
          if (cmd === "list_managed_processes") {
            return [
              ...(launched ? [process] : []),
              ...(latestReleaseLaunched ? [latestReleaseProcess] : []),
            ];
          }
          if (cmd === "list_launcher_events") return [];
          if (cmd === "load_minecraft_session") return null;
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Library" }).click();
  const profileActions = page.locator(".profile-row").filter({ hasText: "WinterPack" }).getByLabel("WinterPack launch actions");
  await profileActions.getByRole("button", { name: "Play" }).click();

  const launchingButton = profileActions.getByRole("button", { name: "Launching..." });
  await expect(launchingButton).toBeDisabled();
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('[aria-label="WinterPack launch actions"] button');
    button?.removeAttribute("disabled");
    button?.click();
  });
  await expect(page.getByLabel("Launcher status message")).not.toContainText("launcher operation");
  let invoked = await page.evaluate(
    () => (window as typeof window & { __pendingNativeLaunchInvokes: Array<{ cmd: string; profileId?: string }> }).__pendingNativeLaunchInvokes,
  );
  expect(invoked.filter((entry) => entry.cmd === "start_launch_process")).toHaveLength(1);

  const latestReleaseActions = page
    .locator(".profile-row")
    .filter({ hasText: "Latest Release" })
    .getByLabel("Latest Release launch actions");
  await expect(latestReleaseActions.getByRole("button", { name: "Play" })).toBeEnabled();
  await latestReleaseActions.getByRole("button", { name: "Play" }).click();
  await expect(page.locator(".process-row").filter({ hasText: "Latest Release launched while WinterPack was still starting" })).toContainText(
    "Running",
  );
  invoked = await page.evaluate(
    () => (window as typeof window & { __pendingNativeLaunchInvokes: Array<{ cmd: string; profileId?: string }> }).__pendingNativeLaunchInvokes,
  );
  expect(invoked.filter((entry) => entry.cmd === "start_launch_process")).toHaveLength(2);
  expect(invoked).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ cmd: "start_launch_process", profileId: "winterpack" }),
      expect.objectContaining({ cmd: "start_launch_process", profileId: "latest-release" }),
    ]),
  );

  await page.evaluate(() => {
    (window as typeof window & { __resolvePendingNativeLaunch: () => void }).__resolvePendingNativeLaunch();
  });
  await expect(page.locator(".process-row").filter({ hasText: "Launch resolved after pending guard" })).toContainText(
    "Running",
  );
  invoked = await page.evaluate(
    () => (window as typeof window & { __pendingNativeLaunchInvokes: Array<{ cmd: string; profileId?: string }> }).__pendingNativeLaunchInvokes,
  );
  expect(invoked.filter((entry) => entry.cmd === "start_launch_process")).toHaveLength(2);
});

test("library can launch another profile while a pack update is installing", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: Array<{ cmd: string; profileId?: string; packId?: string }> = [];
    let latestReleaseLaunched = false;
    const latestReleaseProcess = {
      id: "minecraft-latest-release",
      processId: 4343,
      command: {
        executable: "javaw.exe",
        args: ["-Xmx4096M", "net.minecraft.client.main.Main"],
        workingDir: "C:/TheBoysLauncher/data/profiles/latest-release",
        env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "latest-release" }],
      },
      state: "running",
      startedAtUnixSeconds: 1_710_000_010,
      runtimeSeconds: 1,
      totalOutputLineCount: 1,
      droppedOutputLineCount: 0,
      output: [{ stream: "stdout", line: "Latest Release launched during WinterPack update" }],
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/TheBoysLauncher/data",
        configDir: "C:/TheBoysLauncher/config",
        cacheDir: "C:/TheBoysLauncher/cache",
        logDir: "C:/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Cozy survival with friends.",
          version: "2.3.7",
          status: "update_available",
          accent: "#67e8b9",
          installedPlayers: 0,
          defaultServer: "The Cabin",
        },
      ],
      profiles: [
        {
          id: "latest-release",
          name: "Latest Release",
          loader: "vanilla",
          gameVersion: "1.21.8",
          memoryMb: 4096,
          jvmArgs: [],
        },
        {
          id: "winterpack",
          name: "WinterPack",
          loader: "forge",
          gameVersion: "1.20.1",
          installedPackVersion: "2.3.6",
          memoryMb: 6144,
          jvmArgs: [],
        },
      ],
      imports: [],
    });

    Object.defineProperty(window, "__installThenLaunchInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { profileId?: string; packId?: string }) => {
          invoked.push({ cmd, profileId: args?.profileId, packId: args?.packId });
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "plan_install_pack") {
            return {
              operationId: "00000000-0000-4000-8000-0000000000b1",
              operation: "install_pack",
              subjectId: "winterpack",
              events: [
                { kind: "queued", message: "Update queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Update plan is ready to execute.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "install_pack") return new Promise(() => undefined);
          if (cmd === "start_launch_process") {
            if (args?.profileId !== "latest-release") throw new Error(`Unexpected launch target: ${args?.profileId}`);
            latestReleaseLaunched = true;
            return latestReleaseProcess;
          }
          if (cmd === "list_managed_processes") return latestReleaseLaunched ? [latestReleaseProcess] : [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "load_minecraft_session") return null;
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Library" }).click();
  await page
    .locator(".profile-row")
    .filter({ hasText: "WinterPack" })
    .getByLabel("WinterPack launch actions")
    .getByRole("button", { name: "Update" })
    .click();

  await expect(page.getByLabel("Launcher quick status")).toContainText("Installing...");
  await page.getByRole("button", { name: "Library" }).click();
  const latestReleaseActions = page
    .locator(".profile-row")
    .filter({ hasText: "Latest Release" })
    .getByLabel("Latest Release launch actions");
  await expect(latestReleaseActions.getByRole("button", { name: "Play" })).toBeEnabled();
  await latestReleaseActions.getByRole("button", { name: "Play" }).click();

  await expect(page.locator(".process-row").filter({ hasText: "Latest Release launched during WinterPack update" })).toContainText(
    "Running",
  );
  const invoked = await page.evaluate(
    () => (window as typeof window & { __installThenLaunchInvokes: Array<{ cmd: string; profileId?: string; packId?: string }> }).__installThenLaunchInvokes,
  );
  expect(invoked).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ cmd: "install_pack", packId: "winterpack" }),
      expect.objectContaining({ cmd: "start_launch_process", profileId: "latest-release" }),
    ]),
  );
});

test("library can set up and launch another profile while a pack update is installing", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: Array<{ cmd: string; profileId?: string; packId?: string }> = [];
    let repaired = false;
    let latestReleaseLaunched = false;
    const latestReleaseProcess = {
      id: "minecraft-latest-release",
      processId: 4344,
      command: {
        executable: "javaw.exe",
        args: ["-Xmx4096M", "net.minecraft.client.main.Main"],
        workingDir: "C:/TheBoysLauncher/data/profiles/latest-release",
        env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "latest-release" }],
      },
      state: "running",
      startedAtUnixSeconds: 1_710_000_020,
      runtimeSeconds: 1,
      totalOutputLineCount: 1,
      droppedOutputLineCount: 0,
      output: [{ stream: "stdout", line: "Latest Release launched after setup during WinterPack update" }],
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/TheBoysLauncher/data",
        configDir: "C:/TheBoysLauncher/config",
        cacheDir: "C:/TheBoysLauncher/cache",
        logDir: "C:/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Cozy survival with friends.",
          version: "2.3.7",
          status: "update_available",
          accent: "#67e8b9",
          installedPlayers: 0,
          defaultServer: "The Cabin",
        },
        {
          id: "latest-release",
          name: "Latest Release",
          tagline: "Fresh vanilla profile.",
          version: "1.21.8",
          status: repaired ? "installed" : "repair_needed",
          accent: "#38bdf8",
          installedPlayers: 0,
          defaultServer: "No server",
        },
      ],
      profiles: [
        {
          id: "latest-release",
          name: "Latest Release",
          loader: "vanilla",
          gameVersion: "1.21.8",
          memoryMb: 4096,
          jvmArgs: [],
        },
        {
          id: "winterpack",
          name: "WinterPack",
          loader: "forge",
          gameVersion: "1.20.1",
          installedPackVersion: "2.3.6",
          memoryMb: 6144,
          jvmArgs: [],
        },
      ],
      imports: [],
    });

    Object.defineProperty(window, "__installThenSetupLaunchInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { profileId?: string; packId?: string }) => {
          invoked.push({ cmd, profileId: args?.profileId, packId: args?.packId });
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "plan_install_pack") {
            return {
              operationId: "00000000-0000-4000-8000-0000000000c1",
              operation: "install_pack",
              subjectId: "winterpack",
              events: [
                { kind: "queued", message: "Update queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Update plan is ready to execute.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "install_pack") return new Promise(() => undefined);
          if (cmd === "plan_repair_profile") {
            if (args?.profileId !== "latest-release") throw new Error(`Unexpected setup target: ${args?.profileId}`);
            return {
              operationId: "00000000-0000-4000-8000-0000000000c2",
              operation: "repair_profile",
              subjectId: "latest-release",
              events: [
                { kind: "queued", message: "Setup queued for Latest Release", progressPercent: 0 },
                { kind: "completed", message: "Setup is ready to start.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "repair_profile") {
            if (args?.profileId !== "latest-release") throw new Error(`Unexpected repair target: ${args?.profileId}`);
            repaired = true;
            return {
              action: "repair_profile",
              subjectId: "latest-release",
              status: "completed",
              message: "Profile setup completed.",
            };
          }
          if (cmd === "start_launch_process") {
            if (args?.profileId !== "latest-release") throw new Error(`Unexpected launch target: ${args?.profileId}`);
            latestReleaseLaunched = true;
            return latestReleaseProcess;
          }
          if (cmd === "list_managed_processes") return latestReleaseLaunched ? [latestReleaseProcess] : [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "load_minecraft_session") return null;
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Library" }).click();
  await page
    .locator(".profile-row")
    .filter({ hasText: "WinterPack" })
    .getByLabel("WinterPack launch actions")
    .getByRole("button", { name: "Update" })
    .click();

  await expect(page.getByLabel("Launcher quick status")).toContainText("Installing...");
  await page.getByRole("button", { name: "Library" }).click();
  const latestReleaseActions = page
    .locator(".profile-row")
    .filter({ hasText: "Latest Release" })
    .getByLabel("Latest Release launch actions");
  await expect(latestReleaseActions.getByRole("button", { name: "Play" })).toBeEnabled();
  await latestReleaseActions.getByRole("button", { name: "Play" }).click();

  await expect(page.locator(".process-row").filter({ hasText: "Latest Release launched after setup during WinterPack update" })).toContainText(
    "Running",
  );
  const invoked = await page.evaluate(
    () => (window as typeof window & { __installThenSetupLaunchInvokes: Array<{ cmd: string; profileId?: string; packId?: string }> }).__installThenSetupLaunchInvokes,
  );
  expect(invoked).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ cmd: "install_pack", packId: "winterpack" }),
      expect.objectContaining({ cmd: "plan_repair_profile", profileId: "latest-release" }),
      expect.objectContaining({ cmd: "repair_profile", profileId: "latest-release" }),
      expect.objectContaining({ cmd: "start_launch_process", profileId: "latest-release" }),
    ]),
  );
  expect(invoked.indexOf(invoked.find((entry) => entry.cmd === "plan_repair_profile")!)).toBeGreaterThan(
    invoked.indexOf(invoked.find((entry) => entry.cmd === "install_pack")!),
  );
});

test("activity failed launch recovery works while a pack update is installing", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: Array<{ cmd: string; profileId?: string; packId?: string }> = [];
    let repaired = false;
    let latestReleaseLaunched = false;
    const latestReleaseProcess = {
      id: "minecraft-latest-release",
      processId: 4345,
      command: {
        executable: "javaw.exe",
        args: ["-Xmx4096M", "net.minecraft.client.main.Main"],
        workingDir: "C:/TheBoysLauncher/data/profiles/latest-release",
        env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "latest-release" }],
      },
      state: "running",
      startedAtUnixSeconds: 1_710_000_030,
      runtimeSeconds: 1,
      totalOutputLineCount: 1,
      droppedOutputLineCount: 0,
      output: [{ stream: "stdout", line: "Latest Release recovered from Activity during WinterPack update" }],
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/TheBoysLauncher/data",
        configDir: "C:/TheBoysLauncher/config",
        cacheDir: "C:/TheBoysLauncher/cache",
        logDir: "C:/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Cozy survival with friends.",
          version: "2.3.7",
          status: "update_available",
          accent: "#67e8b9",
          installedPlayers: 0,
          defaultServer: "The Cabin",
        },
        {
          id: "latest-release",
          name: "Latest Release",
          tagline: "Fresh vanilla profile.",
          version: "1.21.8",
          status: repaired ? "installed" : "repair_needed",
          accent: "#38bdf8",
          installedPlayers: 0,
          defaultServer: "No server",
        },
      ],
      profiles: [
        {
          id: "latest-release",
          name: "Latest Release",
          loader: "vanilla",
          gameVersion: "1.21.8",
          memoryMb: 4096,
          jvmArgs: [],
        },
        {
          id: "winterpack",
          name: "WinterPack",
          loader: "forge",
          gameVersion: "1.20.1",
          installedPackVersion: "2.3.6",
          memoryMb: 6144,
          jvmArgs: [],
        },
      ],
      imports: [],
    });

    Object.defineProperty(window, "__activityRecoveryDuringInstallInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { profileId?: string; packId?: string }) => {
          invoked.push({ cmd, profileId: args?.profileId, packId: args?.packId });
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "plan_install_pack") {
            return {
              operationId: "00000000-0000-4000-8000-0000000000d1",
              operation: "install_pack",
              subjectId: "winterpack",
              events: [
                { kind: "queued", message: "Update queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Update plan is ready to execute.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "install_pack") return new Promise(() => undefined);
          if (cmd === "plan_repair_profile") {
            if (args?.profileId !== "latest-release") throw new Error(`Unexpected setup target: ${args?.profileId}`);
            return {
              operationId: "00000000-0000-4000-8000-0000000000d2",
              operation: "repair_profile",
              subjectId: "latest-release",
              events: [
                { kind: "queued", message: "Setup queued for Latest Release", progressPercent: 0 },
                { kind: "completed", message: "Setup is ready to start.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "repair_profile") {
            if (args?.profileId !== "latest-release") throw new Error(`Unexpected repair target: ${args?.profileId}`);
            repaired = true;
            return {
              action: "repair_profile",
              subjectId: "latest-release",
              status: "completed",
              message: "Profile setup completed.",
            };
          }
          if (cmd === "start_launch_process") {
            if (args?.profileId !== "latest-release") throw new Error(`Unexpected launch target: ${args?.profileId}`);
            latestReleaseLaunched = true;
            return latestReleaseProcess;
          }
          if (cmd === "list_managed_processes") return latestReleaseLaunched ? [latestReleaseProcess] : [];
          if (cmd === "list_launcher_events") {
            return [
              {
                id: "latest-release-launch-failed",
                operationId: "latest-release-launch",
                operation: "launch_profile",
                subjectId: "latest-release",
                kind: "failed",
                message: "launch artifact is missing: asset launch argument --assetIndex requires --assetsDir",
                progressPercent: 100,
                occurredAtUnixSeconds: 1_710_000_000,
              },
            ];
          }
          if (cmd === "load_minecraft_session") return null;
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Library" }).click();
  await page
    .locator(".profile-row")
    .filter({ hasText: "WinterPack" })
    .getByLabel("WinterPack launch actions")
    .getByRole("button", { name: "Update" })
    .click();
  await expect(page.getByLabel("Launcher quick status")).toContainText("Installing...");

  await page.getByRole("button", { name: "Activity" }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  const failedLaunch = page.locator(".event-row").filter({ hasText: "Game files are missing" });
  await expect(failedLaunch.getByRole("button", { name: "Try play again" })).toBeEnabled();
  await failedLaunch.getByRole("button", { name: "Try play again" }).click();

  await expect(page.locator(".process-row").filter({ hasText: "Latest Release recovered from Activity during WinterPack update" })).toContainText(
    "Running",
  );
  const invoked = await page.evaluate(
    () =>
      (window as typeof window & { __activityRecoveryDuringInstallInvokes: Array<{ cmd: string; profileId?: string; packId?: string }> })
        .__activityRecoveryDuringInstallInvokes,
  );
  expect(invoked).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ cmd: "install_pack", packId: "winterpack" }),
      expect.objectContaining({ cmd: "plan_repair_profile", profileId: "latest-release" }),
      expect.objectContaining({ cmd: "repair_profile", profileId: "latest-release" }),
      expect.objectContaining({ cmd: "start_launch_process", profileId: "latest-release" }),
    ]),
  );
});

test("library play action keeps returned native process visible when process refresh lags", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    let callbackId = 1;
    const callbacks = new Map<number, (...args: unknown[]) => unknown>();
    const launchedProcess = {
      id: "minecraft-winterpack",
      processId: 4242,
      command: {
        executable: "javaw.exe",
        args: ["-Xmx6144M", "cpw.mods.bootstraplauncher.BootstrapLauncher"],
        workingDir: "C:/TheBoysLauncher/data/profiles/winterpack",
        env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
      },
      state: "running",
      startedAtUnixSeconds: 1_710_000_000,
      runtimeSeconds: 1,
      totalOutputLineCount: 1,
      droppedOutputLineCount: 0,
      output: [{ stream: "stdout", line: "Returned launch summary" }],
    };

    Object.defineProperty(window, "__laggingProcessRefreshInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/TheBoysLauncher/data",
                configDir: "C:/TheBoysLauncher/config",
                cacheDir: "C:/TheBoysLauncher/cache",
                logDir: "C:/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  tagline: "Cozy survival with friends.",
                  version: "2.3.7",
                  status: "installed",
                  accent: "#67e8b9",
                  installedPlayers: 0,
                  defaultServer: "The Cabin",
                },
              ],
              profiles: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  loader: "forge",
                  gameVersion: "1.20.1",
                  installedPackVersion: "2.3.7",
                  memoryMb: 6144,
                  jvmArgs: [],
                },
              ],
              imports: [],
            };
          }
          if (cmd === "start_launch_process") return launchedProcess;
          if (cmd === "list_managed_processes") return [];
          if (cmd === "list_launcher_events") {
            return stopped
              ? [
                  {
                    id: "stop-requested-event",
                    operationId: "running-winterpack",
                    operation: "managed_process",
                    subjectId: "running-winterpack",
                    kind: "verifying",
                    message: "Stop requested for pid 4242 (javaw.exe)",
                    progressPercent: 75,
                    occurredAtUnixSeconds: 1_710_000_010,
                  },
                ]
              : [];
          }
          if (cmd === "load_minecraft_session") return null;
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: (callback: (...args: unknown[]) => unknown) => {
          const id = callbackId++;
          callbacks.set(id, callback);
          return id;
        },
        unregisterCallback: (id: number) => {
          callbacks.delete(id);
        },
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Library" }).click();
  await page.locator(".profile-row").filter({ hasText: "WinterPack" }).getByRole("button", { name: "Play" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Games" })).toHaveClass(/active/);
  const processRow = page.locator(".process-row").filter({ hasText: "Returned launch summary" });
  await expect(processRow).toBeVisible();
  await expect(processRow).toContainText("Running");
  const invoked = await page.evaluate(
    () =>
      (window as typeof window & { __laggingProcessRefreshInvokes: string[] }).__laggingProcessRefreshInvokes,
  );
  expect(invoked.indexOf("list_managed_processes", invoked.indexOf("start_launch_process"))).toBeGreaterThan(
    invoked.indexOf("start_launch_process"),
  );
});

test("native process refresh failure clears stale process rows", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    let callbackId = 1;
    let launched = false;
    const callbacks = new Map<number, (...args: unknown[]) => unknown>();
    const launchedProcess = {
      id: "minecraft-winterpack",
      processId: 4242,
      command: {
        executable: "javaw.exe",
        args: ["-Xmx6144M", "cpw.mods.bootstraplauncher.BootstrapLauncher"],
        workingDir: "C:/TheBoysLauncher/data/profiles/winterpack",
        env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
      },
      state: "running",
      startedAtUnixSeconds: 1_710_000_000,
      runtimeSeconds: 3,
      totalOutputLineCount: 1,
      droppedOutputLineCount: 0,
      output: [{ stream: "stdout", line: "Returned launch summary" }],
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/TheBoysLauncher/data",
        configDir: "C:/TheBoysLauncher/config",
        cacheDir: "C:/TheBoysLauncher/cache",
        logDir: "C:/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Cozy survival with friends.",
          version: "2.3.7",
          status: "installed",
          accent: "#67e8b9",
          installedPlayers: 0,
          defaultServer: "The Cabin",
        },
      ],
      profiles: [
        {
          id: "winterpack",
          name: "WinterPack",
          loader: "forge",
          gameVersion: "1.20.1",
          installedPackVersion: "2.3.7",
          memoryMb: 6144,
          jvmArgs: [],
        },
      ],
      imports: [],
    });

    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "start_launch_process") {
            launched = true;
            return launchedProcess;
          }
          if (cmd === "list_managed_processes") {
            if (!launched) return [];
            if ((window as typeof window & { __failProcessRefresh?: boolean }).__failProcessRefresh) {
              throw new Error("process registry unavailable");
            }
            return [launchedProcess];
          }
          if (cmd === "list_launcher_events") return [];
          if (cmd === "load_minecraft_session") return null;
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: (callback: (...args: unknown[]) => unknown) => {
          const id = callbackId++;
          callbacks.set(id, callback);
          return id;
        },
        unregisterCallback: (id: number) => {
          callbacks.delete(id);
        },
      },
      configurable: true,
    });
    Object.defineProperty(window, "__nativeProcessRefreshFailureInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Library" }).click();
  await page.locator(".profile-row").filter({ hasText: "WinterPack" }).getByRole("button", { name: "Play" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByLabel("Launcher quick status")).toContainText("1 game running");
  await expect(page.locator(".process-row").filter({ hasText: "Returned launch summary" })).toContainText("Running");

  await page.evaluate(() => {
    (window as typeof window & { __failProcessRefresh?: boolean }).__failProcessRefresh = true;
  });
  await page.getByLabel("Activity controls").getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText(
    "Game status is unavailable right now. Try again after restarting the launcher.",
  );
  await expect(page.getByLabel("Launcher status message")).not.toContainText("process registry unavailable");
  await expect(page.locator(".process-row")).toHaveCount(0);
  await expect(page.getByLabel("Launcher quick status")).toContainText("No games running");

  await page.getByRole("button", { name: "Library" }).click();
  const profileActions = page.locator(".profile-row").filter({ hasText: "WinterPack" }).getByLabel("WinterPack profile actions");
  await expect(profileActions.getByRole("button", { name: "Play" })).toBeEnabled();
  await expect(profileActions).not.toContainText("Running");
  const invoked = await page.evaluate(
    () =>
      (window as typeof window & { __nativeProcessRefreshFailureInvokes: string[] })
        .__nativeProcessRefreshFailureInvokes,
  );
  expect(invoked.filter((cmd) => cmd === "list_managed_processes").length).toBeGreaterThanOrEqual(2);
});

test("clear exited process does not restore recent launch fallback", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    const exitedProcess = {
      id: "minecraft-winterpack-exited",
      processId: 4242,
      command: {
        executable: "javaw.exe",
        args: ["-Xmx6144M", "cpw.mods.bootstraplauncher.BootstrapLauncher"],
        workingDir: "C:/TheBoysLauncher/data/profiles/winterpack",
        env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
      },
      state: "exited",
      exitCode: 0,
      stopRequested: true,
      startedAtUnixSeconds: 1_710_000_000,
      exitedAtUnixSeconds: 1_710_000_001,
      runtimeSeconds: 1,
      totalOutputLineCount: 1,
      droppedOutputLineCount: 0,
      output: [{ stream: "stdout", line: "Exited before registry refresh" }],
    };

    Object.defineProperty(window, "__clearExitedFallbackInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/TheBoysLauncher/data",
                configDir: "C:/TheBoysLauncher/config",
                cacheDir: "C:/TheBoysLauncher/cache",
                logDir: "C:/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  tagline: "Cozy survival with friends.",
                  version: "2.3.7",
                  status: "installed",
                  accent: "#67e8b9",
                  installedPlayers: 0,
                  defaultServer: "The Cabin",
                },
              ],
              profiles: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  loader: "forge",
                  gameVersion: "1.20.1",
                  installedPackVersion: "2.3.7",
                  memoryMb: 6144,
                  jvmArgs: [],
                },
              ],
              imports: [],
            };
          }
          if (cmd === "start_launch_process") return exitedProcess;
          if (cmd === "list_managed_processes") return [];
          if (cmd === "clear_exited_managed_processes") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "load_minecraft_session") return null;
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Library" }).click();
  await page.locator(".profile-row").filter({ hasText: "WinterPack" }).getByRole("button", { name: "Play" }).click();

  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Games", exact: true })).toHaveClass(
    /active/,
  );
  await expect(page.locator(".process-row").filter({ hasText: "Exited before registry refresh" })).toBeVisible();
  await page.getByRole("button", { name: "Clear finished" }).click();
  await expect(page.locator(".process-row").filter({ hasText: "Exited before registry refresh" })).toHaveCount(0);
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator(".process-row").filter({ hasText: "Exited before registry refresh" })).toHaveCount(0);

  const invoked = await page.evaluate(
    () => (window as typeof window & { __clearExitedFallbackInvokes: string[] }).__clearExitedFallbackInvokes,
  );
  expect(invoked).toContain("clear_exited_managed_processes");
  expect(invoked.filter((cmd) => cmd === "list_managed_processes").length).toBeGreaterThanOrEqual(2);
});

test("installed pack card play action opens native process supervisor", async ({ page }) => {
  await page.addInitScript(() => {
    let launched = false;
    Object.defineProperty(window, "__packPlayInvokes", {
      value: [] as string[],
      configurable: true,
    });
    const process = {
      id: "minecraft-winterpack-card",
      processId: 4343,
      command: {
        executable: "javaw.exe",
        args: ["-Xmx6144M", "cpw.mods.bootstraplauncher.BootstrapLauncher"],
        workingDir: "C:/TheBoysLauncher/data/profiles/winterpack",
        env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
      },
      state: "running",
      startedAtUnixSeconds: 1_710_000_000,
      runtimeSeconds: 2,
      totalOutputLineCount: 1,
      droppedOutputLineCount: 0,
      output: [{ stream: "stdout", line: "Featured pack launch starting" }],
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/TheBoysLauncher/data",
        configDir: "C:/TheBoysLauncher/config",
        cacheDir: "C:/TheBoysLauncher/cache",
        logDir: "C:/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Cozy survival with friends.",
          version: "2.3.7",
          status: "installed",
          accent: "#67e8b9",
          installedPlayers: 0,
          defaultServer: "The Cabin",
        },
      ],
      profiles: [
        {
          id: "winterpack",
          name: "WinterPack",
          loader: "forge",
          gameVersion: "1.20.1",
          installedPackVersion: "2.3.7",
          memoryMb: 6144,
          jvmArgs: [],
        },
      ],
      imports: [],
    });

    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          (window as typeof window & { __packPlayInvokes: string[] }).__packPlayInvokes.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "start_launch_process") {
            launched = true;
            return process;
          }
          if (cmd === "list_managed_processes") return launched ? [process] : [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");

  const card = page.locator(".pack-card").filter({ hasText: "WinterPack" });
  await expect(card.getByRole("button", { name: "Play" })).toBeVisible();
  await card.getByRole("button", { name: "Play" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Games" })).toHaveClass(/active/);
  await expect(page.locator(".process-row").filter({ hasText: "Featured pack launch starting" })).toContainText("Running");
  await page.getByRole("navigation").getByRole("button", { name: "Play" }).click();
  await expect(page.getByLabel("Primary pack actions").locator(".primary-button").filter({ hasText: "Running" })).toBeDisabled();
  await expect(card.getByRole("button", { name: "Running" })).toBeDisabled();
  const invoked = await page.evaluate(() => (window as typeof window & { __packPlayInvokes: string[] }).__packPlayInvokes);
  expect(invoked).toContain("start_launch_process");
  expect(invoked).not.toContain("install_pack");
});

test("library play action surfaces native launch preflight errors", async ({ page }) => {
  let devSessionRequests = 0;
  await page.route("http://127.0.0.1:4074/presence", async (route) => {
    await route.fulfill({
      status: 503,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
      body: JSON.stringify({ error: "presence unavailable in this test" }),
    });
  });
  await page.route("http://127.0.0.1:4074/dev/sessions", async (route) => {
    devSessionRequests += 1;
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        accountId: "00000000-0000-4000-8000-000000000001",
        tokenType: "Bearer",
        sessionKind: "dev",
        authorizationHeader: "Bearer test-session",
        accessToken: "test-session",
        issuedAtUnixSeconds: 1,
        expiresAtUnixSeconds: 9_999_999_999,
      }),
    });
  });
  await page.addInitScript(() => {
    let repaired = false;
    let callbackId = 1;
    const invoked: string[] = [];
    const callbacks = new Map<number, (...args: unknown[]) => unknown>();
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: [
        {
          id: "winterpack",
          name: "WinterPack",
          loader: "forge",
          gameVersion: "1.20.1",
          installedPackVersion: "2.3.7",
          memoryMb: 6144,
          jvmArgs: [],
        },
      ],
      imports: [],
    });

    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "start_launch_process") {
            if (repaired) {
              return {
                id: "winterpack-process",
                processId: 4301,
                command: {
                  executable: "javaw.exe",
                  args: ["-Xmx6144M", "net.minecraft.client.main.Main"],
                  workingDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/profiles/winterpack",
                  env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
                },
                state: "running",
                startedAtUnixSeconds: 1_710_000_002,
                runtimeSeconds: 0,
                totalOutputLineCount: 0,
                droppedOutputLineCount: 0,
                output: [],
              };
            }
            throw new Error(
              "launch asset index is missing: C:/cache/assets/indexes/1.20.1.json.",
            );
          }
          if (cmd === "list_managed_processes") {
            return repaired
              ? [
                  {
                    id: "winterpack-process",
                    processId: 4301,
                    command: {
                      executable: "javaw.exe",
                      args: ["-Xmx6144M", "net.minecraft.client.main.Main"],
                      workingDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/profiles/winterpack",
                      env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
                    },
                    state: "running",
                    startedAtUnixSeconds: 1_710_000_002,
                    runtimeSeconds: 0,
                    totalOutputLineCount: 0,
                    droppedOutputLineCount: 0,
                    output: [],
                  },
                ]
              : [];
          }
          if (cmd === "plan_repair_profile") {
            return {
              operationId: "00000000-0000-4000-8000-000000000092",
              operation: "repair_profile",
              subjectId: "winterpack",
              events: [
                { kind: "queued", message: "Setup queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Setup is ready to start.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "repair_profile") {
            repaired = true;
            return {
              action: "repair_profile",
              subjectId: "winterpack",
              status: "completed",
              message: "Profile repair completed.",
            };
          }
          if (cmd === "list_launcher_events") {
            const events = [
              {
                id: "launch-failed",
                operationId: "00000000-0000-4000-8000-000000000091",
                operation: "launch_profile",
                subjectId: "winterpack",
                kind: "failed",
                message: "launch asset index is missing: C:/cache/assets/indexes/1.20.1.json.",
                progressPercent: 100,
                occurredAtUnixSeconds: 1_710_000_000,
              },
            ];
            if (repaired) {
              events.push(
                {
                  id: "repair-completed",
                  operationId: "00000000-0000-4000-8000-000000000092",
                  operation: "repair_profile",
                  subjectId: "winterpack",
                  kind: "completed",
                  message: "Profile repair completed.",
                  progressPercent: 100,
                  occurredAtUnixSeconds: 1_710_000_001,
                },
              );
            }
            return events;
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: (callback: (...args: unknown[]) => unknown) => {
          const id = callbackId++;
          callbacks.set(id, callback);
          return id;
        },
        unregisterCallback: (id: number) => {
          callbacks.delete(id);
        },
      },
      configurable: true,
    });
    Object.defineProperty(window, "__launchRecoveryInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Library" }).click();
  devSessionRequests = 0;
  await page.locator(".profile-row").filter({ hasText: "WinterPack" }).getByRole("button", { name: "Play" }).click();

  await expect(page.getByRole("complementary")).toContainText("WinterPack is running");
  await expect(page.getByRole("complementary")).not.toContainText("launch asset index is missing");
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Games" })).toHaveClass(/active/);
  await expect(page.locator(".process-row").filter({ hasText: "javaw.exe" })).toBeVisible();
  await page.getByLabel("Activity views").getByRole("button", { name: "History", exact: true }).click();
  const launchFailure = page.locator(".event-row").filter({ hasText: "Game files are missing" });
  await expect(launchFailure).toBeVisible();
  await expect(page.getByText("launch asset index is missing")).toHaveCount(0);
  await expect(page.getByText("C:/cache/assets/indexes/1.20.1.json")).toHaveCount(0);
  await expect(page.getByText("Launching profile is mocked in web preview")).toHaveCount(0);
  const invoked = await page.evaluate(() => (window as typeof window & { __launchRecoveryInvokes: string[] }).__launchRecoveryInvokes);
  expect(invoked.filter((cmd) => cmd === "start_launch_process")).toHaveLength(2);
  expect(invoked.indexOf("list_launcher_events")).toBeLessThan(invoked.indexOf("plan_repair_profile"));
  expect(invoked.indexOf("plan_repair_profile")).toBeLessThan(invoked.indexOf("repair_profile"));
  expect(invoked.indexOf("start_launch_process", invoked.indexOf("repair_profile"))).toBeGreaterThan(
    invoked.indexOf("repair_profile"),
  );
  expect(invoked.indexOf("bootstrap_snapshot", invoked.indexOf("repair_profile"))).toBeGreaterThan(invoked.indexOf("repair_profile"));
  expect(invoked.indexOf("list_launcher_events", invoked.indexOf("repair_profile"))).toBeGreaterThan(invoked.indexOf("repair_profile"));
});

test("library play action surfaces native Java runtime recovery and retry", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    let launchAttempts = 0;
    let runtimeInstalled = false;
    const downloadPlan = {
      versionId: "temurin-21-windows-x64",
      totalBytes: 1234,
      items: [
        {
          id: "java-runtime-archive-temurin-21-windows-x64",
          kind: "java_runtime_archive",
          url: "https://downloads.example/temurin-21.zip",
          destination: "C:/Users/test/AppData/Roaming/TheBoysLauncher/cache/java/temurin-21.zip",
          size: 1234,
        },
      ],
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Cozy survival with friends.",
          version: "2.3.7",
          status: "not_installed",
          accent: "#67e8b9",
          installedPlayers: 0,
          defaultServer: "The Cabin",
        },
      ],
      profiles: [
        {
          id: "modern-vanilla",
          name: "Modern Vanilla",
          loader: "vanilla",
          gameVersion: "1.21.8",
          memoryMb: 4096,
          jvmArgs: [],
        },
      ],
      imports: [],
    });

    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "start_launch_process") {
            launchAttempts += 1;
            if (launchAttempts === 1) {
              throw new Error(
                "Minecraft requires Java 21 or newer, but discovered Java 17 at C:/Java/17/bin/java.exe. Install a managed Java runtime from Settings before launching.",
              );
            }
            return {
              id: "java-runtime-retry-process",
              processId: 4242,
              state: "running",
              startedAtUnixSeconds: 1_781_000_000,
              runtimeSeconds: 3,
              totalOutputLineCount: 1,
              droppedOutputLineCount: 0,
              command: {
                executable: "javaw.exe",
                args: ["-jar", "minecraft.jar"],
                env: [
                  {
                    key: "THEBOYSLAUNCHER_PROFILE_ID",
                    value: "modern-vanilla",
                    sensitive: false,
                  },
                ],
                workingDirectory: "C:/Users/test/AppData/Roaming/TheBoysLauncher/data/profiles/modern-vanilla",
              },
              output: [{ stream: "stdout", line: "Minecraft started with Java 21", timestampUnixSeconds: 1_781_000_001 }],
            };
          }
          if (cmd === "list_launcher_events") {
            return [
              {
                id: "java-launch-failed",
                operationId: "00000000-0000-4000-8000-000000000193",
                operation: "launch_profile",
                subjectId: "modern-vanilla",
                kind: "failed",
                message:
                  "Minecraft requires Java 21 or newer, but discovered Java 17 at C:/Java/17/bin/java.exe. Install a managed Java runtime from Settings before launching.",
                progressPercent: 100,
                occurredAtUnixSeconds: 1_710_000_000,
              },
            ];
          }
          if (cmd === "build_managed_java_runtime_download_plan") return downloadPlan;
          if (cmd === "execute_download_plan") {
            return {
              operation: "download_artifacts",
              subject: "temurin-21-windows-x64",
              events: [{ kind: "completed", message: "Java runtime archive downloaded.", progressPercent: 100 }],
            };
          }
          if (cmd === "execute_managed_java_runtime_install") {
            runtimeInstalled = true;
            return {
              operation: "install_java_runtime",
              subject: "temurin-21-windows-x64",
              events: [{ kind: "completed", message: "Java runtime temurin-21-windows-x64 is installed.", progressPercent: 100 }],
            };
          }
          if (cmd === "recommended_java_runtime_manifest") {
            return [
              {
                runtimeId: "temurin-21-windows-x64",
                label: "Temurin 21 LTS",
                vendor: "Eclipse Adoptium",
                majorVersion: 21,
                platform: "windows-x64",
                url: "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse",
                archiveFileName: "temurin-21-windows-x64.zip",
                notes: "Recommended for Minecraft 1.20.5 and newer.",
              },
            ];
          }
          if (cmd === "discover_java_runtimes") {
            return [
              {
                id: runtimeInstalled ? "java-21-temurin" : "java-17",
                path: runtimeInstalled
                  ? "C:/Users/test/AppData/Roaming/TheBoysLauncher/runtimes/temurin-21-windows-x64/bin/java.exe"
                  : "C:/Java/17/bin/java.exe",
                version: runtimeInstalled ? "21.0.6" : "17.0.12",
                majorVersion: runtimeInstalled ? 21 : 17,
                source: runtimeInstalled ? "bundled" : "path",
              },
            ];
          }
          if (cmd === "list_managed_processes") return [];
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__javaRecoveryInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Library" }).click();
  await page.locator(".profile-row").filter({ hasText: "Modern Vanilla" }).getByRole("button", { name: "Play" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await page.getByLabel("Activity views").getByRole("button", { name: "Games" }).click();
  await expect(page.locator(".process-row").filter({ hasText: "Minecraft started with Java 21" })).toBeVisible();
  await expect(page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Prepare Java" })).toHaveCount(0);
  await expect(page.getByRole("complementary").getByRole("button", { name: "Repair" })).toHaveCount(0);
  await page.getByLabel("Activity views").getByRole("button", { name: "History" }).click();
  const javaFailureEvent = page.locator(".event-row").filter({ hasText: "Preparing Java 21 automatically" });
  await expect(javaFailureEvent).toBeVisible();
  await expect(javaFailureEvent).not.toContainText("Install a managed Java runtime from Settings before launching");
  await expect(javaFailureEvent.getByRole("button", { name: "Prepare Java" })).toHaveCount(0);
  const invoked = await page.evaluate(() => (window as typeof window & { __javaRecoveryInvokes: string[] }).__javaRecoveryInvokes);
  expect(invoked).toContain("start_launch_process");
  expect(invoked).toContain("recommended_java_runtime_manifest");
  expect(invoked).toContain("discover_java_runtimes");
  expect(invoked).toContain("execute_managed_java_runtime_install");
  expect(invoked.filter((cmd) => cmd === "start_launch_process")).toHaveLength(2);
  expect(invoked).not.toContain("install_pack");
  expect(invoked).not.toContain("plan_repair_profile");
});

test("missing managed Java executable path auto-installs Java and retries", async ({ page }) => {
  await page.addInitScript(() => {
    const message =
      "Java executable C:/Users/test/AppData/Roaming/TheBoysLauncher/runtimes/temurin-21-windows-x64/bin/java.exe is missing. Install a managed Java runtime from Settings before launching.";
    const invoked: string[] = [];
    let launchAttempts = 0;
    let runtimeInstalled = false;
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [
                {
                  id: "modern-vanilla",
                  name: "Modern Vanilla",
                  loader: "vanilla",
                  gameVersion: "1.21.8",
                  memoryMb: 4096,
                  jvmArgs: [],
                },
              ],
              imports: [],
            };
          }
          if (cmd === "start_launch_process") {
            launchAttempts += 1;
            if (launchAttempts === 1) throw new Error(message);
            return {
              id: "missing-java-retry-process",
              processId: 4343,
              state: "running",
              startedAtUnixSeconds: 1_781_000_000,
              runtimeSeconds: 2,
              totalOutputLineCount: 1,
              droppedOutputLineCount: 0,
              command: {
                executable: "javaw.exe",
                args: ["-jar", "minecraft.jar"],
                env: [
                  {
                    key: "THEBOYSLAUNCHER_PROFILE_ID",
                    value: "modern-vanilla",
                    sensitive: false,
                  },
                ],
                workingDirectory: "C:/Users/test/AppData/Roaming/TheBoysLauncher/data/profiles/modern-vanilla",
              },
              output: [{ stream: "stdout", line: "Minecraft started after Java reinstall", timestampUnixSeconds: 1_781_000_001 }],
            };
          }
          if (cmd === "list_launcher_events") {
            return [
              {
                id: "missing-java-launch-failed",
                operationId: "00000000-0000-4000-8000-000000000197",
                operation: "launch_profile",
                subjectId: "modern-vanilla",
                kind: "failed",
                message,
                progressPercent: 100,
                occurredAtUnixSeconds: 1_710_000_000,
              },
            ];
          }
          if (cmd === "build_managed_java_runtime_download_plan") {
            return {
              versionId: "temurin-21-windows-x64",
              totalBytes: 1234,
              items: [
                {
                  id: "java-runtime-archive-temurin-21-windows-x64",
                  kind: "java_runtime_archive",
                  url: "https://downloads.example/temurin-21.zip",
                  destination: "C:/Users/test/AppData/Roaming/TheBoysLauncher/cache/java/temurin-21.zip",
                  size: 1234,
                },
              ],
            };
          }
          if (cmd === "execute_download_plan") {
            return {
              operation: "download_artifacts",
              subject: "temurin-21-windows-x64",
              events: [{ kind: "completed", message: "Java runtime archive downloaded.", progressPercent: 100 }],
            };
          }
          if (cmd === "execute_managed_java_runtime_install") {
            runtimeInstalled = true;
            return {
              operation: "install_java_runtime",
              subject: "temurin-21-windows-x64",
              events: [{ kind: "completed", message: "Java runtime temurin-21-windows-x64 is installed.", progressPercent: 100 }],
            };
          }
          if (cmd === "recommended_java_runtime_manifest") {
            return [
              {
                runtimeId: "temurin-21-windows-x64",
                label: "Temurin 21 LTS",
                vendor: "Eclipse Adoptium",
                majorVersion: 21,
                platform: "windows-x64",
                url: "https://downloads.example/temurin-21.zip",
                archiveFileName: "temurin-21-windows-x64.zip",
                notes: "Recommended for Minecraft 1.20.5 and newer.",
              },
            ];
          }
          if (cmd === "discover_java_runtimes") {
            return runtimeInstalled
              ? [
                  {
                    id: "java-21-temurin",
                    path: "C:/Users/test/AppData/Roaming/TheBoysLauncher/runtimes/temurin-21-windows-x64/bin/java.exe",
                    version: "21.0.6",
                    majorVersion: 21,
                    source: "bundled",
                  },
                ]
              : [];
          }
          if (cmd === "list_managed_processes") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__missingJavaInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Library" }).click();
  await page.locator(".profile-row").filter({ hasText: "Modern Vanilla" }).getByRole("button", { name: "Play" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await page.getByLabel("Activity views").getByRole("button", { name: "Games" }).click();
  await expect(page.locator(".process-row").filter({ hasText: "Minecraft started after Java reinstall" })).toBeVisible();
  await expect(page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Prepare Java" })).toHaveCount(0);
  await expect(page.getByRole("complementary").getByRole("button", { name: "Repair" })).toHaveCount(0);
  await page.getByRole("button", { name: "History", exact: true }).click();
  const failedJavaEvent = page.locator(".event-row").filter({ hasText: "Preparing Java automatically" });
  await expect(failedJavaEvent).toBeVisible();
  await expect(failedJavaEvent).not.toContainText("Install a managed Java runtime from Settings before launching");
  await expect(failedJavaEvent.getByRole("button", { name: "Prepare Java" })).toHaveCount(0);
  const invoked = await page.evaluate(() => (window as typeof window & { __missingJavaInvokes: string[] }).__missingJavaInvokes);
  expect(invoked.filter((cmd) => cmd === "start_launch_process")).toHaveLength(2);
  expect(invoked).toContain("execute_managed_java_runtime_install");
});

test("legacy profile missing Java auto-installs Java 8 instead of newer runtime", async ({ page }) => {
  await page.addInitScript(() => {
    const message =
      "Java executable C:/Users/test/AppData/Roaming/TheBoysLauncher/runtimes/temurin-8-windows-x64/bin/java.exe is missing. Install a managed Java runtime from Settings before launching.";
    const invoked: string[] = [];
    const requestedRuntimeIds: string[] = [];
    let launchAttempts = 0;
    let runtimeInstalled = false;
    Object.defineProperty(window, "__legacyJavaInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__legacyJavaRequestedRuntimeIds", {
      value: requestedRuntimeIds,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: Record<string, unknown>) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [
                {
                  id: "legacy-vanilla",
                  name: "Legacy Vanilla",
                  loader: "vanilla",
                  gameVersion: "1.16.5",
                  memoryMb: 4096,
                  jvmArgs: [],
                },
              ],
              imports: [],
            };
          }
          if (cmd === "start_launch_process") {
            launchAttempts += 1;
            if (launchAttempts === 1) throw new Error(message);
            return {
              id: "legacy-java-retry-process",
              processId: 4545,
              state: "running",
              startedAtUnixSeconds: 1_781_000_000,
              runtimeSeconds: 2,
              totalOutputLineCount: 1,
              droppedOutputLineCount: 0,
              command: {
                executable: "javaw.exe",
                args: ["-jar", "minecraft.jar"],
                env: [
                  {
                    key: "THEBOYSLAUNCHER_PROFILE_ID",
                    value: "legacy-vanilla",
                    sensitive: false,
                  },
                ],
                workingDirectory: "C:/Users/test/AppData/Roaming/TheBoysLauncher/data/profiles/legacy-vanilla",
              },
              output: [{ stream: "stdout", line: "Minecraft started with Java 8", timestampUnixSeconds: 1_781_000_001 }],
            };
          }
          if (cmd === "list_launcher_events") {
            return [
              {
                id: "legacy-missing-java-launch-failed",
                operationId: "00000000-0000-4000-8000-000000000198",
                operation: "launch_profile",
                subjectId: "legacy-vanilla",
                kind: "failed",
                message,
                progressPercent: 100,
                occurredAtUnixSeconds: 1_710_000_000,
              },
            ];
          }
          if (cmd === "recommended_java_runtime_manifest") {
            return [
              {
                runtimeId: "temurin-21-windows-x64",
                label: "Temurin 21 LTS",
                vendor: "Eclipse Adoptium",
                majorVersion: 21,
                platform: "windows-x64",
                url: "https://downloads.example/temurin-21.zip",
                archiveFileName: "temurin-21-windows-x64.zip",
                notes: "Recommended for Minecraft 1.20.5 and newer.",
              },
              {
                runtimeId: "temurin-8-windows-x64",
                label: "Temurin 8 LTS",
                vendor: "Eclipse Adoptium",
                majorVersion: 8,
                platform: "windows-x64",
                url: "https://downloads.example/temurin-8.zip",
                archiveFileName: "temurin-8-windows-x64.zip",
                notes: "Recommended for legacy Minecraft versions.",
              },
            ];
          }
          if (cmd === "build_managed_java_runtime_download_plan") {
            const request = args?.request as { runtimeId?: string } | undefined;
            requestedRuntimeIds.push(request?.runtimeId ?? "");
            return {
              versionId: request?.runtimeId ?? "temurin-8-windows-x64",
              totalBytes: 1234,
              items: [
                {
                  id: `java-runtime-archive-${request?.runtimeId ?? "temurin-8-windows-x64"}`,
                  kind: "java_runtime_archive",
                  url: "https://downloads.example/temurin-8.zip",
                  destination: "C:/Users/test/AppData/Roaming/TheBoysLauncher/cache/java/temurin-8.zip",
                  size: 1234,
                },
              ],
            };
          }
          if (cmd === "execute_download_plan") {
            return {
              operation: "download_artifacts",
              subject: "temurin-8-windows-x64",
              events: [{ kind: "completed", message: "Java runtime archive downloaded.", progressPercent: 100 }],
            };
          }
          if (cmd === "execute_managed_java_runtime_install") {
            runtimeInstalled = true;
            return {
              operation: "install_java_runtime",
              subject: "temurin-8-windows-x64",
              events: [{ kind: "completed", message: "Java runtime temurin-8-windows-x64 is installed.", progressPercent: 100 }],
            };
          }
          if (cmd === "discover_java_runtimes") {
            return runtimeInstalled
              ? [
                  {
                    id: "java-8-temurin",
                    path: "C:/Users/test/AppData/Roaming/TheBoysLauncher/runtimes/temurin-8-windows-x64/bin/java.exe",
                    version: "1.8.0_402",
                    majorVersion: 8,
                    source: "bundled",
                  },
                ]
              : [];
          }
          if (cmd === "list_managed_processes" || cmd === "list_minecraft_accounts") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Library" }).click();
  await page.locator(".profile-row").filter({ hasText: "Legacy Vanilla" }).getByRole("button", { name: "Play" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await page.getByLabel("Activity views").getByRole("button", { name: "Games" }).click();
  await expect(page.locator(".process-row").filter({ hasText: "Minecraft started with Java 8" })).toBeVisible();
  const requestedRuntimeIds = await page.evaluate(
    () => (window as typeof window & { __legacyJavaRequestedRuntimeIds: string[] }).__legacyJavaRequestedRuntimeIds,
  );
  expect(requestedRuntimeIds).toEqual(["temurin-8-windows-x64"]);
  const invoked = await page.evaluate(() => (window as typeof window & { __legacyJavaInvokes: string[] }).__legacyJavaInvokes);
  expect(invoked.filter((cmd) => cmd === "start_launch_process")).toHaveLength(2);
  expect(invoked).toContain("execute_managed_java_runtime_install");
});

test("library launch details action explains desktop app requirement in web preview", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Library" }).click();
  await clickProfileSetupCheck(page.locator(".profile-row").filter({ hasText: "WinterPack" }));

  await expect(page.getByText("Launch details require the desktop app")).toBeVisible();
  await expect(page.getByText("Launch diagnostics require the desktop app")).toHaveCount(0);
  await expect(page.getByText("Launch details are mocked in web preview")).toHaveCount(0);
});

test("library launch details action shows native command preview", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    let copiedLaunchCommand = "";
    Object.defineProperty(window, "__commandPreviewInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__copiedLaunchCommand", {
      get: () => copiedLaunchCommand,
      configurable: true,
    });
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    document.execCommand = (command: string) => {
      if (command !== "copy") return false;
      copiedLaunchCommand = (document.activeElement as HTMLTextAreaElement | null)?.value ?? "";
      return true;
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              minecraftSession: {
                session: {
                  username: "PlayerOne",
                  uuid: "00000000-0000-4000-8000-000000000001",
                  accessToken: "renderer-redacted",
                },
                accountId: "00000000-0000-4000-8000-000000000001",
                storedAtUnixSeconds: 1_710_000_000,
                expiresAtUnixSeconds: 1,
                microsoftClientId: "client-123",
              },
              friends: [],
              packs: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  tagline: "Cozy survival with friends.",
                  version: "10/30/2025",
                  status: "installed",
                  accent: "#67e8b9",
                  installedPlayers: 0,
                  defaultServer: "The Cabin",
                },
              ],
              profiles: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  loader: "forge",
                  gameVersion: "1.20.1",
                  installedPackVersion: "10/30/2025",
                  memoryMb: 6144,
                  jvmArgs: [],
                },
              ],
              imports: [],
            };
          }
          if (cmd === "build_stored_authenticated_launch_command") {
            return {
              executable: "javaw.exe",
              args: [
                "-Xmx6144M",
                "--username",
                "PlayerOne",
                "--accessToken",
                "<redacted>",
                "--gameDir",
                "C:/TheBoysLauncher/data/profiles/winterpack",
                "--assetsDir",
                "C:/TheBoysLauncher/cache/assets",
                "--version",
                "1.20.1-forge-47.4.0",
                "--launchTarget",
                "forgeclient",
                "--width",
                "1280",
                "--height",
                "720",
              ],
              workingDir: "C:/TheBoysLauncher/data/profiles/Winter Pack",
              env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.locator(".account-card")).toContainText("refreshes");
  await page.getByRole("button", { name: "Library" }).click();
  await clickProfileSetupCheck(page.locator(".profile-row").filter({ hasText: "WinterPack" }));

  const preview = page.getByLabel("Launch details preview", { exact: true });
  await expect(preview).toContainText("Signed-in launch details");
  await expect(preview).toContainText("WinterPack");
  await expect(preview).toContainText("Java app");
  await expect(preview).toContainText("Game folder");
  await expect(preview).toContainText("Launch options");
  await expect(preview).toContainText("Launcher variables");
  await expect(preview).toContainText("javaw.exe");
  await expect(preview).toContainText("C:/TheBoysLauncher/data/profiles/Winter Pack");
  await expect(preview).toContainText("17");
  await expect(page.getByLabel("Launch detail arguments")).toContainText("--username");
  await expect(page.getByLabel("Launch detail arguments")).toContainText("PlayerOne");
  await expect(page.getByLabel("Launch detail arguments")).toContainText("5 more args");
  await preview.getByRole("button", { name: "Copy launch details for WinterPack" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText("Copied launch details for WinterPack");
  const copiedLaunchCommand = await page.evaluate(
    () => (window as typeof window & { __copiedLaunchCommand: string }).__copiedLaunchCommand,
  );
  expect(copiedLaunchCommand).toContain("# Working directory: C:/TheBoysLauncher/data/profiles/Winter Pack");
  expect(copiedLaunchCommand).toContain("javaw.exe -Xmx6144M --username PlayerOne --accessToken <redacted>");
  expect(copiedLaunchCommand).toContain("--height 720");
  expect(copiedLaunchCommand).toContain("THEBOYSLAUNCHER_PROFILE_ID=winterpack");
  await preview.getByRole("button", { name: "Close launch details preview" }).click();
  await expect(preview).toHaveCount(0);

  const invoked = await page.evaluate(() => (window as typeof window & { __commandPreviewInvokes: string[] }).__commandPreviewInvokes);
  expect(invoked).toContain("build_stored_authenticated_launch_command");
  expect(invoked).not.toContain("build_launch_command");
});

test("launch command preflight failure offers setup recovery", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    Object.defineProperty(window, "__commandRepairRecoveryInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  tagline: "Cozy survival with friends.",
                  version: "2.3.7",
                  status: "installed",
                  accent: "#67e8b9",
                  installedPlayers: 0,
                  defaultServer: "The Cabin",
                },
              ],
              profiles: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  loader: "forge",
                  gameVersion: "1.20.1",
                  installedPackVersion: "2.3.7",
                  memoryMb: 6144,
                  jvmArgs: [],
                },
              ],
              imports: [],
            };
          }
          if (cmd === "build_launch_command") {
            throw new Error("asset index is missing: C:/TheBoysLauncher/cache/assets/indexes/1.20.1.json");
          }
          if (cmd === "plan_repair_profile") {
            return {
              operationId: "00000000-0000-4000-8000-0000000000a1",
              operation: "repair_profile",
              subjectId: "winterpack",
              events: [
                { kind: "queued", message: "Setup queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Setup is ready to start.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "repair_profile") {
            return {
              action: "repair_profile",
              subjectId: "winterpack",
              status: "completed",
              message: "Profile repair completed.",
            };
          }
          if (cmd === "start_launch_process") {
            return {
              id: "winterpack-process",
              processId: 4242,
              command: {
                executable: "C:/Java/bin/javaw.exe",
                args: ["-version"],
                workingDir: "C:/TheBoysLauncher/profiles/winterpack",
                env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
              },
              state: "running",
              startedAtUnixSeconds: 1_710_000_000,
              runtimeSeconds: 1,
              totalOutputLineCount: 1,
              droppedOutputLineCount: 0,
              output: [{ stream: "stdout", line: "Starting Minecraft" }],
            };
          }
          if (cmd === "list_managed_processes") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Library" }).click();
  await clickProfileSetupCheck(page.locator(".profile-row").filter({ hasText: "WinterPack" }));

  await expect(page.getByLabel("Launcher status message")).toContainText("Game files are missing");
  await expect(page.getByLabel("Launch details preview")).toHaveCount(0);
  const recoveryActions = page.getByLabel("Launcher recovery actions");
  await expect(recoveryActions.getByRole("button", { name: "Try play again" })).toBeVisible();
  await recoveryActions.getByRole("button", { name: "Try play again" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Games", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".process-row").filter({ hasText: "WinterPack" })).toContainText("Running");
  const invoked = await page.evaluate(
    () => (window as typeof window & { __commandRepairRecoveryInvokes: string[] }).__commandRepairRecoveryInvokes,
  );
  expect(invoked.indexOf("build_launch_command")).toBeLessThan(invoked.indexOf("plan_repair_profile"));
  expect(invoked.indexOf("plan_repair_profile")).toBeLessThan(invoked.indexOf("repair_profile"));
  expect(invoked.indexOf("start_launch_process")).toBeGreaterThan(invoked.indexOf("repair_profile"));
});

test("successful launch command preview clears stale repair recovery", async ({ page }) => {
  await page.addInitScript(() => {
    let commandAttempts = 0;
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  tagline: "Cozy survival with friends.",
                  version: "2.3.7",
                  status: "installed",
                  accent: "#67e8b9",
                  installedPlayers: 0,
                  defaultServer: "The Cabin",
                },
              ],
              profiles: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  loader: "forge",
                  gameVersion: "1.20.1",
                  memoryMb: 6144,
                  jvmArgs: [],
                },
              ],
              imports: [],
            };
          }
          if (cmd === "build_launch_command") {
            commandAttempts += 1;
            if (commandAttempts === 1) {
              throw new Error("asset index is missing: C:/TheBoysLauncher/cache/assets/indexes/1.20.1.json");
            }
            return {
              executable: "javaw.exe",
              args: ["-Xmx6144M", "--username", "Player", "--version", "1.20.1-forge-47.4.0"],
              workingDir: "C:/TheBoysLauncher/data/profiles/winterpack",
              env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Library" }).click();
  const profile = page.locator(".profile-row").filter({ hasText: "WinterPack" });
  await clickProfileSetupCheck(profile);

  await expect(page.getByLabel("Launcher status message")).toContainText("Game files are missing");
  await expect(page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Try play again" })).toBeVisible();

  await profile.getByRole("button", { name: "Check launch" }).click();

  const preview = page.getByLabel("Launch details preview", { exact: true });
  await expect(preview).toContainText("WinterPack");
  await expect(preview).toContainText("javaw.exe");
  await expect(page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Try play again" })).toHaveCount(0);
});

test("launch command Java preflight failure offers Java recovery", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    Object.defineProperty(window, "__commandJavaRecoveryInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  tagline: "Cozy survival with friends.",
                  version: "2.3.7",
                  status: "installed",
                  accent: "#67e8b9",
                  installedPlayers: 0,
                  defaultServer: "The Cabin",
                },
              ],
              profiles: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  loader: "forge",
                  gameVersion: "1.20.1",
                  installedPackVersion: "2.3.7",
                  memoryMb: 6144,
                  jvmArgs: [],
                },
              ],
              imports: [],
            };
          }
          if (cmd === "build_launch_command") {
            throw new Error("Install a managed Java runtime from Settings before launching");
          }
          if (cmd === "recommended_java_runtime_manifest") {
            return [
              {
                runtimeId: "temurin-21-windows-x64",
                label: "Eclipse Temurin 21",
                vendor: "Eclipse Temurin",
                majorVersion: 21,
                platform: "windows-x64",
                url: "https://example.com/temurin-21.zip",
                archiveFileName: "temurin-21.zip",
                notes: "Recommended for modern Minecraft",
              },
            ];
          }
          if (cmd === "discover_java_runtimes") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Library" }).click();
  await clickProfileSetupCheck(page.locator(".profile-row").filter({ hasText: "WinterPack" }));

  await expect(page.getByLabel("Launcher status message")).toContainText(
    "Preparing the right Java automatically for this Minecraft version.",
  );
  await expect(page.getByLabel("Launch details preview")).toHaveCount(0);
  const recoveryActions = page.getByLabel("Launcher recovery actions");
  await expect(recoveryActions.getByRole("button", { name: "Prepare Java" })).toBeVisible();
  await recoveryActions.getByRole("button", { name: "Prepare Java" }).click();

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByLabel("Managed Java runtime ID")).toHaveValue("temurin-21-windows-x64");
  await expect(page.getByLabel("Managed Java archive URL")).toHaveValue("https://example.com/temurin-21.zip");
  const invoked = await page.evaluate(
    () => (window as typeof window & { __commandJavaRecoveryInvokes: string[] }).__commandJavaRecoveryInvokes,
  );
  expect(invoked).toContain("build_launch_command");
  expect(invoked).toContain("recommended_java_runtime_manifest");
  expect(invoked).toContain("discover_java_runtimes");
  expect(invoked).not.toContain("plan_repair_profile");
});

test("authenticated launch command refresh failure offers sign-in recovery", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    Object.defineProperty(window, "__commandSessionRecoveryInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              minecraftSession: {
                session: {
                  username: "PlayerOne",
                  uuid: "00000000-0000-4000-8000-000000000001",
                  accessToken: "[redacted]",
                },
                accountId: "00000000-0000-4000-8000-000000000001",
                storedAtUnixSeconds: 1_710_000_000,
                expiresAtUnixSeconds: 1_900_000_000,
              },
              friends: [],
              packs: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  tagline: "Cozy survival with friends.",
                  version: "2.3.7",
                  status: "installed",
                  accent: "#67e8b9",
                  installedPlayers: 0,
                  defaultServer: "The Cabin",
                },
              ],
              profiles: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  loader: "forge",
                  gameVersion: "1.20.1",
                  installedPackVersion: "2.3.7",
                  memoryMb: 6144,
                  jvmArgs: [],
                },
              ],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "build_stored_authenticated_launch_command") {
            throw new Error("Microsoft token exchange failed: invalid_grant: Refresh token expired");
          }
          if (cmd === "start_microsoft_auth_flow") {
            return {
              authUrl: "https://login.live.com/oauth20_authorize.srf?client_id=client-123",
              state: "state-123",
              codeVerifier: "verifier",
              codeChallenge: "challenge",
              clientId: "client-123",
              redirectUri: "http://127.0.0.1:53682/auth/microsoft/callback",
              scopes: ["XboxLive.signin", "offline_access"],
            };
          }
          if (cmd === "open_microsoft_auth_url") return undefined;
          if (cmd === "complete_microsoft_login_with_local_callback") {
            throw new Error("timed out waiting for Microsoft sign-in callback");
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Library" }).click();
  await clickProfileSetupCheck(page.locator(".profile-row").filter({ hasText: "WinterPack" }));

  await expect(page.getByLabel("Launcher status message")).toContainText(
    "Microsoft sign-in needs to be refreshed. Sign in again to continue.",
  );
  await expect(page.getByLabel("Launcher status message")).not.toContainText("invalid_grant");
  await expect(page.getByRole("complementary").getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.locator(".account-card")).toContainText("Not signed in");

  await page.getByRole("complementary").getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Microsoft sign-in timed out. Start sign-in again from TheBoysLauncher.")).toBeVisible();
  await expect(page.getByText("timed out waiting for Microsoft sign-in callback")).toHaveCount(0);
  const invoked = await page.evaluate(
    () => (window as typeof window & { __commandSessionRecoveryInvokes: string[] }).__commandSessionRecoveryInvokes,
  );
  expect(invoked).toContain("build_stored_authenticated_launch_command");
  expect(invoked).not.toContain("build_launch_command");
  expect(invoked).toContain("start_microsoft_auth_flow");
  expect(invoked).toContain("complete_microsoft_login_with_local_callback");
});

test("home details action explains desktop folder requirement in web preview", async ({ page }) => {
  await page.route("http://127.0.0.1:4074/packs/winterpack", async (route) => {
    await route.abort();
  });
  await page.goto("/");

  await page.getByLabel("Primary pack actions").getByRole("button", { name: "Details" }).click();

  await expect(page.getByText("Pack details are using preview data")).toBeVisible();
  await expect(page.getByLabel("WinterPack pack details")).toBeVisible();
  await page.getByRole("button", { name: "WinterPack more actions" }).click();
  await expect(page.getByRole("menu", { name: "WinterPack more menu" })).not.toContainText("Verify files");
  await expect(page.getByRole("menu", { name: "WinterPack more menu" })).toContainText("Open folder");
  await expect(page.getByRole("menu", { name: "WinterPack more menu" })).toContainText("Update");
  await expect(page.getByRole("menu", { name: "WinterPack more menu" })).toContainText("Duplicate instance");
  await expect(page.getByRole("menu", { name: "WinterPack more menu" })).toContainText("Delete profile");
  await page.getByRole("menu", { name: "WinterPack more menu" }).getByRole("menuitem", { name: "Open folder" }).click();
  await expect(page.getByText("Opening profile folders requires the desktop app")).toBeVisible();
  await expect(page.getByText("Opening profile folder is mocked in web preview")).toHaveCount(0);
  await page.getByRole("button", { name: "Back to Home" }).click();
  await expect(page.getByLabel("WinterPack pack details")).toHaveCount(0);
});

test("native home details fallback uses local pack wording instead of preview data", async ({ page }) => {
  await page.route("http://127.0.0.1:4074/packs/winterpack", async (route) => {
    await route.abort();
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  tagline: "Cozy survival with friends.",
                  version: "2.3.7",
                  status: "installed",
                  accent: "#67e8b9",
                  installedPlayers: 0,
                  defaultServer: "The Cabin",
                },
              ],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByLabel("Primary pack actions").getByRole("button", { name: "Details" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText("Using local pack details");
  await expect(page.getByLabel("Launcher status message")).not.toContainText("preview data");
  await expect(page.getByLabel("WinterPack pack details")).toBeVisible();
});

test("pack details friends rail can start a join action", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Primary pack actions").getByRole("button", { name: "Details" }).click();

  const details = page.getByLabel("WinterPack pack details");
  await expect(details).toBeVisible();
  const friendRow = details.locator(".compact-friend-row").filter({ hasText: "Dylan" });
  await expect(friendRow.getByRole("button", { name: "Join" })).toBeVisible();

  await friendRow.getByRole("button", { name: "Join" }).click();
  await expect(page.getByText("Friend joins require the desktop app")).toBeVisible();
});

test("pack details more menu can delete an installed profile", async ({ page }) => {
  await page.route("http://127.0.0.1:4074/packs/winterpack", async (route) => {
    await route.abort();
  });
  await page.addInitScript(() => {
    let deleted = false;
    const invoked: string[] = [];
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: deleted
        ? []
        : [
            {
              id: "winterpack",
              name: "WinterPack",
              tagline: "Cozy survival with friends.",
              version: "2.3.7",
              status: "installed",
              accent: "#67e8b9",
              installedPlayers: 0,
              defaultServer: "The Cabin",
            },
          ],
      profiles: deleted
        ? []
        : [
            {
              id: "winterpack",
              name: "WinterPack",
              loader: "forge",
              gameVersion: "1.20.1",
              memoryMb: 6144,
              jvmArgs: [],
            },
          ],
      imports: [],
    });
    Object.defineProperty(window, "__packDetailsDeleteInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") {
            return deleted
              ? [
                  {
                    id: "delete-completed",
                    operationId: "00000000-0000-4000-8000-000000000299",
                    operation: "delete_profile",
                    subjectId: "winterpack",
                    kind: "completed",
                    message: "Profile files were removed; shared Minecraft downloads were kept for faster future installs.",
                    progressPercent: 100,
                    occurredAtUnixSeconds: 1_710_000_000,
                  },
                ]
              : [];
          }
          if (cmd === "list_managed_processes") return [];
          if (cmd === "open_profile_folder") return undefined;
          if (cmd === "delete_profile") {
            deleted = true;
            return {
              action: "delete_profile",
              subjectId: "winterpack",
              status: "completed",
              message: "Profile files were removed; shared Minecraft downloads were kept for faster future installs.",
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByLabel("Primary pack actions").getByRole("button", { name: "Details" }).click();
  await expect(page.getByLabel("WinterPack pack details")).toBeVisible();

  await page.getByRole("button", { name: "WinterPack more actions" }).click();
  await page.getByRole("menu", { name: "WinterPack more menu" }).getByRole("menuitem", { name: "Open folder" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText("WinterPack folder opened");
  await page.getByRole("button", { name: "WinterPack more actions" }).click();
  await page.getByRole("menu", { name: "WinterPack more menu" }).getByRole("menuitem", { name: "Delete profile" }).click();
  await expect(page.getByLabel("Confirm deleting WinterPack")).toContainText("Remove this profile's files?");
  await page.getByLabel("Confirm deleting WinterPack").getByRole("menuitem", { name: "Delete profile" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.locator(".event-row").filter({ hasText: "shared Minecraft downloads were kept" })).toBeVisible();
  await page.getByRole("button", { name: "Library" }).click();
  await expect(page.locator(".profile-row").filter({ hasText: "WinterPack" })).toHaveCount(0);
  const invoked = await page.evaluate(() => (window as typeof window & { __packDetailsDeleteInvokes: string[] }).__packDetailsDeleteInvokes);
  expect(invoked).toContain("open_profile_folder");
  expect(invoked).toContain("delete_profile");
  expect(invoked.indexOf("open_profile_folder")).toBeLessThan(invoked.indexOf("delete_profile"));
  expect(invoked.indexOf("bootstrap_snapshot", invoked.indexOf("delete_profile"))).toBeGreaterThan(invoked.indexOf("delete_profile"));
  expect(invoked.indexOf("list_launcher_events", invoked.indexOf("delete_profile"))).toBeGreaterThan(invoked.indexOf("delete_profile"));
});

test("library duplicate action refreshes native profiles", async ({ page }) => {
  await page.route("http://127.0.0.1:4074/packs", async (route) => {
    await route.abort();
  });
  await page.addInitScript(() => {
    let duplicated = false;
    const invoked: string[] = [];
    const sourceProfile = {
      id: "winterpack",
      name: "WinterPack",
      loader: "forge",
      gameVersion: "1.20.1",
      installedPackVersion: "2.3.7",
      memoryMb: 6144,
      jvmArgs: ["-Dexample=true"],
      resolution: { width: 1280, height: 720 },
      defaultServer: { name: "The Cabin", address: "play.example.test", port: 25565 },
    };
    const duplicateProfile = {
      ...sourceProfile,
      id: "winterpack-copy",
      name: "WinterPack Copy",
      installedPackVersion: undefined,
      lastPlayed: undefined,
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Cozy survival with friends.",
          version: "2.3.7",
          status: "installed",
          accent: "#67e8b9",
          installedPlayers: 0,
          defaultServer: "The Cabin",
        },
      ],
      profiles: duplicated ? [sourceProfile, duplicateProfile] : [sourceProfile],
      imports: [],
    });
    Object.defineProperty(window, "__nativeDuplicateInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { request?: { id: string } }) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "duplicate_profile") {
            if (args?.request?.id !== "winterpack") throw new Error("unexpected profile id");
            duplicated = true;
            return duplicateProfile;
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Library" }).click();
  const sourceRow = page.locator(".profile-row").filter({ hasText: "WinterPack" }).first();
  await expect(sourceRow).toBeVisible();
  await sourceRow.getByRole("button", { name: "WinterPack more actions" }).click();
  await sourceRow.getByRole("menu", { name: "WinterPack more menu" }).getByRole("menuitem", { name: "Duplicate profile" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText("WinterPack Copy duplicated");
  await expect(page.locator(".profile-row").filter({ hasText: "WinterPack Copy" })).toBeVisible();
  const invoked = await page.evaluate(() => (window as typeof window & { __nativeDuplicateInvokes: string[] }).__nativeDuplicateInvokes);
  expect(invoked).toContain("duplicate_profile");
  expect(invoked.indexOf("bootstrap_snapshot", invoked.indexOf("duplicate_profile"))).toBeGreaterThan(
    invoked.indexOf("duplicate_profile"),
  );
});

test("library duplicate action creates a preview copy", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Library" }).click();

  const sourceRow = page.locator(".profile-row").filter({ hasText: "WinterPack" }).first();
  await expect(sourceRow).toBeVisible();
  await sourceRow.getByRole("button", { name: "WinterPack more actions" }).click();
  await sourceRow.getByRole("menu", { name: "WinterPack more menu" }).getByRole("menuitem", { name: "Duplicate profile" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText("WinterPack Copy duplicated in preview");
  await expect(page.getByLabel("Launcher status message")).not.toContainText("Profile duplicated in web preview");
  await expect(page.locator(".profile-row").filter({ hasText: "WinterPack Copy" })).toBeVisible();
});

test("pack play setup refreshes native bootstrap snapshot status", async ({ page }) => {
  await page.addInitScript(() => {
    let repaired = false;
    let callbackId = 1;
    const invoked: string[] = [];
    const callbacks = new Map<number, (...args: unknown[]) => unknown>();
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [
        {
          id: "1",
          name: "Dylan",
          avatarColor: "#67e8b9",
          state: "playing",
          packName: "WinterPack",
          serverName: "The Cabin",
          joinable: true,
        },
      ],
      packs: [
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Cozy survival with friends.",
          version: "10/30/2025",
          status: repaired ? "installed" : "repair_needed",
          accent: "#67e8b9",
          installedPlayers: 0,
          defaultServer: "The Cabin",
        },
      ],
      profiles: [
        {
          id: "winterpack",
          name: "WinterPack",
          loader: "forge",
          gameVersion: "1.20.1",
          installedPackVersion: "10/30/2025",
          memoryMb: 6144,
          jvmArgs: [],
        },
      ],
      imports: [],
    });

    Object.defineProperty(window, "__repairInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "plan_repair_profile") {
            return {
              operationId: "00000000-0000-4000-8000-000000000091",
              operation: "repair_profile",
              subjectId: "winterpack",
              events: [
                { kind: "queued", message: "Setup queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Setup is ready to start.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "repair_profile") {
            repaired = true;
            return {
              action: "repair_profile",
              subjectId: "winterpack",
              status: "completed",
              message: "Profile repair completed.",
            };
          }
          if (cmd === "start_launch_process") {
            if (!repaired) {
              throw new Error("launch artifact is missing: asset index is missing. Install or repair the profile before launching.");
            }
            return {
              id: "winterpack-process",
              processId: 4300,
              command: {
                executable: "javaw.exe",
                args: ["-Xmx6144M", "net.minecraft.client.main.Main"],
                workingDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/profiles/winterpack",
                env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
              },
              state: "running",
              startedAtUnixSeconds: 1_710_000_000,
              runtimeSeconds: 1,
              totalOutputLineCount: 0,
              droppedOutputLineCount: 0,
              output: [],
            };
          }
          if (cmd === "list_launcher_events") {
            return [
              {
                id: "repair-completed",
                operationId: "00000000-0000-4000-8000-000000000091",
                operation: "repair_profile",
                subjectId: "winterpack",
                kind: "completed",
                message: "Profile repair completed.",
                progressPercent: 100,
                occurredAtUnixSeconds: 1_710_000_000,
              },
            ];
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: (callback: (...args: unknown[]) => unknown) => {
          const id = callbackId++;
          callbacks.set(id, callback);
          return id;
        },
        unregisterCallback: (id: number) => {
          callbacks.delete(id);
        },
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");

  const card = page.locator(".pack-card").filter({ hasText: "WinterPack" });
  await expect(card).toContainText("Ready");
  await expect(card.getByRole("button", { name: "Repair" })).toHaveCount(0);
  await card.getByRole("button", { name: "Play" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Games", exact: true })).toHaveClass(/active/);
  await page.getByLabel("Activity views").getByRole("button", { name: "History" }).click();
  await expect(page.locator(".event-row").filter({ hasText: "Files are ready." })).toBeVisible();
  await expect(page.getByLabel("Launcher quick status")).toContainText("Game setup - Done");
  await page.locator("nav").getByRole("button", { name: "Play" }).click();
  await expect(card.getByRole("button", { name: "Repair" })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Play" })).toBeEnabled();
  const invoked = await page.evaluate(() => (window as typeof window & { __repairInvokes: string[] }).__repairInvokes);
  expect(invoked.filter((cmd) => cmd === "bootstrap_snapshot").length).toBeGreaterThanOrEqual(2);
  expect(invoked.indexOf("plan_repair_profile")).toBeLessThan(invoked.indexOf("repair_profile"));
  expect(invoked.indexOf("bootstrap_snapshot", invoked.indexOf("repair_profile"))).toBeGreaterThan(invoked.indexOf("repair_profile"));
  expect(invoked.indexOf("start_launch_process")).toBeGreaterThan(invoked.indexOf("repair_profile"));
  expect(invoked.indexOf("list_launcher_events", invoked.indexOf("repair_profile"))).toBeGreaterThan(invoked.indexOf("repair_profile"));
});

test("launch setup recovery stays available while another pack installs", async ({ page }) => {
  await page.addInitScript(() => {
    let repaired = false;
    let repairAttempts = 0;
    let installStarted = false;
    let resolveInstall: ((value: unknown) => void) | null = null;
    const invoked: string[] = [];
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [
        {
          id: "skypack",
          name: "SkyPack",
          tagline: "A second pack to install.",
          version: "1.0.0",
          status: installStarted ? "installed" : "not_installed",
          accent: "#38bdf8",
          installedPlayers: 0,
          defaultServer: "Sky Base",
        },
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Cozy survival with friends.",
          version: "2.3.7",
          status: repaired ? "installed" : "repair_needed",
          accent: "#67e8b9",
          installedPlayers: 0,
          defaultServer: "The Cabin",
        },
      ],
      profiles: [
        {
          id: "winterpack",
          name: "WinterPack",
          loader: "forge",
          gameVersion: "1.20.1",
          installedPackVersion: "2.3.7",
          memoryMb: 6144,
          jvmArgs: [],
        },
      ],
      imports: [],
    });
    Object.defineProperty(window, "__concurrentSetupInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__finishSkyPackInstall", {
      value: () => {
        resolveInstall?.({
          action: "install_pack",
          subjectId: "skypack",
          status: "completed",
          message: "Pack is ready.",
        });
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { profileId?: string; packId?: string }) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "start_launch_process") {
            if (args?.profileId !== "winterpack") throw new Error(`Unexpected launch target: ${args?.profileId}`);
            if (!repaired) {
              throw new Error("launch artifact is missing: asset index is missing. Install or repair the profile before launching.");
            }
            return {
              id: "winterpack-process",
              processId: 4300,
              command: {
                executable: "javaw.exe",
                args: ["-Xmx6144M", "net.minecraft.client.main.Main"],
                workingDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/profiles/winterpack",
                env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
              },
              state: "running",
              startedAtUnixSeconds: 1_710_000_000,
              runtimeSeconds: 1,
              totalOutputLineCount: 0,
              droppedOutputLineCount: 0,
              output: [],
            };
          }
          if (cmd === "plan_install_pack") {
            if (args?.packId !== "skypack") throw new Error(`Unexpected install target: ${args?.packId}`);
            return {
              operationId: "00000000-0000-4000-8000-000000000501",
              operation: "install_pack",
              subjectId: "skypack",
              events: [
                { kind: "queued", message: "Install queued for SkyPack", progressPercent: 0 },
                { kind: "completed", message: "Prepare plan is ready to execute.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "install_pack") {
            installStarted = true;
            return new Promise((resolve) => {
              resolveInstall = resolve;
            });
          }
          if (cmd === "plan_repair_profile") {
            if (args?.profileId !== "winterpack") throw new Error(`Unexpected setup target: ${args?.profileId}`);
            return {
              operationId: "00000000-0000-4000-8000-000000000502",
              operation: "repair_profile",
              subjectId: "winterpack",
              events: [
                { kind: "queued", message: "Setup queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Setup is ready to start.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "repair_profile") {
            if (args?.profileId !== "winterpack") throw new Error(`Unexpected repair target: ${args?.profileId}`);
            repairAttempts += 1;
            if (repairAttempts === 1) {
              throw new Error("Profile repair failed: asset index is missing");
            }
            repaired = true;
            return {
              action: "repair_profile",
              subjectId: "winterpack",
              status: "completed",
              message: "Profile repair completed.",
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.locator(".pack-card").filter({ hasText: "SkyPack" }).getByRole("button", { name: /Install|Set up/ }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __concurrentSetupInvokes: string[] }).__concurrentSetupInvokes.filter(
            (cmd) => cmd === "install_pack",
          ).length,
      ),
    )
    .toBe(1);

  await page.getByRole("button", { name: "Library" }).click();
  await page.locator(".profile-row").filter({ hasText: "WinterPack" }).getByRole("button", { name: "Play" }).click();
  const recoveryAction = page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Try play again" });
  await expect(recoveryAction).toBeEnabled();
  await expect(recoveryAction).toBeEnabled();
  await recoveryAction.click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __concurrentSetupInvokes: string[] }).__concurrentSetupInvokes.filter(
            (cmd) => cmd === "repair_profile",
          ).length,
      ),
    )
    .toBeGreaterThanOrEqual(2);

  await page.evaluate(() => (window as typeof window & { __finishSkyPackInstall: () => void }).__finishSkyPackInstall());
  const invoked = await page.evaluate(() => (window as typeof window & { __concurrentSetupInvokes: string[] }).__concurrentSetupInvokes);
  expect(invoked.indexOf("install_pack")).toBeLessThan(invoked.indexOf("plan_repair_profile"));
  expect(invoked.indexOf("repair_profile")).toBeGreaterThan(invoked.indexOf("install_pack"));
  expect(invoked.lastIndexOf("start_launch_process")).toBeGreaterThan(invoked.lastIndexOf("repair_profile"));
});

test("library profile launch actions hide manual repair", async ({ page }) => {
  await page.addInitScript(() => {
    let repaired = false;
    const invoked: string[] = [];
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: [
        {
          id: "manual-forge",
          name: "Manual Forge",
          loader: "forge",
          gameVersion: "1.20.1",
          memoryMb: 6144,
          jvmArgs: repaired ? ["-Drepaired=true"] : [],
        },
      ],
      imports: [],
    });

    Object.defineProperty(window, "__libraryRepairInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "plan_repair_profile") {
            return {
              operationId: "00000000-0000-4000-8000-000000000191",
              operation: "repair_profile",
              subjectId: "manual-forge",
              events: [
                { kind: "queued", message: "Setup queued for Manual Forge", progressPercent: 0 },
                { kind: "completed", message: "Setup is ready to start.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "repair_profile") {
            repaired = true;
            return {
              action: "repair_profile",
              subjectId: "manual-forge",
              status: "completed",
              message: "Profile repair completed.",
            };
          }
          if (cmd === "list_launcher_events") {
            return [
              {
                id: "library-repair-completed",
                operationId: "00000000-0000-4000-8000-000000000191",
                operation: "repair_profile",
                subjectId: "manual-forge",
                kind: "completed",
                message: "Profile repair completed.",
                progressPercent: 100,
                occurredAtUnixSeconds: 1_710_000_000,
              },
            ];
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");

  await page.getByRole("button", { name: "Library" }).click();
  const profile = page.locator(".profile-row").filter({ hasText: "Manual Forge" });
  await expect(profile.getByLabel("Manual Forge launch actions")).not.toContainText("Repair");
  await expect(profile.getByLabel("Manual Forge launch actions").getByRole("button", { name: "Play" })).toBeVisible();
  await expect(profile.getByLabel("Manual Forge launch actions")).not.toContainText("Check launch");
  await expect(page.getByLabel("Manual Forge profile summary")).not.toContainText("Java launch options");
  const invoked = await page.evaluate(() => (window as typeof window & { __libraryRepairInvokes: string[] }).__libraryRepairInvokes);
  expect(invoked).not.toContain("plan_repair_profile");
  expect(invoked).not.toContain("repair_profile");
});

test("failed native repair surfaces the failed launcher event", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    let callbackId = 1;
    const callbacks = new Map<number, (...args: unknown[]) => unknown>();
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Cozy survival with friends.",
          version: "10/30/2025",
          status: "repair_needed",
          accent: "#67e8b9",
          installedPlayers: 0,
          defaultServer: "The Cabin",
        },
      ],
      profiles: [
        {
          id: "winterpack",
          name: "WinterPack",
          loader: "forge",
          gameVersion: "1.20.1",
          installedPackVersion: "10/30/2025",
          memoryMb: 6144,
          jvmArgs: [],
        },
      ],
      imports: [],
    });

    Object.defineProperty(window, "__failedRepairInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "plan_repair_profile") {
            return {
              operationId: "00000000-0000-4000-8000-000000000092",
              operation: "repair_profile",
              subjectId: "winterpack",
              events: [
                { kind: "queued", message: "Setup queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Setup is ready to start.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "repair_profile") {
            throw new Error("Profile repair failed: asset index is missing");
          }
          if (cmd === "start_launch_process") {
            throw new Error("launch artifact is missing: asset index is missing. Install or repair the profile before launching.");
          }
          if (cmd === "list_launcher_events") {
            return [
              {
                id: "repair-failed",
                operationId: "00000000-0000-4000-8000-000000000093",
                operation: "repair_profile",
                subjectId: "winterpack",
                kind: "failed",
                message: "Profile repair failed: asset index is missing",
                progressPercent: 100,
                occurredAtUnixSeconds: 1_710_000_000,
              },
            ];
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: (callback: (...args: unknown[]) => unknown) => {
          const id = callbackId++;
          callbacks.set(id, callback);
          return id;
        },
        unregisterCallback: (id: number) => {
          callbacks.delete(id);
        },
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");

  await page.getByLabel("Primary pack actions").getByRole("button", { name: "Play" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "History", exact: true })).toHaveClass(/active/);
  await expect(page.getByRole("complementary")).toContainText("Setup failed: asset index is missing");
  await expect(page.getByText("Install or repair")).toHaveCount(0);
  const failedEvent = page.locator(".event-row").filter({ hasText: "Setup failed: asset index is missing" });
  await expect(failedEvent).toBeVisible();
  await expect(failedEvent.getByRole("button", { name: "Try play again" })).toBeVisible();
  await expect(failedEvent.getByRole("button", { name: "Set up files" })).toHaveCount(0);
  await expect(page.locator(".event-row").filter({ hasText: "Setup is ready to start." })).toHaveCount(0);
  await failedEvent.getByRole("button", { name: "Try play again" }).click();
  await expect(page.getByRole("complementary")).toContainText("Setup failed: asset index is missing");

  const invoked = await page.evaluate(
    () => (window as typeof window & { __failedRepairInvokes: string[] }).__failedRepairInvokes,
  );
  expect(invoked.filter((cmd) => cmd === "plan_repair_profile")).toHaveLength(2);
  expect(invoked.filter((cmd) => cmd === "repair_profile")).toHaveLength(2);
  expect(invoked.indexOf("list_launcher_events", invoked.indexOf("repair_profile"))).toBeGreaterThan(
    invoked.indexOf("repair_profile"),
  );
});

test("home repair action shows pending native repair state", async ({ page }) => {
  await page.addInitScript(() => {
    let repaired = false;
    let callbackId = 1;
    let completeRepair: ((value: unknown) => void) | null = null;
    const invoked: string[] = [];
    const callbacks = new Map<number, (...args: unknown[]) => unknown>();
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [
        {
          id: "1",
          name: "Dylan",
          avatarColor: "#67e8b9",
          state: "playing",
          packName: "WinterPack",
          serverName: "The Cabin",
          joinable: true,
        },
        {
          id: "2",
          name: "Alex",
          avatarColor: "#8b5cf6",
          state: "playing",
          packName: "Latest Release",
          serverName: "The Cabin",
          joinable: true,
        },
      ],
      packs: [
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Cozy survival with friends.",
          version: "10/30/2025",
          status: repaired ? "installed" : "repair_needed",
          accent: "#67e8b9",
          installedPlayers: 0,
          defaultServer: "The Cabin",
        },
      ],
      profiles: [
        {
          id: "winterpack",
          name: "WinterPack",
          loader: "forge",
          gameVersion: "1.20.1",
          installedPackVersion: "10/30/2025",
          memoryMb: 6144,
          jvmArgs: [],
        },
      ],
      imports: [],
    });

    Object.defineProperty(window, "__pendingRepairInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__completePendingRepair", {
      value: () => {
        repaired = true;
        completeRepair?.({
          action: "repair_profile",
          subjectId: "winterpack",
          status: "completed",
          message: "Profile setup completed.",
        });
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "plan_repair_profile") {
            return {
              operationId: "00000000-0000-4000-8000-000000000097",
              operation: "repair_profile",
              subjectId: "winterpack",
              events: [
                { kind: "queued", message: "Setup queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Setup is ready to start.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "repair_profile") {
            return new Promise((resolve) => {
              completeRepair = resolve;
            });
          }
          if (cmd === "start_launch_process") {
            throw new Error("launch artifact is missing: asset index is missing. Install or repair the profile before launching.");
          }
          if (cmd === "list_launcher_events") {
            return [
              repaired
                ? {
                    id: "repair-completed",
                    operationId: "00000000-0000-4000-8000-000000000097",
                    operation: "repair_profile",
                    subjectId: "winterpack",
                    kind: "completed",
                    message: "Profile setup completed.",
                    progressPercent: 100,
                    occurredAtUnixSeconds: 1_710_000_000,
                  }
                : {
                    id: "repair-active",
                    operationId: "00000000-0000-4000-8000-000000000097",
                    operation: "repair_profile",
                    subjectId: "winterpack",
                    kind: "active",
                    message: "Setting up profile files",
                    progressPercent: 45,
                    occurredAtUnixSeconds: 1_710_000_000,
                  },
            ];
          }
          if (cmd === "list_managed_processes") {
            return [
              {
                id: "exited-winterpack",
                processId: 4300,
                command: {
                  executable: "javaw.exe",
                  args: ["-Xmx6144M", "net.minecraft.client.main.Main"],
                  workingDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/profiles/winterpack",
                  env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
                },
                state: "exited",
                exitCode: 0,
                startedAtUnixSeconds: 1_710_000_000,
                exitedAtUnixSeconds: 1_710_000_020,
                runtimeSeconds: 20,
                totalOutputLineCount: 1,
                droppedOutputLineCount: 0,
                output: [{ stream: "stdout", line: "Ready after previous launch" }],
              },
            ];
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: (callback: (...args: unknown[]) => unknown) => {
          const id = callbackId++;
          callbacks.set(id, callback);
          return id;
        },
        unregisterCallback: (id: number) => {
          callbacks.delete(id);
        },
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");

  await page.getByLabel("Primary pack actions").getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "History", exact: true })).toHaveClass(/active/);
  const pendingRepairPlanEvent = page.locator(".event-row").filter({ hasText: "Setup is ready to start." });
  await expect(pendingRepairPlanEvent).toBeVisible();
  await expect(pendingRepairPlanEvent.getByRole("button", { name: "Play" })).toHaveCount(0);
  await page.locator("nav").getByRole("button", { name: "Home" }).click();
  await expect(page.getByLabel("Primary pack actions").getByRole("button", { name: "Setting up..." })).toBeDisabled();
  await expect(page.getByLabel("Primary pack actions").getByRole("button", { name: "Busy" })).toHaveCount(0);
  await expect(page.locator(".home-library-row").filter({ hasText: "WinterPack" }).locator(".play-icon-button")).toBeDisabled();
  const pendingHomeFriend = page.getByLabel("Home party panel").locator(".friend-row").filter({ hasText: "Alex" });
  await expect(pendingHomeFriend.getByRole("button", { name: "Join" })).toBeEnabled();
  await page.getByRole("button", { name: "Library" }).click();
  const pendingProfileActions = page.getByLabel("WinterPack launch actions");
  await expect(pendingProfileActions.getByRole("button", { name: "Busy" })).toHaveCount(0);
  await expect(pendingProfileActions.getByRole("button", { name: "Setting up..." })).toBeDisabled();
  await expect(pendingProfileActions.getByRole("button", { name: "Repairing..." })).toHaveCount(0);
  await page.getByRole("button", { name: "Friends" }).click();
  const pendingRosterFriend = page.locator(".friend-row").filter({ hasText: "Alex" }).filter({ hasText: "The Cabin" });
  await expect(pendingRosterFriend.getByRole("button", { name: "Join" })).toBeEnabled();
  await page.getByRole("button", { name: "Activity" }).click();
  await page.getByLabel("Activity views").getByRole("button", { name: "Games" }).click();
  const exitedProcessActions = page.locator(".process-row").filter({ hasText: "Ready after previous launch" }).getByLabel("WinterPack game actions");
  await expect(exitedProcessActions.getByRole("button", { name: "Setting up..." })).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(() => (window as typeof window & { __pendingRepairInvokes: string[] }).__pendingRepairInvokes),
    )
    .toContain("repair_profile");

  const invokedWhilePending = await page.evaluate(
    () => (window as typeof window & { __pendingRepairInvokes: string[] }).__pendingRepairInvokes,
  );
  expect(invokedWhilePending.filter((cmd) => cmd === "repair_profile")).toHaveLength(1);

  await page.evaluate(() =>
    (window as typeof window & { __completePendingRepair: () => void }).__completePendingRepair(),
  );

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await page.getByLabel("Activity views").getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("button", { name: "History", exact: true })).toHaveClass(/active/);
  const completedRepairEvent = page.locator(".event-row").filter({ hasText: "Files are ready." });
  await expect(completedRepairEvent).toBeVisible();
  await expect(completedRepairEvent.getByRole("button", { name: "Play" })).toBeEnabled();
  const invoked = await page.evaluate(
    () => (window as typeof window & { __pendingRepairInvokes: string[] }).__pendingRepairInvokes,
  );
  expect(invoked.filter((cmd) => cmd === "repair_profile")).toHaveLength(1);
});

test("friend join action explains desktop app requirement in web preview", async ({ page }) => {
  await page.goto("/");

  await page.locator(".friend-row").filter({ hasText: "Dylan" }).getByRole("button", { name: "Join" }).click();

  await expect(page.getByText("Friend joins require the desktop app")).toBeVisible();
});

test("friend join is disabled while native server launch is pending", async ({ page }) => {
  await page.addInitScript(() => {
    let joined = false;
    let resolveJoin: ((process: unknown) => void) | undefined;
    const invoked: string[] = [];
    const process = {
      id: "managed-join-process",
      processId: 4242,
      command: {
        executable: "javaw.exe",
        args: ["--server", "play.theboys.example", "--port", "25565"],
        workingDir: "C:/launcher/profiles/winterpack",
        env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
      },
      state: "running",
      startedAtUnixSeconds: 1_710_000_000,
      runtimeSeconds: 1,
      totalOutputLineCount: 1,
      droppedOutputLineCount: 0,
      output: [{ stream: "stdout", line: "Joined The Cabin after pending guard" }],
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [
        {
          id: "friend-dylan",
          name: "Dylan",
          avatarColor: "#67e8b9",
          state: "playing",
          packName: "WinterPack",
          serverName: "The Cabin",
          joinable: true,
        },
      ],
      packs: [
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Cozy survival with friends.",
          version: "2.3.7",
          status: "installed",
          accent: "#67e8b9",
          installedPlayers: 1,
          defaultServer: "The Cabin",
        },
      ],
      profiles: [
        {
          id: "winterpack",
          name: "WinterPack",
          loader: "forge",
          gameVersion: "1.20.1",
          installedPackVersion: "2.3.7",
          memoryMb: 6144,
          jvmArgs: [],
        },
      ],
      imports: [],
    });

    Object.defineProperty(window, "__resolvePendingFriendJoin", {
      value: () => {
        joined = true;
        resolveJoin?.(process);
      },
      configurable: true,
    });
    Object.defineProperty(window, "__pendingFriendJoinInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return joined ? [process] : [];
          if (cmd === "start_launch_process_for_server") {
            return new Promise((resolve) => {
              resolveJoin = resolve;
            });
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Friends" }).click();
  await page.evaluate(() => {
    const button = [...document.querySelectorAll<HTMLButtonElement>(".friend-row button")].find((candidate) =>
      candidate.textContent?.includes("Join"),
    );
    button?.click();
    button?.click();
  });

  const friendActions = page.locator(".friend-row").filter({ hasText: "Dylan" }).locator(".friend-actions");
  await expect(friendActions.getByRole("button", { name: "Launching..." })).toBeDisabled();
  let invoked = await page.evaluate(
    () => (window as typeof window & { __pendingFriendJoinInvokes: string[] }).__pendingFriendJoinInvokes,
  );
  expect(invoked.filter((cmd) => cmd === "start_launch_process_for_server")).toHaveLength(1);

  await page.evaluate(() => {
    (window as typeof window & { __resolvePendingFriendJoin: () => void }).__resolvePendingFriendJoin();
  });
  await expect(page.locator(".process-row").filter({ hasText: "Joined The Cabin after pending guard" })).toContainText(
    "Running",
  );
  invoked = await page.evaluate(
    () => (window as typeof window & { __pendingFriendJoinInvokes: string[] }).__pendingFriendJoinInvokes,
  );
  expect(invoked.filter((cmd) => cmd === "start_launch_process_for_server")).toHaveLength(1);
});

test("friend join auto-installs Java and retries native server launch", async ({ page }) => {
  await page.route("http://127.0.0.1:4074/dev/sessions", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        accountId: "00000000-0000-4000-8000-000000000001",
        tokenType: "Bearer",
        sessionKind: "dev",
        authorizationHeader: "Bearer test-session",
        accessToken: "test-session",
        issuedAtUnixSeconds: 1,
        expiresAtUnixSeconds: 9_999_999_999,
      }),
    });
  });
  await page.route("http://127.0.0.1:4074/presence/**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
      body: "{}",
    });
  });
  await page.addInitScript(() => {
    const invoked: string[] = [];
    let joinAttempts = 0;
    let runtimeInstalled = false;
    const javaFailure =
      "Minecraft requires Java 21 or newer, but discovered Java 17 at C:/Java/17/bin/java.exe. Install a managed Java runtime from Settings before launching.";
    const downloadPlan = {
      versionId: "temurin-21-windows-x64",
      totalBytes: 1234,
      items: [
        {
          id: "java-runtime-archive-temurin-21-windows-x64",
          kind: "java_runtime_archive",
          url: "https://downloads.example/temurin-21.zip",
          destination: "C:/Users/test/AppData/Local/TheBoysLauncher/cache/java/temurin-21.zip",
          size: 1234,
        },
      ],
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [
        {
          id: "friend-dylan",
          name: "Dylan",
          avatarColor: "#67e8b9",
          state: "playing",
          packName: "WinterPack",
          serverName: "The Cabin",
          joinable: true,
        },
      ],
      packs: [
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Cozy survival with friends.",
          version: "2.3.7",
          status: "installed",
          accent: "#67e8b9",
          installedPlayers: 1,
          defaultServer: "The Cabin",
        },
      ],
      profiles: [
        {
          id: "winterpack",
          name: "WinterPack",
          loader: "forge",
          gameVersion: "1.20.1",
          installedPackVersion: "2.3.7",
          memoryMb: 6144,
          jvmArgs: [],
        },
      ],
      imports: [],
    });

    Object.defineProperty(window, "__friendJoinJavaInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "start_launch_process_for_server") {
            joinAttempts += 1;
            if (joinAttempts === 1) throw new Error(javaFailure);
            return {
              id: "winterpack-java-join-process",
              processId: 4309,
              command: {
                executable: "javaw.exe",
                args: ["-Xmx6144M", "net.minecraft.client.main.Main", "--server", "play.theboys.example"],
                workingDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/profiles/winterpack",
                env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
              },
              state: "running",
              startedAtUnixSeconds: 1_710_000_002,
              runtimeSeconds: 0,
              totalOutputLineCount: 1,
              droppedOutputLineCount: 0,
              output: [{ stream: "stdout", line: "Joined The Cabin with Java 21" }],
            };
          }
          if (cmd === "recommended_java_runtime_manifest") {
            return [
              {
                runtimeId: "temurin-21-windows-x64",
                label: "Temurin 21 LTS",
                vendor: "Eclipse Adoptium",
                majorVersion: 21,
                platform: "windows-x64",
                url: "https://downloads.example/temurin-21.zip",
                archiveFileName: "temurin-21-windows-x64.zip",
                notes: "Recommended for Minecraft 1.20.5 and newer.",
              },
            ];
          }
          if (cmd === "build_managed_java_runtime_download_plan") return downloadPlan;
          if (cmd === "execute_download_plan") {
            return {
              operation: "download_artifacts",
              subject: "temurin-21-windows-x64",
              events: [{ kind: "completed", message: "Java runtime archive downloaded.", progressPercent: 100 }],
            };
          }
          if (cmd === "execute_managed_java_runtime_install") {
            runtimeInstalled = true;
            return {
              operation: "install_java_runtime",
              subject: "temurin-21-windows-x64",
              events: [{ kind: "completed", message: "Java runtime temurin-21-windows-x64 is installed.", progressPercent: 100 }],
            };
          }
          if (cmd === "discover_java_runtimes") {
            return [
              {
                id: runtimeInstalled ? "java-21-temurin" : "java-17",
                path: runtimeInstalled
                  ? "C:/Users/test/AppData/Roaming/TheBoysLauncher/runtimes/temurin-21-windows-x64/bin/java.exe"
                  : "C:/Java/17/bin/java.exe",
                version: runtimeInstalled ? "21.0.6" : "17.0.12",
                majorVersion: runtimeInstalled ? 21 : 17,
                source: runtimeInstalled ? "bundled" : "path",
              },
            ];
          }
          if (cmd === "list_launcher_events") {
            return [
              {
                id: "join-java-launch-failed",
                operationId: "00000000-0000-4000-8000-000000000244",
                operation: "launch_profile",
                subjectId: "winterpack",
                kind: "failed",
                message: javaFailure,
                progressPercent: 100,
                occurredAtUnixSeconds: 1_710_000_000,
              },
            ];
          }
          if (cmd === "list_managed_processes") {
            return joinAttempts > 1
              ? [
                  {
                    id: "winterpack-java-join-process",
                    processId: 4309,
                    command: {
                      executable: "javaw.exe",
                      args: ["-Xmx6144M", "net.minecraft.client.main.Main", "--server", "play.theboys.example"],
                      workingDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/profiles/winterpack",
                      env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
                    },
                    state: "running",
                    startedAtUnixSeconds: 1_710_000_002,
                    runtimeSeconds: 0,
                    totalOutputLineCount: 1,
                    droppedOutputLineCount: 0,
                    output: [{ stream: "stdout", line: "Joined The Cabin with Java 21" }],
                  },
                ]
              : [];
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Friends" }).click();
  await page.locator(".friend-row").filter({ hasText: "Dylan" }).getByRole("button", { name: "Join" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await page.getByLabel("Activity views").getByRole("button", { name: "Games" }).click();
  await expect(page.locator(".process-row").filter({ hasText: "Joined The Cabin with Java 21" })).toBeVisible();
  await expect(page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Prepare Java" })).toHaveCount(0);

  const invoked = await page.evaluate(() => (window as typeof window & { __friendJoinJavaInvokes: string[] }).__friendJoinJavaInvokes);
  expect(invoked.filter((cmd) => cmd === "start_launch_process_for_server")).toHaveLength(2);
  expect(invoked).toContain("recommended_java_runtime_manifest");
  expect(invoked).toContain("execute_managed_java_runtime_install");
});

test("friend join updates pack before native server launch", async ({ page }) => {
  const accountId = "00000000-0000-4000-8000-000000000001";
  let presenceBody = "";
  await page.route("http://127.0.0.1:4074/**", async (route) => {
    const request = route.request();
    const corsHeaders = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (request.url().endsWith("/dev/sessions")) {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          tokenType: "Bearer",
          sessionKind: "dev",
          authorizationHeader: "Bearer test-session",
          accessToken: "test-session",
          issuedAtUnixSeconds: 1,
          expiresAtUnixSeconds: 9_999_999_999,
        }),
      });
      return;
    }
    if (request.url().endsWith("/presence")) {
      await route.fulfill({
        status: 503,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: "{}",
      });
      return;
    }
    if (request.url().endsWith(`/presence/${accountId}`)) {
      presenceBody = request.postData() ?? "";
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          state: "playing",
          packId: "winterpack",
          serverId: "The Cabin",
          updatedAt: "2026-06-25T12:00:00Z",
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, headers: corsHeaders });
  });
  await page.addInitScript(() => {
    const invoked: string[] = [];
    const process = {
      id: "managed-join-process",
      processId: 4242,
      command: {
        executable: "javaw.exe",
        args: ["--server", "play.theboys.example", "--port", "25565"],
        workingDir: "C:/launcher/profiles/winterpack",
        env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
      },
      state: "running",
      exitCode: null,
      stopRequested: false,
      startedAtUnixSeconds: 1_710_000_000,
      exitedAtUnixSeconds: null,
      runtimeSeconds: 1,
      totalOutputLineCount: 1,
      droppedOutputLineCount: 0,
      output: [{ stream: "stdout", line: "Joining The Cabin" }],
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [
        {
          id: "friend-dylan",
          name: "Dylan",
          avatarColor: "#67e8b9",
          state: "playing",
          packName: "WinterPack",
          serverName: "The Cabin",
          joinable: true,
        },
      ],
      packs: [
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Cozy survival with friends.",
          version: "2.3.7",
          status: (window as typeof window & { __joinPackInstalled?: boolean }).__joinPackInstalled
            ? "installed"
            : "update_available",
          accent: "#67e8b9",
          installedPlayers: 1,
          defaultServer: "The Cabin",
        },
      ],
      profiles: [
        {
          id: "winterpack",
          name: "WinterPack",
          loader: "forge",
          gameVersion: "1.20.1",
          installedPackVersion: (window as typeof window & { __joinPackInstalled?: boolean }).__joinPackInstalled
            ? "2.3.7"
            : "2.3.6",
          memoryMb: 6144,
          jvmArgs: [],
        },
      ],
      imports: [],
    });

    Object.defineProperty(window, "__friendJoinUpdateInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "plan_install_pack") {
            return {
              operationId: "00000000-0000-4000-8000-000000000094",
              operation: "install_pack",
              subjectId: "winterpack",
              events: [
                { kind: "queued", message: "Update queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Update plan is ready to execute.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "install_pack") {
            Object.defineProperty(window, "__joinPackInstalled", {
              value: true,
              configurable: true,
            });
            return {
              action: "install_pack",
              subjectId: "winterpack",
              status: "completed",
              message: "Pack updated successfully.",
            };
          }
          if (cmd === "list_launcher_events") return [];
          if (cmd === "start_launch_process_for_server") return process;
          if (cmd === "list_managed_processes") return [process];
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Friends" }).click();
  await page.locator(".friend-row").filter({ hasText: "Dylan" }).getByRole("button", { name: "Join" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("complementary")).toContainText(
    /Joining Dylan with your Minecraft account|Presence shared for The Cabin/,
  );
  await expect(page.getByRole("complementary")).not.toContainText("stored session");
  await expect(page.getByRole("complementary")).not.toContainText("Authenticated join queued");
  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Games" })).toHaveClass(/active/);
  await expect(page.locator(".process-row").filter({ hasText: "Joining The Cabin" })).toBeVisible();
  await expect.poll(() => presenceBody).toContain("winterpack");
  const invoked = await page.evaluate(
    () => (window as typeof window & { __friendJoinUpdateInvokes: string[] }).__friendJoinUpdateInvokes,
  );
  expect(invoked.indexOf("plan_install_pack")).toBeLessThan(invoked.indexOf("install_pack"));
  expect(invoked.indexOf("install_pack")).toBeLessThan(invoked.indexOf("start_launch_process_for_server"));
  expect(JSON.parse(presenceBody)).toEqual({
    state: "playing",
    packId: "winterpack",
    serverId: "The Cabin",
  });
});

test("friend join surfaces native launch preflight repair recovery", async ({ page }) => {
  let devSessionRequests = 0;
  await page.route("http://127.0.0.1:4074/dev/sessions", async (route) => {
    devSessionRequests += 1;
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        accountId: "00000000-0000-4000-8000-000000000001",
        tokenType: "Bearer",
        sessionKind: "dev",
        authorizationHeader: "Bearer test-session",
        accessToken: "test-session",
        issuedAtUnixSeconds: 1,
        expiresAtUnixSeconds: 9_999_999_999,
      }),
    });
  });
  await page.addInitScript(() => {
    let repaired = false;
    let callbackId = 1;
    const invoked: string[] = [];
    const callbacks = new Map<number, (...args: unknown[]) => unknown>();
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [
        {
          id: "friend-dylan",
          name: "Dylan",
          avatarColor: "#67e8b9",
          state: "playing",
          packName: "WinterPack",
          serverName: "The Cabin",
          joinable: true,
        },
      ],
      packs: [
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Cozy survival with friends.",
          version: "2.3.7",
          status: "installed",
          accent: "#67e8b9",
          installedPlayers: 1,
          defaultServer: "The Cabin",
        },
      ],
      profiles: [
        {
          id: "winterpack",
          name: "WinterPack",
          loader: "forge",
          gameVersion: "1.20.1",
          installedPackVersion: "2.3.7",
          memoryMb: 6144,
          jvmArgs: [],
        },
      ],
      imports: [],
    });

    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "start_launch_process_for_server") {
            if (repaired) {
              return {
                id: "winterpack-join-process",
                processId: 4302,
                command: {
                  executable: "javaw.exe",
                  args: ["-Xmx6144M", "net.minecraft.client.main.Main", "--server", "play.theboys.example"],
                  workingDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/profiles/winterpack",
                  env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
                },
                state: "running",
                startedAtUnixSeconds: 1_710_000_002,
                runtimeSeconds: 0,
                totalOutputLineCount: 0,
                droppedOutputLineCount: 0,
                output: [],
              };
            }
            throw new Error("natives directory is missing: C:/cache/natives/1.20.1.");
          }
          if (cmd === "plan_repair_profile") {
            return {
              operationId: "00000000-0000-4000-8000-000000000096",
              operation: "repair_profile",
              subjectId: "winterpack",
              events: [
                { kind: "queued", message: "Setup queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Setup is ready to start.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "list_managed_processes") {
            return repaired
              ? [
                  {
                    id: "winterpack-join-process",
                    processId: 4302,
                    command: {
                      executable: "javaw.exe",
                      args: ["-Xmx6144M", "net.minecraft.client.main.Main", "--server", "play.theboys.example"],
                      workingDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/profiles/winterpack",
                      env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
                    },
                    state: "running",
                    startedAtUnixSeconds: 1_710_000_002,
                    runtimeSeconds: 0,
                    totalOutputLineCount: 0,
                    droppedOutputLineCount: 0,
                    output: [],
                  },
                ]
              : [];
          }
          if (cmd === "repair_profile") {
            repaired = true;
            return {
              action: "repair_profile",
              subjectId: "winterpack",
              status: "completed",
              message: "Profile repair completed.",
            };
          }
          if (cmd === "list_launcher_events") {
            const events = [
              {
                id: "join-launch-failed",
                operationId: "00000000-0000-4000-8000-000000000095",
                operation: "launch_profile",
                subjectId: "winterpack",
                kind: "failed",
                message: "natives directory is missing: C:/cache/natives/1.20.1.",
                progressPercent: 100,
                occurredAtUnixSeconds: 1_710_000_000,
              },
            ];
            if (repaired) {
              events.push({
                id: "join-repair-completed",
                operationId: "00000000-0000-4000-8000-000000000096",
                operation: "repair_profile",
                subjectId: "winterpack",
                kind: "completed",
                message: "Profile repair completed.",
                progressPercent: 100,
                occurredAtUnixSeconds: 1_710_000_001,
              });
            }
            return events;
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: (callback: (...args: unknown[]) => unknown) => {
          const id = callbackId++;
          callbacks.set(id, callback);
          return id;
        },
        unregisterCallback: (id: number) => {
          callbacks.delete(id);
        },
      },
      configurable: true,
    });
    Object.defineProperty(window, "__friendJoinRecoveryInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });
  await page.goto("/");
  await expect.poll(() => devSessionRequests).toBeGreaterThanOrEqual(1);

  await page.getByRole("button", { name: "Friends" }).click();
  await page.locator(".friend-row").filter({ hasText: "Dylan" }).getByRole("button", { name: "Join" }).click();

  expect(devSessionRequests).toBeLessThanOrEqual(8);
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("complementary")).toContainText("Joining The Cabin");
  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Games" })).toHaveClass(/active/);
  await expect(page.locator(".process-row").filter({ hasText: "javaw.exe" })).toBeVisible();
  const invoked = await page.evaluate(() => (window as typeof window & { __friendJoinRecoveryInvokes: string[] }).__friendJoinRecoveryInvokes);
  expect(invoked.filter((cmd) => cmd === "start_launch_process_for_server")).toHaveLength(2);
  expect(invoked.indexOf("list_launcher_events")).toBeLessThan(invoked.indexOf("plan_repair_profile"));
  expect(invoked.indexOf("plan_repair_profile")).toBeLessThan(invoked.indexOf("repair_profile"));
  expect(invoked.indexOf("start_launch_process_for_server", invoked.indexOf("repair_profile"))).toBeGreaterThan(
    invoked.indexOf("repair_profile"),
  );
  expect(invoked).not.toContain("start_launch_process");
  expect(invoked.indexOf("bootstrap_snapshot", invoked.indexOf("repair_profile"))).toBeGreaterThan(invoked.indexOf("repair_profile"));
  expect(invoked.indexOf("list_launcher_events", invoked.indexOf("repair_profile"))).toBeGreaterThan(invoked.indexOf("repair_profile"));
});

test("library new profile action creates a preview profile", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Library" }).click();
  await page.getByRole("button", { name: "New Instance" }).click();
  await expect(page.getByLabel("New profile editor")).toBeVisible();
  await page.getByLabel("New profile name").fill("");
  await expect(page.getByRole("button", { name: "Create profile" })).toBeDisabled();
  await page.getByLabel("New profile name").fill("Preview NeoForge");
  await page.getByLabel("New profile version channel").selectOption("snapshot");
  await expect(page.getByText("No snapshots are available right now. Try Releases or refresh later.")).toBeVisible();
  await expect(page.getByLabel("New profile game version")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Create profile" })).toBeDisabled();
  await page.getByLabel("New profile version channel").selectOption("release");
  await page.getByLabel("New profile game version").selectOption("1.21.1");
  await expect(page.getByLabel("New profile memory")).toBeVisible();
  await page.getByLabel("New profile memory").fill("7168");
  await expect(page.getByLabel("New profile advanced settings")).toHaveCount(0);
  await expect(page.getByLabel("New profile loader")).toHaveCount(0);
  await page.getByRole("button", { name: "Advanced" }).click();
  await expect(page.getByLabel("New profile advanced settings")).toBeVisible();
  await page.getByLabel("New profile loader").selectOption("neoforge");
  await page.getByLabel("New profile game version").selectOption("1.21.8");
  await expect(page.getByLabel("New profile loader")).toHaveValue("vanilla");
  await expect(page.getByLabel("New profile loader").locator("option", { hasText: "NeoForge" })).toHaveCount(0);
  await expect(page.getByLabel("New profile advanced settings")).toContainText(
    "Only loaders the launcher can prepare for this Minecraft version are shown.",
  );
  await page.getByLabel("New profile game version").selectOption("1.21.1");
  await expect(page.getByLabel("New profile loader").locator("option", { hasText: "NeoForge" })).toHaveCount(1);
  await page.getByLabel("New profile loader").selectOption("neoforge");
  await expect(page.getByRole("button", { name: "Create profile" })).toBeEnabled();
  await page.getByRole("button", { name: "Create profile" }).click();

  await expect(page.getByText("Preview NeoForge created in preview")).toBeVisible();
  await expect(page.getByText("Creating profile is mocked in web preview")).toHaveCount(0);
  const profile = page.locator(".profile-row").filter({ hasText: "Preview NeoForge" });
  await expect(profile.getByLabel("Preview NeoForge profile summary")).toContainText("1.21.1");
  await expect(profile.getByLabel("Preview NeoForge profile summary")).toContainText("NeoForge");
  await expect(profile.getByLabel("Preview NeoForge profile summary")).toContainText("7 GB RAM");
});

test("library profile editor saves preview changes", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Library" }).click();
  const profile = page.locator(".profile-row").filter({ hasText: "WinterPack" });
  await expect(page.getByLabel("WinterPack profile summary")).toContainText("1280x720");
  await expect(page.getByLabel("WinterPack profile summary")).toContainText("The Cabin");
  await expect(page.getByLabel("WinterPack profile summary")).not.toContainText("Java launch options");
  await expect(page.getByLabel("WinterPack launch actions")).toContainText("Play");
  await expect(page.getByLabel("WinterPack launch actions")).not.toContainText("Repair");
  await expect(page.getByLabel("WinterPack launch actions")).not.toContainText("Check launch");
  await expect(page.getByLabel("WinterPack launch actions")).not.toContainText("Folder");
  await expect(page.getByLabel("WinterPack edit actions")).toContainText("Customize");
  await expect(page.getByLabel("WinterPack edit actions")).toContainText("More");
  await expect(page.getByLabel("WinterPack edit actions")).not.toContainText("Duplicate");
  await page.getByRole("button", { name: "WinterPack more actions" }).click();
  await expect(page.getByRole("menu", { name: "WinterPack more menu" })).toContainText("Open folder");
  await expect(page.getByRole("menu", { name: "WinterPack more menu" })).toContainText("Customize");
  await expect(page.getByRole("menu", { name: "WinterPack more menu" })).toContainText("Duplicate profile");
  await page.getByRole("button", { name: "WinterPack more actions" }).click();
  await expect(page.getByLabel("WinterPack danger actions")).toHaveCount(0);
  await expect(profile.getByLabel("WinterPack profile editor")).toHaveCount(0);
  await openProfileCustomize(profile);
  await expect(page.getByLabel("WinterPack danger actions")).toContainText("Hide from Library");
  await expect(page.getByLabel("WinterPack danger actions")).toContainText("Delete");
  await expect(profile.getByLabel("WinterPack profile editor")).toBeVisible();
  await expect(page.getByLabel("WinterPack edit actions")).toContainText("Close");
  await expect(page.getByLabel("WinterPack edit actions")).not.toContainText("Unsaved changes");
  await expect(page.getByLabel("WinterPack edit actions")).not.toContainText("Fix highlighted fields");
  await expect(profile.getByLabel("WinterPack memory")).toBeVisible();
  await expect(profile.getByLabel("WinterPack window width")).toHaveCount(0);
  await expect(profile.getByLabel("WinterPack default server address")).toHaveCount(0);
  await profile.getByLabel("WinterPack version channel").selectOption("snapshot");
  await expect(profile.getByLabel("WinterPack game version")).toBeDisabled();
  await profile.getByLabel("WinterPack version channel").selectOption("release");
  await profile.getByLabel("WinterPack game version").selectOption("1.21.1");
  await expect(profile.getByLabel("WinterPack loader")).toHaveCount(0);
  await expect(profile.getByLabel("WinterPack Java launch options")).toHaveCount(0);
  await expect(profile.getByLabel("WinterPack Java path override")).toHaveCount(0);
  await expect(profile.getByText("Leave blank so the launcher picks the right Java automatically.")).toHaveCount(0);
  await expect(profile.getByRole("button", { name: "Check launch" })).toHaveCount(0);
  await profile.getByLabel("WinterPack memory").fill("8192");
  await expect(page.getByLabel("WinterPack edit actions")).toContainText("Unsaved changes");
  await profile.getByRole("button", { name: "Advanced" }).click();
  await expect(profile.getByRole("button", { name: "Check launch" })).toBeVisible();
  await expect(profile.getByLabel("WinterPack advanced profile settings")).toBeVisible();
  await expect(profile.getByText("Leave blank so the launcher picks the right Java automatically.")).toBeVisible();
  await profile.getByLabel("WinterPack window width").fill("1600");
  await profile.getByLabel("WinterPack window height").fill("900");
  await profile.getByLabel("WinterPack default server name").fill("The New Cabin");
  await profile.getByLabel("WinterPack default server address").fill("https://play.new-cabin.local/server");
  await expect(profile.getByText("Enter the server address only, not a full URL.")).toBeVisible();
  await expect(page.getByLabel("WinterPack edit actions")).toContainText("Fix highlighted fields");
  await expect(profile.getByRole("button", { name: "Save" })).toBeDisabled();
  await profile.getByLabel("WinterPack default server address").fill("play.new-cabin.local!");
  await expect(profile.getByText("Use only a normal server address, like play.example.com or 192.168.1.10.")).toBeVisible();
  await expect(page.getByLabel("WinterPack edit actions")).toContainText("Fix highlighted fields");
  await expect(profile.getByRole("button", { name: "Save" })).toBeDisabled();
  await profile.getByLabel("WinterPack default server address").fill("play.new-cabin.local");
  await expect(page.getByLabel("WinterPack edit actions")).toContainText("Unsaved changes");
  await profile.getByLabel("WinterPack default server port").fill("70000");
  await expect(profile.getByText("Use a port from 1 to 65535, or leave it blank.")).toBeVisible();
  await expect(page.getByLabel("WinterPack edit actions")).toContainText("Fix highlighted fields");
  await expect(profile.getByRole("button", { name: "Save" })).toBeDisabled();
  await profile.getByLabel("WinterPack default server port").fill("25566");
  await expect(page.getByLabel("WinterPack edit actions")).toContainText("Unsaved changes");
  await profile.getByLabel("WinterPack loader").selectOption("neoforge");
  await profile.getByLabel("WinterPack game version").selectOption("1.21.8");
  await expect(profile.getByLabel("WinterPack loader")).toHaveValue("vanilla");
  await expect(profile.getByLabel("WinterPack loader").locator("option", { hasText: "NeoForge" })).toHaveCount(0);
  await expect(profile.getByLabel("WinterPack advanced profile settings")).toContainText(
    "Only loaders the launcher can prepare for this Minecraft version are shown.",
  );
  await profile.getByLabel("WinterPack game version").selectOption("1.21.4");
  await profile.getByLabel("WinterPack loader").selectOption("quilt");
  await profile.getByLabel("WinterPack Java launch options").fill("-Dfoo=bar -Dbar=baz");
  await profile.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Profile update saved in web preview")).toBeVisible();
  await expect(page.getByLabel("WinterPack profile summary")).toContainText("1.21.4");
  await expect(page.getByLabel("WinterPack profile summary")).toContainText("Quilt");
  await expect(page.getByLabel("WinterPack profile summary")).toContainText("8 GB RAM");
  await expect(page.getByLabel("WinterPack profile summary")).toContainText("1600x900");
  await expect(page.getByLabel("WinterPack profile summary")).toContainText("The New Cabin");
  await expect(page.getByLabel("WinterPack profile summary")).not.toContainText("Java launch options");

  await openProfileCustomize(profile);
  await expect(profile.getByLabel("WinterPack window width")).toHaveCount(0);
  await expect(profile.getByLabel("WinterPack default server address")).toHaveCount(0);
  await profile.getByRole("button", { name: "Advanced" }).click();
  await expect(profile.getByLabel("WinterPack window width")).toBeVisible();
  await expect(profile.getByLabel("WinterPack default server address")).toBeVisible();
  await profile.getByLabel("WinterPack window width").fill("");
  await profile.getByLabel("WinterPack window height").fill("");
  await profile.getByLabel("WinterPack default server name").fill("");
  await profile.getByLabel("WinterPack default server address").fill("");
  await profile.getByLabel("WinterPack default server port").fill("");
  await profile.getByLabel("WinterPack Java launch options").fill("");
  await profile.getByRole("button", { name: "Save" }).click();

  await expect(page.getByLabel("WinterPack profile summary")).not.toContainText("Default window");
  await expect(page.getByLabel("WinterPack profile summary")).not.toContainText("No default server");
  await expect(page.getByLabel("WinterPack profile summary")).not.toContainText("Java launch options");
});

test("library profile editor can choose snapshot versions from the manifest", async ({ page }) => {
  await page.addInitScript(() => {
    let savedVersion = "1.21.8";
    let prepared = false;
    const updateRequests: unknown[] = [];
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: [
        {
          id: "snapshot-profile",
          name: "Snapshot Profile",
          loader: "vanilla",
          gameVersion: savedVersion,
          memoryMb: 4096,
          jvmArgs: [],
        },
      ],
      imports: [],
    });

    Object.defineProperty(window, "__snapshotProfileUpdateRequests", {
      value: updateRequests,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { request?: { gameVersion?: string } }) => {
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "list_minecraft_versions") {
            return [
              {
                id: "1.21.8",
                versionType: "release",
                url: "https://example.invalid/1.21.8.json",
                releaseTime: "2025-07-17T12:00:00+00:00",
              },
              {
                id: "26w01a",
                versionType: "snapshot",
                url: "https://example.invalid/26w01a.json",
                releaseTime: "2026-01-07T12:00:00+00:00",
              },
            ];
          }
          if (cmd === "update_profile") {
            updateRequests.push(args?.request);
            savedVersion = args?.request?.gameVersion ?? savedVersion;
            return {
              id: "snapshot-profile",
              name: "Snapshot Profile",
              loader: "vanilla",
              gameVersion: savedVersion,
              memoryMb: 4096,
              jvmArgs: [],
            };
          }
          if (cmd === "prepare_profile") {
            prepared = true;
            return {
              action: "repair_profile",
              subjectId: "snapshot-profile",
              status: "completed",
              message: "Profile setup completed.",
            };
          }
          if (cmd === "list_launcher_events") {
            return prepared
              ? [
                  {
                    id: "snapshot-profile-setup-completed",
                    operationId: "snapshot-profile-setup",
                    operation: "repair_profile",
                    subjectId: "snapshot-profile",
                    kind: "completed",
                    message: "Profile setup completed.",
                    progressPercent: 100,
                    occurredAtUnixSeconds: 1_710_000_000,
                  },
                ]
              : [];
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Library" }).click();
  const profile = page.locator(".profile-row").filter({ hasText: "Snapshot Profile" });
  await openProfileCustomize(profile);
  await profile.getByLabel("Snapshot Profile version channel").selectOption("snapshot");
  await profile.getByLabel("Snapshot Profile game version").selectOption("26w01a");
  await profile.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Snapshot Profile updated and ready")).toBeVisible();
  await expect(profile.getByLabel("Snapshot Profile profile summary")).toContainText("26w01a");
  const updateRequests = await page.evaluate(
    () => (window as typeof window & { __snapshotProfileUpdateRequests: unknown[] }).__snapshotProfileUpdateRequests,
  );
  expect(updateRequests).toEqual([expect.objectContaining({ id: "snapshot-profile", gameVersion: "26w01a" })]);
});

test("library profile editor syncs native refreshed profile values after save", async ({ page }) => {
  await page.addInitScript(() => {
    let saved = false;
    let prepared = false;
    const invoked: string[] = [];
    const updateRequests: unknown[] = [];
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: [
        {
          id: "winterpack",
          name: saved ? "WinterPack Canonical" : "WinterPack",
          loader: saved ? "forge" : "fabric",
          gameVersion: saved ? "1.20.1" : "1.21.4",
          memoryMb: saved ? 6144 : 4096,
          jvmArgs: [],
          javaRuntimeOverridePath: saved ? "C:/Java/21/bin/java.exe" : undefined,
        },
      ],
      imports: [],
    });

    Object.defineProperty(window, "__profileSyncInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__profileSyncUpdateRequests", {
      value: updateRequests,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { request?: unknown }) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "update_profile") {
            updateRequests.push(args?.request);
            saved = true;
            return {
              id: "winterpack",
              name: "WinterPack Canonical",
              loader: "forge",
              gameVersion: "1.20.1",
              memoryMb: 6144,
              jvmArgs: [],
              javaRuntimeOverridePath: "C:/Java/21/bin/java.exe",
            };
          }
          if (cmd === "prepare_profile") {
            prepared = true;
            return {
              action: "repair_profile",
              subjectId: "winterpack",
              status: "completed",
              message: "Profile setup completed.",
            };
          }
          if (cmd === "list_launcher_events") {
            return prepared
              ? [
                  {
                    id: "profile-update-setup-completed",
                    operationId: "profile-update-setup",
                    operation: "repair_profile",
                    subjectId: "winterpack",
                    kind: "completed",
                    message: "Profile setup completed.",
                    progressPercent: 100,
                    occurredAtUnixSeconds: 1_710_000_000,
                  },
                ]
              : [];
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Library" }).click();
  const draftProfile = page.locator(".profile-row").filter({ hasText: "WinterPack" });
  await openProfileCustomize(draftProfile);
  await draftProfile.getByLabel("WinterPack profile name").fill("WinterPack Draft");
  await draftProfile.getByRole("button", { name: "Advanced" }).click();
  await draftProfile.getByLabel("WinterPack Java path override").fill("C:/Java/21/bin/java.exe");
  await draftProfile.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("WinterPack Canonical updated and ready")).toBeVisible();
  const canonicalProfile = page.locator(".profile-row").filter({ hasText: "WinterPack Canonical" });
  await openProfileCustomize(canonicalProfile);
  await expect(canonicalProfile.getByLabel("WinterPack Canonical profile name")).toHaveValue("WinterPack Canonical");
  await canonicalProfile.getByRole("button", { name: "Advanced" }).click();
  await expect(canonicalProfile.getByLabel("WinterPack Canonical game version")).toHaveValue("1.20.1");
  await expect(canonicalProfile.getByLabel("WinterPack Canonical loader")).toHaveValue("forge");
  await expect(canonicalProfile.getByLabel("WinterPack Canonical memory")).toHaveValue("6144");
  await expect(canonicalProfile.getByLabel("WinterPack Canonical Java path override")).toHaveValue("C:/Java/21/bin/java.exe");
  await expect(page.getByLabel("WinterPack Canonical profile summary")).toContainText("1.20.1");
  await expect(page.getByLabel("WinterPack Canonical profile summary")).not.toContainText("Java");
  const invoked = await page.evaluate(() => (window as typeof window & { __profileSyncInvokes: string[] }).__profileSyncInvokes);
  const requests = await page.evaluate(
    () => (window as typeof window & { __profileSyncUpdateRequests: Array<{ javaRuntimeOverridePath?: string }> }).__profileSyncUpdateRequests,
  );
  expect(invoked.filter((cmd) => cmd === "bootstrap_snapshot").length).toBeGreaterThanOrEqual(3);
  expect(invoked).toContain("update_profile");
  expect(invoked.indexOf("update_profile")).toBeLessThan(invoked.indexOf("prepare_profile"));
  expect(invoked.indexOf("list_launcher_events", invoked.indexOf("prepare_profile"))).toBeGreaterThan(
    invoked.indexOf("prepare_profile"),
  );
  expect(requests[0]?.javaRuntimeOverridePath).toBe("C:/Java/21/bin/java.exe");
});

test("library profile editor setup fallback offers play recovery", async ({ page }) => {
  await page.addInitScript(() => {
    let saved = false;
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: [
        {
          id: "winterpack",
          name: "WinterPack",
          loader: "vanilla",
          gameVersion: saved ? "1.21.8" : "1.20.1",
          memoryMb: 4096,
          jvmArgs: [],
        },
      ],
      imports: [],
    });

    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { request?: { gameVersion?: string } }) => {
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_minecraft_versions") {
            return [
              {
                id: "1.21.8",
                versionType: "release",
                url: "https://example.invalid/1.21.8.json",
                releaseTime: "2025-07-17T12:00:00+00:00",
              },
              {
                id: "1.20.1",
                versionType: "release",
                url: "https://example.invalid/1.20.1.json",
                releaseTime: "2023-06-12T12:00:00+00:00",
              },
            ];
          }
          if (cmd === "update_profile") {
            saved = true;
            return {
              id: "winterpack",
              name: "WinterPack",
              loader: "vanilla",
              gameVersion: args?.request?.gameVersion ?? "1.21.8",
              memoryMb: 4096,
              jvmArgs: [],
            };
          }
          if (cmd === "prepare_profile") throw "";
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Library" }).click();
  const profile = page.locator(".profile-row").filter({ hasText: "WinterPack" });
  await openProfileCustomize(profile);
  await profile.getByLabel("WinterPack game version").selectOption("1.21.8");
  await profile.getByRole("button", { name: "Save" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText(
    "WinterPack was updated, but game setup needs another try.",
  );
  await expect(page.getByLabel("Launcher status message")).not.toContainText("Press Try play again");
  await expect(page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Try play again" })).toBeEnabled();
});

test("library profile editor ignores rapid duplicate native save clicks", async ({ page }) => {
  await page.addInitScript(() => {
    let saved = false;
    let resolveUpdate: ((value: unknown) => void) | null = null;
    const updateRequests: unknown[] = [];
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: [
        {
          id: "winterpack",
          name: "WinterPack",
          loader: "forge",
          gameVersion: "1.20.1",
          memoryMb: saved ? 8192 : 4096,
          jvmArgs: [],
        },
      ],
      imports: [],
    });

    Object.defineProperty(window, "__duplicateProfileSaveRequests", {
      value: updateRequests,
      configurable: true,
    });
    Object.defineProperty(window, "__resolveDuplicateProfileSave", {
      value: () => {
        saved = true;
        resolveUpdate?.({
          id: "winterpack",
          name: "WinterPack",
          loader: "forge",
          gameVersion: "1.20.1",
          memoryMb: 8192,
          jvmArgs: [],
        });
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { request?: unknown }) => {
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_minecraft_versions") {
            return [
              {
                id: "1.20.1",
                versionType: "release",
                url: "https://example.invalid/1.20.1.json",
                releaseTime: "2023-06-12T12:00:00+00:00",
              },
            ];
          }
          if (cmd === "update_profile") {
            updateRequests.push(args?.request);
            return new Promise((resolve) => {
              resolveUpdate = resolve;
            });
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Library" }).click();
  const profile = page.locator(".profile-row").filter({ hasText: "WinterPack" });
  await openProfileCustomize(profile);
  await profile.getByLabel("WinterPack memory").fill("8192");
  await profile.getByRole("button", { name: "Save" }).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });

  await expect(page.getByLabel("WinterPack edit actions").getByRole("button", { name: "Saving..." })).toBeDisabled();
  const pendingRequests = await page.evaluate(
    () => (window as typeof window & { __duplicateProfileSaveRequests: unknown[] }).__duplicateProfileSaveRequests,
  );
  expect(pendingRequests).toHaveLength(1);
  await page.evaluate(
    () => (window as typeof window & { __resolveDuplicateProfileSave: () => void }).__resolveDuplicateProfileSave(),
  );

  await expect(page.getByText("WinterPack updated")).toBeVisible();
  await expect(page.getByLabel("WinterPack profile summary")).toContainText("8 GB RAM");
  const finalRequests = await page.evaluate(
    () => (window as typeof window & { __duplicateProfileSaveRequests: unknown[] }).__duplicateProfileSaveRequests,
  );
  expect(finalRequests).toEqual([expect.objectContaining({ id: "winterpack", memoryMb: 8192 })]);
});

test("library profile editor keeps profile values after native save failure", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    Object.defineProperty(window, "__failedNativeSaveInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return {
            settings: {
              maxMemoryMb: 6144,
              minMemoryMb: 2048,
              offlineUsername: "Player",
              telemetryEnabled: false,
            },
            directories: {
              dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
              configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
              cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
              logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
            },
            friends: [],
            packs: [
              {
                id: "winterpack",
                name: "WinterPack",
                tagline: "Long winter survival with a cozy base.",
                version: "1.20.1",
                status: "installed",
                accent: "#7dd3fc",
                installedPlayers: 2,
              },
            ],
            profiles: [
              {
                id: "winterpack",
                name: "WinterPack",
                loader: "forge",
                gameVersion: "1.20.1",
                memoryMb: 4096,
                jvmArgs: [],
              },
            ],
            imports: [],
          };
          if (cmd === "update_profile") throw new Error("profile has a running managed process");
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");

  await page.getByRole("button", { name: "Library" }).click();
  const profile = page.locator(".profile-row").filter({ hasText: "WinterPack" });
  await openProfileCustomize(profile);
  await profile.getByLabel("WinterPack game version").selectOption("1.21.4");
  await profile.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("This game is running. Stop it before changing this profile.")).toBeVisible();
  await expect(page.getByLabel("WinterPack profile summary")).toContainText("1.20.1");
  await expect(page.getByText("Profile update saved in web preview")).toHaveCount(0);
  const invoked = await page.evaluate(
    () => (window as typeof window & { __failedNativeSaveInvokes: string[] }).__failedNativeSaveInvokes,
  );
  expect(invoked).toContain("update_profile");
  expect(invoked.filter((cmd) => cmd === "bootstrap_snapshot")).toHaveLength(1);
});

test("library hide-from-library action removes profile in preview", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Library" }).click();
  const profile = page.locator(".profile-row").filter({ hasText: "Latest Release" });
  await openProfileCustomize(profile);
  await profile.getByRole("button", { name: "Hide from Library" }).click();

  await expect(page.getByText("Latest Release hidden from Library in preview")).toBeVisible();
  await expect(page.getByText("Profile hidden from Library in web preview")).toHaveCount(0);
  await expect(profile).toHaveCount(0);
});

test("library delete action removes profile in preview", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Library" }).click();
  const profile = page.locator(".profile-row").filter({ hasText: "Latest Release" });
  await openProfileCustomize(profile);
  await profile.getByRole("button", { name: "Delete" }).click();
  await expect(profile.getByText("Shared Minecraft downloads are kept for faster future installs.")).toBeVisible();
  await profile.getByRole("button", { name: "Confirm delete" }).click();

  await expect(page.getByText("Latest Release deleted in preview")).toBeVisible();
  await expect(page.getByText("Profile deleted in web preview")).toHaveCount(0);
  await expect(profile).toHaveCount(0);
});

test("library delete action can be canceled in preview", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Library" }).click();
  const profile = page.locator(".profile-row").filter({ hasText: "Latest Release" });
  await openProfileCustomize(profile);
  await profile.getByRole("button", { name: "Delete" }).click();
  await expect(profile.getByRole("button", { name: "Confirm delete" })).toBeVisible();
  await profile.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByText("Profile deletion canceled")).toBeVisible();
  await expect(profile).toBeVisible();
});

test("library delete action surfaces native event stream after removal", async ({ page }) => {
  await page.addInitScript(() => {
    let deleted = false;
    const invoked: string[] = [];
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: deleted
        ? []
        : [
            {
              id: "latest-release",
              name: "Latest Release",
              loader: "vanilla",
              gameVersion: "1.21.8",
              memoryMb: 4096,
              jvmArgs: [],
            },
          ],
      imports: [],
    });

    Object.defineProperty(window, "__nativeDeleteInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "delete_profile") {
            deleted = true;
            return {
              action: "delete_profile",
              subjectId: "latest-release",
              status: "completed",
              message:
                "Latest Release deleted. Profile files were removed; shared Minecraft downloads were kept for faster future installs.",
            };
          }
          if (cmd === "list_launcher_events") {
            return [
              {
                id: "delete-completed",
                operationId: "00000000-0000-4000-8000-000000000098",
                operation: "delete_profile",
                subjectId: "latest-release",
                kind: "completed",
                message:
                  "Latest Release deleted. Profile files were removed; shared Minecraft downloads were kept for faster future installs.",
                progressPercent: 100,
                occurredAtUnixSeconds: 1_710_000_000,
              },
            ];
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Library" }).click();
  const profile = page.locator(".profile-row").filter({ hasText: "Latest Release" });
  await openProfileCustomize(profile);
  await profile.getByRole("button", { name: "Delete" }).click();
  await profile.getByRole("button", { name: "Confirm delete" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText(
    "shared Minecraft downloads were kept for faster future installs",
  );
  await expect(page.getByRole("heading", { name: "Activity", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "History", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".event-row").filter({ hasText: "shared Minecraft downloads were kept" })).toBeVisible();
  await page.getByRole("button", { name: "Library" }).click();
  await expect(page.locator(".profile-row").filter({ hasText: "Latest Release" })).toHaveCount(0);
  const invoked = await page.evaluate(() => (window as typeof window & { __nativeDeleteInvokes: string[] }).__nativeDeleteInvokes);
  expect(invoked.indexOf("delete_profile")).toBeGreaterThanOrEqual(0);
  expect(invoked.indexOf("bootstrap_snapshot", invoked.indexOf("delete_profile"))).toBeGreaterThan(invoked.indexOf("delete_profile"));
  expect(invoked.indexOf("list_launcher_events", invoked.indexOf("delete_profile"))).toBeGreaterThan(invoked.indexOf("delete_profile"));
});

test("library delete action clears stale launch recovery for removed profile", async ({ page }) => {
  await page.addInitScript(() => {
    let deleted = false;
    const invoked: string[] = [];
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: deleted
        ? []
        : [
            {
              id: "latest-release",
              name: "Latest Release",
              loader: "vanilla",
              gameVersion: "1.21.8",
              memoryMb: 4096,
              jvmArgs: [],
            },
          ],
      imports: [],
    });

    Object.defineProperty(window, "__deleteClearsRecoveryInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "build_launch_command") {
            throw new Error("asset index is missing: C:/TheBoysLauncher/cache/assets/indexes/1.21.8.json");
          }
          if (cmd === "delete_profile") {
            deleted = true;
            return {
              action: "delete_profile",
              subjectId: "latest-release",
              status: "completed",
              message:
                "Latest Release deleted. Profile files were removed; shared Minecraft downloads were kept for faster future installs.",
            };
          }
          if (cmd === "list_launcher_events") {
            return deleted
              ? [
                  {
                    id: "delete-completed",
                    operationId: "00000000-0000-4000-8000-000000000198",
                    operation: "delete_profile",
                    subjectId: "latest-release",
                    kind: "completed",
                    message:
                      "Latest Release deleted. Profile files were removed; shared Minecraft downloads were kept for faster future installs.",
                    progressPercent: 100,
                    occurredAtUnixSeconds: 1_710_000_000,
                  },
                ]
              : [];
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Library" }).click();
  const profile = page.locator(".profile-row").filter({ hasText: "Latest Release" });
  await clickProfileSetupCheck(profile);
  await expect(page.getByLabel("Launcher status message")).toContainText("Game files are missing");
  await expect(page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Try play again" })).toBeVisible();

  await profile.getByRole("button", { name: "Delete" }).click();
  await profile.getByRole("button", { name: "Confirm delete" }).click();

  await expect(page.locator(".event-row").filter({ hasText: "shared Minecraft downloads were kept" })).toBeVisible();
  await expect(page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Try play again" })).toHaveCount(0);
  await page.getByRole("button", { name: "Library" }).click();
  await expect(profile).toHaveCount(0);
  const invoked = await page.evaluate(
    () => (window as typeof window & { __deleteClearsRecoveryInvokes: string[] }).__deleteClearsRecoveryInvokes,
  );
  expect(invoked).toContain("build_launch_command");
  expect(invoked).toContain("delete_profile");
});

test("library delete action keeps profile visible after native failure", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: [
        {
          id: "latest-release",
          name: "Latest Release",
          loader: "vanilla",
          gameVersion: "1.21.8",
          memoryMb: 4096,
          jvmArgs: [],
        },
      ],
      imports: [],
    });

    Object.defineProperty(window, "__failedNativeDeleteInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "delete_profile") throw new Error("profile data directory is locked");
          if (cmd === "list_launcher_events") {
            return [
              {
                id: "delete-failed",
                operationId: "00000000-0000-4000-8000-000000000099",
                operation: "delete_profile",
                subjectId: "latest-release",
                kind: "failed",
                message: "Profile delete failed: profile data directory is locked",
                progressPercent: 100,
                occurredAtUnixSeconds: 1_710_000_000,
              },
            ];
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Library" }).click();
  const profile = page.locator(".profile-row").filter({ hasText: "Latest Release" });
  await openProfileCustomize(profile);
  await profile.getByRole("button", { name: "Delete" }).click();
  await profile.getByRole("button", { name: "Confirm delete" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "History", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".event-row").filter({ hasText: "Profile delete failed" })).toBeVisible();
  await page.getByRole("button", { name: "Library" }).click();
  await expect(page.locator(".profile-row").filter({ hasText: "Latest Release" })).toBeVisible();
  const invoked = await page.evaluate(
    () => (window as typeof window & { __failedNativeDeleteInvokes: string[] }).__failedNativeDeleteInvokes,
  );
  expect(invoked.indexOf("list_launcher_events", invoked.indexOf("delete_profile"))).toBeGreaterThan(
    invoked.indexOf("delete_profile"),
  );
});

test("library hide-from-library action keeps profile visible after native failure", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    Object.defineProperty(window, "__failedNativeArchiveInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return {
            settings: {
              maxMemoryMb: 6144,
              minMemoryMb: 2048,
              offlineUsername: "Player",
              telemetryEnabled: false,
            },
            directories: {
              dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
              configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
              cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
              logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
            },
            friends: [],
            packs: [
              {
                id: "latest-release",
                name: "Latest Release",
                tagline: "Vanilla Minecraft.",
                version: "1.21.8",
                status: "installed",
                accent: "#60a5fa",
                installedPlayers: 0,
              },
            ],
            profiles: [
              {
                id: "latest-release",
                name: "Latest Release",
                loader: "vanilla",
                gameVersion: "1.21.8",
                memoryMb: 4096,
                jvmArgs: [],
              },
            ],
            imports: [],
          };
          if (cmd === "archive_profile") throw new Error("profile has a running managed process");
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");

  await page.getByRole("button", { name: "Library" }).click();
  const profile = page.locator(".profile-row").filter({ hasText: "Latest Release" });
  await openProfileCustomize(profile);
  await profile.getByRole("button", { name: "Hide from Library" }).click();

  await expect(page.getByText("This game is running. Stop it before changing this profile.")).toBeVisible();
  await expect(profile).toBeVisible();
  const invoked = await page.evaluate(() => (window as typeof window & { __failedNativeArchiveInvokes: string[] }).__failedNativeArchiveInvokes);
  expect(invoked).toContain("archive_profile");
  expect(invoked).not.toContain("delete_profile");
});

test("library delete action is disabled while a profile process is running", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Activity" }).click();
  await page.getByLabel("Activity views").getByRole("button", { name: "Games" }).click();
  await page.getByRole("button", { name: "Library" }).click();

  const runningProfile = page.locator(".profile-row").filter({ hasText: "WinterPack" });
  await expect(runningProfile).toContainText("This game is running");
  const runningLaunchActions = runningProfile.getByLabel("WinterPack launch actions").getByRole("button", { name: "Running" });
  await expect(runningLaunchActions).toHaveCount(2);
  await expect(runningLaunchActions.first()).toBeDisabled();
  await expect(runningLaunchActions.nth(1)).toBeDisabled();
  const runningProcessActions = runningProfile.getByLabel("WinterPack game actions");
  await expect(runningProcessActions.getByRole("button", { name: "Stop" })).toBeEnabled();
  await expect(runningProcessActions.getByRole("button", { name: "Save log" })).toBeEnabled();
  await runningProcessActions.getByRole("button", { name: "Save log" }).click();
  await runningProcessActions.getByRole("button", { name: "Stop" }).click();
  await expect(runningProfile.getByLabel("WinterPack game actions").getByRole("button", { name: "Stopping" })).toBeDisabled();
  await expect(runningProfile.getByLabel("WinterPack edit actions").getByRole("button", { name: "Customize" })).toBeDisabled();
  await expect(runningProfile.getByLabel("WinterPack danger actions")).toHaveCount(0);

  const idleProfile = page.locator(".profile-row").filter({ hasText: "Latest Release" });
  await openProfileCustomize(idleProfile);
  await expect(idleProfile.getByRole("button", { name: "Hide from Library" })).toBeEnabled();
  await expect(idleProfile.getByRole("button", { name: "Delete" })).toBeEnabled();
});

test("pack update action is disabled while the target profile process is running", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    const runningProcess = {
      id: "minecraft-winterpack",
      processId: 4242,
      state: "running",
      startedAtUnixSeconds: 1_710_000_000,
      runtimeSeconds: 12,
      totalOutputLineCount: 1,
      droppedOutputLineCount: 0,
      command: {
        executable: "javaw.exe",
        args: ["-jar", "minecraft.jar"],
        workingDir: "C:/TheBoysLauncher/data/profiles/winterpack",
        env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
      },
      output: [{ stream: "stdout", line: "WinterPack is running" }],
    };
    Object.defineProperty(window, "__runningUpdatePackInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/TheBoysLauncher/data",
                configDir: "C:/TheBoysLauncher/config",
                cacheDir: "C:/TheBoysLauncher/cache",
                logDir: "C:/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  tagline: "Cozy survival with friends.",
                  version: "2.3.8",
                  status: "update_available",
                  accent: "#67e8b9",
                  installedPlayers: 0,
                  defaultServer: "The Cabin",
                },
              ],
              profiles: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  loader: "forge",
                  gameVersion: "1.20.1",
                  installedPackVersion: "2.3.7",
                  memoryMb: 6144,
                  jvmArgs: [],
                },
              ],
              imports: [],
            };
          }
          if (cmd === "list_managed_processes") return [runningProcess];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Activity" }).click();
  await page.getByLabel("Activity views").getByRole("button", { name: "Games" }).click();
  await page.locator("nav").getByRole("button", { name: "Play" }).click();

  await expect(page.getByLabel("Primary pack actions").getByRole("button", { name: "Running" }).first()).toBeDisabled();
  const packCard = page.locator(".pack-card").filter({ hasText: "WinterPack" });
  await expect(packCard.getByRole("button", { name: "Running" })).toBeDisabled();
  await packCard.getByRole("button", { name: "Running" }).click({ force: true });
  const invoked = await page.evaluate(() => (window as typeof window & { __runningUpdatePackInvokes: string[] }).__runningUpdatePackInvokes);
  expect(invoked).not.toContain("install_pack");
});

test("activity repair retry is disabled while the target profile process is running", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    const runningProcess = {
      id: "minecraft-winterpack",
      processId: 4242,
      state: "running",
      startedAtUnixSeconds: 1_710_000_000,
      runtimeSeconds: 12,
      totalOutputLineCount: 1,
      droppedOutputLineCount: 0,
      command: {
        executable: "javaw.exe",
        args: ["-jar", "minecraft.jar"],
        workingDir: "C:/TheBoysLauncher/data/profiles/winterpack",
        env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
      },
      output: [{ stream: "stdout", line: "WinterPack is running" }],
    };
    Object.defineProperty(window, "__runningRepairRetryInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/TheBoysLauncher/data",
                configDir: "C:/TheBoysLauncher/config",
                cacheDir: "C:/TheBoysLauncher/cache",
                logDir: "C:/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  tagline: "Cozy survival with friends.",
                  version: "2.3.7",
                  status: "repair_needed",
                  accent: "#67e8b9",
                  installedPlayers: 0,
                  defaultServer: "The Cabin",
                },
              ],
              profiles: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  loader: "forge",
                  gameVersion: "1.20.1",
                  installedPackVersion: "2.3.7",
                  memoryMb: 6144,
                  jvmArgs: [],
                },
              ],
              imports: [],
            };
          }
          if (cmd === "list_managed_processes") return [runningProcess];
          if (cmd === "list_launcher_events") {
            return [
              {
                id: "repair-failed",
                operationId: "00000000-0000-4000-8000-000000000212",
                operation: "repair_profile",
                subjectId: "winterpack",
                kind: "failed",
                message: "Profile repair failed: asset index is missing",
                progressPercent: 100,
                occurredAtUnixSeconds: 1_710_000_000,
              },
            ];
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Activity" }).click();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.getByLabel("Activity views").getByRole("button", { name: "History", exact: true }).click();

  const failedRepairEvent = page.locator(".event-row").filter({ hasText: "Setup failed: asset index is missing" });
  await expect(failedRepairEvent.getByRole("button", { name: "Running" })).toBeDisabled();
  await failedRepairEvent.getByRole("button", { name: "Running" }).click({ force: true });
  const invoked = await page.evaluate(() => (window as typeof window & { __runningRepairRetryInvokes: string[] }).__runningRepairRetryInvokes);
  expect(invoked).not.toContain("repair_profile");
});

test("friend join is disabled while the target profile process is running", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Activity" }).click();
  await page.getByLabel("Activity views").getByRole("button", { name: "Games" }).click();
  await page.locator("nav").getByRole("button", { name: "Play" }).click();

  const homeFriend = page.getByLabel("Home party panel").locator(".friend-row").filter({ hasText: "Dylan" });
  await expect(homeFriend.getByRole("button", { name: "Running" })).toBeDisabled();
  await expect(homeFriend.getByRole("button", { name: "Join" })).toHaveCount(0);

  await page.getByRole("button", { name: "Friends" }).click();
  const rosterFriend = page.locator(".friend-row").filter({ hasText: "Dylan" }).filter({ hasText: "The Cabin" });
  await expect(rosterFriend.getByRole("button", { name: "Running" })).toBeDisabled();
  await expect(rosterFriend.getByRole("button", { name: "Join" })).toHaveCount(0);
});

test("import screen exposes scan action", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("navigation").getByRole("button", { name: "Import" }).click();
  await expect(page.getByRole("heading", { name: "Import Profiles" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Find profiles" })).toBeVisible();
  await expect(page.getByText("No profiles found yet")).toBeVisible();
  await expect(page.getByText("paste a folder path above", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review folder" })).toBeDisabled();
  await expect(page.getByText("Paste a profile folder path first.")).toHaveCount(0);
  await page.getByLabel("Custom import folder path").fill("   ");
  await expect(page.getByText("Use a normal profile folder path.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review folder" })).toBeDisabled();
});

test("import screen can review a custom folder path", async ({ page }) => {
  await page.addInitScript(() => {
    let plannedRequest: unknown = null;
    const snapshot = {
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: [],
      imports: [],
    };

    Object.defineProperty(window, "__customImportPlannedRequest", {
      get: () => plannedRequest,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { request?: unknown }) => {
          if (cmd === "bootstrap_snapshot") return snapshot;
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "list_minecraft_versions") return [];
          if (cmd === "plan_profile_import") {
            plannedRequest = args?.request ?? null;
            await new Promise((resolve) => setTimeout(resolve, 200));
            return {
              profileId: "custom-family-world",
              profileName: "Family World",
              sourcePath: "D:/Games/PrismLauncher/instances/FamilyWorld",
              destinationPath: "C:/Users/test/AppData/Roaming/TheBoysLauncher/data/profiles/custom-family-world",
              detectedLoader: "vanilla",
              detectedGameVersion: "1.21.8",
              items: [
                {
                  kind: "saves",
                  source: "D:/Games/PrismLauncher/instances/FamilyWorld/.minecraft/saves",
                  destination: "C:/Users/test/AppData/Roaming/TheBoysLauncher/data/profiles/custom-family-world/saves",
                  exists: true,
                  destinationExists: false,
                  fileCount: 1,
                  totalBytes: 2048,
                },
              ],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Import" }).click();
  await expect(page.getByRole("button", { name: "Review folder" })).toBeDisabled();
  await page.getByLabel("Custom import profile name").fill("Family World");
  await page.getByLabel("Custom import folder path").fill(String.raw`"D:\Games\PrismLauncher\instances\FamilyWorld"`);
  await expect(page.getByRole("button", { name: "Review folder" })).toBeEnabled();
  await page.getByRole("button", { name: "Review folder" }).click();
  await expect(page.getByRole("button", { name: "Preparing..." })).toBeDisabled();

  const importDialog = page.getByRole("dialog", { name: "Review profile import" });
  await expect(importDialog.getByRole("heading", { name: "Family World" })).toBeVisible();
  await expect(importDialog).toContainText("1 item ready - 2.0 KB");
  await expect(importDialog).toContainText("1.21.8 - Vanilla");
  await expect(importDialog.locator(".import-row").filter({ hasText: "Saves" })).toContainText("Ready to bring over");
  await expect(importDialog).not.toContainText("custom-family-world/saves");
  const request = await page.evaluate(
    () => (window as typeof window & { __customImportPlannedRequest: unknown }).__customImportPlannedRequest,
  );
  expect(request).toEqual({
    name: "Family World",
    sourcePath: String.raw`D:\Games\PrismLauncher\instances\FamilyWorld`,
  });
});

test("native import scan disables duplicate scans while pending", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    const snapshot = {
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: [],
      imports: [],
    };
    Object.defineProperty(window, "__nativeImportScanInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot;
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "list_minecraft_versions") return [];
          if (cmd === "scan_imports") {
            await new Promise((resolve) => setTimeout(resolve, 200));
            return [
              {
                id: "native-prism-winterpack",
                source: "Prism Launcher",
                name: "WinterPack Native",
                path: "D:/Prism/instances/WinterPack",
                kind: "prism",
                detectedLoader: "fabric",
                detectedGameVersion: "1.21.1",
                importableFileCount: 3,
                importableTotalBytes: 4096,
              },
              {
                id: "native-prism-family-world",
                source: "Prism Launcher",
                name: "Family World",
                path: "D:/Prism/instances/FamilyWorld",
                kind: "prism",
                detectedLoader: "vanilla",
                detectedGameVersion: "1.21.8",
              },
            ];
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Import" }).click();
  await expect(page.getByRole("button", { name: "Looking..." })).toBeDisabled();
  await page.getByRole("button", { name: "Looking..." }).click({ force: true });

  await expect(page.locator(".import-row").filter({ hasText: "WinterPack Native" })).toBeVisible();
  await expect(page.locator(".import-row").filter({ hasText: "Family World" })).toContainText(
    "Files to copy will be checked during review",
  );
  const invoked = await page.evaluate(
    () => (window as typeof window & { __nativeImportScanInvokes: string[] }).__nativeImportScanInvokes,
  );
  expect(invoked.filter((cmd) => cmd === "scan_imports")).toHaveLength(1);
});

test("native import scan failure does not show preview profiles", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "list_minecraft_versions") return [];
          if (cmd === "scan_imports") throw new Error("import scan failed with HTTP 503");
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Import" }).click();
  await page.getByRole("button", { name: "Find profiles" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText("import scan is unavailable right now. Try again later.");
  await expect(page.locator(".import-row")).toHaveCount(0);
  await expect(page.getByText("WinterPack Instance")).toHaveCount(0);
  await expect(page.getByText("Preview found 1 profile to import")).toHaveCount(0);
});

test("native import review failure does not show preview review plan", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [
                {
                  id: "native-prism-winterpack",
                  source: "Prism Launcher",
                  name: "WinterPack Native",
                  path: "D:/Prism/instances/WinterPack",
                  kind: "prism",
                  detectedLoader: "fabric",
                  detectedGameVersion: "1.21.1",
                },
              ],
            };
          }
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "list_minecraft_versions") return [];
          if (cmd === "plan_profile_import") throw new Error("profile import review failed with HTTP 503");
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Import" }).click();
  await page.locator(".import-row").filter({ hasText: "WinterPack Native" }).getByRole("button", { name: "Review" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText("profile import review is unavailable right now. Try again later.");
  await expect(page.getByRole("dialog", { name: "Review profile import" })).toHaveCount(0);
  await expect(page.getByText("Preview import review is ready")).toHaveCount(0);
  await expect(page.getByText("Preview destination")).toHaveCount(0);
});

test("friends screen starts without seeded preview requests or blocked accounts", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Friends" }).click();
  await expect(page.locator(".page-title")).toContainText("Friends");
  await expect(page.locator(".friend-row").filter({ hasText: "Avery" })).toHaveCount(0);
  await expect(page.locator(".friend-row").filter({ hasText: "Sam" })).toHaveCount(0);
  await expect(page.locator(".friend-row").filter({ hasText: "BlockedPreview" })).toHaveCount(0);
  await expect(page.locator(".friend-row").filter({ hasText: "Incoming request" })).toHaveCount(0);
});

test("friends screen requires enough characters before adding a friend", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Friends" }).click();
  await page.getByLabel("Friend name").fill("A");

  await expect(page.getByRole("button", { name: "Search" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add" })).toBeDisabled();
  await page.locator("form.friend-search").evaluate((form) => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  await expect(page.getByText("Enter at least 2 characters")).toBeVisible();
  await expect(page.locator(".friend-row").filter({ hasText: "A" }).filter({ hasText: "Request sent" })).toHaveCount(0);
});

test("native friends search failure does not show preview roster matches", async ({ page }) => {
  await page.route("http://127.0.0.1:4074/**", async (route) => {
    await route.abort();
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [
                {
                  id: "friend-dill",
                  name: "Dill",
                  avatarColor: "#67e8b9",
                  state: "online",
                  joinable: false,
                },
              ],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "social_backend_status") {
            return {
              endpointKind: "local",
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: true,
              managed: true,
              message: "Local friends service is reachable",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Friends" }).click();
  await page.getByLabel("Friend name").fill("Dill");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText("Friend search is unavailable right now. Try again later.");
  await expect(page.getByLabel("Friend search results")).toContainText("Friend search is unavailable right now");
  await expect(page.getByLabel("Friend search results")).not.toContainText("Dill");
  await expect(page.getByLabel("Friend search results")).not.toContainText("preview");
});

test("friends screen can send requests through the social backend scaffold", async ({ page }) => {
  const accountId = "00000000-0000-4000-8000-000000000001";
  const issuedAtUnixSeconds = Math.floor(Date.now() / 1000);
  const expiresAtUnixSeconds = issuedAtUnixSeconds + 3600;
  const accessToken = `dev-session:${accountId}:${expiresAtUnixSeconds}`;
  let friendRequestBody = "";
  let friendRequestCount = 0;
  let accountSearchAuthorization = "";
  let accountSearchCount = 0;
  let blockRequestBody = "";
  let unblockCalled = false;
  let muteRequestBody = "";
  let unmuteCalled = false;

  await page.route("http://127.0.0.1:4074/**", async (route) => {
    const request = route.request();
    const corsHeaders = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (request.url().endsWith("/dev/sessions")) {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          tokenType: "Bearer",
          sessionKind: "dev",
          accessToken,
          authorizationHeader: `Bearer ${accessToken}`,
          issuedAtUnixSeconds,
          expiresAtUnixSeconds,
        }),
      });
      return;
    }
    if (request.url().endsWith("/sessions/current")) {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          tokenType: "Bearer",
          sessionKind: "dev",
          expiresAtUnixSeconds,
          secondsRemaining: 3600,
        }),
      });
      return;
    }
    if (request.url().includes("/accounts/search?")) {
      accountSearchCount += 1;
      accountSearchAuthorization = request.headers()["authorization"] ?? "";
      await new Promise((resolve) => setTimeout(resolve, 200));
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify([
          {
            accountId: "00000000-0000-4000-8000-000000000099",
            minecraftUuid: "00000000-0000-4000-8000-000000000199",
            minecraftName: "Casey",
          },
        ]),
      });
      return;
    }
    if (request.url().endsWith(`/friends/${accountId}/requests`)) {
      friendRequestCount += 1;
      friendRequestBody = request.postData() ?? "";
      await new Promise((resolve) => setTimeout(resolve, 200));
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({ accountId: "00000000-0000-4000-8000-000000000099", status: "pendingOutbound", muted: false }),
      });
      return;
    }
    if (request.url().includes(`/friends/${accountId}/requests/`) && request.url().endsWith("/accept")) {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({ accountId: "00000000-0000-4000-8000-000000000004", status: "friends", muted: false }),
      });
      return;
    }
    if (request.url().endsWith(`/blocks/${accountId}`)) {
      blockRequestBody = request.postData() ?? "";
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({ accountId: "00000000-0000-4000-8000-000000000002" }),
      });
      return;
    }
    if (request.url().includes(`/blocks/${accountId}/`)) {
      unblockCalled = true;
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (request.url().endsWith(`/mutes/${accountId}`)) {
      muteRequestBody = request.postData() ?? "";
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({ accountId: "00000000-0000-4000-8000-000000000002" }),
      });
      return;
    }
    if (request.url().includes(`/mutes/${accountId}/`)) {
      unmuteCalled = true;
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    await route.fulfill({ status: 404, headers: corsHeaders });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Friends" }).click();
  await page.getByLabel("Friend name").fill("Casey");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("button", { name: "Searching..." })).toBeDisabled();
  await page.getByRole("button", { name: "Searching..." }).click({ force: true });
  await expect(page.getByText("Found 1 account", { exact: true })).toBeVisible();
  await expect(page.locator(".friend-search-result").filter({ hasText: "Casey" })).toContainText("Request");
  expect(accountSearchAuthorization).toBe(`Bearer ${accessToken}`);
  expect(accountSearchCount).toBe(1);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("button", { name: "Sending..." })).toBeDisabled();
  await page.getByRole("button", { name: "Sending..." }).click({ force: true });

  await expect(page.getByText("Friend request sent to Casey")).toBeVisible();
  await expect(page.locator(".friend-row").filter({ hasText: "Casey" }).filter({ hasText: "Request sent" })).toBeVisible();
  expect(JSON.parse(friendRequestBody).targetAccountId).toMatch(/[0-9a-f-]{36}/);
  expect(friendRequestCount).toBe(1);

  const mason = page.locator(".friend-row").filter({ hasText: "Mason" });
  await mason.getByRole("button", { name: "Mason more actions" }).click();
  await mason.getByRole("button", { name: "Mute" }).click();
  await expect(mason.filter({ hasText: "Muted" })).toBeVisible();
  expect(JSON.parse(muteRequestBody).targetAccountId).toMatch(/[0-9a-f-]{36}/);

  await mason.getByRole("button", { name: "Mason more actions" }).click();
  await mason.getByRole("button", { name: "Unmute" }).click();
  await expect(mason.filter({ hasText: "Muted" })).toHaveCount(0);
  expect(unmuteCalled).toBeTruthy();

  await mason.getByRole("button", { name: "Mason more actions" }).click();
  await mason.getByRole("button", { name: "Block" }).click();
  await expect(page.locator(".friend-row").filter({ hasText: "Mason" }).filter({ hasText: "Blocked account" })).toBeVisible();
  expect(JSON.parse(blockRequestBody).targetAccountId).toMatch(/[0-9a-f-]{36}/);

  await page.locator(".friend-row").filter({ hasText: "Mason" }).getByRole("button", { name: "Unblock" }).click();
  await expect(page.locator(".friend-row").filter({ hasText: "Mason" }).filter({ hasText: "Blocked account" })).toHaveCount(0);
  expect(unblockCalled).toBeTruthy();
});

test("native friend request failure does not create a fake queued request", async ({ page }) => {
  const accountId = "00000000-0000-4000-8000-000000000001";
  const issuedAtUnixSeconds = Math.floor(Date.now() / 1000);
  const expiresAtUnixSeconds = issuedAtUnixSeconds + 3600;
  const accessToken = `minecraft-session:${accountId}:${expiresAtUnixSeconds}`;
  const authorizationHeader = `Bearer ${accessToken}`;
  let devSessionRequests = 0;
  let friendRequestCount = 0;

  await installNativeSocialPresenceStub(page, { accountId, accessToken, authorizationHeader });
  await page.route("http://127.0.0.1:4074/**", async (route) => {
    const request = route.request();
    const corsHeaders = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (request.url().endsWith("/dev/sessions")) {
      devSessionRequests += 1;
      await route.fulfill({ status: 403, headers: corsHeaders });
      return;
    }
    if (request.url().endsWith(`/friends/${accountId}/requests`)) {
      friendRequestCount += 1;
      await route.fulfill({ status: 500, headers: corsHeaders, body: "{}" });
      return;
    }
    await route.fulfill({ status: 404, headers: corsHeaders, body: "{}" });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Friends" }).click();
  await page.getByLabel("Friend name").fill("Casey");
  await page.getByRole("button", { name: "Add" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText("Friend request is unavailable right now. Try again later.");
  await expect(page.getByLabel("Friend search results")).toContainText("Friend request could not be sent");
  await expect(page.locator(".friend-row").filter({ hasText: "Casey" }).filter({ hasText: "Request sent" })).toHaveCount(0);
  expect(friendRequestCount).toBe(1);
  expect(devSessionRequests).toBe(0);
});

test("native social privacy failures do not fake block or mute success", async ({ page }) => {
  const accountId = "00000000-0000-4000-8000-000000000001";
  const issuedAtUnixSeconds = Math.floor(Date.now() / 1000);
  const expiresAtUnixSeconds = issuedAtUnixSeconds + 3600;
  const accessToken = `dev-session:${accountId}:${expiresAtUnixSeconds}`;
  let blockCount = 0;
  let muteCount = 0;

  await page.route("http://127.0.0.1:4074/**", async (route) => {
    const request = route.request();
    const corsHeaders = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (request.url().endsWith("/dev/sessions")) {
      devSessionRequests += 1;
      await route.fulfill({ status: 403, headers: corsHeaders });
      return;
    }
    if (request.url().endsWith(`/blocks/${accountId}`)) {
      blockCount += 1;
      await route.fulfill({ status: 500, headers: corsHeaders, body: "{}" });
      return;
    }
    if (request.url().endsWith(`/mutes/${accountId}`)) {
      muteCount += 1;
      await route.fulfill({ status: 500, headers: corsHeaders, body: "{}" });
      return;
    }
    await route.fulfill({ status: 404, headers: corsHeaders, body: "{}" });
  });

  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [
                {
                  id: "00000000-0000-4000-8000-000000000002",
                  name: "Mason",
                  avatarColor: "#67e8b9",
                  state: "online",
                  joinable: false,
                },
              ],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              endpointKind: "local",
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: true,
              managed: true,
              message: "Local friends service is reachable",
            };
          }
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Friends" }).click();
  const mason = page.locator(".friend-row").filter({ hasText: "Mason" });
  await expect(mason).toBeVisible();

  await mason.getByRole("button", { name: "Mason more actions" }).click();
  await mason.getByRole("button", { name: "Mute" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText("Mute is unavailable right now");
  await expect(page.getByLabel("Launcher status message")).not.toContainText("Mason muted");
  await expect(mason.filter({ hasText: "Muted" })).toHaveCount(0);

  await mason.getByRole("button", { name: "Mason more actions" }).click();
  await mason.getByRole("button", { name: "Block" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText("Block is unavailable right now");
  await expect(page.getByLabel("Launcher status message")).not.toContainText("Mason blocked");
  await expect(mason.filter({ hasText: "Blocked account" })).toHaveCount(0);
  expect(muteCount).toBe(1);
  expect(blockCount).toBe(1);
});

test("native social privacy undo failures keep existing block and mute state", async ({ page }) => {
  const accountId = "00000000-0000-4000-8000-000000000001";
  const issuedAtUnixSeconds = Math.floor(Date.now() / 1000);
  const expiresAtUnixSeconds = issuedAtUnixSeconds + 3600;
  const accessToken = `dev-session:${accountId}:${expiresAtUnixSeconds}`;
  let unblockCount = 0;
  let unmuteCount = 0;

  await page.route("http://127.0.0.1:4074/**", async (route) => {
    const request = route.request();
    const corsHeaders = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (request.url().endsWith("/dev/sessions")) {
      devSessionRequests += 1;
      await route.fulfill({ status: 403, headers: corsHeaders });
      return;
    }
    if (request.url().endsWith("/sessions/current")) {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          tokenType: "Bearer",
          sessionKind: "dev",
          expiresAtUnixSeconds,
          secondsRemaining: 3600,
        }),
      });
      return;
    }
    if (request.url().endsWith(`/blocks/${accountId}`)) {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({ accountId: "00000000-0000-4000-8000-000000000002" }),
      });
      return;
    }
    if (request.url().includes(`/blocks/${accountId}/`)) {
      unblockCount += 1;
      await route.fulfill({ status: 500, headers: corsHeaders, body: "{}" });
      return;
    }
    if (request.url().endsWith(`/mutes/${accountId}`)) {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({ accountId: "00000000-0000-4000-8000-000000000002" }),
      });
      return;
    }
    if (request.url().includes(`/mutes/${accountId}/`)) {
      unmuteCount += 1;
      await route.fulfill({ status: 500, headers: corsHeaders, body: "{}" });
      return;
    }
    await route.fulfill({ status: 404, headers: corsHeaders, body: "{}" });
  });

  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [
                {
                  id: "00000000-0000-4000-8000-000000000002",
                  name: "Mason",
                  avatarColor: "#67e8b9",
                  state: "online",
                  joinable: false,
                },
              ],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              endpointKind: "local",
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: true,
              managed: true,
              message: "Local friends service is reachable",
            };
          }
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Friends" }).click();
  const mason = page.locator(".friend-row").filter({ hasText: "Mason" });

  await mason.getByRole("button", { name: "Mason more actions" }).click();
  await mason.getByRole("button", { name: "Mute" }).click();
  await expect(mason.filter({ hasText: "Muted" })).toBeVisible();
  await mason.getByRole("button", { name: "Mason more actions" }).click();
  await mason.getByRole("button", { name: "Unmute" }).click();
  await expect(page.getByLabel("Launcher status message")).not.toContainText("Mason unmuted");
  await expect(mason.filter({ hasText: "Muted" })).toBeVisible();

  await mason.getByRole("button", { name: "Mason more actions" }).click();
  await mason.getByRole("button", { name: "Block" }).click();
  const blockedMason = page.locator(".friend-row").filter({ hasText: "Mason" }).filter({ hasText: "Blocked account" });
  await expect(blockedMason).toBeVisible();
  await blockedMason.getByRole("button", { name: "Unblock" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText("Unblock is unavailable right now");
  await expect(page.getByLabel("Launcher status message")).not.toContainText("Account unblocked");
  await expect(blockedMason).toBeVisible();
  expect(unmuteCount).toBe(1);
  expect(unblockCount).toBe(1);
});

test("import screen plans a preview migration", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("navigation").getByRole("button", { name: "Import" }).click();
  await page.getByRole("button", { name: "Find profiles" }).click();
  const importRow = page.locator(".import-row").filter({ hasText: "WinterPack" });
  await expect(importRow).toContainText("Detected as WinterPack");
  await expect(importRow).toContainText("1.21.1 - Fabric");
  await expect(importRow).toContainText("42 files to copy");
  await expect(importRow).toContainText("96 KB");
  await expect(importRow).toContainText("Preview import with saves");
  await importRow.getByText("View folder path").click();
  await expect(importRow).toContainText("icon.png");
  await importRow.getByRole("button", { name: "Review" }).click();

  await expect(page.getByText("Preview import review is ready")).toBeVisible();
  const importDialog = page.getByRole("dialog", { name: "Review profile import" });
  await expect(importDialog.getByRole("heading", { name: "WinterPack" })).toBeVisible();
  await expect(importDialog).toContainText("1.21.1 - Fabric");
  await expect(importDialog).toContainText("3 items ready - 49 KB");
  await expect(importDialog.locator(".import-row").filter({ hasText: "Saves" })).toContainText("8 files");
  await expect(importDialog.locator(".import-row").filter({ hasText: "Saves" })).toContainText("Ready to bring over");
  await expect(importDialog.locator(".import-row").filter({ hasText: "Saves" })).toContainText("32 KB");
  await expect(importDialog.locator(".import-row").filter({ hasText: "Options" })).toContainText("1 file");
  await expect(importDialog.locator(".import-row").filter({ hasText: "Options" })).toContainText("Ready to bring over");
  await expect(importDialog.locator(".import-row").filter({ hasText: "Options" })).toContainText("512 B");
  await expect(importDialog.locator(".import-row").filter({ hasText: "Resource packs" })).toContainText("2 files");
  await expect(importDialog.locator(".import-row").filter({ hasText: "Resource packs" })).toContainText("Ready to bring over");
  await expect(importDialog.locator(".import-row").filter({ hasText: "Resource packs" })).toContainText("16 KB");
  await expect(importDialog).not.toContainText("resource_packs");
  await expect(importDialog).not.toContainText("Preview destination/saves");
  await expect(importDialog.locator(".import-row").filter({ hasText: "Matching files already exist" })).toBeVisible();
  await expect(importDialog.getByLabel("config matching file choice")).toBeVisible();
  await importDialog.getByRole("button", { name: "Bring over", exact: true }).click();

  await expect(page.getByText("Choose what to do with matching files before importing")).toBeVisible();
  await expect(page.getByText("Choose what to do with conflicts before importing")).toHaveCount(0);
  await importDialog.locator(".import-row").filter({ hasText: "config" }).getByRole("button", { name: "Keep both" }).click();
  await expect(importDialog.locator(".import-row").filter({ hasText: "Matching files will be kept as a new copy" })).toBeVisible();
  await expect(importDialog).toContainText("4 items ready - 113 KB");
  await importDialog.getByRole("button", { name: "Bring over", exact: true }).click();

  await expect(page.getByText("Profile imported in web preview")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  const importedProfile = page.locator(".profile-row").filter({ hasText: "WinterPack" }).first();
  await expect(importedProfile).toContainText("Fabric");
  await expect(importedProfile.getByLabel("WinterPack profile summary")).not.toContainText("No default server");
  await expect(importedProfile.getByRole("button", { name: "Play" })).toBeVisible();
});

test("native import disables duplicate submissions while pending", async ({ page }) => {
  await page.addInitScript(() => {
    let imported = false;
    let completeImport: ((value: unknown) => void) | null = null;
    const invoked: string[] = [];
    const importedProfile = {
      id: "prism-winterpack",
      name: "WinterPack Imported",
      loader: "fabric",
      gameVersion: "1.21.1",
      memoryMb: 6144,
      jvmArgs: [],
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: imported ? [importedProfile] : [],
      imports: [
        {
          id: "prism-winterpack",
          source: "Prism Launcher",
          name: "WinterPack Instance",
          path: "C:/Users/test/AppData/Roaming/PrismLauncher/instances/WinterPack",
          kind: "prism",
          detectedLoader: "fabric",
          detectedGameVersion: "1.21.1",
          detectedName: "WinterPack Imported",
          detectedSummary: "Native import candidate.",
          importableFileCount: 2,
          importableTotalBytes: 1024,
        },
      ],
    });

    Object.defineProperty(window, "__nativeImportInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__completeNativeImport", {
      value: () => {
        imported = true;
        completeImport?.({
          operationId: "00000000-0000-4000-8000-000000000201",
          operation: "import_profile",
          subjectId: "prism-winterpack",
          events: [
            { kind: "queued", message: "Import queued for WinterPack Imported", progressPercent: 0 },
            { kind: "completed", message: "Import completed without modifying the source profile.", progressPercent: 100 },
          ],
        });
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { request?: unknown; plan?: unknown }) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "scan_imports") return snapshot().imports;
          if (cmd === "plan_profile_import") {
            return {
              profileId: "prism-winterpack",
              profileName: "WinterPack Imported",
              sourcePath: "C:/Users/test/AppData/Roaming/PrismLauncher/instances/WinterPack",
              destinationPath: "C:/Users/test/AppData/Roaming/TheBoysLauncher/data/profiles/prism-winterpack",
              detectedLoader: "fabric",
              detectedGameVersion: "1.21.1",
              items: [
                {
                  kind: "saves",
                  source: "C:/Users/test/AppData/Roaming/PrismLauncher/instances/WinterPack/.minecraft/saves",
                  destination: "C:/Users/test/AppData/Roaming/TheBoysLauncher/data/profiles/prism-winterpack/saves",
                  exists: true,
                  destinationExists: false,
                  fileCount: 2,
                  totalBytes: 1024,
                },
              ],
            };
          }
          if (cmd === "execute_profile_import") {
            if (!args?.plan) throw new Error("Expected import plan");
            return new Promise((resolve) => {
              completeImport = resolve;
            });
          }
          if (cmd === "list_launcher_events") {
            return imported
              ? [
                  {
                    id: "import-completed",
                    operationId: "00000000-0000-4000-8000-000000000201",
                    operation: "import_profile",
                    subjectId: "prism-winterpack",
                    kind: "completed",
                    message: "Import completed without modifying the source profile.",
                    progressPercent: 100,
                    occurredAtUnixSeconds: 1_710_000_000,
                  },
                ]
              : [];
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Import" }).click();
  await expect(page.locator(".import-row").filter({ hasText: "WinterPack Imported" })).toBeVisible();
  await page.locator(".import-row").filter({ hasText: "WinterPack Imported" }).getByRole("button", { name: "Review" }).click();
  const importDialog = page.getByRole("dialog", { name: "Review profile import" });
  const importButton = importDialog.getByRole("button", { name: "Bring over", exact: true });
  await expect(importButton).toBeEnabled();
  await importButton.click();
  await expect(importDialog.getByRole("button", { name: "Bringing over..." })).toBeDisabled();

  const invokedWhilePending = await page.evaluate(
    () => (window as typeof window & { __nativeImportInvokes: string[] }).__nativeImportInvokes,
  );
  expect(invokedWhilePending.filter((cmd) => cmd === "execute_profile_import")).toHaveLength(1);

  await page.evaluate(() => (window as typeof window & { __completeNativeImport: () => void }).__completeNativeImport());
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.locator(".profile-row").filter({ hasText: "WinterPack Imported" })).toContainText("Fabric");
  const invoked = await page.evaluate(
    () => (window as typeof window & { __nativeImportInvokes: string[] }).__nativeImportInvokes,
  );
  expect(invoked.filter((cmd) => cmd === "execute_profile_import")).toHaveLength(1);
  expect(invoked.indexOf("bootstrap_snapshot", invoked.indexOf("execute_profile_import"))).toBeGreaterThan(
    invoked.indexOf("execute_profile_import"),
  );
});

test("activity screen loads event log fallback", async ({ page }) => {
  await page.addInitScript(() => {
    let copiedProcessOutput = "";
    Object.defineProperty(window, "__copiedProcessOutput", {
      get: () => copiedProcessOutput,
      configurable: true,
    });
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    document.execCommand = (command: string) => {
      if (command !== "copy") return false;
      copiedProcessOutput = (document.activeElement as HTMLTextAreaElement | null)?.value ?? "";
      return true;
    };
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Activity" }).click();
  await expect(page.getByRole("heading", { name: "Activity", exact: true })).toBeVisible();
  await expect(page.getByLabel("Current operation", { exact: true })).toContainText("Install WinterPack");
  await expect(page.getByLabel("Current operation details", { exact: true })).toContainText("Prepare files - winterpack");
  await expect(page.getByLabel("Current operation details", { exact: true })).toContainText("Working");
  await expect(page.getByLabel("Current operation step breakdown", { exact: true })).toContainText("0 done");
  await expect(page.getByLabel("Current operation step breakdown", { exact: true })).toContainText("5 working");
  await expect(page.getByLabel("Current operation step breakdown", { exact: true })).toContainText("1 waiting");
  await expect(page.getByLabel("Current operation", { exact: true })).toContainText("Downloading pack files");
  await expect(page.getByRole("progressbar", { name: "Install WinterPack progress" })).toHaveAttribute(
    "aria-valuenow",
    "70",
  );
  await expect(page.getByLabel("Recent activity").locator(".event-row")).toHaveCount(5);
  await expect(page.getByLabel("Activity views")).toContainText("Overview");
  await expect(page.getByLabel("Activity views")).toContainText("Downloads");
  await expect(page.getByLabel("Activity views")).toContainText("Games");
  await expect(page.getByLabel("Activity views")).not.toContainText("Processes");
  await expect(page.getByLabel("Activity views")).toContainText("History");
  await expect(page.getByLabel("Activity controls")).toContainText("Refresh");
  await expect(page.getByLabel("Activity controls")).toContainText("Clear finished");
  await expect(page.getByLabel("Activity controls")).toContainText("Auto refresh");
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText("pack files ready");
  await expect(page.getByRole("button", { name: "Overview" })).toHaveClass(/active/);
  await expect(page.locator(".process-row")).toHaveCount(0);
  await page.getByLabel("Activity views").getByRole("button", { name: "Downloads", exact: true }).click();
  await expect(page.getByLabel("Download activity").locator(".event-row")).toHaveCount(6);
  await expect(page.getByLabel("Download activity")).toContainText("Downloading file: client-1.20.1");
  await page.getByLabel("Activity views").getByRole("button", { name: "Games", exact: true }).click();

  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Games", exact: true })).toHaveClass(
    /active/,
  );
  const runningProcessRow = page.locator(".process-row").filter({ hasText: "Running" }).first();
  await expect(runningProcessRow).toContainText("Preview game is running");
  await expect(runningProcessRow).toContainText("Ran for 12m 12s");
  await expect(runningProcessRow).toContainText("2/2 log lines kept");
  await expect(runningProcessRow.getByText("View game log")).toBeVisible();
  await runningProcessRow.getByText("View game log").click();
  await expect(runningProcessRow.locator(".process-output")).toContainText("Live game output will stream here in the desktop app");
  await expect(page.locator(".process-row").filter({ hasText: "Preview crash: missing dependency" })).toBeVisible();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  const runningProcessActions = page.locator(".process-row").filter({ hasText: "Running" }).getByLabel("WinterPack game actions").first();
  await expect(runningProcessActions).toContainText("Stop");
  await expect(runningProcessActions).toContainText("Save log");
  await expect(runningProcessActions).toContainText("Copy log text");
  await runningProcessActions.getByRole("button", { name: "Copy log text" }).click();
  const copiedProcessOutput = await page.evaluate(
    () => (window as typeof window & { __copiedProcessOutput: string }).__copiedProcessOutput,
  );
  expect(copiedProcessOutput).toContain("stdout: Live game output will stream here in the desktop app");
  await runningProcessActions.getByRole("button", { name: "Save log" }).click();
  await runningProcessActions.getByRole("button", { name: "Stop" }).click();
  await expect(page.locator(".process-row").filter({ hasText: "Stopping" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear finished" })).toBeEnabled();
  await page.getByRole("button", { name: "Clear finished" }).click();
  await expect(page.locator(".process-row").filter({ hasText: "Stopping" })).toBeVisible();
  await expect(page.locator(".process-row").filter({ hasText: "Closed with an error" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Clear finished" })).toBeDisabled();
  await page.getByRole("button", { name: "Auto refresh" }).click();
  await expect(page.getByRole("button", { name: "Auto refresh" })).toHaveClass(/active/);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.getByRole("button", { name: "History", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".event-row").filter({ hasText: "Preview activity history ready" })).toBeVisible();
  await expect(page.locator(".event-row").filter({ hasText: "Preview activity history ready" })).toContainText(
    "Game setup - winterpack",
  );
  const fileDetails = page.getByLabel("File download details");
  await expect(fileDetails).toContainText("View download details (5 download updates)");
  await expect(page.locator(".event-row").filter({ hasText: "Downloaded file: client-1.20.1" })).not.toBeVisible();
  await fileDetails.getByText("View download details (5 download updates)").click();
  await expect(page.locator(".event-row").filter({ hasText: "Downloaded file: client-1.20.1" })).toContainText(
    "Prepare files - winterpack",
  );
  await expect(page.locator(".event-row").filter({ hasText: "Already have file: user-options" })).toContainText(
    "Prepare files - winterpack",
  );
  await expect(
    page.locator(".event-row").filter({ hasText: "Preview activity history ready" }),
  ).toContainText("3/9/2024");
  await expect(page.locator(".event-row").filter({ hasText: "Preview process exited with exit code 7" })).toContainText(
    "Game status - preview process",
  );
  await expect(page.getByText("Event log is mocked in web preview")).toHaveCount(0);
  await expect(page.getByText("Game status is mocked in web preview")).toHaveCount(0);
});

test("activity active operation without percent uses working progress", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "list_launcher_events") {
            return [
              {
                id: "working-event",
                operationId: "working-operation",
                operation: "download_artifacts",
                subjectId: "winterpack",
                kind: "active",
                message: "Preparing files",
                occurredAtUnixSeconds: 1_710_000_000,
              },
            ];
          }
          if (cmd === "list_managed_processes" || cmd === "list_minecraft_accounts") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        listen: async () => () => undefined,
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Activity" }).click();

  await expect(page.getByLabel("Current operation", { exact: true })).toContainText("Preparing files");
  await expect(page.getByLabel("Current operation", { exact: true })).toContainText("Working");
  const operationRow = page.locator(".event-row").filter({ hasText: "Preparing files" });
  await expect(operationRow).toContainText("Working");
  const progressbar = page.getByRole("progressbar", { name: "Install WinterPack progress" });
  await expect(progressbar).toBeVisible();
  await expect(progressbar).not.toHaveAttribute("aria-valuenow", /.+/);
});

test("activity file progress uses mod loader context for setup downloads", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/TheBoysLauncher/data",
                configDir: "C:/TheBoysLauncher/config",
                cacheDir: "C:/TheBoysLauncher/cache",
                logDir: "C:/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "list_launcher_events") {
            return [
              {
                id: "modloader-download",
                operationId: "modloader-setup",
                operation: "download_artifacts",
                subjectId: "winterpack-modloader-artifacts",
                kind: "downloading",
                message: "Downloading file: installer-lib.jar (library, 1.2 MB)",
                progressPercent: 33,
                occurredAtUnixSeconds: 1_710_000_000,
              },
            ];
          }
          if (cmd === "list_managed_processes" || cmd === "list_minecraft_accounts") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        listen: async () => () => undefined,
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Activity" }).click();

  await expect(page.getByLabel("Latest file progress")).toContainText("Now: mod loader files");
  await expect(page.getByLabel("Latest file progress")).not.toContainText("Now: Minecraft libraries");
});

test("native event log refresh failure preserves real activity state", async ({ page }) => {
  await page.addInitScript(() => {
    let failEventRefresh = false;
    Object.defineProperty(window, "__failNativeEventRefresh", {
      get: () => failEventRefresh,
      set: (value: boolean) => {
        failEventRefresh = value;
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/TheBoysLauncher/data",
                configDir: "C:/TheBoysLauncher/config",
                cacheDir: "C:/TheBoysLauncher/cache",
                logDir: "C:/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "list_launcher_events") {
            if ((window as typeof window & { __failNativeEventRefresh: boolean }).__failNativeEventRefresh) {
              throw new Error("event log database unavailable");
            }
            return [
              {
                id: "real-launch-event",
                operationId: "real-launch",
                operation: "launch_profile",
                subjectId: "winterpack",
                kind: "completed",
                message: "Real launch event from native log",
                progressPercent: 100,
                occurredAtUnixSeconds: 1_710_000_000,
              },
            ];
          }
          if (cmd === "list_managed_processes") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Friends service is not reachable; packaged service can be started from Settings.",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Activity" }).click();
  await expect(page.getByLabel("Launcher tasks")).toContainText("Real launch event from native log");

  await page.evaluate(() => {
    (window as typeof window & { __failNativeEventRefresh: boolean }).__failNativeEventRefresh = true;
  });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText(
    "Activity history is unavailable right now. Try again after restarting the launcher.",
  );
  await expect(page.getByLabel("Launcher status message")).not.toContainText("event log database unavailable");
  await expect(page.getByLabel("Launcher tasks")).toContainText("Real launch event from native log");
  await expect(page.getByText("Event log is mocked in web preview")).toHaveCount(0);

  await page.getByLabel("Activity views").getByRole("button", { name: "History", exact: true }).click();
  await expect(page.locator(".event-row").filter({ hasText: "Real launch event from native log" })).toBeVisible();
  await expect(page.locator(".event-row").filter({ hasText: "Event log is mocked in web preview" })).toHaveCount(0);
});

test("activity event log sanitizes cached launch setup failures", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/TheBoysLauncher/data",
                configDir: "C:/TheBoysLauncher/config",
                cacheDir: "C:/TheBoysLauncher/cache",
                logDir: "C:/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  loader: "forge",
                  gameVersion: "1.20.1",
                  memoryMb: 6144,
                  jvmArgs: [],
                },
              ],
              imports: [],
            };
          }
          if (cmd === "list_launcher_events") {
            return [
              {
                id: "cached-launch-setup-failure",
                operationId: "cached-launch-setup",
                operation: "launch_profile",
                subjectId: "winterpack",
                kind: "failed",
                message:
                  "launch artifact is missing: asset index is missing. Install or repair the profile before launching.",
                progressPercent: 100,
                occurredAtUnixSeconds: 1_710_000_000,
              },
            ];
          }
          if (cmd === "list_managed_processes") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Friends service is not reachable; packaged service can be started from Settings.",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Activity" }).click();

  await expect(page.getByLabel("Launcher tasks")).toContainText(
    "Game files are missing. The launcher will set them up automatically.",
  );
  await expect(page.getByText("Install or repair")).toHaveCount(0);
  await expect(page.getByText("launch artifact is missing")).toHaveCount(0);

  await page.getByLabel("Activity views").getByRole("button", { name: "History", exact: true }).click();
  const cachedFailure = page.locator(".event-row").filter({ hasText: "Game files are missing" });
  await expect(cachedFailure).toBeVisible();
  await expect(cachedFailure).toContainText("Start game - winterpack");
  await expect(cachedFailure.getByRole("button", { name: "Try play again" })).toBeVisible();
});

test("activity event log sanitizes automatic setup failure prefixes", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/TheBoysLauncher/data",
                configDir: "C:/TheBoysLauncher/config",
                cacheDir: "C:/TheBoysLauncher/cache",
                logDir: "C:/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  loader: "forge",
                  gameVersion: "1.20.1",
                  memoryMb: 6144,
                  jvmArgs: [],
                },
              ],
              imports: [],
            };
          }
          if (cmd === "list_launcher_events") {
            return [
              {
                id: "cached-auto-setup-failure",
                operationId: "cached-auto-setup",
                operation: "launch_profile",
                subjectId: "winterpack",
                kind: "failed",
                message: "Automatic profile setup before launch failed: asset index is missing",
                progressPercent: 100,
                occurredAtUnixSeconds: 1_710_000_000,
              },
              {
                id: "cached-auto-repair-failure",
                operationId: "cached-auto-repair",
                operation: "launch_profile",
                subjectId: "winterpack",
                kind: "failed",
                message: "Automatic profile repair before launch failed: natives directory is missing",
                progressPercent: 100,
                occurredAtUnixSeconds: 1_710_000_001,
              },
            ];
          }
          if (cmd === "list_managed_processes") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Friends service is not reachable; packaged service can be started from Settings.",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Activity" }).click();

  await expect(page.getByLabel("Launcher tasks")).toContainText("Automatic setup before launch failed: asset index is missing");
  await expect(page.getByLabel("Launcher tasks")).toContainText("Automatic setup before launch failed: natives directory is missing");
  await expect(page.getByText("Automatic profile setup before launch failed")).toHaveCount(0);
  await expect(page.getByText("Automatic profile repair before launch failed")).toHaveCount(0);
});

test("activity event log sanitizes launch startup process failures", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/TheBoysLauncher/data",
                configDir: "C:/TheBoysLauncher/config",
                cacheDir: "C:/TheBoysLauncher/cache",
                logDir: "C:/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  loader: "forge",
                  gameVersion: "1.20.1",
                  memoryMb: 6144,
                  jvmArgs: [],
                },
              ],
              imports: [],
            };
          }
          if (cmd === "list_launcher_events") {
            return [
              {
                id: "cached-launch-startup-failure",
                operationId: "cached-launch-startup",
                operation: "launch_profile",
                subjectId: "winterpack",
                kind: "failed",
                message: "launch process exited during startup with exit code 1",
                progressPercent: 100,
                occurredAtUnixSeconds: 1_710_000_000,
              },
            ];
          }
          if (cmd === "list_managed_processes") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Activity" }).click();

  await expect(page.getByLabel("Launcher tasks")).toContainText("Game closed during startup with exit code 1");
  await expect(page.getByText("launch process")).toHaveCount(0);

  await page.getByLabel("Activity views").getByRole("button", { name: "History", exact: true }).click();
  const cachedFailure = page.locator(".event-row").filter({ hasText: "Game closed during startup" });
  await expect(cachedFailure).toBeVisible();
  await expect(cachedFailure).toContainText("Start game - winterpack");
});

test("activity overview sorts operations by latest event update", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/TheBoysLauncher/data",
                configDir: "C:/TheBoysLauncher/config",
                cacheDir: "C:/TheBoysLauncher/cache",
                logDir: "C:/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "list_launcher_events") {
            return [
              {
                id: "install-queued",
                operationId: "install-operation",
                operation: "install_pack",
                subjectId: "winterpack",
                kind: "queued",
                message: "Install queued for WinterPack",
                progressPercent: 0,
                occurredAtUnixSeconds: 1_710_000_000,
              },
              {
                id: "download-queued",
                operationId: "download-operation",
                operation: "download_artifacts",
                subjectId: "winterpack",
                kind: "queued",
                message: "Artifact download queued for winterpack",
                progressPercent: 0,
                occurredAtUnixSeconds: 1_710_000_001,
              },
              {
                id: "download-complete",
                operationId: "download-operation",
                operation: "download_artifacts",
                subjectId: "winterpack",
                kind: "completed",
                message: "Downloaded artifact: forge-bootstrap",
                progressPercent: 100,
                occurredAtUnixSeconds: 1_710_000_002,
              },
              {
                id: "install-complete",
                operationId: "install-operation",
                operation: "install_pack",
                subjectId: "winterpack",
                kind: "completed",
                message: "Pack installed successfully.",
                progressPercent: 100,
                occurredAtUnixSeconds: 1_710_000_003,
              },
            ];
          }
          if (cmd === "list_managed_processes") return [];
          if (cmd === "load_minecraft_session") return null;
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Activity" }).click();

  await expect(page.getByLabel("Current operation", { exact: true })).toContainText("Pack installed successfully.");
  const recentRows = page.getByLabel("Recent activity").locator(".event-row");
  await expect(recentRows.first()).toContainText("Pack installed successfully.");
  await expect(recentRows.first()).toContainText("Install pack - winterpack");
  await expect(page.getByLabel("Latest task steps")).toContainText("Latest task - Install pack - winterpack");
  await expect(page.getByLabel("Latest task steps")).toContainText("2 steps");
  await expect(page.locator(".operation-step").filter({ hasText: "Install queued for WinterPack" })).not.toBeVisible();
  await expect(page.getByLabel("Latest task steps")).toContainText("View steps");
  await expect(page.getByLabel("Latest task steps")).toContainText("Install queued for WinterPack");
  await expect(page.getByLabel("Latest task steps")).toContainText("Pack installed successfully.");
});

test("activity process row labels user-stopped exits separately from crashes", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/TheBoysLauncher/data",
                configDir: "C:/TheBoysLauncher/config",
                cacheDir: "C:/TheBoysLauncher/cache",
                logDir: "C:/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") {
            return [
              {
                id: "stopped-winterpack",
                processId: 4242,
                command: {
                  executable: "javaw.exe",
                  args: ["-Xmx6144M", "cpw.mods.bootstraplauncher.BootstrapLauncher"],
                  workingDir: "C:/TheBoysLauncher/data/profiles/winterpack",
                  env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
                },
                state: "exited",
                stopRequested: true,
                exitCode: 1,
                startedAtUnixSeconds: 1_710_000_000,
                exitedAtUnixSeconds: 1_710_000_095,
                runtimeSeconds: 95,
                totalOutputLineCount: 2,
                droppedOutputLineCount: 0,
                output: [{ stream: "stdout", line: "User stop requested" }],
              },
            ];
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Activity" }).click();
  await page.getByLabel("Activity views").getByRole("button", { name: "Games" }).click();

  const stoppedProcess = page.locator(".process-row").filter({ hasText: "User stop requested" });
  await expect(stoppedProcess).toBeVisible();
  await expect(stoppedProcess).toContainText("Stopped");
  await expect(stoppedProcess).not.toContainText("Closed with an error");
  await expect(stoppedProcess).not.toContainText("exited with code");
  await stoppedProcess.getByText("View game details").click();
  await expect(stoppedProcess.getByLabel("Minecraft game details")).toContainText("exit code: 1");
});

test("native process log export refreshes exited process state", async ({ page }) => {
  await page.addInitScript(() => {
    let exported = false;
    const invoked: string[] = [];
    const process = () => ({
      id: "running-winterpack",
      processId: 4242,
      command: {
        executable: "javaw.exe",
        args: ["-Xmx6144M", "cpw.mods.bootstraplauncher.BootstrapLauncher"],
        workingDir: "C:/TheBoysLauncher/data/profiles/winterpack",
        env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
      },
      state: exported ? "exited" : "running",
      exitCode: exported ? 0 : undefined,
      startedAtUnixSeconds: 1_710_000_000,
      exitedAtUnixSeconds: exported ? 1_710_000_120 : undefined,
      runtimeSeconds: exported ? 120 : 95,
      totalOutputLineCount: 2,
      droppedOutputLineCount: 0,
      output: [
        { stream: "stdout", line: "WinterPack is running" },
        { stream: "stdout", line: exported ? "Minecraft exited cleanly" : "Waiting for close" },
      ],
    });

    Object.defineProperty(window, "__logExportInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/TheBoysLauncher/data",
                configDir: "C:/TheBoysLauncher/config",
                cacheDir: "C:/TheBoysLauncher/cache",
                logDir: "C:/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  tagline: "Cozy survival with friends.",
                  version: "2.3.7",
                  status: "installed",
                  accent: "#67e8b9",
                  installedPlayers: 0,
                  defaultServer: "The Cabin",
                },
              ],
              profiles: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  loader: "forge",
                  gameVersion: "1.20.1",
                  installedPackVersion: "2.3.7",
                  memoryMb: 6144,
                  jvmArgs: [],
                },
              ],
              imports: [],
            };
          }
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [process()];
          if (cmd === "export_managed_process_log") {
            exported = true;
            return {
              managedProcessId: "running-winterpack",
              processId: 4242,
              path: "C:/TheBoysLauncher/logs/processes/winterpack.log",
              lineCount: 2,
              totalOutputLineCount: 5,
              droppedOutputLineCount: 3,
            };
          }
          if (cmd === "reveal_exported_process_log") return undefined;
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Activity" }).click();
  await page.getByLabel("Activity views").getByRole("button", { name: "Games" }).click();

  const processRow = page.locator(".process-row").filter({ hasText: "WinterPack is running" });
  await expect(processRow).toContainText("Running");
  await processRow.getByRole("button", { name: "Save log" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText(
    "Game log saved (2/5 log lines kept - 3 older lines hidden)",
  );
  await expect(page.getByLabel("Launcher status message")).not.toContainText("C:/TheBoysLauncher/logs/processes/winterpack.log");
  const logExportPanel = page.getByLabel("Last game log export");
  await expect(logExportPanel).toContainText("Game log saved");
  await expect(logExportPanel).toContainText("2/5 log lines kept - 3 older lines hidden");
  await expect(logExportPanel).toContainText("C:/TheBoysLauncher/logs/processes/winterpack.log");
  await logExportPanel.getByRole("button", { name: "Open logs" }).click();
  await expect(page.getByRole("complementary")).toContainText("Opened game log folder");
  await expect(processRow).toContainText("Closed");
  await expect(processRow.getByRole("button", { name: "Stop" })).toHaveCount(0);
  await expect(processRow.getByRole("button", { name: "Save log" })).toBeVisible();
  await logExportPanel.getByRole("button", { name: "Dismiss game log export" }).click();
  await expect(page.getByLabel("Last game log export")).toHaveCount(0);

  await page.getByRole("button", { name: "Library" }).click();
  const profile = page.locator(".profile-row").filter({ hasText: "WinterPack" });
  await expect(profile.getByLabel("WinterPack launch actions").getByRole("button", { name: "Play" })).toBeEnabled();
  await openProfileCustomize(profile);
  await expect(profile.getByLabel("WinterPack danger actions").getByRole("button", { name: "Delete" })).toBeEnabled();

  const invoked = await page.evaluate(() => (window as typeof window & { __logExportInvokes: string[] }).__logExportInvokes);
  expect(invoked.indexOf("list_managed_processes", invoked.indexOf("export_managed_process_log"))).toBeGreaterThan(
    invoked.indexOf("export_managed_process_log"),
  );
  expect(invoked).toContain("reveal_exported_process_log");
  expect(invoked.indexOf("reveal_exported_process_log")).toBeGreaterThan(invoked.indexOf("export_managed_process_log"));
});

test("activity process log export opens the Activity log receipt", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    const runningProcess = {
      id: "running-winterpack",
      processId: 4242,
      command: {
        executable: "javaw.exe",
        args: ["-Xmx6144M", "cpw.mods.bootstraplauncher.BootstrapLauncher"],
        workingDir: "C:/TheBoysLauncher/data/profiles/winterpack",
        env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
      },
      state: "running",
      startedAtUnixSeconds: 1_710_000_000,
      runtimeSeconds: 95,
      totalOutputLineCount: 2,
      droppedOutputLineCount: 0,
      output: [{ stream: "stdout", line: "WinterPack is running" }],
    };

    Object.defineProperty(window, "__libraryLogExportInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/TheBoysLauncher/data",
                configDir: "C:/TheBoysLauncher/config",
                cacheDir: "C:/TheBoysLauncher/cache",
                logDir: "C:/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  tagline: "Cozy survival with friends.",
                  version: "2.3.7",
                  status: "installed",
                  accent: "#67e8b9",
                  installedPlayers: 0,
                  defaultServer: "The Cabin",
                },
              ],
              profiles: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  loader: "forge",
                  gameVersion: "1.20.1",
                  memoryMb: 6144,
                  jvmArgs: [],
                  lastPlayed: "Never",
                },
              ],
              imports: [],
            };
          }
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [runningProcess];
          if (cmd === "export_managed_process_log") {
            return {
              managedProcessId: "running-winterpack",
              processId: 4242,
              path: "C:/TheBoysLauncher/logs/processes/winterpack.log",
              lineCount: 2,
              totalOutputLineCount: 2,
              droppedOutputLineCount: 0,
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Activity" }).click();
  await page.getByLabel("Activity views").getByRole("button", { name: "Games" }).click();
  const processRow = page.locator(".process-row").filter({ hasText: "WinterPack is running" });
  await expect(processRow).toBeVisible();
  await processRow.getByRole("button", { name: "Save log" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Games", exact: true })).toHaveClass(
    /active/,
  );
  const logExportPanel = page.getByLabel("Last game log export");
  await expect(logExportPanel).toContainText("Game log saved");
  await expect(logExportPanel).toContainText("2 log lines kept");
  await expect(logExportPanel).toContainText("C:/TheBoysLauncher/logs/processes/winterpack.log");
  await expect(logExportPanel.getByRole("button", { name: "Open logs" })).toBeVisible();

  const invoked = await page.evaluate(() => (window as typeof window & { __libraryLogExportInvokes: string[] }).__libraryLogExportInvokes);
  expect(invoked.indexOf("list_managed_processes", invoked.indexOf("export_managed_process_log"))).toBeGreaterThan(
    invoked.indexOf("export_managed_process_log"),
  );
});

test("native process action failures preserve process state", async ({ page }) => {
  await page.addInitScript(() => {
    const runningProcess = {
      id: "running-winterpack",
      processId: 4242,
      command: {
        executable: "javaw.exe",
        args: ["-Xmx6144M", "cpw.mods.bootstraplauncher.BootstrapLauncher"],
        workingDir: "C:/TheBoysLauncher/data/profiles/winterpack",
        env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
      },
      state: "running",
      startedAtUnixSeconds: 1_710_000_000,
      runtimeSeconds: 95,
      totalOutputLineCount: 1,
      droppedOutputLineCount: 0,
      output: [{ stream: "stdout", line: "WinterPack is still running" }],
    };
    const exitedProcess = {
      id: "exited-winterpack",
      processId: 4343,
      command: {
        executable: "javaw.exe",
        args: ["-Xmx6144M", "cpw.mods.bootstraplauncher.BootstrapLauncher"],
        workingDir: "C:/TheBoysLauncher/data/profiles/winterpack-old",
        env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack-old" }],
      },
      state: "exited",
      exitCode: 0,
      startedAtUnixSeconds: 1_710_000_000,
      exitedAtUnixSeconds: 1_710_000_020,
      runtimeSeconds: 20,
      totalOutputLineCount: 1,
      droppedOutputLineCount: 0,
      output: [{ stream: "stdout", line: "Old process exited cleanly" }],
    };

    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/TheBoysLauncher/data",
                configDir: "C:/TheBoysLauncher/config",
                cacheDir: "C:/TheBoysLauncher/cache",
                logDir: "C:/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  tagline: "Cozy survival with friends.",
                  version: "2.3.7",
                  status: "installed",
                  accent: "#67e8b9",
                  installedPlayers: 0,
                  defaultServer: "The Cabin",
                },
              ],
              profiles: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  loader: "forge",
                  gameVersion: "1.20.1",
                  installedPackVersion: "2.3.7",
                  memoryMb: 6144,
                  jvmArgs: [],
                },
              ],
              imports: [],
            };
          }
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [runningProcess, exitedProcess];
          if (cmd === "stop_managed_process") throw new Error("Process stop failed: access denied");
          if (cmd === "export_managed_process_log") throw new Error("Process log export failed: disk full");
          if (cmd === "clear_exited_managed_processes") {
            throw new Error("Clearing exited processes failed: registry locked");
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Activity" }).click();
  await page.getByLabel("Activity views").getByRole("button", { name: "Games" }).click();

  const runningRow = page.locator(".process-row").filter({ hasText: "WinterPack is still running" });
  const exitedRow = page.locator(".process-row").filter({ hasText: "Old process exited cleanly" });
  await expect(runningRow).toContainText("Running");
  await expect(exitedRow).toContainText("Closed");

  await runningRow.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText("Stopping game failed: access denied");
  await expect(runningRow).toContainText("Running");
  await expect(runningRow.getByRole("button", { name: "Stop" })).toBeEnabled();

  await runningRow.getByRole("button", { name: "Save log" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText("Game log export failed: disk full");
  await expect(page.getByLabel("Last game log export")).toHaveCount(0);

  await page.getByLabel("Activity controls").getByRole("button", { name: "Clear finished" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText(
    "Clearing finished games failed: registry locked",
  );
  await expect(exitedRow).toBeVisible();
});

test("native process log reveal failure keeps exported log receipt", async ({ page }) => {
  await page.addInitScript(() => {
    const process = {
      id: "running-winterpack",
      processId: 4242,
      command: {
        executable: "javaw.exe",
        args: ["-Xmx6144M", "cpw.mods.bootstraplauncher.BootstrapLauncher"],
        workingDir: "C:/TheBoysLauncher/data/profiles/winterpack",
        env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
      },
      state: "running",
      startedAtUnixSeconds: 1_710_000_000,
      runtimeSeconds: 95,
      totalOutputLineCount: 2,
      droppedOutputLineCount: 0,
      output: [{ stream: "stdout", line: "WinterPack is running" }],
    };

    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/TheBoysLauncher/data",
                configDir: "C:/TheBoysLauncher/config",
                cacheDir: "C:/TheBoysLauncher/cache",
                logDir: "C:/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  tagline: "Cozy survival with friends.",
                  version: "2.3.7",
                  status: "installed",
                  accent: "#67e8b9",
                  installedPlayers: 0,
                  defaultServer: "The Cabin",
                },
              ],
              profiles: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  loader: "forge",
                  gameVersion: "1.20.1",
                  installedPackVersion: "2.3.7",
                  memoryMb: 6144,
                  jvmArgs: [],
                },
              ],
              imports: [],
            };
          }
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [process];
          if (cmd === "export_managed_process_log") {
            return {
              managedProcessId: "running-winterpack",
              processId: 4242,
              path: "C:/TheBoysLauncher/logs/processes/winterpack.log",
              lineCount: 2,
              totalOutputLineCount: 2,
              droppedOutputLineCount: 0,
            };
          }
          if (cmd === "reveal_exported_process_log") {
            throw new Error("Opening process log location failed: shell denied access");
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Activity" }).click();
  await page.getByLabel("Activity views").getByRole("button", { name: "Games" }).click();

  const processRow = page.locator(".process-row").filter({ hasText: "WinterPack is running" });
  await processRow.getByRole("button", { name: "Save log" }).click();
  const logExportPanel = page.getByLabel("Last game log export");
  await expect(logExportPanel).toContainText("C:/TheBoysLauncher/logs/processes/winterpack.log");

  await logExportPanel.getByRole("button", { name: "Open logs" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText(
    "Opening game log folder failed: shell denied access",
  );
  await expect(logExportPanel).toContainText("C:/TheBoysLauncher/logs/processes/winterpack.log");
});

test("exited native process row can relaunch its profile from Activity", async ({ page }) => {
  await page.addInitScript(() => {
    let relaunched = false;
    const invoked: string[] = [];
    const exitedProcess = {
      id: "exited-winterpack",
      processId: 4242,
      command: {
        executable: "javaw.exe",
        args: ["-Xmx6144M", "cpw.mods.bootstraplauncher.BootstrapLauncher"],
        workingDir: "C:/TheBoysLauncher/data/profiles/winterpack",
        env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
      },
      state: "exited",
      exitCode: 0,
      startedAtUnixSeconds: 1_710_000_000,
      exitedAtUnixSeconds: 1_710_000_120,
      runtimeSeconds: 120,
      totalOutputLineCount: 2,
      droppedOutputLineCount: 0,
      output: [
        { stream: "stdout", line: "WinterPack stopped cleanly" },
        { stream: "stdout", line: "Ready to relaunch" },
      ],
    };
    const runningProcess = {
      ...exitedProcess,
      id: "relaunched-winterpack",
      processId: 4243,
      state: "running",
      exitCode: undefined,
      exitedAtUnixSeconds: undefined,
      runtimeSeconds: 1,
      output: [{ stream: "stdout", line: "WinterPack relaunched from Activity" }],
    };
    const otherPack = {
      id: "otherpack",
      name: "Other Pack",
      tagline: "An unrelated install lane.",
      version: "1.0.0",
      status: "update_available",
      accent: "#38bdf8",
      installedPlayers: 0,
      defaultServer: "Other Server",
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/TheBoysLauncher/data",
        configDir: "C:/TheBoysLauncher/config",
        cacheDir: "C:/TheBoysLauncher/cache",
        logDir: "C:/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [
        otherPack,
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Cozy survival with friends.",
          version: "2.3.7",
          status: "installed",
          accent: "#67e8b9",
          installedPlayers: 0,
          defaultServer: "The Cabin",
        },
      ],
      profiles: [
        {
          id: "winterpack",
          name: "WinterPack",
          loader: "forge",
          gameVersion: "1.20.1",
          installedPackVersion: "2.3.7",
          memoryMb: 6144,
          jvmArgs: [],
        },
        {
          id: "otherpack",
          name: "Other Pack",
          loader: "vanilla",
          gameVersion: "1.21.8",
          installedPackVersion: "0.9.0",
          memoryMb: 4096,
          jvmArgs: [],
        },
      ],
      imports: [],
    });

    Object.defineProperty(window, "__activityRelaunchInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return relaunched ? [runningProcess] : [exitedProcess];
          if (cmd === "plan_install_pack") {
            return {
              operationId: "otherpack-install",
              operation: "install_pack",
              subjectId: "otherpack",
              events: [
                { kind: "queued", message: "Install queued for Other Pack", progressPercent: 0 },
                { kind: "completed", message: "Install plan is ready to execute.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "install_pack") return new Promise(() => undefined);
          if (cmd === "start_launch_process") {
            relaunched = true;
            return runningProcess;
          }
          if (cmd === "load_minecraft_session") return null;
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Library" }).click();
  await page
    .locator(".profile-row")
    .filter({ hasText: "Other Pack" })
    .getByLabel("Other Pack launch actions")
    .getByRole("button", { name: "Update" })
    .click();
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await page.getByRole("button", { name: "Activity" }).click();
  await page.getByLabel("Activity views").getByRole("button", { name: "Games", exact: true }).click();

  const exitedRow = page.locator(".process-row").filter({ hasText: "Ready to relaunch" });
  await expect(exitedRow).toContainText("Closed");
  const exitedProcessActions = exitedRow.getByLabel("WinterPack game actions");
  await expect(exitedProcessActions.getByRole("button", { name: "Play" })).toBeEnabled();
  await expect(exitedProcessActions.getByRole("button", { name: "Stop" })).toHaveCount(0);
  await expect(exitedProcessActions).toContainText("Save log");
  await exitedProcessActions.getByRole("button", { name: "Play" }).click();

  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Games", exact: true })).toHaveClass(
    /active/,
  );
  const relaunchedRow = page.locator(".process-row").filter({ hasText: "WinterPack relaunched from Activity" });
  await expect(relaunchedRow).toContainText("Running");
  await expect(page.getByRole("button", { name: "Auto refresh" })).toHaveClass(/active/);

  const invoked = await page.evaluate(
    () => (window as typeof window & { __activityRelaunchInvokes: string[] }).__activityRelaunchInvokes,
  );
  expect(invoked).toContain("start_launch_process");
  expect(invoked.indexOf("start_launch_process")).toBeGreaterThan(invoked.indexOf("list_managed_processes"));
});

test("stopping a native process keeps playing presence while stop is pending", async ({ page }) => {
  const accountId = "00000000-0000-4000-8000-000000000001";
  const issuedAtUnixSeconds = Math.floor(Date.now() / 1000);
  const expiresAtUnixSeconds = issuedAtUnixSeconds + 3600;
  const accessToken = `dev-session:${accountId}:${expiresAtUnixSeconds}`;
  let presenceBody = "";
  let presenceAuthorization = "";

  await page.route("http://127.0.0.1:4074/**", async (route) => {
    const request = route.request();
    const corsHeaders = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (request.url().endsWith("/dev/sessions")) {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          tokenType: "Bearer",
          sessionKind: "dev",
          accessToken,
          authorizationHeader: `Bearer ${accessToken}`,
          issuedAtUnixSeconds,
          expiresAtUnixSeconds,
        }),
      });
      return;
    }
    if (request.url().endsWith("/sessions/current")) {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          tokenType: "Bearer",
          sessionKind: "dev",
          expiresAtUnixSeconds,
          secondsRemaining: 3600,
        }),
      });
      return;
    }
    if (request.url().endsWith("/presence")) {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: "[]",
      });
      return;
    }
    if (request.url().endsWith(`/presence/${accountId}`)) {
      presenceBody = request.postData() ?? "";
      presenceAuthorization = request.headers()["authorization"] ?? "";
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          state: "online",
          updatedAt: "2026-06-25T12:00:00Z",
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, headers: corsHeaders });
  });

  await page.addInitScript(() => {
    let stopped = false;
    const process = () => ({
      id: "running-winterpack",
      processId: 4242,
      command: {
        executable: "javaw.exe",
        args: ["-Xmx6144M", "cpw.mods.bootstraplauncher.BootstrapLauncher"],
        workingDir: "C:/TheBoysLauncher/data/profiles/winterpack",
        env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
      },
      state: stopped ? "stop_requested" : "running",
      stopRequested: stopped,
      startedAtUnixSeconds: 1_710_000_000,
      runtimeSeconds: stopped ? 96 : 95,
      totalOutputLineCount: 1,
      droppedOutputLineCount: 0,
      output: [{ stream: "stdout", line: stopped ? "Stopping WinterPack" : "WinterPack is running" }],
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/TheBoysLauncher/data",
                configDir: "C:/TheBoysLauncher/config",
                cacheDir: "C:/TheBoysLauncher/cache",
                logDir: "C:/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  tagline: "Cozy survival with friends.",
                  version: "2.3.7",
                  status: "installed",
                  accent: "#67e8b9",
                  installedPlayers: 0,
                  defaultServer: "The Cabin",
                },
              ],
              profiles: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  loader: "forge",
                  gameVersion: "1.20.1",
                  installedPackVersion: "2.3.7",
                  memoryMb: 6144,
                  jvmArgs: [],
                },
              ],
              imports: [],
            };
          }
          if (cmd === "list_launcher_events") {
            return stopped
              ? [
                  {
                    id: "stop-requested-event",
                    operationId: "running-winterpack",
                    operation: "managed_process",
                    subjectId: "running-winterpack",
                    kind: "verifying",
                    message: "Stop requested for pid 4242 (javaw.exe)",
                    progressPercent: 75,
                    occurredAtUnixSeconds: 1_710_000_010,
                  },
                ]
              : [];
          }
          if (cmd === "list_managed_processes") return [process()];
          if (cmd === "stop_managed_process") {
            stopped = true;
            return process();
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: true,
              managed: false,
              message: "Reachable",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Activity" }).click();
  await page.getByLabel("Activity views").getByRole("button", { name: "Games", exact: true }).click();
  await page.locator(".process-row").filter({ hasText: "WinterPack is running" }).getByRole("button", { name: "Stop" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText("Stopping game");
  await expect(page.getByLabel("Launcher status message")).not.toContainText("javaw.exe");
  await page.getByLabel("Activity views").getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.getByLabel("Launcher tasks")).toContainText("Stopping game");
  await expect(page.getByLabel("Launcher tasks")).not.toContainText("javaw.exe");
  await page.getByLabel("Activity views").getByRole("button", { name: "Games", exact: true }).click();
  const stoppingProcess = page.locator(".process-row").filter({ hasText: "Stopping WinterPack" });
  await expect(stoppingProcess).toContainText("Stopping");
  await expect(stoppingProcess.getByRole("button", { name: "Stopping" })).toBeDisabled();
  expect(presenceAuthorization).toBe("");
  expect(presenceBody).toBe("");
  await page.locator("nav").getByRole("button", { name: "Home" }).click();
  await expect(page.getByLabel("Home party panel")).toContainText("0 parties");
  await expect(page.getByLabel("Home party panel")).not.toContainText("WinterPack");
});

test("stopping a native process clears local playing presence after exit", async ({ page }) => {
  const accountId = "00000000-0000-4000-8000-000000000001";
  const issuedAtUnixSeconds = Math.floor(Date.now() / 1000);
  const expiresAtUnixSeconds = issuedAtUnixSeconds + 3600;
  const accessToken = `dev-session:${accountId}:${expiresAtUnixSeconds}`;
  let presenceBody = "";
  let presenceAuthorization = "";

  await page.route("http://127.0.0.1:4074/**", async (route) => {
    const request = route.request();
    const corsHeaders = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (request.url().endsWith("/dev/sessions")) {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          tokenType: "Bearer",
          sessionKind: "dev",
          accessToken,
          authorizationHeader: `Bearer ${accessToken}`,
          issuedAtUnixSeconds,
          expiresAtUnixSeconds,
        }),
      });
      return;
    }
    if (request.url().endsWith("/sessions/current")) {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          tokenType: "Bearer",
          sessionKind: "dev",
          expiresAtUnixSeconds,
          secondsRemaining: 3600,
        }),
      });
      return;
    }
    if (request.url().endsWith("/presence")) {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: "[]",
      });
      return;
    }
    if (request.url().endsWith(`/presence/${accountId}`)) {
      presenceBody = request.postData() ?? "";
      presenceAuthorization = request.headers()["authorization"] ?? "";
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          state: "online",
          updatedAt: "2026-06-25T12:00:00Z",
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, headers: corsHeaders });
  });

  await page.addInitScript(() => {
    const process = () => ({
      id: "running-winterpack",
      processId: 4242,
      command: {
        executable: "javaw.exe",
        args: ["-Xmx6144M", "cpw.mods.bootstraplauncher.BootstrapLauncher"],
        workingDir: "C:/TheBoysLauncher/data/profiles/winterpack",
        env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
      },
      state: "running",
      startedAtUnixSeconds: 1_710_000_000,
      runtimeSeconds: 95,
      totalOutputLineCount: 1,
      droppedOutputLineCount: 0,
      output: [{ stream: "stdout", line: "WinterPack is running" }],
    });
    const stoppedProcess = () => ({
      ...process(),
      state: "exited",
      stopRequested: true,
      exitCode: 1,
      exitedAtUnixSeconds: 1_710_000_096,
      runtimeSeconds: 96,
      output: [{ stream: "stdout", line: "WinterPack stopped" }],
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/TheBoysLauncher/data",
                configDir: "C:/TheBoysLauncher/config",
                cacheDir: "C:/TheBoysLauncher/cache",
                logDir: "C:/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  tagline: "Cozy survival with friends.",
                  version: "2.3.7",
                  status: "installed",
                  accent: "#67e8b9",
                  installedPlayers: 0,
                  defaultServer: "The Cabin",
                },
              ],
              profiles: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  loader: "forge",
                  gameVersion: "1.20.1",
                  installedPackVersion: "2.3.7",
                  memoryMb: 6144,
                  jvmArgs: [],
                },
              ],
              imports: [],
            };
          }
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [process()];
          if (cmd === "stop_managed_process") return stoppedProcess();
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: true,
              managed: false,
              message: "Reachable",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Activity" }).click();
  await page.getByLabel("Activity views").getByRole("button", { name: "Games" }).click();
  await page.locator(".process-row").filter({ hasText: "WinterPack is running" }).getByRole("button", { name: "Stop" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText("WinterPack stopped");
  await expect(page.getByLabel("Launcher status message")).not.toContainText("javaw.exe");
  expect(presenceAuthorization).toBe(`Bearer ${accessToken}`);
  expect(JSON.parse(presenceBody)).toEqual({ state: "online" });
  await page.locator("nav").getByRole("button", { name: "Play" }).click();
  await expect(page.getByLabel("Home party panel")).toContainText("0 parties");
  await expect(page.getByLabel("Home party panel")).not.toContainText("WinterPack");
});

test("settings render memory and offline profile data", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();

  await expect(page.getByLabel("Settings account actions")).toContainText("Use preview account");
  await expect(page.getByText("Usage sharing", { exact: true })).toBeVisible();
  await expect(page.getByText("Usage sharing off", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Diagnostics" })).toHaveCount(0);
  await expect(page.getByLabel("Settings account actions")).not.toContainText("Renew");
  await expect(page.getByLabel("Settings account actions")).not.toContainText("Finish sign in");
  await expect(page.getByLabel("Settings account actions")).not.toContainText("Sign out");
  await expect(page.getByLabel("Settings account actions")).not.toContainText("Add account");
  await expect(page.getByLabel("Settings account actions")).not.toContainText("Accounts");
  await expect(page.getByRole("button", { name: "Advanced" })).toBeVisible();
  await page.getByRole("button", { name: "Advanced" }).click();
  await expect(page.getByLabel("Settings account maintenance actions")).toContainText("Renew");
  await expect(page.getByLabel("Settings account maintenance actions")).toContainText("Finish sign in");
  await expect(page.getByLabel("Settings account maintenance actions")).toContainText("Sign out");
  await expect(page.getByLabel("Settings runtime actions")).toContainText("Find Java");
  await expect(page.getByLabel("Settings runtime actions")).toContainText("Recommended Java");
  await expect(page.getByLabel("Settings runtime actions")).not.toContainText("Check friends");
  await expect(page.getByLabel("Settings service actions")).toContainText("Check friends");
  await expect(page.getByLabel("Settings service actions")).toContainText("Start local service");
  await expect(page.getByLabel("Settings service actions")).toContainText("Stop local service");
  await expect(page.getByLabel("Advanced launcher status")).toContainText("Usage sharing");
  await expect(page.getByLabel("Advanced launcher status")).toContainText("Off");
  await expect(page.getByLabel("Advanced launcher status")).toContainText("Available in desktop app");
  await expect(page.getByLabel("Advanced launcher status")).not.toContainText("Native data directory unavailable");
  await expect(page.getByLabel("Advanced launcher status")).not.toContainText("Native logs directory unavailable");
  await expect(page.getByLabel("Minecraft memory")).toHaveValue("6144");
  await expect(page.getByLabel("Offline username")).toHaveValue("Player");
  await expect(page.locator(".setting", { has: page.getByText("Minecraft account", { exact: true }) })).toContainText("Not signed in");
  await expect(page.getByRole("heading", { name: "Memory allocation" })).toBeVisible();
  await expect(page.getByText("How much RAM to give the game.")).toBeVisible();
  await expect(page.getByLabel("Downloads concurrency")).toContainText("4 (Recommended)");
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
  await expect(page.getByLabel("Settings save status")).toContainText("Settings saved");
  await expect(page.getByText("Connection", { exact: true })).toBeVisible();
  await expect(page.getByText("Connection details", { exact: true })).toBeVisible();
  await page.getByText("Connection details", { exact: true }).click();
  await expect(page.getByText("http://127.0.0.1:4074", { exact: true })).toBeVisible();
  await page.getByText("View folders", { exact: true }).click();
  await expect(page.getByLabel("Settings overview")).toContainText("Available in desktop app");
  await expect(page.getByLabel("Settings overview")).not.toContainText("Native data directory unavailable");
  await expect(page.getByText("Launcher updates", { exact: true })).toBeVisible();
  await expect(page.getByText("Updates are checked automatically.")).toBeVisible();
});

test("settings save action saves preview settings", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Advanced" }).click();
  const sessionSetting = page.locator(".setting", { has: page.getByText("Minecraft account", { exact: true }) });
  await expect(sessionSetting).toContainText(/Player|Not signed in/);
  await expect(sessionSetting).not.toContainText("11111111-1111-4111-8111-111111111111");
  await page.getByLabel("Offline username").fill("Builder");
  await page.getByLabel("Settings save status").getByRole("button", { name: "Save settings" }).click();

  await expect(page.getByText("Settings saved in preview")).toBeVisible();
  await expect(page.getByText("Saving settings is mocked in web preview")).toHaveCount(0);
  await expect(page.getByLabel("Settings save status")).toContainText("Settings saved");
});

test("settings save status tracks privacy changes", async ({ page }) => {
  await page.addInitScript(() => {
    let savedSettings = {
      maxMemoryMb: 6144,
      minMemoryMb: 2048,
      offlineUsername: "Player",
      telemetryEnabled: false,
    };
    let saveRequest: unknown = null;
    Object.defineProperty(window, "__settingsSaveStatusRequest", {
      get: () => saveRequest,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { settings?: typeof savedSettings }) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: savedSettings,
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "save_settings") {
            saveRequest = args?.settings ?? null;
            savedSettings = args?.settings ?? savedSettings;
            return savedSettings;
          }
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  const saveStatus = page.getByLabel("Settings save status");
  await expect(saveStatus).toContainText("Settings saved");
  await expect(saveStatus.getByRole("button", { name: "Save settings" })).toBeDisabled();
  await expect(page.getByText("Usage sharing off", { exact: true })).toBeVisible();

  await page.getByRole("checkbox").check();
  await expect(page.getByText("Usage sharing on", { exact: true })).toBeVisible();
  await expect(saveStatus).toContainText("Unsaved settings");
  await expect(saveStatus).toContainText("Save when you are done changing launcher preferences.");
  await expect(saveStatus.getByRole("button", { name: "Save settings" })).toBeEnabled();
  await saveStatus.getByRole("button", { name: "Save settings" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText("Settings saved");
  await expect(saveStatus).toContainText("Settings saved");
  await expect(saveStatus.getByRole("button", { name: "Save settings" })).toBeDisabled();
  const request = await page.evaluate(
    () => (window as typeof window & { __settingsSaveStatusRequest: unknown }).__settingsSaveStatusRequest,
  );
  expect(request).toMatchObject({ telemetryEnabled: true });
});

test("settings global Java override can be cleared back to automatic", async ({ page }) => {
  await page.addInitScript(() => {
    let savedSettings = {
      maxMemoryMb: 6144,
      minMemoryMb: 2048,
      offlineUsername: "Player",
      telemetryEnabled: false,
      javaRuntimeOverridePath: "C:/Java/21/bin/java.exe",
    };
    let saveRequest: unknown = null;
    Object.defineProperty(window, "__settingsJavaOverrideSaveRequest", {
      get: () => saveRequest,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: { settings?: typeof savedSettings }) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: savedSettings,
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "save_settings") {
            saveRequest = args?.settings ?? null;
            savedSettings = args?.settings ?? savedSettings;
            return savedSettings;
          }
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Advanced" }).click();
  await expect(page.getByLabel("Global Java path override")).toHaveValue("C:/Java/21/bin/java.exe");
  await expect(page.getByText("Leave blank for automatic Java selection.")).toBeVisible();
  await page.getByLabel("Global Java path override").fill("");
  await expect(page.getByLabel("Settings save status")).toContainText("Unsaved settings");
  await expect(page.getByLabel("Settings save status")).toContainText("Save when you are done changing launcher preferences.");
  await expect(page.getByLabel("Settings save status").getByRole("button", { name: "Save settings" })).toBeEnabled();
  await page.getByLabel("Settings save status").getByRole("button", { name: "Save settings" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText("Settings saved");
  const request = await page.evaluate(
    () => (window as typeof window & { __settingsJavaOverrideSaveRequest: Record<string, unknown> }).__settingsJavaOverrideSaveRequest,
  );
  expect(request.javaRuntimeOverridePath).toBeUndefined();
});

test("settings native save and clear-session failures preserve real state", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              minecraftSession: {
                session: {
                  username: "Player",
                  uuid: "11111111-1111-4111-8111-111111111111",
                  accessToken: "native-token",
                },
                accountId: "11111111-1111-4111-8111-111111111111",
                expiresAtUnixSeconds: 1_900_000_000,
                storedAtUnixSeconds: 1_710_000_000,
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "save_settings") {
            throw new Error("settings store is locked by another process");
          }
          if (cmd === "clear_minecraft_session") {
            throw new Error("session keychain delete failed");
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.locator(".account-card")).toContainText("Player");
  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByLabel("Offline username").fill("Builder");
  await page.getByLabel("Settings save status").getByRole("button", { name: "Save settings" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText(
    "Settings are open in another launcher window. Close the other window and try again.",
  );
  await expect(page.getByLabel("Launcher status message")).not.toContainText("settings store is locked by another process");
  await expect(page.getByText("Saving settings is mocked in web preview")).toHaveCount(0);

  await page.getByLabel("Settings account maintenance actions").getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText(
    "The launcher could not sign out right now. Close the launcher and try again.",
  );
  await expect(page.getByLabel("Launcher status message")).not.toContainText("session keychain delete failed");
  await expect(page.getByText("Signing out is mocked in web preview")).toHaveCount(0);
  await expect(page.locator(".account-card")).toContainText("Player");
});

test("settings account refresh hides renderer session save internals", async ({ page }) => {
  await page.addInitScript(() => {
    let refreshAttempts = 0;
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              minecraftSession: {
                session: {
                  username: "Player",
                  uuid: "11111111-1111-4111-8111-111111111111",
                  accessToken: "[redacted]",
                },
                accountId: "11111111-1111-4111-8111-111111111111",
                expiresAtUnixSeconds: 1_900_000_000,
                storedAtUnixSeconds: 1_710_000_000,
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "refresh_saved_minecraft_session") {
            refreshAttempts += 1;
            if (refreshAttempts === 1) {
              throw new Error("renderer-redacted Minecraft sessions cannot be saved; refresh or sign in again");
            }
            throw new Error("No stored Minecraft session");
          }
          if (cmd === "load_minecraft_session") {
            throw new Error(
              "renderer-created Minecraft sessions cannot be saved by the packaged app; use Microsoft sign-in instead or set THEBOYS_ALLOW_RENDERER_SESSION_SAVE=true for local development",
            );
          }
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByLabel("Settings account maintenance actions").getByRole("button", { name: "Renew" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText(
    "Minecraft sign-in needs to be refreshed. Sign in again to continue.",
  );
  await expect(page.getByLabel("Launcher status message")).not.toContainText("renderer-redacted");

  await page.getByLabel("Settings account maintenance actions").getByRole("button", { name: "Renew" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText(
    "Preview accounts are only available in web preview. Use Microsoft sign-in in the desktop app.",
  );
  await expect(page.getByLabel("Launcher status message")).not.toContainText("THEBOYS_ALLOW_RENDERER_SESSION_SAVE");
  await expect(page.getByLabel("Launcher status message")).not.toContainText("local development");
});

test("settings lists stored Minecraft accounts and switches the active account", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    let activeAccountId = "account-one";
    const accountOneSession = {
      session: {
        username: "BuilderOne",
        uuid: "11111111-1111-4111-8111-111111111111",
        accessToken: "[redacted]",
      },
      accountId: "account-one",
      expiresAtUnixSeconds: 1_900_000_000,
      storedAtUnixSeconds: 1_710_000_000,
    };
    const accountTwoSession = {
      session: {
        username: "BuilderTwo",
        uuid: "22222222-2222-4222-8222-222222222222",
        accessToken: "[redacted]",
      },
      accountId: "account-two",
      expiresAtUnixSeconds: 1_900_000_000,
      storedAtUnixSeconds: 1_710_000_000,
    };
    const activeSession = () => activeAccountId === "account-one" ? accountOneSession : accountTwoSession;
    const accountSummaries = () => [
      {
        accountId: "account-one",
        username: "BuilderOne",
        uuid: "11111111-1111-4111-8111-111111111111",
        expiresAtUnixSeconds: 1_900_000_000,
        active: activeAccountId === "account-one",
      },
      {
        accountId: "account-two",
        username: "BuilderTwo",
        uuid: "22222222-2222-4222-8222-222222222222",
        expiresAtUnixSeconds: 1_900_000_000,
        active: activeAccountId === "account-two",
      },
    ];
    Object.defineProperty(window, "__accountSwitchInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: Record<string, unknown>) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              minecraftSession: activeSession(),
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "list_minecraft_accounts") return accountSummaries();
          if (cmd === "select_minecraft_account") {
            await new Promise((resolve) => setTimeout(resolve, 200));
            activeAccountId = String(args?.accountId);
            return activeSession();
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        listen: async () => () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();

  await expect(page.getByLabel("Minecraft account summary")).toContainText("2 saved accounts");
  await page.getByRole("button", { name: "Manage accounts" }).click();
  const accountDialog = page.getByRole("dialog", { name: "Manage Minecraft accounts" });
  await expect(accountDialog).toBeVisible();
  const accounts = accountDialog.getByLabel("Minecraft accounts");
  await expect(accounts).toContainText("BuilderOne");
  await expect(accounts).toContainText("BuilderTwo");
  await expect(
    accounts.locator(".runtime-row").filter({ hasText: "BuilderOne" }).getByRole("button", { name: "Selected" }),
  ).toBeDisabled();
  await accounts.locator(".runtime-row").filter({ hasText: "BuilderTwo" }).getByRole("button", { name: "Remove" }).click();
  await expect(
    accounts.locator(".runtime-row").filter({ hasText: "BuilderTwo" }).getByRole("button", { name: "Remove account" }),
  ).toBeVisible();
  await expect(accounts.locator(".runtime-row").filter({ hasText: "BuilderTwo" })).toContainText(
    "Removes it from this launcher only.",
  );

  const builderTwoRow = accounts.locator(".runtime-row").filter({ hasText: "BuilderTwo" });
  await builderTwoRow.getByRole("button", { name: "Switch" }).click();
  await expect(builderTwoRow.getByRole("button", { name: "Switching..." })).toBeDisabled();
  await builderTwoRow.getByRole("button", { name: "Switching..." }).click({ force: true });

  await expect(page.locator(".topbar").getByRole("button", { name: /BuilderTwo/ })).toBeVisible();
  await expect(accountDialog).toContainText("BuilderTwo is selected for Minecraft launches.");
  await expect(page.locator(".account-card")).toContainText("BuilderTwo");
  await expect(page.getByLabel("Launcher status message")).toContainText("Switched to BuilderTwo");
  await expect(
    accounts.locator(".runtime-row").filter({ hasText: "BuilderTwo" }).getByRole("button", { name: "Selected" }),
  ).toBeDisabled();
  await expect(
    accounts.locator(".runtime-row").filter({ hasText: "BuilderTwo" }).getByRole("button", { name: "Remove account" }),
  ).toHaveCount(0);
  await expect(accounts.locator(".runtime-row").filter({ hasText: "BuilderTwo" }).getByRole("button", { name: "Remove" })).toBeVisible();
  const invoked = await page.evaluate(() => (window as typeof window & { __accountSwitchInvokes: string[] }).__accountSwitchInvokes);
  expect(invoked.filter((cmd) => cmd === "select_minecraft_account")).toHaveLength(1);
  await page.getByRole("button", { name: "Close account manager" }).click();
  await page.locator(".topbar").getByRole("button", { name: /BuilderTwo/ }).click();
  await expect(page.getByRole("dialog", { name: "Manage Minecraft accounts" })).toBeVisible();
});

test("settings account switch and remove failures keep saved account state", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    const accountOneSession = {
      session: {
        username: "BuilderOne",
        uuid: "11111111-1111-4111-8111-111111111111",
        accessToken: "[redacted]",
      },
      accountId: "account-one",
      expiresAtUnixSeconds: 1_900_000_000,
      storedAtUnixSeconds: 1_710_000_000,
    };
    const accountSummaries = () => [
      {
        accountId: "account-one",
        username: "BuilderOne",
        uuid: "11111111-1111-4111-8111-111111111111",
        expiresAtUnixSeconds: 1_900_000_000,
        active: true,
      },
      {
        accountId: "account-two",
        username: "BuilderTwo",
        uuid: "22222222-2222-4222-8222-222222222222",
        expiresAtUnixSeconds: 1_900_000_000,
        active: false,
      },
    ];
    Object.defineProperty(window, "__failedAccountActionInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              minecraftSession: accountOneSession,
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "list_minecraft_accounts") return accountSummaries();
          if (cmd === "select_minecraft_account") throw new Error("");
          if (cmd === "remove_minecraft_account") throw new Error("");
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        listen: async () => () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Manage accounts" }).click();
  const accountDialog = page.getByRole("dialog", { name: "Manage Minecraft accounts" });
  const accounts = accountDialog.getByLabel("Minecraft accounts");
  const builderOneRow = accounts.locator(".runtime-row").filter({ hasText: "BuilderOne" });
  const builderTwoRow = accounts.locator(".runtime-row").filter({ hasText: "BuilderTwo" });

  await builderTwoRow.getByRole("button", { name: "Switch" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText("Minecraft account switching failed");
  await expect(page.locator(".account-card")).toContainText("BuilderOne");
  await expect(builderOneRow.getByRole("button", { name: "Selected" })).toBeDisabled();
  await expect(builderTwoRow.getByRole("button", { name: "Switch" })).toBeVisible();

  await builderTwoRow.getByRole("button", { name: "Remove" }).click();
  await builderTwoRow.getByRole("button", { name: "Remove account" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText("Removing Minecraft account failed");
  await expect(accounts).toContainText("BuilderOne");
  await expect(accounts).toContainText("BuilderTwo");
  const invoked = await page.evaluate(() => (window as typeof window & { __failedAccountActionInvokes: string[] }).__failedAccountActionInvokes);
  expect(invoked).toContain("select_minecraft_account");
  expect(invoked).toContain("remove_minecraft_account");
});

test("settings save validates memory and offline username before native call", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    Object.defineProperty(window, "__settingsValidationInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByLabel("Minimum memory").fill("8192");
  await page.getByLabel("Minecraft memory").fill("4096");

  await expect(page.getByLabel("Settings save status")).toContainText(
    "Maximum memory needs to be at least the minimum memory.",
  );
  await expect(page.getByLabel("Settings save status").getByRole("button", { name: "Save settings" })).toBeDisabled();

  await page.getByLabel("Minimum memory").fill("2048");
  await page.getByLabel("Minecraft memory").fill("6144");
  await page.getByLabel("Offline username").fill("");

  await expect(page.getByLabel("Settings save status")).toContainText("Enter an offline username.");
  await expect(page.getByLabel("Settings save status").getByRole("button", { name: "Save settings" })).toBeDisabled();
  const invoked = await page.evaluate(
    () => (window as typeof window & { __settingsValidationInvokes: string[] }).__settingsValidationInvokes,
  );
  expect(invoked).not.toContain("save_settings");
});

test("settings can manage preview Minecraft account", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.locator(".account-card")).toContainText("Not signed in");
  await page.getByRole("button", { name: "Use preview account" }).click();

  await expect(page.getByText("Preview account ready for Player")).toBeVisible();
  await expect(page.getByText("Minecraft account is mocked in web preview")).toHaveCount(0);
  await expect(page.locator(".account-card")).toContainText("Player");
  await expect(page.locator(".account-card")).toContainText("Player signed in");

  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByLabel("Settings account maintenance actions").getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("Signed out of Minecraft")).toBeVisible();
  await expect(page.getByText("Signing out is mocked in web preview")).toHaveCount(0);
  await expect(page.locator(".account-card")).toContainText("Not signed in");
});

test("settings native account actions do not expose preview session saving", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              minecraftSession: {
                session: {
                  username: "Player",
                  uuid: "11111111-1111-4111-8111-111111111111",
                  accessToken: "[redacted]",
                },
                accountId: "11111111-1111-4111-8111-111111111111",
                expiresAtUnixSeconds: 1_900_000_000,
                storedAtUnixSeconds: 1_710_000_000,
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "list_minecraft_accounts") {
            return [
              {
                accountId: "11111111-1111-4111-8111-111111111111",
                username: "Player",
                uuid: "11111111-1111-4111-8111-111111111111",
                expiresAtUnixSeconds: 1_900_000_000,
                active: true,
              },
            ];
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByLabel("Settings account actions")).toContainText("Add another account");
  await expect(page.getByLabel("Settings account actions")).toContainText("Manage accounts");
  await expect(page.getByLabel("Settings account actions")).not.toContainText("Refresh accounts");
  await expect(page.getByRole("button", { name: "Use preview account" })).toHaveCount(0);
  await page.getByRole("button", { name: "Manage accounts" }).click();
  const accountDialog = page.getByRole("dialog", { name: "Manage Minecraft accounts" });
  await expect(accountDialog.getByLabel("Account manager actions")).toContainText("Refresh accounts");
  await expect(accountDialog.getByLabel("Minecraft accounts")).toContainText(
    "Player",
  );
});

test("settings native mode keeps renderer-created preview session actions hidden", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByLabel("Settings account actions")).toContainText("Add account");
  await expect(page.getByLabel("Settings account actions")).toContainText("Manage accounts");
  await expect(page.getByLabel("Settings account actions")).not.toContainText("Refresh accounts");
  await expect(page.getByRole("button", { name: "Use preview account" })).toHaveCount(0);
  await expect(page.locator(".account-card")).toContainText("Not signed in");
  await page.getByRole("button", { name: "Manage accounts" }).click();
  const accountDialog = page.getByRole("dialog", { name: "Manage Minecraft accounts" });
  await expect(accountDialog.getByLabel("Account manager actions")).toContainText("Refresh accounts");
  await expect(accountDialog).toContainText("No saved accounts");
});

test("settings can remove a stored Minecraft account with confirmation", async ({ page }) => {
  let activeSession = {
    session: {
      username: "Dilll",
      uuid: "12345678-1234-5678-9234-567812345678",
      accessToken: "redacted",
    },
    accountId: "account-dilll",
    storedAtUnixSeconds: 1_780_000_000,
    expiresAtUnixSeconds: 1_900_000_000,
  };
  let accounts = [
    {
      accountId: "account-dilll",
      username: "Dilll",
      uuid: "12345678-1234-5678-9234-567812345678",
      active: true,
      expiresAtUnixSeconds: 1_900_000_000,
    },
    {
      accountId: "account-builder",
      username: "Builder",
      uuid: "22345678-1234-5678-9234-567812345678",
      active: false,
      expiresAtUnixSeconds: 1_900_000_000,
    },
  ];
  let removeCallCount = 0;
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });
  await page.exposeFunction("__settingsRemoveInvoke", async (cmd: string, args?: Record<string, unknown>) => {
    if (cmd === "bootstrap_snapshot") {
      return {
        settings: {
          maxMemoryMb: 6144,
          minMemoryMb: 2048,
          offlineUsername: "Player",
          telemetryEnabled: false,
        },
        directories: {
          dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
          configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
          cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
          logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
        },
        friends: [],
        packs: [],
        profiles: [],
        imports: [],
        minecraftSession: activeSession,
      };
    }
    if (cmd === "social_backend_status") {
      return {
        bindAddr: "127.0.0.1:4074",
        healthUrl: "http://127.0.0.1:4074/health",
        running: true,
        managed: true,
        message: "Reachable",
      };
    }
    if (cmd === "list_minecraft_accounts") return accounts;
    if (cmd === "remove_minecraft_account") {
      removeCallCount += 1;
      expect(args?.accountId).toBe("account-dilll");
      await new Promise((resolve) => setTimeout(resolve, 200));
      activeSession = {
        session: {
          username: "Builder",
          uuid: "22345678-1234-5678-9234-567812345678",
          accessToken: "redacted-builder",
        },
        accountId: "account-builder",
        storedAtUnixSeconds: 1_780_000_000,
        expiresAtUnixSeconds: 1_900_000_000,
      };
      accounts = [
        {
          accountId: "account-builder",
          username: "Builder",
          uuid: "22345678-1234-5678-9234-567812345678",
          active: true,
          expiresAtUnixSeconds: 1_900_000_000,
        },
      ];
      return activeSession;
    }
    if (cmd === "plugin:event|listen") return 1;
    if (cmd === "plugin:event|unlisten") return undefined;
    throw new Error(`Unexpected invoke: ${cmd}`);
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: (cmd: string, args?: Record<string, unknown>) =>
          (window as unknown as { __settingsRemoveInvoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> })
            .__settingsRemoveInvoke(cmd, args),
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Manage accounts" }).click();
  const accountDialog = page.getByRole("dialog", { name: "Manage Minecraft accounts" });
  const accountsList = accountDialog.getByLabel("Minecraft accounts");
  await expect(accountsList).toContainText("Dilll");
  await expect(accountsList).toContainText("Builder");

  await accountsList.getByRole("button", { name: "Remove" }).first().click();
  await expect(accountsList.getByRole("button", { name: "Remove account" })).toBeVisible();
  await expect(accountsList.locator(".runtime-row").filter({ hasText: "Dilll" })).toContainText(
    "Removes it from this launcher only.",
  );
  await expect.poll(() => removeCallCount).toBe(0);

  await accountsList.getByRole("button", { name: "Remove account" }).click();
  await expect(accountsList.getByRole("button", { name: "Removing..." })).toBeDisabled();
  await expect(accountsList).not.toContainText("Dilll");
  await expect(accountsList).toContainText("Builder");
  await expect(accountsList).toContainText("Signed in and selected");
  await expect(page.locator(".account-card")).toContainText("Builder");
  await expect.poll(() => removeCallCount).toBe(1);
});

test("stored session exchanges Minecraft identity for backend social authorization", async ({ page }) => {
  let exchangeCount = 0;
  let presenceAuthorization = "";
  await page.route("http://127.0.0.1:4074/sessions/minecraft", async (route) => {
    exchangeCount += 1;
    const body = route.request().postDataJSON() as {
      accountId?: string;
      minecraftUuid: string;
      minecraftName: string;
      accessToken: string;
    };
    expect(body.accountId).toBeUndefined();
    expect(body.minecraftName).toBe("Player");
    expect(body.minecraftUuid).toBe("00000000-0000-4000-8000-000000000001");
    expect(body.accessToken).toBe("preview-access-token");
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        accountId: body.minecraftUuid,
        tokenType: "Bearer",
        sessionKind: "minecraft",
        minecraftUuid: body.minecraftUuid,
        minecraftName: body.minecraftName,
        accessToken: "minecraft-session-test-token",
        authorizationHeader: "Bearer minecraft-session-test-token",
        issuedAtUnixSeconds: 1_780_000_000,
        expiresAtUnixSeconds: 1_900_000_000,
      }),
    });
  });
  await page.route("http://127.0.0.1:4074/presence/00000000-0000-4000-8000-000000000001", async (route) => {
    presenceAuthorization = route.request().headers().authorization ?? "";
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        accountId: "00000000-0000-4000-8000-000000000001",
        state: "playing",
        packId: "winterpack",
        updatedAt: "2024-03-09T16:00:00Z",
      }),
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Use preview account" }).click();
  await page.getByRole("button", { name: "Library" }).click();
  await page.locator(".profile-row").filter({ hasText: "WinterPack" }).getByRole("button", { name: "Play" }).click();

  await expect.poll(() => exchangeCount).toBe(1);
  await expect.poll(() => presenceAuthorization).toBe("Bearer minecraft-session-test-token");
});

test("native stored session exchange keeps Minecraft token out of the renderer path", async ({ page }) => {
  const invoked: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
  let browserMinecraftExchangeCount = 0;
  let presenceAuthorization = "";

  await page.addInitScript(() => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    Object.defineProperty(window, "__nativeSessionInvokes", {
      value: calls,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: Record<string, unknown>) => {
          calls.push({ cmd, args });
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              minecraftSession: {
                session: {
                  username: "Player",
                  uuid: "11111111-1111-4111-8111-111111111111",
                  accessToken: "[redacted]",
                },
                accountId: "11111111-1111-4111-8111-111111111111",
                expiresAtUnixSeconds: 1_900_000_000,
                storedAtUnixSeconds: 1_710_000_000,
              },
              friends: [],
              packs: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  tagline: "Cozy survival with friends.",
                  version: "1.0.3",
                  status: "installed",
                  accent: "#67e8b9",
                  installedPlayers: 1,
                  defaultServer: "The Cabin",
                },
              ],
              profiles: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  loader: "fabric",
                  gameVersion: "1.21.1",
                  memoryMb: 6144,
                  jvmArgs: [],
                },
              ],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: true,
              managed: true,
              processId: 4074,
              message: "Friends service is reachable",
            };
          }
          if (cmd === "start_stored_authenticated_launch_process") {
            return {
              id: "managed-winterpack",
              processId: 4321,
              command: {
                executable: "java",
                args: [],
                workingDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/profiles/winterpack",
                env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
              },
              state: "running",
              startedAtUnixSeconds: 1_710_000_000,
              runtimeSeconds: 0,
              totalOutputLineCount: 0,
              droppedOutputLineCount: 0,
              output: [],
            };
          }
          if (cmd === "exchange_stored_minecraft_session_for_backend_session") {
            return {
              accountId: args?.accountId,
              tokenType: "Bearer",
              sessionKind: "minecraft",
              accessToken: "native-minecraft-session-token",
              authorizationHeader: "Bearer native-minecraft-session-token",
              issuedAtUnixSeconds: 1_780_000_000,
              expiresAtUnixSeconds: 1_900_000_000,
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.route("http://127.0.0.1:4074/sessions/minecraft", async (route) => {
    browserMinecraftExchangeCount += 1;
    await route.fulfill({ status: 500, body: "renderer should not exchange Minecraft tokens in native mode" });
  });
  await page.route("http://127.0.0.1:4074/presence/11111111-1111-4111-8111-111111111111", async (route) => {
    presenceAuthorization = route.request().headers().authorization ?? "";
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        accountId: "11111111-1111-4111-8111-111111111111",
        state: "playing",
        packId: "winterpack",
        updatedAt: "2026-06-26T12:00:00Z",
      }),
    });
  });

  await page.goto("/");
  await expect(page.getByText("Desktop connected")).toBeVisible();
  await page.getByRole("button", { name: "Library" }).click();
  await page.locator(".profile-row").filter({ hasText: "WinterPack" }).getByRole("button", { name: "Play" }).click();

  await expect.poll(() => presenceAuthorization).toBe("Bearer native-minecraft-session-token");
  expect(browserMinecraftExchangeCount).toBe(0);
  invoked.push(...(await page.evaluate(() => window.__nativeSessionInvokes)));
  const exchangeCall = invoked
    .filter((call) => call.cmd === "exchange_stored_minecraft_session_for_backend_session")
    .at(-1);
  expect(exchangeCall?.args).toEqual({
    accountId: "11111111-1111-4111-8111-111111111111",
    healthUrl: "http://127.0.0.1:4074/health",
  });
});

test("authenticated launch refresh failure offers sign-in recovery", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    Object.defineProperty(window, "__sessionRecoveryInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              minecraftSession: {
                session: {
                  username: "Player",
                  uuid: "00000000-0000-4000-8000-000000000001",
                  accessToken: "[redacted]",
                },
                accountId: "00000000-0000-4000-8000-000000000001",
                expiresAtUnixSeconds: 1_900_000_000,
                storedAtUnixSeconds: 1_710_000_000,
              },
              friends: [],
              packs: [],
              profiles: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  loader: "forge",
                  gameVersion: "1.20.1",
                  memoryMb: 6144,
                  jvmArgs: [],
                },
              ],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "start_stored_authenticated_launch_process") {
            throw new Error("Microsoft token exchange failed: invalid_grant: Refresh token expired");
          }
          if (cmd === "list_launcher_events") {
            return [
              {
                id: "session-refresh-failed",
                operationId: "00000000-0000-4000-8000-000000000202",
                operation: "launch_profile",
                subjectId: "winterpack",
                kind: "failed",
                message: "Microsoft token exchange failed: invalid_grant: Refresh token expired",
                progressPercent: 100,
                occurredAtUnixSeconds: 1_710_000_000,
              },
            ];
          }
          if (cmd === "start_microsoft_auth_flow") {
            return {
              authUrl: "https://login.live.com/oauth20_authorize.srf?client_id=client-123",
              state: "state-123",
              codeVerifier: "verifier",
              codeChallenge: "challenge",
              clientId: "client-123",
              redirectUri: "http://127.0.0.1:53682/auth/microsoft/callback",
              scopes: ["XboxLive.signin", "offline_access"],
            };
          }
          if (cmd === "open_microsoft_auth_url") return undefined;
          if (cmd === "complete_microsoft_login_with_local_callback") {
            throw new Error("timed out waiting for Microsoft sign-in callback");
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Library" }).click();
  await page.locator(".profile-row").filter({ hasText: "WinterPack" }).getByRole("button", { name: "Play" }).click();

  await expect(page.getByLabel("Launcher tasks")).toContainText(
    "Microsoft sign-in needs to be refreshed. Sign in again to continue.",
  );
  await expect(page.getByLabel("Launcher tasks")).not.toContainText("invalid_grant");
  await expect(page.getByRole("complementary").getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.locator(".account-card")).toContainText("Not signed in");

  await page.getByRole("complementary").getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Microsoft sign-in timed out. Start sign-in again from TheBoysLauncher.")).toBeVisible();
  await expect(page.getByText("timed out waiting for Microsoft sign-in callback")).toHaveCount(0);
  const invoked = await page.evaluate(
    () => (window as typeof window & { __sessionRecoveryInvokes: string[] }).__sessionRecoveryInvokes,
  );
  expect(invoked).toContain("start_stored_authenticated_launch_process");
  expect(invoked).toContain("start_microsoft_auth_flow");
  expect(invoked).toContain("complete_microsoft_login_with_local_callback");
});

test("authenticated launch sign-in recovery can retry the blocked profile", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    let signedIn = false;
    let launchAttempts = 0;
    const storedSession = {
      session: {
        username: "Player",
        uuid: "00000000-0000-4000-8000-000000000001",
        accessToken: "[redacted]",
      },
      accountId: "00000000-0000-4000-8000-000000000001",
      expiresAtUnixSeconds: 1_900_000_000,
      storedAtUnixSeconds: 1_710_000_000,
    };
    const snapshot = () => ({
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      minecraftSession: signedIn ? storedSession : {
        ...storedSession,
        expiresAtUnixSeconds: 1_800_000_000,
      },
      friends: [],
      packs: [],
      profiles: [
        {
          id: "winterpack",
          name: "WinterPack",
          loader: "forge",
          gameVersion: "1.20.1",
          memoryMb: 6144,
          jvmArgs: [],
        },
      ],
      imports: [],
    });

    Object.defineProperty(window, "__sessionRetryInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot();
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "start_stored_authenticated_launch_process") {
            launchAttempts += 1;
            if (launchAttempts === 1) {
              throw new Error("Microsoft token exchange failed: invalid_grant: Refresh token expired");
            }
            return {
              id: "session-retry-process",
              processId: 5150,
              state: "running",
              startedAtUnixSeconds: 1_781_000_000,
              runtimeSeconds: 2,
              totalOutputLineCount: 1,
              droppedOutputLineCount: 0,
              command: {
                executable: "javaw.exe",
                args: ["-jar", "minecraft.jar"],
                env: [
                  {
                    key: "THEBOYSLAUNCHER_PROFILE_ID",
                    value: "winterpack",
                    sensitive: false,
                  },
                ],
                workingDirectory: "C:/Users/test/AppData/Roaming/TheBoysLauncher/data/profiles/winterpack",
              },
              output: [{ stream: "stdout", line: "Authenticated Minecraft started", timestampUnixSeconds: 1_781_000_001 }],
            };
          }
          if (cmd === "list_launcher_events") {
            return [
              {
                id: "session-launch-failed",
                operationId: "00000000-0000-4000-8000-000000000203",
                operation: "launch_profile",
                subjectId: "winterpack",
                kind: "failed",
                message: "Microsoft token exchange failed: invalid_grant: Refresh token expired",
                progressPercent: 100,
                occurredAtUnixSeconds: 1_710_000_000,
              },
            ];
          }
          if (cmd === "list_managed_processes") return [];
          if (cmd === "start_microsoft_auth_flow") {
            return {
              authUrl: "https://login.live.com/oauth20_authorize.srf?client_id=client-123",
              state: "state-123",
              codeVerifier: "verifier",
              codeChallenge: "challenge",
              clientId: "client-123",
              redirectUri: "http://127.0.0.1:53682/auth/microsoft/callback",
              scopes: ["XboxLive.signin", "offline_access"],
            };
          }
          if (cmd === "open_microsoft_auth_url") return undefined;
          if (cmd === "complete_microsoft_login_with_local_callback") {
            signedIn = true;
            return storedSession;
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Library" }).click();
  await page.locator(".profile-row").filter({ hasText: "WinterPack" }).getByRole("button", { name: "Play" }).click();

  await expect(page.getByLabel("Launcher tasks")).toContainText(
    "Microsoft sign-in needs to be refreshed. Sign in again to continue.",
  );
  await expect(page.getByLabel("Launcher tasks")).not.toContainText("invalid_grant");
  await expect(page.getByRole("complementary").getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.getByRole("button", { name: "Activity" }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  const failedSessionEvent = page.locator(".event-row").filter({ hasText: "Microsoft sign-in needs to be refreshed" });
  await expect(failedSessionEvent.getByRole("button", { name: "Sign in" })).toBeVisible();
  await failedSessionEvent.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText("Signed in as Player");
  await expect(page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Play" })).toBeVisible();
  await page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Play" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Games" })).toHaveClass(/active/);
  await expect(page.locator(".process-row").filter({ hasText: "Authenticated Minecraft started" })).toBeVisible();
  const invoked = await page.evaluate(() => (window as typeof window & { __sessionRetryInvokes: string[] }).__sessionRetryInvokes);
  expect(invoked.filter((cmd) => cmd === "start_stored_authenticated_launch_process")).toHaveLength(2);
  expect(invoked).toContain("start_microsoft_auth_flow");
  expect(invoked).toContain("complete_microsoft_login_with_local_callback");
});

test("successful offline launch clears stale sign-in recovery after auth failure", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    let authenticatedLaunchAttempts = 0;
    const snapshot = {
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      minecraftSession: {
        session: {
          username: "Player",
          uuid: "00000000-0000-4000-8000-000000000001",
          accessToken: "[redacted]",
        },
        accountId: "00000000-0000-4000-8000-000000000001",
        expiresAtUnixSeconds: 1_900_000_000,
        storedAtUnixSeconds: 1_710_000_000,
      },
      friends: [],
      packs: [],
      profiles: [
        {
          id: "winterpack",
          name: "WinterPack",
          loader: "forge",
          gameVersion: "1.20.1",
          memoryMb: 6144,
          jvmArgs: [],
        },
      ],
      imports: [],
    };

    Object.defineProperty(window, "__offlineAfterAuthFailureInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot;
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "start_stored_authenticated_launch_process") {
            authenticatedLaunchAttempts += 1;
            throw new Error("Microsoft token exchange failed: invalid_grant: Refresh token expired");
          }
          if (cmd === "start_launch_process") {
            return {
              id: "offline-after-auth-failure",
              processId: 4242,
              state: "running",
              startedAtUnixSeconds: 1_781_000_000,
              runtimeSeconds: 1,
              totalOutputLineCount: 1,
              droppedOutputLineCount: 0,
              command: {
                executable: "javaw.exe",
                args: ["-jar", "minecraft.jar"],
                workingDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/data/profiles/winterpack",
                env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
              },
              output: [{ stream: "stdout", line: "Offline launch recovered after auth failure" }],
            };
          }
          if (cmd === "list_launcher_events") {
            return authenticatedLaunchAttempts > 0
              ? [
                  {
                    id: "session-launch-failed",
                    operationId: "00000000-0000-4000-8000-000000000204",
                    operation: "launch_profile",
                    subjectId: "winterpack",
                    kind: "failed",
                    message: "Microsoft token exchange failed: invalid_grant: Refresh token expired",
                    progressPercent: 100,
                    occurredAtUnixSeconds: 1_710_000_000,
                  },
                ]
              : [];
          }
          if (cmd === "list_managed_processes") return [];
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Library" }).click();
  const profile = page.locator(".profile-row").filter({ hasText: "WinterPack" });
  await profile.getByRole("button", { name: "Play" }).click();

  await expect(page.getByLabel("Launcher tasks")).toContainText(
    "Microsoft sign-in needs to be refreshed. Sign in again to continue.",
  );
  await expect(page.getByLabel("Launcher tasks")).not.toContainText("invalid_grant");
  await expect(page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Sign in" })).toBeVisible();

  await page.getByRole("button", { name: "Library" }).click();
  await profile.getByRole("button", { name: "Play" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Games" })).toHaveClass(/active/);
  await expect(page.locator(".process-row").filter({ hasText: "Offline launch recovered after auth failure" })).toBeVisible();
  await expect(page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Sign in" })).toHaveCount(0);
  const invoked = await page.evaluate(
    () => (window as typeof window & { __offlineAfterAuthFailureInvokes: string[] }).__offlineAfterAuthFailureInvokes,
  );
  expect(invoked).toContain("start_stored_authenticated_launch_process");
  expect(invoked).toContain("start_launch_process");
});

test("expired refreshable stored session still uses native authenticated launch", async ({ page }) => {
  const accountId = "00000000-0000-4000-8000-000000000001";
  let presenceAuthorization = "";
  await page.route("http://127.0.0.1:4074/presence/00000000-0000-4000-8000-000000000001", async (route) => {
    presenceAuthorization = route.request().headers().authorization ?? "";
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        accountId,
        state: "playing",
        packId: "winterpack",
        updatedAt: "2026-06-25T12:00:00Z",
      }),
    });
  });
  await page.addInitScript(() => {
    const invoked: string[] = [];
    const expiredRefreshableSession = {
      session: {
        username: "Builder",
        uuid: "00000000-0000-4000-8000-000000000001",
        accessToken: "[redacted]",
      },
      accountId: "00000000-0000-4000-8000-000000000001",
      expiresAtUnixSeconds: 1,
      microsoftClientId: "client-123",
      storedAtUnixSeconds: 1,
    };
    const process = {
      id: "refreshed-auth-process",
      processId: 5151,
      state: "running",
      startedAtUnixSeconds: 1_781_000_000,
      runtimeSeconds: 1,
      totalOutputLineCount: 1,
      droppedOutputLineCount: 0,
      command: {
        executable: "javaw.exe",
        args: ["-jar", "minecraft.jar"],
        env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
        workingDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/data/profiles/winterpack",
      },
      output: [{ stream: "stdout", line: "Refreshed stored session launch started" }],
    };
    Object.defineProperty(window, "__expiredRefreshableLaunchInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              minecraftSession: expiredRefreshableSession,
              friends: [],
              packs: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  tagline: "Cozy survival with friends.",
                  version: "2.3.7",
                  status: "installed",
                  accent: "#67e8b9",
                  installedPlayers: 1,
                  defaultServer: "The Cabin",
                },
              ],
              profiles: [
                {
                  id: "winterpack",
                  name: "WinterPack",
                  loader: "forge",
                  gameVersion: "1.20.1",
                  installedPackVersion: "2.3.7",
                  memoryMb: 6144,
                  jvmArgs: [],
                },
              ],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "start_stored_authenticated_launch_process") {
            await new Promise((resolve) => setTimeout(resolve, 200));
            return process;
          }
          if (cmd === "exchange_stored_minecraft_session_for_backend_session") {
            return {
              accountId: "00000000-0000-4000-8000-000000000001",
              tokenType: "Bearer",
              sessionKind: "minecraft",
              authorizationHeader: "Bearer refreshed-session-token",
              accessToken: "refreshed-session-token",
              issuedAtUnixSeconds: 1,
              expiresAtUnixSeconds: 9_999_999_999,
            };
          }
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [process];
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Library" }).click();
  await page.locator(".profile-row").filter({ hasText: "WinterPack" }).getByRole("button", { name: "Play" }).click();

  await expect(page.locator(".sidebar")).toContainText("Launching with your Minecraft account");
  await expect(page.locator(".sidebar")).not.toContainText("authenticated profile");
  await expect(page.locator(".process-row").filter({ hasText: "Refreshed stored session launch started" })).toBeVisible();
  await expect.poll(() => presenceAuthorization).toBe("Bearer refreshed-session-token");
  const invoked = await page.evaluate(
    () => (window as typeof window & { __expiredRefreshableLaunchInvokes: string[] }).__expiredRefreshableLaunchInvokes,
  );
  expect(invoked).toContain("start_stored_authenticated_launch_process");
  expect(invoked).toContain("exchange_stored_minecraft_session_for_backend_session");
  expect(invoked).not.toContain("start_launch_process");
});

test("stored session upgrades cached dev backend session to Minecraft authorization", async ({ page }) => {
  const accountId = "00000000-0000-4000-8000-000000000001";
  const issuedAtUnixSeconds = Math.floor(Date.now() / 1000);
  const devAccessToken = `dev-session:${accountId}:${issuedAtUnixSeconds + 3600}`;
  let devSessionRequests = 0;
  let minecraftExchangeRequests = 0;
  const presenceAuthorizations: string[] = [];

  await page.route("http://127.0.0.1:4074/**", async (route) => {
    const request = route.request();
    const corsHeaders = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (request.url().endsWith("/dev/sessions")) {
      devSessionRequests += 1;
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          tokenType: "Bearer",
          sessionKind: "dev",
          accessToken: devAccessToken,
          authorizationHeader: `Bearer ${devAccessToken}`,
          issuedAtUnixSeconds,
          expiresAtUnixSeconds: issuedAtUnixSeconds + 3600,
        }),
      });
      return;
    }
    if (request.url().endsWith("/sessions/current")) {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          tokenType: "Bearer",
          sessionKind: "dev",
          expiresAtUnixSeconds: issuedAtUnixSeconds + 3600,
          secondsRemaining: 3600,
        }),
      });
      return;
    }
    if (request.url().endsWith("/sessions/minecraft")) {
      minecraftExchangeRequests += 1;
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          tokenType: "Bearer",
          sessionKind: "minecraft",
          accessToken: "minecraft-session-upgraded-token",
          authorizationHeader: "Bearer minecraft-session-upgraded-token",
          issuedAtUnixSeconds,
          expiresAtUnixSeconds: issuedAtUnixSeconds + 3600,
        }),
      });
      return;
    }
    if (request.url().endsWith(`/presence/${accountId}`)) {
      presenceAuthorizations.push(request.headers()["authorization"] ?? "");
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          state: "playing",
          packId: "winterpack",
          updatedAt: "2026-06-25T12:00:00Z",
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, headers: corsHeaders });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Library" }).click();
  await page.locator(".profile-row").filter({ hasText: "WinterPack" }).getByRole("button", { name: "Play" }).click();
  await expect(page.getByText("Presence shared for WinterPack")).toBeVisible();
  expect(presenceAuthorizations).toEqual([`Bearer ${devAccessToken}`]);

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Use preview account" }).click();
  await page.getByRole("button", { name: "Library" }).click();
  await page.locator(".profile-row").filter({ hasText: "WinterPack" }).getByRole("button", { name: "Play" }).click();

  await expect.poll(() => minecraftExchangeRequests).toBe(1);
  await expect.poll(() => presenceAuthorizations.at(-1)).toBe("Bearer minecraft-session-upgraded-token");
  expect(devSessionRequests).toBe(1);
});

test("stored session switches launch actions to authenticated preview path", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Use preview account" }).click();
  await expect(page.getByText("Preview account ready for Player")).toBeVisible();

  await page.getByRole("button", { name: "Library" }).click();
  const profile = page.locator(".profile-row").filter({ hasText: "WinterPack" });
  await clickProfileSetupCheck(profile);
  await expect(page.getByText("Signed-in launch details require the desktop app")).toBeVisible();
  await expect(page.getByText("Signed-in launch diagnostics require the desktop app")).toHaveCount(0);
  await expect(page.getByText("Signed-in launch details are mocked in web preview")).toHaveCount(0);

  await profile.getByRole("button", { name: "Play" }).click();
  await expect(page.getByText("Sign in launches require the desktop app")).toBeVisible();
});

test("stored session friend join passes server target to native authenticated launch", async ({ page }) => {
  const accountId = "00000000-0000-4000-8000-000000000001";
  let presenceBody = "";
  await page.route("http://127.0.0.1:4074/**", async (route) => {
    const request = route.request();
    const corsHeaders = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (request.url().endsWith("/presence")) {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify([
          {
            accountId: "friend-dylan",
            state: "playing",
            packId: "winterpack",
            serverId: "The Cabin",
            updatedAt: "2026-06-25T12:00:00Z",
          },
        ]),
      });
      return;
    }
    if (request.url().endsWith(`/presence/${accountId}`)) {
      presenceBody = request.postData() ?? "";
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          state: "playing",
          packId: "winterpack",
          serverId: "The Cabin",
          updatedAt: "2026-06-25T12:00:00Z",
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, headers: corsHeaders });
  });
  await page.addInitScript(() => {
    const invoked: Array<{ cmd: string; payload?: unknown }> = [];
    let joined = false;
    const storedSession = {
      session: {
        username: "Builder",
        uuid: "00000000-0000-4000-8000-000000000001",
        accessToken: "[redacted]",
      },
      accountId: "00000000-0000-4000-8000-000000000001",
      storedAtUnixSeconds: 1_710_000_000,
      expiresAtUnixSeconds: 9_999_999_999,
    };
    const process = {
      id: "managed-auth-join-process",
      processId: 4243,
      command: {
        executable: "javaw.exe",
        args: ["--server", "play.theboys.example", "--port", "25565"],
        workingDir: "C:/launcher/profiles/winterpack",
        env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
      },
      state: "running",
      exitCode: null,
      stopRequested: false,
      startedAtUnixSeconds: 1_710_000_000,
      exitedAtUnixSeconds: null,
      runtimeSeconds: 1,
      totalOutputLineCount: 1,
      droppedOutputLineCount: 0,
      output: [{ stream: "stdout", line: "Authenticated join to The Cabin" }],
    };
    const snapshot = {
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      minecraftSession: storedSession,
      friends: [
        {
          id: "friend-dylan",
          name: "Dylan",
          avatarColor: "#67e8b9",
          state: "playing",
          packName: "WinterPack",
          serverName: "The Cabin",
          joinable: true,
        },
      ],
      packs: [
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Cozy survival with friends.",
          version: "2.3.7",
          status: "installed",
          accent: "#67e8b9",
          installedPlayers: 1,
          defaultServer: "The Cabin",
        },
      ],
      profiles: [
        {
          id: "winterpack",
          name: "WinterPack",
          loader: "forge",
          gameVersion: "1.20.1",
          installedPackVersion: "2.3.7",
          memoryMb: 6144,
          jvmArgs: [],
        },
      ],
      imports: [],
    };

    Object.defineProperty(window, "__authenticatedJoinInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, payload?: unknown) => {
          invoked.push({ cmd, payload });
          if (cmd === "bootstrap_snapshot") {
            if (!joined) return snapshot;
            return {
              ...snapshot,
              profiles: snapshot.profiles.map((profile) =>
                profile.id === "winterpack" ? { ...profile, lastPlayed: "unix:1710000200" } : profile,
              ),
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "exchange_stored_minecraft_session_for_backend_session") {
            return {
              accountId: "00000000-0000-4000-8000-000000000001",
              tokenType: "Bearer",
              sessionKind: "minecraft",
              authorizationHeader: "Bearer minecraft-session-token",
              accessToken: "minecraft-session-token",
              issuedAtUnixSeconds: 1,
              expiresAtUnixSeconds: 9_999_999_999,
            };
          }
          if (cmd === "start_stored_authenticated_launch_process") {
            joined = true;
            return process;
          }
          if (cmd === "list_managed_processes") return [process];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Friends" }).click();
  await expect(page.locator(".friend-row").filter({ hasText: "Dylan" })).toBeVisible();
  await page.locator(".friend-row").filter({ hasText: "Dylan" }).getByRole("button", { name: "Join" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Games" })).toHaveClass(/active/);
  await expect(page.locator(".process-row").filter({ hasText: "Authenticated join to The Cabin" })).toBeVisible();
  await page.getByRole("button", { name: "Library" }).click();
  await expect(page.locator(".profile-row").filter({ hasText: "WinterPack" })).toContainText("Last played");
  await expect.poll(() => presenceBody).toContain("winterpack");
  const invoked = await page.evaluate(
    () => (window as typeof window & { __authenticatedJoinInvokes: Array<{ cmd: string; payload?: unknown }> }).__authenticatedJoinInvokes,
  );
  const launchCall = invoked.find((item) => item.cmd === "start_stored_authenticated_launch_process");
  expect(launchCall?.payload).toMatchObject({
    profileId: "winterpack",
    server: {
      name: "The Cabin",
      address: "play.theboys.example",
      port: 25565,
    },
  });
  expect(JSON.parse(presenceBody)).toEqual({
    state: "playing",
    packId: "winterpack",
    serverId: "The Cabin",
  });
});

test("stored session friend join sign-in recovery preserves server target", async ({ page }) => {
  await page.route("http://127.0.0.1:4074/**", async (route) => {
    const request = route.request();
    const corsHeaders = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    await route.fulfill({ status: 503, headers: { ...corsHeaders, "content-type": "application/json" }, body: "{}" });
  });
  await page.addInitScript(() => {
    const invoked: Array<{ cmd: string; payload?: unknown }> = [];
    let launchAttempts = 0;
    const storedSession = {
      session: {
        username: "Builder",
        uuid: "00000000-0000-4000-8000-000000000001",
        accessToken: "[redacted]",
      },
      accountId: "00000000-0000-4000-8000-000000000001",
      storedAtUnixSeconds: 1_710_000_000,
      expiresAtUnixSeconds: 9_999_999_999,
      microsoftClientId: "desktop-client",
    };
    const process = {
      id: "managed-auth-recovered-join-process",
      processId: 4244,
      command: {
        executable: "javaw.exe",
        args: ["--server", "play.theboys.example", "--port", "25565"],
        workingDir: "C:/launcher/profiles/winterpack",
        env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
      },
      state: "running",
      exitCode: null,
      stopRequested: false,
      startedAtUnixSeconds: 1_710_000_000,
      exitedAtUnixSeconds: null,
      runtimeSeconds: 1,
      totalOutputLineCount: 1,
      droppedOutputLineCount: 0,
      output: [{ stream: "stdout", line: "Recovered authenticated join to The Cabin" }],
    };
    const snapshot = {
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      minecraftSession: storedSession,
      friends: [
        {
          id: "friend-dylan",
          name: "Dylan",
          avatarColor: "#67e8b9",
          state: "playing",
          packName: "WinterPack",
          serverName: "The Cabin",
          joinable: true,
        },
      ],
      packs: [
        {
          id: "winterpack",
          name: "WinterPack",
          tagline: "Cozy survival with friends.",
          version: "2.3.7",
          status: "installed",
          accent: "#67e8b9",
          installedPlayers: 1,
          defaultServer: "The Cabin",
        },
      ],
      profiles: [
        {
          id: "winterpack",
          name: "WinterPack",
          loader: "forge",
          gameVersion: "1.20.1",
          installedPackVersion: "2.3.7",
          memoryMb: 6144,
          jvmArgs: [],
        },
      ],
      imports: [],
    };

    Object.defineProperty(window, "__authenticatedJoinRecoveryInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, payload?: unknown) => {
          invoked.push({ cmd, payload });
          if (cmd === "bootstrap_snapshot") return snapshot;
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "start_microsoft_auth_flow") {
            return {
              authUrl: "https://login.live.com/oauth20_authorize.srf?client_id=desktop-client",
              state: "state-1",
              codeVerifier: "verifier-1",
              clientId: "desktop-client",
              redirectUri: "http://localhost:53682/",
            };
          }
          if (cmd === "open_microsoft_auth_url") return undefined;
          if (cmd === "complete_microsoft_login_with_local_callback") return storedSession;
          if (cmd === "start_stored_authenticated_launch_process") {
            launchAttempts += 1;
            if (launchAttempts === 1) {
              throw new Error("stored Minecraft session has expired; sign in again");
            }
            return process;
          }
          if (cmd === "list_managed_processes") return launchAttempts > 1 ? [process] : [];
          if (cmd === "list_launcher_events") return [];
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Friends" }).click();
  await page.locator(".friend-row").filter({ hasText: "Dylan" }).getByRole("button", { name: "Join" }).click();

  const recoveryActions = page.getByLabel("Launcher recovery actions");
  await expect(recoveryActions.getByRole("button", { name: "Sign in" })).toBeVisible();
  await recoveryActions.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Signed in as Builder")).toBeVisible();
  await expect(recoveryActions.getByRole("button", { name: "Try join again" })).toBeVisible();
  await recoveryActions.getByRole("button", { name: "Try join again" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.locator(".process-row").filter({ hasText: "Recovered authenticated join to The Cabin" })).toBeVisible();
  const invoked = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __authenticatedJoinRecoveryInvokes: Array<{ cmd: string; payload?: unknown }>;
        }
      ).__authenticatedJoinRecoveryInvokes,
  );
  const launchCalls = invoked.filter((item) => item.cmd === "start_stored_authenticated_launch_process");
  expect(launchCalls).toHaveLength(2);
  expect(launchCalls[1]?.payload).toMatchObject({
    profileId: "winterpack",
    server: {
      name: "The Cabin",
      address: "play.theboys.example",
      port: 25565,
    },
  });
});

test("settings Java discovery action shows preview runtime", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByRole("button", { name: "Find Java" }).click();

  await expect(page.getByText("Preview Java runtime ready")).toBeVisible();
  await expect(page.getByText("Java discovery is mocked in web preview")).toHaveCount(0);
  await expect(page.locator(".runtime-row").filter({ hasText: "Java 21" })).toContainText("bundled");
  await expect(page.locator(".runtime-row").filter({ hasText: "Java 21" })).toContainText("runtimes/java-21");
});

test("settings native Java failures do not show preview runtimes", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "discover_java_runtimes") {
            throw new Error("Java runtime scan failed");
          }
          if (cmd === "recommended_java_runtime_manifest") {
            throw new Error("Java recommendation manifest unavailable");
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByRole("button", { name: "Find Java" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText(
    "Java scan is unavailable right now. You can still use automatic Java when launching.",
  );
  await expect(page.getByLabel("Launcher status message")).not.toContainText("Java runtime scan failed");
  await expect(page.getByText("Java discovery is mocked in web preview")).toHaveCount(0);
  await expect(page.locator(".runtime-row").filter({ hasText: "Preview/TheBoysLauncher/runtimes/java-21" })).toHaveCount(0);
  await expect(page.getByLabel("Detected Java runtimes").locator(".runtime-row")).toHaveCount(0);

  await page.getByRole("button", { name: "Recommended Java" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText("Java recommendations are unavailable right now. Try again later.");
  await expect(page.getByLabel("Launcher status message")).not.toContainText("Java recommendation manifest unavailable");
  await expect(page.getByText("Java recommendations are mocked in web preview")).toHaveCount(0);
  await expect(page.getByLabel("Recommended Java runtimes").locator(".runtime-row")).toHaveCount(0);
});

test("settings managed Java install shows preview runtime", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByRole("button", { name: "Recommended Java" }).click();
  await expect(page.getByText("Preview Java recommendations loaded")).toBeVisible();
  await expect(page.getByText("Java recommendations are mocked in web preview")).toHaveCount(0);
  const recommendedRuntime = page
    .getByLabel("Recommended Java runtimes")
    .locator(".runtime-row")
    .filter({ hasText: "Temurin 21 LTS" });
  await expect(recommendedRuntime).toContainText("Eclipse Adoptium - Java 21 - windows-x64");
  await recommendedRuntime.getByRole("button", { name: "Use" }).click();
  await expect(page.getByLabel("Managed Java runtime ID")).toHaveValue("temurin-21-windows-x64");
  await expect(page.getByLabel("Managed Java archive file")).toHaveValue("temurin-21-windows-x64.zip");
  await page.getByLabel("Managed Java runtime ID").fill("Java 21 Test");
  await page.getByLabel("Managed Java archive URL").fill("https://downloads.example/java-21-test.zip");
  await page.getByLabel("Managed Java archive file").fill("java-21-test.zip");
  await page.getByRole("button", { name: "Install runtime" }).click();

  await expect(page.getByText("Preview Java runtime added")).toBeVisible();
  await expect(page.getByText("Java install is mocked in web preview")).toHaveCount(0);
  await expect(page.locator(".runtime-row").filter({ hasText: "Preview/TheBoysLauncher/runtimes/java-21-test" })).toContainText(
    "Java 21",
  );
});

test("settings managed Java install runs native download and install commands", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    const snapshot = {
      settings: {
        maxMemoryMb: 6144,
        minMemoryMb: 2048,
        offlineUsername: "Player",
        telemetryEnabled: false,
      },
      directories: {
        dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
        configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
        cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
        logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
      },
      friends: [],
      packs: [],
      profiles: [],
      imports: [],
    };
    const downloadPlan = {
      versionId: "temurin-21-windows-x64",
      items: [
        {
          id: "java-runtime-archive-temurin-21-windows-x64",
          kind: "java_runtime_archive",
          url: "https://downloads.example/temurin-21.zip",
          destination: "C:/Users/test/AppData/Roaming/TheBoysLauncher/runtimes/temurin-21-windows-x64/downloads/temurin-21.zip",
        },
      ],
    };

    Object.defineProperty(window, "__managedJavaInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") return snapshot;
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "recommended_java_runtime_manifest") {
            return [
              {
                runtimeId: "temurin-21-windows-x64",
                label: "Temurin 21 LTS",
                vendor: "Eclipse Adoptium",
                majorVersion: 21,
                platform: "windows-x64",
                url: "https://downloads.example/temurin-21.zip",
                archiveFileName: "temurin-21.zip",
                notes: "Recommended for Minecraft 1.20.5 and newer.",
              },
            ];
          }
          if (cmd === "build_managed_java_runtime_download_plan") return downloadPlan;
          if (cmd === "execute_download_plan") {
            return {
              operationId: "00000000-0000-4000-8000-000000000121",
              operation: "install_java_runtime",
              subjectId: "temurin-21-windows-x64",
              events: [
                { kind: "queued", message: "Java runtime download queued", progressPercent: 0 },
                { kind: "completed", message: "Java runtime archive downloaded.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "execute_managed_java_runtime_install") {
            return {
              operationId: "00000000-0000-4000-8000-000000000122",
              operation: "install_java_runtime",
              subjectId: "temurin-21-windows-x64",
              events: [
                { kind: "queued", message: "Java runtime install queued for temurin-21-windows-x64", progressPercent: 0 },
                { kind: "completed", message: "Java runtime temurin-21-windows-x64 is installed.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "discover_java_runtimes") {
            return [
              {
                id: "java-21-temurin",
                path: "C:/Users/test/AppData/Roaming/TheBoysLauncher/runtimes/temurin-21-windows-x64/bin/java.exe",
                version: "21.0.4",
                majorVersion: 21,
                source: "bundled",
              },
            ];
          }
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByRole("button", { name: "Recommended Java" }).click();
  await page.getByLabel("Recommended Java runtimes").getByRole("button", { name: "Use" }).click();
  await page.getByRole("button", { name: "Install runtime" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "History", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".event-row").filter({ hasText: "Java download finished." })).toBeVisible();
  await expect(page.locator(".event-row").filter({ hasText: "Java is ready." })).toBeVisible();
  await expect(page.getByRole("complementary")).toContainText("Java is ready.");
  await expect(page.getByRole("complementary")).not.toContainText("Java runtime temurin-21-windows-x64 is installed.");

  const invoked = await page.evaluate(() => (window as typeof window & { __managedJavaInvokes: string[] }).__managedJavaInvokes);
  expect(invoked.indexOf("build_managed_java_runtime_download_plan")).toBeLessThan(invoked.indexOf("execute_download_plan"));
  expect(invoked.indexOf("execute_download_plan")).toBeLessThan(invoked.indexOf("execute_managed_java_runtime_install"));
  expect(invoked.indexOf("execute_managed_java_runtime_install")).toBeLessThan(invoked.lastIndexOf("discover_java_runtimes"));
  expect(invoked.indexOf("list_launcher_events", invoked.indexOf("execute_managed_java_runtime_install"))).toBeGreaterThan(
    invoked.indexOf("execute_managed_java_runtime_install"),
  );
});

test("settings Java recommendations render native hosted manifest entries", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: false,
              message: "Offline",
            };
          }
          if (cmd === "recommended_java_runtime_manifest") {
            return [
              {
                runtimeId: "hosted-temurin-21-windows-x64",
                label: "Hosted Temurin 21",
                vendor: "Hosted Adoptium",
                majorVersion: 21,
                platform: "windows-x64",
                url: "https://downloads.example/hosted-temurin-21.zip",
                archiveFileName: "hosted-temurin-21.zip",
                notes: "Loaded from hosted manifest.",
              },
            ];
          }
          if (cmd === "load_minecraft_session") return null;
          if (cmd === "list_launcher_events") return [];
          if (cmd === "list_managed_processes") return [];
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByRole("button", { name: "Recommended Java" }).click();

  const recommendedRuntime = page
    .getByLabel("Recommended Java runtimes")
    .locator(".runtime-row")
    .filter({ hasText: "Hosted Temurin 21" });
  await expect(page.getByText("Loaded 1 Java recommendation")).toBeVisible();
  await expect(recommendedRuntime).toContainText("Hosted Adoptium - Java 21 - windows-x64");
  await recommendedRuntime.getByRole("button", { name: "Use" }).click();
  await expect(page.getByLabel("Managed Java runtime ID")).toHaveValue("hosted-temurin-21-windows-x64");
  await expect(page.getByLabel("Managed Java archive file")).toHaveValue("hosted-temurin-21.zip");
});

test("settings backend start waits for reachable native status", async ({ page }) => {
  await page.addInitScript(() => {
    let statusChecksAfterStart = 0;
    let startRequests = 0;
    let started = false;
    let callbackId = 0;
    const callbacks = new Map<number, (...args: unknown[]) => unknown>();
    const offlineStatus = {
      bindAddr: "127.0.0.1:4074",
      healthUrl: "http://127.0.0.1:4074/health",
      running: false,
      managed: true,
      processId: 1234,
      endpointKind: "local",
      endpointUrl: "http://127.0.0.1:4074",
      message: "Local friends service is not reachable; packaged service can be started",
    };
    const onlineStatus = {
      ...offlineStatus,
      running: true,
      message: "Local friends service is reachable",
    };

    Object.defineProperty(window, "__friendsServiceStartRequests", {
      get: () => startRequests,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "social_backend_status") {
            if (started) statusChecksAfterStart += 1;
            return started && statusChecksAfterStart > 1 ? onlineStatus : offlineStatus;
          }
          if (cmd === "start_social_backend") {
            startRequests += 1;
            started = true;
            return offlineStatus;
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: (callback: (...args: unknown[]) => unknown) => {
          const id = callbackId++;
          callbacks.set(id, callback);
          return id;
        },
        unregisterCallback: (id: number) => {
          callbacks.delete(id);
        },
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByRole("button", { name: "Start local service" }).click();
  await expect(page.getByRole("button", { name: "Starting..." })).toBeDisabled();
  await page.getByRole("button", { name: "Starting..." }).click({ force: true });

  await expect(page.getByText("Local friends service is reachable")).toBeVisible();
  await expect(page.locator(".setting").filter({ hasText: "Connection" })).toContainText("Reachable");
  const startRequests = await page.evaluate(
    () => (window as typeof window & { __friendsServiceStartRequests: number }).__friendsServiceStartRequests,
  );
  expect(startRequests).toBe(1);
});

test("native startup prefers configured hosted social backend without local auto-start", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    const hostedStatus = {
      endpointKind: "hosted",
      endpointUrl: "https://launcher.dylan.lol",
      bindAddr: "https://launcher.dylan.lol",
      healthUrl: "https://launcher.dylan.lol/health",
      running: false,
      managed: false,
      canStart: false,
      message: "Hosted friends service is configured at https://launcher.dylan.lol but is not reachable; local launcher features remain available",
    };

    Object.defineProperty(window, "__backendStartupInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return hostedStatus;
          }
          if (cmd === "start_social_backend") {
            throw new Error("Hosted mode must not start local service");
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Advanced" }).click();
  await expect(page.locator(".setting", { has: page.getByText("Connection", { exact: true }) }).first()).toContainText("Friends offline");
  await expect(page.locator(".setting", { has: page.getByText("Mode", { exact: true }) }).first()).toContainText("Hosted service");
  await expect(page.getByLabel("Advanced launcher status")).toContainText("Friends service is unavailable right now. Minecraft still works.");
  await expect(page.getByLabel("Advanced launcher status")).not.toContainText("Hosted friends service is configured at");
  await expect(page.getByLabel("Advanced launcher status")).toContainText("https://launcher.dylan.lol/health");
  await expect(page.getByLabel("Settings service actions")).toContainText("Check friends");
  await expect(page.getByRole("button", { name: "Start local service" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Stop local service" })).toHaveCount(0);
  const invoked = await page.evaluate(() => (window as typeof window & { __backendStartupInvokes: string[] }).__backendStartupInvokes);
  expect(invoked).toContain("social_backend_status");
  expect(invoked).not.toContain("start_social_backend");
});

test("disabled native friends service mode stays off without local controls", async ({ page }) => {
  await page.addInitScript(() => {
    const invoked: string[] = [];
    const disabledStatus = {
      endpointKind: "disabled",
      endpointUrl: "off",
      bindAddr: "off",
      healthUrl: "",
      running: false,
      managed: false,
      canStart: false,
      processId: null,
      message: "Friends service is turned off. Minecraft still works.",
    };

    Object.defineProperty(window, "__disabledFriendsInvokes", {
      value: invoked,
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return disabledStatus;
          }
          if (cmd === "start_social_backend") {
            throw new Error("Disabled friends mode must not start local service");
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Advanced" }).click();
  await expect(page.locator(".setting", { has: page.getByText("Connection", { exact: true }) }).first()).toContainText("Off");
  await expect(page.locator(".setting", { has: page.getByText("Mode", { exact: true }) }).first()).toContainText("Off");
  await expect(page.getByLabel("Advanced launcher status")).toContainText("Friends service is turned off. Minecraft still works.");
  await expect(page.getByLabel("Settings service actions")).toContainText("Check friends");
  await expect(page.getByRole("button", { name: "Start local service" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Stop local service" })).toHaveCount(0);
  const invoked = await page.evaluate(() => (window as typeof window & { __disabledFriendsInvokes: string[] }).__disabledFriendsInvokes);
  expect(invoked).toContain("social_backend_status");
  expect(invoked).not.toContain("start_social_backend");
});

test("hosted friends search requires Minecraft sign-in instead of preview fallback", async ({ page }) => {
  let devSessionRequests = 0;
  await page.route("https://launcher.dylan.lol/**", async (route) => {
    if (route.request().url().endsWith("/dev/sessions")) {
      devSessionRequests += 1;
    }
    await route.fulfill({
      status: 404,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "authorization,content-type",
      },
      body: "{}",
    });
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [
                {
                  id: "friend-dill",
                  name: "Dill",
                  avatarColor: "#67e8b9",
                  state: "online",
                  joinable: false,
                },
              ],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              endpointKind: "hosted",
              endpointUrl: "https://launcher.dylan.lol",
              bindAddr: "https://launcher.dylan.lol",
              healthUrl: "https://launcher.dylan.lol/health",
              running: true,
              managed: false,
              canStart: false,
              message: "Hosted friends service is reachable",
            };
          }
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Friends" }).click();
  await page.getByLabel("Friend name").fill("Dill");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText("Sign in to use friends.");
  await expect(page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Friend search results")).toContainText("Sign in to search friends");
  await expect(page.getByLabel("Friend search results")).not.toContainText("Dill");
  expect(devSessionRequests).toBe(0);
});

test("hosted friend requests require Minecraft sign-in instead of queuing locally", async ({ page }) => {
  let devSessionRequests = 0;
  let friendRequestRequests = 0;
  await page.route("https://launcher.dylan.lol/**", async (route) => {
    if (route.request().url().endsWith("/dev/sessions")) {
      devSessionRequests += 1;
    }
    if (route.request().url().includes("/friends/")) {
      friendRequestRequests += 1;
    }
    await route.fulfill({
      status: 404,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "authorization,content-type",
      },
      body: "{}",
    });
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              endpointKind: "hosted",
              endpointUrl: "https://launcher.dylan.lol",
              bindAddr: "https://launcher.dylan.lol",
              healthUrl: "https://launcher.dylan.lol/health",
              running: true,
              managed: false,
              canStart: false,
              message: "Hosted friends service is reachable",
            };
          }
          if (cmd === "list_minecraft_accounts") return [];
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Friends" }).click();
  await page.getByLabel("Friend name").fill("Casey");
  await page.getByRole("button", { name: "Add" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText("Sign in to use friends.");
  await expect(page.getByLabel("Launcher status message")).not.toContainText("hosted friends");
  await expect(page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.locator(".friend-row").filter({ hasText: "Casey" }).filter({ hasText: "Request sent" })).toHaveCount(0);
  expect(devSessionRequests).toBe(0);
  expect(friendRequestRequests).toBe(0);
});

test("hosted friend request exchange failure hides backend internals", async ({ page }) => {
  let friendRequestRequests = 0;
  await page.route("https://launcher.dylan.lol/**", async (route) => {
    if (route.request().url().includes("/friends/")) {
      friendRequestRequests += 1;
    }
    await route.fulfill({
      status: 404,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "authorization,content-type",
      },
      body: "{}",
    });
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              minecraftSession: {
                session: {
                  username: "Player",
                  uuid: "00000000-0000-4000-8000-000000000001",
                  accessToken: "[redacted]",
                },
                accountId: "00000000-0000-4000-8000-000000000001",
                expiresAtUnixSeconds: 1_900_000_000,
                storedAtUnixSeconds: 1_710_000_000,
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              endpointKind: "hosted",
              endpointUrl: "https://launcher.dylan.lol",
              bindAddr: "https://launcher.dylan.lol",
              healthUrl: "https://launcher.dylan.lol/health",
              running: true,
              managed: false,
              canStart: false,
              message: "Hosted friends service is reachable",
            };
          }
          if (cmd === "exchange_stored_minecraft_session_for_backend_session") {
            throw new Error("Minecraft backend session exchange failed with HTTP status 500 Internal Server Error");
          }
          if (cmd === "list_minecraft_accounts") {
            return [
              {
                accountId: "00000000-0000-4000-8000-000000000001",
                username: "Player",
                uuid: "00000000-0000-4000-8000-000000000001",
                active: true,
                expiresAtUnixSeconds: 1_900_000_000,
              },
            ];
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Friends" }).click();
  await page.getByLabel("Friend name").fill("Casey");
  await page.getByRole("button", { name: "Add" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText(
    "Friends service sign-in is unavailable right now. Minecraft still works.",
  );
  await expect(page.getByLabel("Launcher status message")).not.toContainText("backend");
  await expect(page.getByLabel("Launcher status message")).not.toContainText("HTTP status");
  await expect(page.getByLabel("Launcher status message")).not.toContainText("Sign in to use friends");
  await expect(page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Sign in" })).toHaveCount(0);
  expect(friendRequestRequests).toBe(0);
});

test("settings friends service action explains preview and desktop requirements", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByRole("button", { name: "Check friends", exact: true }).click();
  await expect(page.getByText("Preview friends service status ready")).toBeVisible();
  await expect(page.getByText("Friends service status is mocked in web preview")).toHaveCount(0);

  await page.getByRole("button", { name: "Start local service" }).click();
  await expect(page.getByText("Local friends service requires the desktop app")).toBeVisible();
  await expect(page.getByText("Starting friends service is mocked in web preview")).toHaveCount(0);

  await page.getByRole("button", { name: "Stop local service" }).click();
  await expect(page.getByText("Local friends service requires the desktop app")).toBeVisible();
  await expect(page.getByText("Stopping friends service is mocked in web preview")).toHaveCount(0);
});

test("settings native friends service action failures surface real errors", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "bootstrap_snapshot") {
            return {
              settings: {
                maxMemoryMb: 6144,
                minMemoryMb: 2048,
                offlineUsername: "Player",
                telemetryEnabled: false,
              },
              directories: {
                dataDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher",
                configDir: "C:/Users/test/AppData/Roaming/TheBoysLauncher/config",
                cacheDir: "C:/Users/test/AppData/Local/TheBoysLauncher/cache",
                logDir: "C:/Users/test/AppData/Local/TheBoysLauncher/logs",
              },
              friends: [],
              packs: [],
              profiles: [],
              imports: [],
            };
          }
          if (cmd === "social_backend_status") {
            return {
              bindAddr: "127.0.0.1:4074",
              healthUrl: "http://127.0.0.1:4074/health",
              running: false,
              managed: true,
              canStart: false,
              endpointKind: "local",
              message: "backend lock poisoned",
            };
          }
          if (cmd === "start_social_backend") {
            throw new Error("packaged backend executable is missing");
          }
          if (cmd === "stop_social_backend") {
            throw new Error("friends service is not responding");
          }
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "plugin:event|unlisten") return undefined;
          throw new Error(`Unexpected invoke: ${cmd}`);
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: {
        unregisterListener: () => undefined,
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Advanced" }).click();
  await expect(page.getByLabel("Advanced launcher status")).toContainText("Friends service is busy. Try again in a moment.");
  await expect(page.getByLabel("Advanced launcher status")).not.toContainText("backend lock poisoned");

  await page.getByRole("button", { name: "Check friends" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText("Friends service is busy. Try again in a moment.");
  await expect(page.getByLabel("Launcher status message")).not.toContainText("backend lock poisoned");

  await page.getByRole("button", { name: "Start local service" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText("packaged friends service is missing");
  await expect(page.getByLabel("Launcher status message")).not.toContainText("backend executable");
  await expect(page.getByText("Starting friends service is mocked in web preview")).toHaveCount(0);

  await page.getByRole("button", { name: "Stop local service" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText("friends service is not responding");
  await expect(page.getByText("Stopping friends service is mocked in web preview")).toHaveCount(0);
});
