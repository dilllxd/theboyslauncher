import { expect, test, type Locator } from "@playwright/test";

async function openProfileCustomize(profile: Locator) {
  await profile.getByRole("button", { name: "Customize" }).click();
}

test("home screen renders the social launcher shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "WinterPack" })).toBeVisible();
  await expect(page.getByText("Now Online")).toBeVisible();
  await expect(page.getByLabel("Home party panel")).toContainText(/0 parties|1 party/);
  await expect(page.getByLabel("Home party panel")).toContainText(/1 friend online or away|2 friends online or away/);
  await expect(page.getByLabel("Primary pack status")).toContainText("Update");
  await expect(page.getByLabel("Primary pack actions").getByRole("button", { name: "Update" })).toBeVisible();
  await expect(page.getByLabel("Primary pack actions").getByRole("button", { name: "Details" })).toBeVisible();
  await expect(page.getByLabel("Launcher quick status")).toContainText("Session");
  await expect(page.getByLabel("Launcher quick status")).toContainText("Offline ready");
  await expect(page.getByLabel("Launcher quick status")).toContainText("No active process");
  await expect(page.getByLabel("Launcher quick status")).toContainText("No operation yet");
  await expect(page.getByLabel("Launcher status", { exact: true })).toContainText("Web preview");
  await expect(page.getByLabel("Launcher status message")).toContainText(/Launcher ready|Native bootstrap failed/);
  await expect(page.getByRole("button", { name: "Play" }).first()).toBeVisible();

  await page.getByLabel("Launcher quick status").getByRole("button", { name: /Session/ }).click();
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

test("settings exposes stable and dev launcher update channels", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Launcher updates" })).toBeVisible();
  await expect(page.getByLabel("Launcher update channel").getByRole("button", { name: "Stable" })).toBeVisible();
  await page.getByLabel("Launcher update channel").getByRole("button", { name: "Dev" }).click();
  await expect(page.getByText("Dev installs as a separate signed app.")).toBeVisible();
  await expect(page.getByText("Installed: Stable. Selected: Dev.")).toBeVisible();
});

test("backend pack refresh preserves native installed pack state", async ({ page }) => {
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
              message: "Social backend is not reachable; packaged binary can be started from Settings.",
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

  await expect(page.getByLabel("Launcher status message")).toContainText("packaged binary can be started");
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
  expect(profileActionMetrics.tallestButton).toBeLessThanOrEqual(36);
});

test("activity process actions stay visible with long Java paths", async ({ page }) => {
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
  await page.getByLabel("Activity views").getByRole("button", { name: "Processes", exact: true }).click();

  const processRow = page.locator(".process-row").filter({ hasText: "Modern Vanilla" });
  await expect(processRow).toContainText("Minecraft 1.21.8 is running");
  await expect(processRow.getByRole("button", { name: "Stop" })).toBeVisible();

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

test("sign in action falls back to web preview mock", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Microsoft login is mocked in web preview")).toBeVisible();
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

  await expect(page.getByText("Signed in as Builder")).toBeVisible();
  await expect(page.locator(".topbar").getByRole("button", { name: "Minecraft account Builder signed in" })).toBeVisible();
  await expect(page.locator(".topbar").getByRole("button", { name: "Minecraft account Builder signed in" })).toContainText("Signed in");
  await expect(page.locator(".topbar").getByRole("button", { name: "Minecraft account Builder signed in" })).toContainText("Builder");
  await expect(page.locator(".topbar").getByRole("button", { name: "Sign in" })).toHaveCount(0);
  await expect(page.getByLabel("Launcher quick status")).toContainText("Builder signed in");
  await expect(page.getByLabel("Launcher quick status")).not.toContainText("expires");
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.locator(".account-card")).toContainText("Builder");
  const invoked = await page.evaluate(() => (window as typeof window & { __authInvokes: string[] }).__authInvokes);
  expect(invoked).toContain("start_microsoft_auth_flow");
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

  await expect(page.getByText("THEBOYS_MICROSOFT_CLIENT_ID is required")).toBeVisible();
  const invoked = await page.evaluate(
    () => (window as typeof window & { __authSetupInvokes: string[] }).__authSetupInvokes,
  );
  expect(invoked).toContain("start_microsoft_auth_flow");
  expect(invoked).not.toContain("start_microsoft_login");
});

test("settings shows Microsoft callback completion guard", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Advanced" }).click();
  await page
    .getByLabel("Microsoft callback URL")
    .fill("http://127.0.0.1:53682/auth/microsoft/callback?code=abc&state=state");
  await page.getByRole("button", { name: "Finish sign in" }).click();

  await expect(page.getByText("Start Microsoft login first")).toBeVisible();
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
  await expect(page.getByText("local callback timed out")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: "Advanced" }).click();
  await page
    .getByLabel("Microsoft callback URL")
    .fill("http://127.0.0.1:53682/auth/microsoft/callback?code=abc&state=state-abc");
  await page.getByLabel("Settings session actions").getByRole("button", { name: "Finish sign in" }).click();

  await expect(page.getByText("Microsoft token exchange failed: invalid_grant")).toBeVisible();
  const invoked = await page.evaluate(
    () => (window as typeof window & { __callbackCompletionInvokes: string[] }).__callbackCompletionInvokes,
  );
  expect(invoked).toContain("plan_microsoft_token_exchange");
  expect(invoked).toContain("exchange_microsoft_authorization_code");
  expect(invoked).not.toContain("authenticate_and_save_minecraft_session");
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
  await expect(page.locator(".pack-card").filter({ hasText: "WinterPack" })).toHaveCount(0);
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
  await expect(page.getByRole("button", { name: "Events", exact: true })).toHaveClass(/active/);
  const installEvent = page.locator(".event-row").filter({ hasText: "Pack installed successfully." });
  await expect(installEvent).toBeVisible();
  await expect(page.locator(".event-row").filter({ hasText: "Install plan is ready to execute." })).toHaveCount(0);
  await installEvent.getByRole("button", { name: "Play" }).click();
  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Processes" })).toHaveClass(/active/);
  await expect(page.locator(".process-row").filter({ hasText: "javaw.exe" })).toContainText("Running");
  await expect
    .poll(() => page.evaluate(() => (window as typeof window & { __installedPackLaunchProfileIds: string[] }).__installedPackLaunchProfileIds))
    .toEqual(["winterpack"]);
  await page.locator("nav").getByRole("button", { name: "Play" }).click();
  await expect(card.getByRole("button", { name: "Running" })).toBeDisabled();
  await page.getByRole("button", { name: "Library" }).click();
  await expect(page.getByRole("heading", { name: "Profiles" })).toBeVisible();
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
  await expect(page.locator(".event-row").filter({ hasText: "Installing pack is running" })).toContainText("active - 95%");
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
  await expect(page.getByRole("button", { name: "Events", exact: true })).toHaveClass(/active/);
  await expect(page.getByRole("complementary")).toContainText("Pack install failed: missing mod artifact");
  const failedEvent = page.locator(".event-row").filter({ hasText: "Pack install failed: missing mod artifact" });
  await expect(failedEvent).toBeVisible();
  await expect(failedEvent).toContainText("Install pack - winterpack");
  await expect(failedEvent.getByRole("button", { name: "Play" })).toHaveCount(0);
  await expect(failedEvent.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.locator(".event-row").filter({ hasText: "Install plan is ready to execute." })).toHaveCount(0);
  await page.getByRole("button", { name: "Overview" }).click();
  await expect(page.getByLabel("Launcher operations").locator(".operation-row").filter({ hasText: "Pack install failed" })).toHaveClass(
    /failed/,
  );
  await expect(page.getByLabel("Latest operation breakdown")).toContainText("1 failed");
  await expect(page.getByLabel("Latest operation breakdown")).toContainText("0 completed");
  await page.getByRole("button", { name: "Events", exact: true }).click();
  await failedEvent.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("complementary")).toContainText("Pack install failed: missing mod artifact");

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
  await expect(profile.getByLabel("WinterPack profile summary")).not.toContainText("JVM args");
  await expect(profile.getByLabel("WinterPack launch actions").getByRole("button", { name: "Update" })).toBeVisible();
  await profile.getByLabel("WinterPack launch actions").getByRole("button", { name: "Update" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Events", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".event-row").filter({ hasText: "Pack updated successfully." })).toBeVisible();
  await page.getByRole("button", { name: "Library" }).click();
  await expect(profile.getByLabel("WinterPack launch actions").getByRole("button", { name: "Update" })).toHaveCount(0);
  await expect(profile.getByLabel("WinterPack profile summary")).toContainText("8 GB RAM");
  await expect(profile.getByLabel("WinterPack profile summary")).toContainText("1600x900");
  await expect(profile.getByLabel("WinterPack profile summary")).toContainText("The Custom Cabin");
  await expect(profile.getByLabel("WinterPack profile summary")).not.toContainText("JVM args");
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
  await profile.getByRole("button", { name: "Launch details" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText("asset index is missing");
  await expect(page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Try again" })).toBeVisible();

  await profile.getByLabel("WinterPack launch actions").getByRole("button", { name: "Update" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText("Pack updated successfully.");
  await expect(page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Try again" })).toHaveCount(0);
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
                { kind: "queued", message: "Repair queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Repair plan is ready to execute.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "repair_profile") {
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

  const card = page.locator(".pack-card").filter({ hasText: "WinterPack" });
  await card.getByRole("button", { name: "Details" }).click();
  await page.getByRole("button", { name: "WinterPack more actions" }).click();
  await page.getByRole("menu", { name: "WinterPack more menu" }).getByRole("menuitem", { name: "Check files" }).click();
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByLabel("Launcher quick status")).toContainText("Check files - active");

  await page.evaluate(() =>
    (window as typeof window & { __emitRepairCompletedEvent: () => void }).__emitRepairCompletedEvent(),
  );

  await expect(page.getByLabel("Launcher quick status")).toContainText("Check files - completed");
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
            subjectId: "winterpack-modloader-artifacts",
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
    Object.defineProperty(window, "__emitPackInstallCompletedEvent", {
      value: () => {
        const event = {
          event: "launcher-event",
          payload: {
            id: "pack-install-completed",
            operationId: "pack-install",
            operation: "install_pack",
            subjectId: "winterpack",
            kind: "completed",
            message: "Pack installed successfully.",
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
    (window as typeof window & { __emitDownloadEvent: () => void }).__emitDownloadEvent(),
  );

  await expect(page.getByLabel("Launcher status", { exact: true })).toContainText("Downloading files");
  await expect(page.getByLabel("Launcher status message")).toContainText(
    "winterpack - Downloading file: forge-bootstrap",
  );
  await expect(page.getByLabel("Launcher status progress")).toBeVisible();

  await page.evaluate(() =>
    (window as typeof window & { __emitDownloadCompletedEvent: () => void }).__emitDownloadCompletedEvent(),
  );

  await expect(page.getByLabel("Launcher status", { exact: true })).toContainText("Desktop connected");
  await expect(page.getByLabel("Launcher status", { exact: true })).not.toContainText("Downloading files");
  await expect(page.getByLabel("Launcher status message")).toContainText("File download completed");
  await expect(page.getByLabel("Launcher status progress")).toHaveCount(0);

  await page.evaluate(() =>
    (window as typeof window & { __emitProcessorVerifiedEvent: () => void }).__emitProcessorVerifiedEvent(),
  );

  await expect(page.getByLabel("Launcher status", { exact: true })).toContainText("Downloading files");
  await expect(page.getByLabel("Launcher status message")).toContainText(
    "winterpack - Verified modloader installer processor 6/6 outputs.",
  );

  await page.evaluate(() =>
    (window as typeof window & { __emitPackInstallCompletedEvent: () => void }).__emitPackInstallCompletedEvent(),
  );

  await expect(page.getByLabel("Launcher status", { exact: true })).toContainText("Desktop connected");
  await expect(page.getByLabel("Launcher status", { exact: true })).not.toContainText("Downloading files");
  await expect(page.getByLabel("Launcher status message")).toContainText("Pack installed successfully.");
  await expect(page.getByLabel("Launcher status progress")).toHaveCount(0);
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

  await expect(page.getByLabel("Launcher status", { exact: true })).toContainText("Downloading files", {
    timeout: 5000,
  });
  await expect(page.getByLabel("Launcher status message")).toContainText(
    "winterpack - Downloading file: asset-object-minecraft/sounds/random/click.ogg",
  );
  await expect(page.getByLabel("Launcher status progress")).toBeVisible();
  const invoked = await page.evaluate(
    () => (window as typeof window & { __pendingInstallPollInvokes: string[] }).__pendingInstallPollInvokes,
  );
  expect(invoked.filter((cmd) => cmd === "list_launcher_events").length).toBeGreaterThanOrEqual(2);
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
  await expect(page.getByRole("button", { name: "Events", exact: true })).toHaveClass(/active/);
  const pendingPlanEvent = page.locator(".event-row").filter({ hasText: "Update plan is ready to execute." });
  await expect(pendingPlanEvent).toBeVisible();
  await expect(pendingPlanEvent.getByRole("button", { name: "Play" })).toHaveCount(0);
  let invoked = await page.evaluate(() => (window as typeof window & { __packPendingInvokes: string[] }).__packPendingInvokes);
  expect(invoked.filter((cmd) => cmd === "plan_install_pack")).toHaveLength(1);
  expect(invoked.filter((cmd) => cmd === "install_pack")).toHaveLength(1);
  expect(invoked).not.toContain("start_launch_process");

  await page.locator("nav").getByRole("button", { name: "Play" }).click();
  await expect(card.getByRole("button", { name: "Updating..." })).toBeDisabled();
  await page.getByRole("button", { name: "Library" }).click();
  const pendingProfileActions = page.getByLabel("WinterPack launch actions");
  await expect(pendingProfileActions.getByRole("button", { name: "Busy" })).toBeDisabled();
  await expect(pendingProfileActions.getByRole("button", { name: "Updating..." })).toBeDisabled();
  await pendingProfileActions.getByRole("button", { name: "Updating..." }).click({ force: true });
  invoked = await page.evaluate(() => (window as typeof window & { __packPendingInvokes: string[] }).__packPendingInvokes);
  expect(invoked.filter((cmd) => cmd === "install_pack")).toHaveLength(1);
  expect(invoked).not.toContain("start_launch_process");

  await page.evaluate(() => (window as typeof window & { __releasePendingPackInstall: () => void }).__releasePendingPackInstall());
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Events", exact: true })).toHaveClass(/active/);
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
  await profile.getByRole("button", { name: "Archive" }).click();

  await expect(page.getByText("WinterPack archived")).toBeVisible();
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
                versionType: "release",
                url: "https://example.invalid/1.21.8.json",
                releaseTime: "2025-07-17T12:00:00+00:00",
              },
              {
                id: "1.21.4",
                versionType: "release",
                url: "https://example.invalid/1.21.4.json",
                releaseTime: "2024-12-03T12:00:00+00:00",
              },
              {
                id: "26w01a",
                versionType: "snapshot",
                url: "https://example.invalid/26w01a.json",
                releaseTime: "2026-01-07T12:00:00+00:00",
              },
            ];
          }
          if (cmd === "create_profile") {
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
            return {
              id: "receipt-prepare-native-created",
              action: "repair_profile",
              subjectId: "native-created",
              status: "completed",
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
  await page.getByRole("button", { name: "New profile" }).click();
  await page.getByLabel("New profile name").fill("Native Fabric");
  await page.getByLabel("New profile version type").selectOption("snapshot");
  await page.getByLabel("New profile game version").selectOption("26w01a");
  await page.getByLabel("New profile loader").selectOption("fabric");
  await page.getByLabel("New profile memory").fill("8192");
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page.getByText("Native Fabric created and ready")).toBeVisible();
  const createdProfile = page.locator(".profile-row").filter({ hasText: "Native Fabric" });
  await expect(createdProfile.getByLabel("Native Fabric profile summary")).toContainText("26w01a");
  await expect(createdProfile.getByLabel("Native Fabric profile summary")).toContainText("fabric");
  await expect(createdProfile.getByLabel("Native Fabric profile summary")).toContainText("8 GB RAM");
  const invoked = await page.evaluate(() => (window as typeof window & { __nativeCreateProfileInvokes: string[] }).__nativeCreateProfileInvokes);
  expect(invoked.indexOf("create_profile")).toBeLessThan(invoked.indexOf("prepare_profile"));
  expect(invoked.indexOf("bootstrap_snapshot", invoked.indexOf("prepare_profile"))).toBeGreaterThan(invoked.indexOf("prepare_profile"));
});

test("home screen replaces preview friends with social backend presence", async ({ page }) => {
  const accountId = "00000000-0000-4000-8000-000000000001";
  const issuedAtUnixSeconds = Math.floor(Date.now() / 1000);
  const expiresAtUnixSeconds = issuedAtUnixSeconds + 3600;
  const accessToken = `dev-session:${accountId}:${expiresAtUnixSeconds}`;
  let presenceAuthorization = "";
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
  expect(presenceAuthorization).toBe(`Bearer ${accessToken}`);
});

test("home screen clears stale preview friends when backend presence is empty", async ({ page }) => {
  const accountId = "00000000-0000-4000-8000-000000000001";
  const issuedAtUnixSeconds = Math.floor(Date.now() / 1000);
  const expiresAtUnixSeconds = issuedAtUnixSeconds + 3600;
  const accessToken = `dev-session:${accountId}:${expiresAtUnixSeconds}`;
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
    await route.fulfill({ status: 404, headers: corsHeaders });
  });

  await page.goto("/");

  await expect(page.getByText("Ready to play")).toBeVisible();
  await expect(page.getByLabel("Home party panel")).toContainText("0 parties");
  await expect(page.locator(".friend-row").filter({ hasText: "Dylan" })).toHaveCount(0);
  await expect(page.getByLabel("Home party panel")).not.toContainText("friends online or away");
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

  await expect(page.getByText("Ready to play")).toBeVisible();
  await expect(page.getByLabel("Home party panel")).toContainText("0 parties");
  await expect(page.locator(".friend-row").filter({ hasText: "Dilll" })).toHaveCount(0);
  await expect(page.locator(".friend-row").filter({ hasText: "Player 0001" })).toHaveCount(0);
});

test("home screen streams friend presence from the social backend websocket", async ({ page }) => {
  const accountId = "00000000-0000-4000-8000-000000000001";
  const issuedAtUnixSeconds = Math.floor(Date.now() / 1000);
  const expiresAtUnixSeconds = issuedAtUnixSeconds + 3600;
  const accessToken = `dev-session:${accountId}:${expiresAtUnixSeconds}`;
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
    if (request.url().endsWith("/sessions/current")) {
      await route.fulfill({
        status: 200,
        headers: {
          ...corsHeaders,
          "content-type": "application/json",
        },
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
      expect(request.headers()["authorization"]).toBe(`Bearer ${accessToken}`);
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
      await route.fulfill({
        status: 200,
        headers: {
          ...corsHeaders,
          "content-type": "application/json",
        },
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
});

test("home screen does not open presence websocket when presence fetch fails", async ({ page }) => {
  const accountId = "00000000-0000-4000-8000-000000000001";
  const issuedAtUnixSeconds = Math.floor(Date.now() / 1000);
  const expiresAtUnixSeconds = issuedAtUnixSeconds + 3600;
  const accessToken = `dev-session:${accountId}:${expiresAtUnixSeconds}`;
  let presenceAuthorization = "";
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
  expect(presenceAuthorization).toBe(`Bearer ${accessToken}`);
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
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: "[]",
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

test("library play action falls back to web preview mock", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.locator(".account-card")).toContainText("refreshes");
  await page.getByRole("button", { name: "Library" }).click();
  await page.locator(".profile-row").filter({ hasText: "WinterPack" }).getByRole("button", { name: "Play" }).click();

  await expect(page.getByText("Launching profile is mocked in web preview")).toBeVisible();
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
  await expect(page.getByLabel("Launcher quick status")).toContainText("1 active process");
  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Processes" })).toHaveClass(/active/);
  await expect(page.getByLabel("Activity tools").getByRole("button", { name: "Live" })).toHaveClass(/active/);
  const processRow = page.locator(".process-row").filter({ hasText: "Minecraft client starting" });
  await expect(processRow).toBeVisible();
  await expect(processRow).toContainText("Running");
  await expect(processRow.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(processRow.getByRole("button", { name: "Save log" })).toBeVisible();
  await page.getByRole("button", { name: "Overview" }).click();
  await expect(page.getByLabel("Launcher operations")).toContainText("Launch profile - winterpack");
  await expect(page.getByLabel("Launcher operations")).toContainText("Launch process started for WinterPack");
  await page.getByLabel("Activity tools").getByRole("button", { name: "Live" }).click();
  await expect(page.getByLabel("Activity tools").getByRole("button", { name: "Live" })).not.toHaveClass(/active/);
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
    document
      .querySelector<HTMLButtonElement>('[aria-label="WinterPack launch actions"] button')
      ?.click();
  });
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
  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Processes" })).toHaveClass(/active/);
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
  await expect(page.getByLabel("Launcher quick status")).toContainText("1 active process");
  await expect(page.locator(".process-row").filter({ hasText: "Returned launch summary" })).toContainText("Running");

  await page.evaluate(() => {
    (window as typeof window & { __failProcessRefresh?: boolean }).__failProcessRefresh = true;
  });
  await page.getByLabel("Activity tools").getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator(".process-row")).toHaveCount(0);
  await expect(page.getByLabel("Launcher quick status")).toContainText("No active process");

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

  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Processes", exact: true })).toHaveClass(
    /active/,
  );
  await expect(page.locator(".process-row").filter({ hasText: "Exited before registry refresh" })).toBeVisible();
  await page.getByRole("button", { name: "Clear exited" }).click();
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
  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Processes" })).toHaveClass(/active/);
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
                { kind: "queued", message: "Repair queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Repair plan is ready to execute.", progressPercent: 100 },
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

  await expect(page.getByRole("complementary")).toContainText("Launching profile queued");
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Processes" })).toHaveClass(/active/);
  await expect(page.locator(".process-row").filter({ hasText: "javaw.exe" })).toBeVisible();
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
  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Processes" })).toHaveClass(/active/);
  await expect(page.locator(".process-row").filter({ hasText: "Minecraft started with Java 21" })).toBeVisible();
  await expect(page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Java" })).toHaveCount(0);
  await expect(page.getByRole("complementary").getByRole("button", { name: "Repair" })).toHaveCount(0);
  const invoked = await page.evaluate(() => (window as typeof window & { __javaRecoveryInvokes: string[] }).__javaRecoveryInvokes);
  expect(invoked).toContain("start_launch_process");
  expect(invoked).toContain("recommended_java_runtime_manifest");
  expect(invoked).toContain("discover_java_runtimes");
  expect(invoked).toContain("execute_managed_java_runtime_install");
  expect(invoked.filter((cmd) => cmd === "start_launch_process")).toHaveLength(2);
  expect(invoked).not.toContain("install_pack");
  expect(invoked).not.toContain("plan_repair_profile");
});

test("missing managed Java executable path offers Java recovery", async ({ page }) => {
  await page.addInitScript(() => {
    const message =
      "Java executable C:/Users/test/AppData/Roaming/TheBoysLauncher/runtimes/temurin-21-windows-x64/bin/java.exe is missing. Install a managed Java runtime from Settings before launching.";
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
          if (cmd === "start_launch_process") throw new Error(message);
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
  await page.locator(".profile-row").filter({ hasText: "Modern Vanilla" }).getByRole("button", { name: "Play" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Overview" })).toHaveClass(/active/);
  await expect(page.getByRole("heading", { name: /Java executable .* is missing/ })).toBeVisible();
  await expect(page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Java" })).toBeVisible();
  await expect(page.getByRole("complementary").getByRole("button", { name: "Repair" })).toHaveCount(0);

  await page.getByRole("button", { name: "Events", exact: true }).click();
  const failedJavaEvent = page.locator(".event-row").filter({ hasText: "Java executable" });
  await expect(failedJavaEvent.getByRole("button", { name: "Java" })).toBeVisible();
  await failedJavaEvent.getByRole("button", { name: "Java" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByLabel("Managed Java runtime ID")).toHaveValue("temurin-21-windows-x64");
});

test("library launch command action falls back to web preview mock", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Library" }).click();
  await page.locator(".profile-row").filter({ hasText: "WinterPack" }).getByRole("button", { name: "Launch details" }).click();

  await expect(page.getByText("Launch details are mocked in web preview")).toBeVisible();
});

test("library launch command action shows native command preview", async ({ page }) => {
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
  await page.locator(".profile-row").filter({ hasText: "WinterPack" }).getByRole("button", { name: "Launch details" }).click();

  const preview = page.getByLabel("Launch details preview", { exact: true });
  await expect(preview).toContainText("Signed-in launch details");
  await expect(preview).toContainText("WinterPack");
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

test("launch command preflight failure offers file-check recovery", async ({ page }) => {
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
                { kind: "queued", message: "Repair queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Repair plan is ready to execute.", progressPercent: 100 },
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
  await page.locator(".profile-row").filter({ hasText: "WinterPack" }).getByRole("button", { name: "Launch details" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText("asset index is missing");
  await expect(page.getByLabel("Launch details preview")).toHaveCount(0);
  const recoveryActions = page.getByLabel("Launcher recovery actions");
  await expect(recoveryActions.getByRole("button", { name: "Try again" })).toBeVisible();
  await recoveryActions.getByRole("button", { name: "Try again" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Events", exact: true })).toHaveClass(/active/);
  await expect(page.getByLabel("Launcher status message")).toContainText("Files are ready.");
  const invoked = await page.evaluate(
    () => (window as typeof window & { __commandRepairRecoveryInvokes: string[] }).__commandRepairRecoveryInvokes,
  );
  expect(invoked.indexOf("build_launch_command")).toBeLessThan(invoked.indexOf("plan_repair_profile"));
  expect(invoked.indexOf("plan_repair_profile")).toBeLessThan(invoked.indexOf("repair_profile"));
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
  await profile.getByRole("button", { name: "Launch details" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText("asset index is missing");
  await expect(page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Try again" })).toBeVisible();

  await profile.getByRole("button", { name: "Launch details" }).click();

  const preview = page.getByLabel("Launch details preview", { exact: true });
  await expect(preview).toContainText("WinterPack");
  await expect(preview).toContainText("javaw.exe");
  await expect(page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Try again" })).toHaveCount(0);
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
  await page.locator(".profile-row").filter({ hasText: "WinterPack" }).getByRole("button", { name: "Launch details" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText(
    "Install a managed Java runtime from Settings before launching",
  );
  await expect(page.getByLabel("Launch details preview")).toHaveCount(0);
  const recoveryActions = page.getByLabel("Launcher recovery actions");
  await expect(recoveryActions.getByRole("button", { name: "Java" })).toBeVisible();
  await recoveryActions.getByRole("button", { name: "Java" }).click();

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
  await page.locator(".profile-row").filter({ hasText: "WinterPack" }).getByRole("button", { name: "Launch details" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText("Microsoft token exchange failed: invalid_grant");
  await expect(page.getByRole("complementary").getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.locator(".account-card")).toContainText("Not signed in");

  await page.getByRole("complementary").getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("timed out waiting for Microsoft sign-in callback")).toBeVisible();
  const invoked = await page.evaluate(
    () => (window as typeof window & { __commandSessionRecoveryInvokes: string[] }).__commandSessionRecoveryInvokes,
  );
  expect(invoked).toContain("build_stored_authenticated_launch_command");
  expect(invoked).not.toContain("build_launch_command");
  expect(invoked).toContain("start_microsoft_auth_flow");
  expect(invoked).toContain("complete_microsoft_login_with_local_callback");
});

test("home details action falls back to web preview mock", async ({ page }) => {
  await page.route("http://127.0.0.1:4074/packs/winterpack", async (route) => {
    await route.abort();
  });
  await page.goto("/");

  await page.getByLabel("Primary pack actions").getByRole("button", { name: "Details" }).click();

  await expect(page.getByText("Pack details are using preview data")).toBeVisible();
  await expect(page.getByLabel("WinterPack pack details")).toBeVisible();
  await page.getByRole("button", { name: "WinterPack more actions" }).click();
  await expect(page.getByRole("menu", { name: "WinterPack more menu" })).toContainText("Check files");
  await expect(page.getByRole("menu", { name: "WinterPack more menu" })).toContainText("Close details");
  await page.getByRole("button", { name: "Close WinterPack details" }).click();
  await expect(page.getByLabel("WinterPack pack details")).toHaveCount(0);
});

test("pack detail file check refreshes native bootstrap snapshot status", async ({ page }) => {
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
                { kind: "queued", message: "Repair queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Repair plan is ready to execute.", progressPercent: 100 },
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
  await expect(card.getByRole("button", { name: "Repair" })).toHaveCount(0);
  await card.getByRole("button", { name: "Details" }).click();
  await page.getByRole("button", { name: "WinterPack more actions" }).click();
  await page.getByRole("menu", { name: "WinterPack more menu" }).getByRole("menuitem", { name: "Check files" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Events", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".event-row").filter({ hasText: "Files are ready." })).toBeVisible();
  await page.locator("nav").getByRole("button", { name: "Play" }).click();
  await expect(card.getByRole("button", { name: "Play" })).toBeEnabled();
  const invoked = await page.evaluate(() => (window as typeof window & { __repairInvokes: string[] }).__repairInvokes);
  expect(invoked.filter((cmd) => cmd === "bootstrap_snapshot").length).toBeGreaterThanOrEqual(2);
  expect(invoked.indexOf("plan_repair_profile")).toBeLessThan(invoked.indexOf("repair_profile"));
  expect(invoked.indexOf("bootstrap_snapshot", invoked.indexOf("repair_profile"))).toBeGreaterThan(invoked.indexOf("repair_profile"));
  expect(invoked.indexOf("list_launcher_events", invoked.indexOf("repair_profile"))).toBeGreaterThan(invoked.indexOf("repair_profile"));
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
                { kind: "queued", message: "Repair queued for Manual Forge", progressPercent: 0 },
                { kind: "completed", message: "Repair plan is ready to execute.", progressPercent: 100 },
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
  await expect(profile.getByLabel("Manual Forge launch actions").getByRole("button", { name: "Launch details" })).toBeVisible();
  await expect(page.getByLabel("Manual Forge profile summary")).not.toContainText("JVM args");
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
                { kind: "queued", message: "Repair queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Repair plan is ready to execute.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "repair_profile") {
            throw new Error("Profile repair failed: asset index is missing");
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

  const card = page.locator(".pack-card").filter({ hasText: "WinterPack" });
  await card.getByRole("button", { name: "Details" }).click();
  await page.getByRole("button", { name: "WinterPack more actions" }).click();
  await page.getByRole("menu", { name: "WinterPack more menu" }).getByRole("menuitem", { name: "Check files" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Events", exact: true })).toHaveClass(/active/);
  await expect(page.getByRole("complementary")).toContainText("File check failed: asset index is missing");
  const failedEvent = page.locator(".event-row").filter({ hasText: "File check failed: asset index is missing" });
  await expect(failedEvent).toBeVisible();
  await expect(failedEvent.getByRole("button", { name: "Play" })).toHaveCount(0);
  await expect(failedEvent.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.locator(".event-row").filter({ hasText: "File check is ready to start." })).toHaveCount(0);
  await failedEvent.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("complementary")).toContainText("File check failed: asset index is missing");

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
          message: "Profile repair completed.",
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
                { kind: "queued", message: "Repair queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Repair plan is ready to execute.", progressPercent: 100 },
              ],
            };
          }
          if (cmd === "repair_profile") {
            return new Promise((resolve) => {
              completeRepair = resolve;
            });
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
                    message: "Profile repair completed.",
                    progressPercent: 100,
                    occurredAtUnixSeconds: 1_710_000_000,
                  }
                : {
                    id: "repair-active",
                    operationId: "00000000-0000-4000-8000-000000000097",
                    operation: "repair_profile",
                    subjectId: "winterpack",
                    kind: "active",
                    message: "Checking profile files",
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

  const card = page.locator(".pack-card").filter({ hasText: "WinterPack" });
  await card.getByRole("button", { name: "Details" }).click();
  await page.getByRole("button", { name: "WinterPack more actions" }).click();
  await page.getByRole("menu", { name: "WinterPack more menu" }).getByRole("menuitem", { name: "Check files" }).click();
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Events", exact: true })).toHaveClass(/active/);
  const pendingRepairPlanEvent = page.locator(".event-row").filter({ hasText: "File check is ready to start." });
  await expect(pendingRepairPlanEvent).toBeVisible();
  await expect(pendingRepairPlanEvent.getByRole("button", { name: "Play" })).toHaveCount(0);
  await page.locator("nav").getByRole("button", { name: "Play" }).click();
  await expect(card.locator(".card-button")).toBeDisabled();
  const pendingHomeFriend = page.getByLabel("Home party panel").locator(".friend-row").filter({ hasText: "Alex" });
  await expect(pendingHomeFriend.getByRole("button", { name: "Join" })).toBeEnabled();
  await page.getByRole("button", { name: "Library" }).click();
  const pendingProfileActions = page.getByLabel("WinterPack launch actions");
  await expect(pendingProfileActions.getByRole("button", { name: "Busy" })).toBeDisabled();
  await expect(pendingProfileActions.getByRole("button", { name: "Repairing..." })).toHaveCount(0);
  await page.getByRole("button", { name: "Friends" }).click();
  const pendingRosterFriend = page.locator(".friend-row").filter({ hasText: "Alex" }).filter({ hasText: "The Cabin" });
  await expect(pendingRosterFriend.getByRole("button", { name: "Join" })).toBeEnabled();
  await page.getByRole("button", { name: "Activity" }).click();
  await page.getByLabel("Activity views").getByRole("button", { name: "Processes" }).click();
  const exitedProcessActions = page.locator(".process-row").filter({ hasText: "Ready after previous launch" }).getByLabel("WinterPack process actions");
  await expect(exitedProcessActions.getByRole("button", { name: "Checking files..." })).toBeDisabled();
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
  await expect(page.getByRole("button", { name: "Events", exact: true })).toHaveClass(/active/);
  const completedRepairEvent = page.locator(".event-row").filter({ hasText: "Files are ready." });
  await expect(completedRepairEvent).toBeVisible();
  await expect(completedRepairEvent.getByRole("button", { name: "Play" })).toBeEnabled();
  const invoked = await page.evaluate(
    () => (window as typeof window & { __pendingRepairInvokes: string[] }).__pendingRepairInvokes,
  );
  expect(invoked.filter((cmd) => cmd === "repair_profile")).toHaveLength(1);
});

test("friend join action falls back to server launch mock", async ({ page }) => {
  await page.goto("/");

  await page.locator(".friend-row").filter({ hasText: "Dylan" }).getByRole("button", { name: "Join" }).click();

  await expect(page.getByText("Joining friend is mocked in web preview")).toBeVisible();
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
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: "[]",
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
  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Processes" })).toHaveClass(/active/);
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
                { kind: "queued", message: "Repair queued for WinterPack", progressPercent: 0 },
                { kind: "completed", message: "Repair plan is ready to execute.", progressPercent: 100 },
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
  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Processes" })).toHaveClass(/active/);
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

test("library new profile action falls back to web preview mock", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Library" }).click();
  await page.getByRole("button", { name: "New profile" }).click();
  await expect(page.getByLabel("New profile editor")).toBeVisible();
  await page.getByLabel("New profile name").fill("");
  await expect(page.getByRole("button", { name: "Create" })).toBeDisabled();
  await page.getByLabel("New profile name").fill("Preview NeoForge");
  await page.getByLabel("New profile game version").selectOption("1.21.1");
  await page.getByLabel("New profile loader").selectOption("neoforge");
  await page.getByLabel("New profile memory").fill("7168");
  await expect(page.getByRole("button", { name: "Create" })).toBeEnabled();
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page.getByText("Creating profile is mocked in web preview")).toBeVisible();
  const profile = page.locator(".profile-row").filter({ hasText: "Preview NeoForge" });
  await expect(profile.getByLabel("Preview NeoForge profile summary")).toContainText("1.21.1");
  await expect(profile.getByLabel("Preview NeoForge profile summary")).toContainText("neoforge");
  await expect(profile.getByLabel("Preview NeoForge profile summary")).toContainText("7 GB RAM");
});

test("library profile editor saves preview changes", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Library" }).click();
  const profile = page.locator(".profile-row").filter({ hasText: "WinterPack" });
  await expect(page.getByLabel("WinterPack profile summary")).toContainText("1280x720");
  await expect(page.getByLabel("WinterPack profile summary")).toContainText("The Cabin");
  await expect(page.getByLabel("WinterPack profile summary")).not.toContainText("JVM args");
  await expect(page.getByLabel("WinterPack launch actions")).toContainText("Play");
  await expect(page.getByLabel("WinterPack launch actions")).not.toContainText("Repair");
  await expect(page.getByLabel("WinterPack launch actions")).toContainText("Launch details");
  await expect(page.getByLabel("WinterPack edit actions")).toContainText("Customize");
  await expect(page.getByLabel("WinterPack danger actions")).toHaveCount(0);
  await expect(profile.getByLabel("WinterPack profile editor")).toHaveCount(0);
  await openProfileCustomize(profile);
  await expect(page.getByLabel("WinterPack danger actions")).toContainText("Archive");
  await expect(page.getByLabel("WinterPack danger actions")).toContainText("Delete");
  await expect(profile.getByLabel("WinterPack profile editor")).toBeVisible();
  await expect(profile.getByLabel("WinterPack window width")).toHaveCount(0);
  await expect(profile.getByLabel("WinterPack default server address")).toHaveCount(0);
  await profile.getByLabel("WinterPack version type").selectOption("snapshot");
  await expect(profile.getByLabel("WinterPack game version")).toBeDisabled();
  await profile.getByLabel("WinterPack version type").selectOption("release");
  await profile.getByLabel("WinterPack game version").selectOption("1.21.4");
  await profile.getByLabel("WinterPack loader").selectOption("quilt");
  await profile.getByLabel("WinterPack memory").fill("8192");
  await profile.getByRole("button", { name: "Advanced" }).click();
  await expect(profile.getByLabel("WinterPack advanced profile settings")).toBeVisible();
  await profile.getByLabel("WinterPack window width").fill("1600");
  await profile.getByLabel("WinterPack window height").fill("900");
  await profile.getByLabel("WinterPack default server name").fill("The New Cabin");
  await profile.getByLabel("WinterPack default server address").fill("play.new-cabin.local");
  await profile.getByLabel("WinterPack default server port").fill("25566");
  await profile.getByLabel("WinterPack JVM args").fill("-Dfoo=bar -Dbar=baz");
  await profile.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Profile update saved in web preview")).toBeVisible();
  await expect(page.getByLabel("WinterPack profile summary")).toContainText("1.21.4");
  await expect(page.getByLabel("WinterPack profile summary")).toContainText("quilt");
  await expect(page.getByLabel("WinterPack profile summary")).toContainText("8 GB RAM");
  await expect(page.getByLabel("WinterPack profile summary")).toContainText("1600x900");
  await expect(page.getByLabel("WinterPack profile summary")).toContainText("The New Cabin");
  await expect(page.getByLabel("WinterPack profile summary")).not.toContainText("JVM args");

  await profile.getByRole("button", { name: "Customize" }).click();
  await expect(profile.getByLabel("WinterPack window width")).toHaveCount(0);
  await profile.getByRole("button", { name: "Advanced" }).click();
  await profile.getByLabel("WinterPack window width").fill("");
  await profile.getByLabel("WinterPack window height").fill("");
  await profile.getByLabel("WinterPack default server name").fill("");
  await profile.getByLabel("WinterPack default server address").fill("");
  await profile.getByLabel("WinterPack default server port").fill("");
  await profile.getByLabel("WinterPack JVM args").fill("");
  await profile.getByRole("button", { name: "Save" }).click();

  await expect(page.getByLabel("WinterPack profile summary")).toContainText("Default window");
  await expect(page.getByLabel("WinterPack profile summary")).toContainText("No default server");
  await expect(page.getByLabel("WinterPack profile summary")).not.toContainText("JVM args");
});

test("library profile editor can choose snapshot versions from the manifest", async ({ page }) => {
  await page.addInitScript(() => {
    let savedVersion = "1.21.8";
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
  await profile.getByLabel("Snapshot Profile version type").selectOption("snapshot");
  await profile.getByLabel("Snapshot Profile game version").selectOption("26w01a");
  await profile.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Snapshot Profile updated")).toBeVisible();
  await expect(profile.getByLabel("Snapshot Profile profile summary")).toContainText("26w01a");
  const updateRequests = await page.evaluate(
    () => (window as typeof window & { __snapshotProfileUpdateRequests: unknown[] }).__snapshotProfileUpdateRequests,
  );
  expect(updateRequests).toEqual([expect.objectContaining({ id: "snapshot-profile", gameVersion: "26w01a" })]);
});

test("library profile editor syncs native refreshed profile values after save", async ({ page }) => {
  await page.addInitScript(() => {
    let saved = false;
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
  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByLabel("WinterPack profile name").fill("WinterPack Draft");
  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByLabel("WinterPack Java override path").fill("C:/Java/21/bin/java.exe");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("WinterPack Canonical updated")).toBeVisible();
  await page.getByRole("button", { name: "Customize" }).click();
  await expect(page.getByLabel("WinterPack Canonical profile name")).toHaveValue("WinterPack Canonical");
  await expect(page.getByLabel("WinterPack Canonical game version")).toHaveValue("1.20.1");
  await expect(page.getByLabel("WinterPack Canonical loader")).toHaveValue("forge");
  await expect(page.getByLabel("WinterPack Canonical memory")).toHaveValue("6144");
  await page.getByRole("button", { name: "Advanced" }).click();
  await expect(page.getByLabel("WinterPack Canonical Java override path")).toHaveValue("C:/Java/21/bin/java.exe");
  await expect(page.getByLabel("WinterPack Canonical profile summary")).toContainText("1.20.1");
  await expect(page.getByLabel("WinterPack Canonical profile summary")).not.toContainText("Java");
  const invoked = await page.evaluate(() => (window as typeof window & { __profileSyncInvokes: string[] }).__profileSyncInvokes);
  const requests = await page.evaluate(
    () => (window as typeof window & { __profileSyncUpdateRequests: Array<{ javaRuntimeOverridePath?: string }> }).__profileSyncUpdateRequests,
  );
  expect(invoked.filter((cmd) => cmd === "bootstrap_snapshot")).toHaveLength(2);
  expect(invoked).toContain("update_profile");
  expect(requests[0]?.javaRuntimeOverridePath).toBe("C:/Java/21/bin/java.exe");
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
  await profile.getByRole("button", { name: "Customize" }).click();
  await profile.getByLabel("WinterPack game version").selectOption("1.21.4");
  await profile.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("profile has a running managed process")).toBeVisible();
  await expect(page.getByLabel("WinterPack profile summary")).toContainText("1.20.1");
  await expect(page.getByText("Profile update saved in web preview")).toHaveCount(0);
  const invoked = await page.evaluate(
    () => (window as typeof window & { __failedNativeSaveInvokes: string[] }).__failedNativeSaveInvokes,
  );
  expect(invoked).toContain("update_profile");
  expect(invoked.filter((cmd) => cmd === "bootstrap_snapshot")).toHaveLength(1);
});

test("library archive action removes profile in preview", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Library" }).click();
  const profile = page.locator(".profile-row").filter({ hasText: "Latest Release" });
  await openProfileCustomize(profile);
  await profile.getByRole("button", { name: "Archive" }).click();

  await expect(page.getByText("Profile archived in web preview")).toBeVisible();
  await expect(profile).toHaveCount(0);
});

test("library delete action removes profile in preview", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Library" }).click();
  const profile = page.locator(".profile-row").filter({ hasText: "Latest Release" });
  await openProfileCustomize(profile);
  await profile.getByRole("button", { name: "Delete" }).click();
  await expect(profile.getByText("Shared Minecraft downloads are kept for faster reinstalls.")).toBeVisible();
  await profile.getByRole("button", { name: "Confirm delete" }).click();

  await expect(page.getByText("Profile deleted in web preview")).toBeVisible();
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
                "Latest Release deleted. Profile files were removed; shared Minecraft downloads were kept for faster reinstalls.",
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
                  "Latest Release deleted. Profile files were removed; shared Minecraft downloads were kept for faster reinstalls.",
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

  await expect(page.getByText("shared Minecraft downloads were kept for faster reinstalls")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Events", exact: true })).toHaveClass(/active/);
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
                "Latest Release deleted. Profile files were removed; shared Minecraft downloads were kept for faster reinstalls.",
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
                      "Latest Release deleted. Profile files were removed; shared Minecraft downloads were kept for faster reinstalls.",
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
  await profile.getByRole("button", { name: "Launch details" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText("asset index is missing");
  await expect(page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Try again" })).toBeVisible();

  await openProfileCustomize(profile);
  await profile.getByRole("button", { name: "Delete" }).click();
  await profile.getByRole("button", { name: "Confirm delete" }).click();

  await expect(page.locator(".event-row").filter({ hasText: "shared Minecraft downloads were kept" })).toBeVisible();
  await expect(page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Try again" })).toHaveCount(0);
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
  await expect(page.getByRole("button", { name: "Events", exact: true })).toHaveClass(/active/);
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

test("library archive action keeps profile visible after native failure", async ({ page }) => {
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
  await profile.getByRole("button", { name: "Archive" }).click();

  await expect(page.getByText("profile has a running managed process")).toBeVisible();
  await expect(profile).toBeVisible();
  const invoked = await page.evaluate(() => (window as typeof window & { __failedNativeArchiveInvokes: string[] }).__failedNativeArchiveInvokes);
  expect(invoked).toContain("archive_profile");
  expect(invoked).not.toContain("delete_profile");
});

test("library delete action is disabled while a profile process is running", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Activity" }).click();
  await page.getByLabel("Activity views").getByRole("button", { name: "Processes" }).click();
  await page.getByRole("button", { name: "Library" }).click();

  const runningProfile = page.locator(".profile-row").filter({ hasText: "WinterPack" });
  await expect(runningProfile).toContainText("Running process owns this profile");
  const runningLaunchActions = runningProfile.getByLabel("WinterPack launch actions").getByRole("button", { name: "Running" });
  await expect(runningLaunchActions).toHaveCount(3);
  await expect(runningLaunchActions.first()).toBeDisabled();
  await expect(runningLaunchActions.nth(1)).toBeDisabled();
  await expect(runningLaunchActions.nth(2)).toBeDisabled();
  const runningProcessActions = runningProfile.getByLabel("WinterPack process actions");
  await expect(runningProcessActions.getByRole("button", { name: "Stop" })).toBeEnabled();
  await expect(runningProcessActions.getByRole("button", { name: "Save log" })).toBeEnabled();
  await runningProcessActions.getByRole("button", { name: "Save log" }).click();
  await expect(page.getByText("Process log export is mocked in web preview")).toBeVisible();
  await runningProcessActions.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByText("Stopping process is mocked in web preview")).toBeVisible();
  await expect(runningProfile.getByLabel("WinterPack process actions").getByRole("button", { name: "Stopping" })).toBeDisabled();
  await expect(runningProfile.getByLabel("WinterPack edit actions").getByRole("button", { name: "Customize" })).toBeDisabled();
  await expect(runningProfile.getByLabel("WinterPack danger actions")).toHaveCount(0);

  const idleProfile = page.locator(".profile-row").filter({ hasText: "Latest Release" });
  await openProfileCustomize(idleProfile);
  await expect(idleProfile.getByRole("button", { name: "Archive" })).toBeEnabled();
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
  await page.getByLabel("Activity views").getByRole("button", { name: "Processes" }).click();
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
  await page.getByLabel("Activity views").getByRole("button", { name: "Events", exact: true }).click();

  const failedRepairEvent = page.locator(".event-row").filter({ hasText: "File check failed: asset index is missing" });
  await expect(failedRepairEvent.getByRole("button", { name: "Running" })).toBeDisabled();
  await failedRepairEvent.getByRole("button", { name: "Running" }).click({ force: true });
  const invoked = await page.evaluate(() => (window as typeof window & { __runningRepairRetryInvokes: string[] }).__runningRepairRetryInvokes);
  expect(invoked).not.toContain("repair_profile");
});

test("friend join is disabled while the target profile process is running", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Activity" }).click();
  await page.getByLabel("Activity views").getByRole("button", { name: "Processes" }).click();
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
  await expect(page.getByRole("button", { name: "Scan" })).toBeVisible();
});

test("friends screen starts without seeded preview requests or blocked accounts", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Friends" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Friends" })).toBeVisible();
  await expect(page.locator(".friend-row").filter({ hasText: "Avery" })).toHaveCount(0);
  await expect(page.locator(".friend-row").filter({ hasText: "Sam" })).toHaveCount(0);
  await expect(page.locator(".friend-row").filter({ hasText: "BlockedPreview" })).toHaveCount(0);
  await expect(page.locator(".friend-row").filter({ hasText: "Incoming request" })).toHaveCount(0);
});

test("friends screen can send requests through the social backend scaffold", async ({ page }) => {
  const accountId = "00000000-0000-4000-8000-000000000001";
  const issuedAtUnixSeconds = Math.floor(Date.now() / 1000);
  const expiresAtUnixSeconds = issuedAtUnixSeconds + 3600;
  const accessToken = `dev-session:${accountId}:${expiresAtUnixSeconds}`;
  let friendRequestBody = "";
  let accountSearchAuthorization = "";
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
      accountSearchAuthorization = request.headers()["authorization"] ?? "";
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
      friendRequestBody = request.postData() ?? "";
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
  await expect(page.getByText("Found 1 account", { exact: true })).toBeVisible();
  await expect(page.locator(".friend-search-result").filter({ hasText: "Casey" })).toContainText("Request");
  expect(accountSearchAuthorization).toBe(`Bearer ${accessToken}`);
  await page.getByRole("button", { name: "Add" }).click();

  await expect(page.getByText("Friend request sent to Casey")).toBeVisible();
  await expect(page.locator(".friend-row").filter({ hasText: "Casey" }).filter({ hasText: "Request sent" })).toBeVisible();
  expect(JSON.parse(friendRequestBody).targetAccountId).toMatch(/[0-9a-f-]{36}/);

  await page.locator(".friend-row").filter({ hasText: "Mason" }).getByRole("button", { name: "Mute" }).click();
  await expect(page.locator(".friend-row").filter({ hasText: "Mason" }).filter({ hasText: "Muted" })).toBeVisible();
  expect(JSON.parse(muteRequestBody).targetAccountId).toMatch(/[0-9a-f-]{36}/);

  await page.locator(".friend-row").filter({ hasText: "Mason" }).getByRole("button", { name: "Unmute" }).click();
  await expect(page.locator(".friend-row").filter({ hasText: "Mason" }).filter({ hasText: "Muted" })).toHaveCount(0);
  expect(unmuteCalled).toBeTruthy();

  await page.locator(".friend-row").filter({ hasText: "Mason" }).getByRole("button", { name: "Block" }).click();
  await expect(page.locator(".friend-row").filter({ hasText: "Mason" }).filter({ hasText: "Blocked account" })).toBeVisible();
  expect(JSON.parse(blockRequestBody).targetAccountId).toMatch(/[0-9a-f-]{36}/);

  await page.locator(".friend-row").filter({ hasText: "Mason" }).getByRole("button", { name: "Unblock" }).click();
  await expect(page.locator(".friend-row").filter({ hasText: "Mason" }).filter({ hasText: "Blocked account" })).toHaveCount(0);
  expect(unblockCalled).toBeTruthy();
});

test("import screen plans a preview migration", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("navigation").getByRole("button", { name: "Import" }).click();
  await page.getByRole("button", { name: "Scan" }).click();
  const importRow = page.locator(".import-row").filter({ hasText: "WinterPack" });
  await expect(importRow).toContainText("Detected as WinterPack");
  await expect(importRow).toContainText("1.21.1 - fabric");
  await expect(importRow).toContainText("42 importable files");
  await expect(importRow).toContainText("96 KB");
  await expect(importRow).toContainText("Preview import with saves");
  await importRow.getByText("View source details").click();
  await expect(importRow).toContainText("icon.png");
  await importRow.getByRole("button", { name: "Review" }).click();

  await expect(page.getByText("Import planning is mocked in web preview")).toBeVisible();
  const importDialog = page.getByRole("dialog", { name: "Review profile import" });
  await expect(importDialog.getByRole("heading", { name: "WinterPack" })).toBeVisible();
  await expect(importDialog).toContainText("1.21.1 - fabric");
  await expect(importDialog).toContainText("2 items ready - 33 KB");
  await expect(importDialog.locator(".import-row").filter({ hasText: "saves" })).toContainText("8 files");
  await expect(importDialog.locator(".import-row").filter({ hasText: "saves" })).toContainText("32 KB");
  await expect(importDialog.locator(".import-row").filter({ hasText: "options" })).toContainText("1 file");
  await expect(importDialog.locator(".import-row").filter({ hasText: "options" })).toContainText("512 B");
  await expect(importDialog.locator(".import-row").filter({ hasText: "Conflict in target profile" })).toBeVisible();
  await importDialog.getByRole("button", { name: "Import", exact: true }).click();

  await expect(page.getByText("Choose what to do with conflicts before importing")).toBeVisible();
  await importDialog.locator(".import-row").filter({ hasText: "config" }).getByRole("button", { name: "rename" }).click();
  await expect(importDialog.locator(".import-row").filter({ hasText: "Conflict will rename" })).toBeVisible();
  await expect(importDialog).toContainText("3 items ready - 97 KB");
  await importDialog.getByRole("button", { name: "Import", exact: true }).click();

  await expect(page.getByText("Profile imported in web preview")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  const importedProfile = page.locator(".profile-row").filter({ hasText: "WinterPack" }).filter({ hasText: "No default server" });
  await expect(importedProfile).toContainText("fabric");
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
  const importButton = importDialog.getByRole("button", { name: "Import", exact: true });
  await expect(importButton).toBeEnabled();
  await importButton.click();
  await expect(importDialog.getByRole("button", { name: "Importing..." })).toBeDisabled();

  const invokedWhilePending = await page.evaluate(
    () => (window as typeof window & { __nativeImportInvokes: string[] }).__nativeImportInvokes,
  );
  expect(invokedWhilePending.filter((cmd) => cmd === "execute_profile_import")).toHaveLength(1);

  await page.evaluate(() => (window as typeof window & { __completeNativeImport: () => void }).__completeNativeImport());
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.locator(".profile-row").filter({ hasText: "WinterPack Imported" })).toContainText("fabric");
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
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  const operationRows = page.getByLabel("Launcher operations").locator(".operation-row");
  await expect(operationRows.filter({ hasText: "Download files - winterpack" })).toContainText(
    "File already present: user-options",
  );
  await expect(operationRows.filter({ hasText: "Check files - winterpack" })).toContainText(
    "Event log is mocked in web preview",
  );
  await expect(operationRows.filter({ hasText: "Managed process - preview process" })).toContainText(
    "Preview process exited with exit code 7",
  );
  await expect(page.getByRole("progressbar", { name: "Event log is mocked in web preview progress" })).toHaveAttribute(
    "aria-valuenow",
    "100",
  );
  await expect(page.getByLabel("Latest operation steps")).toContainText("Latest operation");
  await expect(page.getByLabel("Latest operation steps")).toContainText("Download files - winterpack");
  await expect(page.getByLabel("Latest operation steps")).toContainText("6 steps");
  await expect(page.getByLabel("Latest operation breakdown")).toContainText("0 completed");
  await expect(page.getByLabel("Latest operation breakdown")).toContainText("5 active");
  await expect(page.getByLabel("Latest operation breakdown")).toContainText("1 pending");
  await expect(page.getByLabel("Latest file progress")).toContainText("Current: forge-bootstrap");
  await expect(page.getByLabel("Latest file progress")).toContainText("1 pending");
  await expect(page.getByLabel("Latest file progress")).toContainText("2 started");
  await expect(page.getByLabel("Latest file progress")).toContainText("2 finished");
  await expect(page.getByLabel("Latest file progress")).toContainText("0 failed");
  const activeDownloadStep = page.locator(".operation-step").filter({ hasText: "Downloading file: forge-bootstrap" });
  await expect(activeDownloadStep).not.toBeVisible();
  await page.getByLabel("Latest operation steps").getByText("View details").click();
  await expect(activeDownloadStep).toContainText("downloading - 55%");
  await expect(page.getByLabel("Recent launcher events").locator(".event-row")).toHaveCount(5);
  await expect(page.getByLabel("Activity views")).toContainText("Overview");
  await expect(page.getByLabel("Activity views")).toContainText("Processes");
  await expect(page.getByLabel("Activity views")).toContainText("Events");
  await expect(page.getByLabel("Activity tools")).toContainText("Refresh");
  await expect(page.getByLabel("Activity tools")).toContainText("Clear exited");
  await expect(page.getByLabel("Activity tools")).toContainText("Live");
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText("user-options");
  await expect(page.getByRole("button", { name: "Overview" })).toHaveClass(/active/);
  await expect(page.locator(".process-row")).toHaveCount(0);
  await page.getByLabel("Activity views").getByRole("button", { name: "Processes", exact: true }).click();

  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Processes", exact: true })).toHaveClass(
    /active/,
  );
  const runningProcessRow = page.locator(".process-row").filter({ hasText: "Running" }).first();
  await expect(runningProcessRow).toContainText("Process registry is mocked in web preview");
  await expect(runningProcessRow).toContainText("runtime 12m 12s");
  await expect(runningProcessRow).toContainText("2/2 output lines retained");
  await expect(runningProcessRow.getByText("View output")).toBeVisible();
  await runningProcessRow.getByText("View output").click();
  await expect(runningProcessRow.locator(".process-output")).toContainText("Live process output will stream here in the desktop shell");
  await expect(page.locator(".process-row").filter({ hasText: "Preview crash: missing dependency" })).toBeVisible();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  const runningProcessActions = page.locator(".process-row").filter({ hasText: "Running" }).getByLabel("WinterPack process actions").first();
  await expect(runningProcessActions).toContainText("Stop");
  await expect(runningProcessActions).toContainText("Save log");
  await expect(runningProcessActions).toContainText("Copy output");
  await runningProcessActions.getByRole("button", { name: "Copy output" }).click();
  const copiedProcessOutput = await page.evaluate(
    () => (window as typeof window & { __copiedProcessOutput: string }).__copiedProcessOutput,
  );
  expect(copiedProcessOutput).toContain("stdout: Live process output will stream here in the desktop shell");
  await runningProcessActions.getByRole("button", { name: "Save log" }).click();
  await runningProcessActions.getByRole("button", { name: "Stop" }).click();
  await expect(page.locator(".process-row").filter({ hasText: "Stop requested" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear exited" })).toBeEnabled();
  await page.getByRole("button", { name: "Clear exited" }).click();
  await expect(page.locator(".process-row").filter({ hasText: "Stop requested" })).toBeVisible();
  await expect(page.locator(".process-row").filter({ hasText: "Crashed with exit code 7" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Clear exited" })).toBeDisabled();
  await page.getByRole("button", { name: "Live" }).click();
  await expect(page.getByRole("button", { name: "Live" })).toHaveClass(/active/);
  await page.getByRole("button", { name: "Events", exact: true }).click();
  await expect(page.getByRole("button", { name: "Events", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".event-row").filter({ hasText: "Event log is mocked in web preview" })).toBeVisible();
  await expect(page.locator(".event-row").filter({ hasText: "Event log is mocked in web preview" })).toContainText(
    "Check files - winterpack",
  );
  await expect(page.locator(".event-row").filter({ hasText: "Downloaded file: client-1.20.1" })).toContainText(
    "Download files - winterpack",
  );
  await expect(page.locator(".event-row").filter({ hasText: "File already present: user-options" })).toContainText(
    "Download files - winterpack",
  );
  await expect(
    page.locator(".event-row").filter({ hasText: "Event log is mocked in web preview" }),
  ).toContainText("3/9/2024");
  await expect(page.locator(".event-row").filter({ hasText: "Preview process exited with exit code 7" })).toContainText(
    "Managed process - preview process",
  );
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
              message: "Social backend is not reachable; packaged binary can be started from Settings.",
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
  await expect(page.getByLabel("Launcher operations")).toContainText("Real launch event from native log");

  await page.evaluate(() => {
    (window as typeof window & { __failNativeEventRefresh: boolean }).__failNativeEventRefresh = true;
  });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText("event log database unavailable");
  await expect(page.getByLabel("Launcher operations")).toContainText("Real launch event from native log");
  await expect(page.getByText("Event log is mocked in web preview")).toHaveCount(0);

  await page.getByLabel("Activity views").getByRole("button", { name: "Events", exact: true }).click();
  await expect(page.locator(".event-row").filter({ hasText: "Real launch event from native log" })).toBeVisible();
  await expect(page.locator(".event-row").filter({ hasText: "Event log is mocked in web preview" })).toHaveCount(0);
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

  const operationRows = page.getByLabel("Launcher operations").locator(".operation-row");
  await expect(operationRows.first()).toContainText("Pack installed successfully.");
  await expect(operationRows.first()).toContainText("Install pack - winterpack");
  await expect(page.getByLabel("Latest operation steps")).toContainText("Latest operation - Install pack - winterpack");
  await expect(page.getByLabel("Latest operation steps")).toContainText("2 steps");
  await expect(page.locator(".operation-step").filter({ hasText: "Install queued for WinterPack" })).not.toBeVisible();
  await page.getByLabel("Latest operation steps").getByText("View details").click();
  await expect(page.locator(".operation-step").filter({ hasText: "Install queued for WinterPack" })).toBeVisible();
  await expect(page.locator(".operation-step").filter({ hasText: "Pack installed successfully." })).toBeVisible();
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
  await page.getByLabel("Activity views").getByRole("button", { name: "Processes" }).click();

  const stoppedProcess = page.locator(".process-row").filter({ hasText: "User stop requested" });
  await expect(stoppedProcess).toBeVisible();
  await expect(stoppedProcess).toContainText("Stopped");
  await expect(stoppedProcess).not.toContainText("Crashed with exit code 1");
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
  await page.getByLabel("Activity views").getByRole("button", { name: "Processes" }).click();

  const processRow = page.locator(".process-row").filter({ hasText: "WinterPack is running" });
  await expect(processRow).toContainText("Running");
  await processRow.getByRole("button", { name: "Save log" }).click();

  await expect(page.getByRole("complementary")).toContainText(
    "Exported process log (2/5 lines retained - 3 dropped) to C:/TheBoysLauncher/logs/processes/winterpack.log",
  );
  const logExportPanel = page.getByLabel("Last process log export");
  await expect(logExportPanel).toContainText("Process log exported");
  await expect(logExportPanel).toContainText("pid 4242 - 2/5 lines retained - 3 dropped");
  await expect(logExportPanel).toContainText("C:/TheBoysLauncher/logs/processes/winterpack.log");
  await logExportPanel.getByRole("button", { name: "Open logs" }).click();
  await expect(page.getByRole("complementary")).toContainText("Opened process log location for pid 4242");
  await expect(processRow).toContainText("Exited cleanly");
  await expect(processRow.getByRole("button", { name: "Stop" })).toHaveCount(0);
  await expect(processRow.getByRole("button", { name: "Save log" })).toBeVisible();
  await logExportPanel.getByRole("button", { name: "Dismiss process log export" }).click();
  await expect(page.getByLabel("Last process log export")).toHaveCount(0);

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

test("library process log export opens the Activity log receipt", async ({ page }) => {
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
  await page.getByLabel("Activity views").getByRole("button", { name: "Processes" }).click();
  await expect(page.locator(".process-row").filter({ hasText: "WinterPack is running" })).toBeVisible();

  await page.getByRole("button", { name: "Library" }).click();
  const profile = page.locator(".profile-row").filter({ hasText: "WinterPack" });
  await profile.getByLabel("WinterPack process actions").getByRole("button", { name: "Save log" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Processes", exact: true })).toHaveClass(
    /active/,
  );
  const logExportPanel = page.getByLabel("Last process log export");
  await expect(logExportPanel).toContainText("Process log exported");
  await expect(logExportPanel).toContainText("pid 4242 - 2 lines retained");
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
  await page.getByLabel("Activity views").getByRole("button", { name: "Processes" }).click();

  const runningRow = page.locator(".process-row").filter({ hasText: "WinterPack is still running" });
  const exitedRow = page.locator(".process-row").filter({ hasText: "Old process exited cleanly" });
  await expect(runningRow).toContainText("Running");
  await expect(exitedRow).toContainText("Exited cleanly");

  await runningRow.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText("Process stop failed: access denied");
  await expect(runningRow).toContainText("Running");
  await expect(runningRow.getByRole("button", { name: "Stop" })).toBeEnabled();

  await runningRow.getByRole("button", { name: "Save log" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText("Process log export failed: disk full");
  await expect(page.getByLabel("Last process log export")).toHaveCount(0);

  await page.getByLabel("Activity tools").getByRole("button", { name: "Clear exited" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText(
    "Clearing exited processes failed: registry locked",
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
  await page.getByLabel("Activity views").getByRole("button", { name: "Processes" }).click();

  const processRow = page.locator(".process-row").filter({ hasText: "WinterPack is running" });
  await processRow.getByRole("button", { name: "Save log" }).click();
  const logExportPanel = page.getByLabel("Last process log export");
  await expect(logExportPanel).toContainText("C:/TheBoysLauncher/logs/processes/winterpack.log");

  await logExportPanel.getByRole("button", { name: "Open logs" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText(
    "Opening process log location failed: shell denied access",
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
  await page.getByRole("button", { name: "Activity" }).click();
  await page.getByLabel("Activity views").getByRole("button", { name: "Processes", exact: true }).click();

  const exitedRow = page.locator(".process-row").filter({ hasText: "Ready to relaunch" });
  await expect(exitedRow).toContainText("Exited cleanly");
  const exitedProcessActions = exitedRow.getByLabel("WinterPack process actions");
  await expect(exitedProcessActions).toContainText("Play");
  await expect(exitedProcessActions.getByRole("button", { name: "Stop" })).toHaveCount(0);
  await expect(exitedProcessActions).toContainText("Save log");
  await exitedProcessActions.getByRole("button", { name: "Play" }).click();

  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Processes", exact: true })).toHaveClass(
    /active/,
  );
  const relaunchedRow = page.locator(".process-row").filter({ hasText: "WinterPack relaunched from Activity" });
  await expect(relaunchedRow).toContainText("Running");
  await expect(page.getByRole("button", { name: "Live" })).toHaveClass(/active/);

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
  await page.getByLabel("Activity views").getByRole("button", { name: "Processes", exact: true }).click();
  await page.locator(".process-row").filter({ hasText: "WinterPack is running" }).getByRole("button", { name: "Stop" }).click();

  await expect(page.getByText("javaw.exe stop requested")).toBeVisible();
  await page.getByLabel("Activity views").getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.getByLabel("Launcher operations")).toContainText("Stop requested for pid 4242 (javaw.exe)");
  await page.getByLabel("Activity views").getByRole("button", { name: "Processes", exact: true }).click();
  const stoppingProcess = page.locator(".process-row").filter({ hasText: "Stopping WinterPack" });
  await expect(stoppingProcess).toContainText("Stop requested");
  await expect(stoppingProcess.getByRole("button", { name: "Stopping" })).toBeDisabled();
  expect(presenceAuthorization).toBe("");
  expect(presenceBody).toBe("");
  await page.locator("nav").getByRole("button", { name: "Play" }).click();
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
  await page.getByLabel("Activity views").getByRole("button", { name: "Processes" }).click();
  await page.locator(".process-row").filter({ hasText: "WinterPack is running" }).getByRole("button", { name: "Stop" }).click();

  await expect(page.getByText("javaw.exe stopped")).toBeVisible();
  expect(presenceAuthorization).toBe(`Bearer ${accessToken}`);
  expect(JSON.parse(presenceBody)).toEqual({ state: "online" });
  await page.locator("nav").getByRole("button", { name: "Play" }).click();
  await expect(page.getByLabel("Home party panel")).toContainText("0 parties");
  await expect(page.getByLabel("Home party panel")).not.toContainText("WinterPack");
});

test("settings render memory and offline profile data", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();

  await expect(page.getByLabel("Settings session actions")).toContainText("Save session");
  await expect(page.getByLabel("Settings session actions")).not.toContainText("Renew");
  await expect(page.getByLabel("Settings session actions")).not.toContainText("Finish sign in");
  await expect(page.getByLabel("Settings session actions")).not.toContainText("Clear");
  await expect(page.getByLabel("Settings session actions")).not.toContainText("Add account");
  await expect(page.getByLabel("Settings session actions")).not.toContainText("Accounts");
  await expect(page.getByRole("button", { name: "Advanced" })).toBeVisible();
  await page.getByRole("button", { name: "Advanced" }).click();
  await expect(page.getByLabel("Settings account maintenance actions")).toContainText("Renew");
  await expect(page.getByLabel("Settings account maintenance actions")).toContainText("Finish sign in");
  await expect(page.getByLabel("Settings account maintenance actions")).toContainText("Clear");
  await expect(page.getByLabel("Settings runtime actions")).toContainText("Java");
  await expect(page.getByLabel("Settings runtime actions")).toContainText("Recommended");
  await expect(page.getByLabel("Settings runtime actions")).toContainText("Backend");
  await expect(page.getByLabel("Settings service actions")).toContainText("Start local");
  await expect(page.getByLabel("Settings service actions")).toContainText("Stop local");
  await expect(page.getByLabel("Minecraft memory")).toHaveValue("6144");
  await expect(page.getByLabel("Offline username")).toHaveValue("Player");
  await expect(page.getByText(/6 GB set aside for Minecraft/)).toBeVisible();
  await expect(page.getByText("Social backend", { exact: true })).toBeVisible();
  await expect(page.getByText("http://127.0.0.1:4074", { exact: true })).toBeVisible();
  await expect(page.getByText("Launcher updates", { exact: true })).toBeVisible();
  await expect(page.getByText("Updates are checked automatically.")).toBeVisible();
});

test("settings save action falls back to web preview mock", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByLabel("Offline username").fill("Builder");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();

  await expect(page.getByText("Saving settings is mocked in web preview")).toBeVisible();
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
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText("settings store is locked by another process");
  await expect(page.getByText("Saving settings is mocked in web preview")).toHaveCount(0);

  await page.getByLabel("Settings account maintenance actions").getByRole("button", { name: "Clear" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText("session keychain delete failed");
  await expect(page.getByText("Clearing Minecraft session is mocked in web preview")).toHaveCount(0);
  await expect(page.locator(".account-card")).toContainText("Player");
});

test("settings lists stored Minecraft accounts and switches the active account", async ({ page }) => {
  await page.addInitScript(() => {
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
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string, args?: Record<string, unknown>) => {
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
  await expect(accounts.locator(".runtime-row").filter({ hasText: "BuilderOne" }).getByRole("button", { name: "Active" })).toBeDisabled();

  await accounts.locator(".runtime-row").filter({ hasText: "BuilderTwo" }).getByRole("button", { name: "Use" }).click();

  await expect(page.locator(".topbar").getByRole("button", { name: /BuilderTwo/ })).toBeVisible();
  await expect(accountDialog).toContainText("BuilderTwo is selected for launching.");
  await expect(page.locator(".account-card")).toContainText("BuilderTwo");
  await expect(page.getByLabel("Launcher status message")).toContainText("Switched to BuilderTwo");
  await expect(accounts.locator(".runtime-row").filter({ hasText: "BuilderTwo" }).getByRole("button", { name: "Active" })).toBeDisabled();
  await page.getByRole("button", { name: "Close account manager" }).click();
  await page.locator(".topbar").getByRole("button", { name: /BuilderTwo/ }).click();
  await expect(page.getByRole("dialog", { name: "Manage Minecraft accounts" })).toBeVisible();
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
  await page.getByRole("button", { name: "Save changes", exact: true }).click();

  await expect(page.getByText("Maximum memory must be greater than or equal to minimum memory")).toBeVisible();

  await page.getByLabel("Minimum memory").fill("2048");
  await page.getByLabel("Minecraft memory").fill("6144");
  await page.getByLabel("Offline username").fill("");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();

  await expect(page.getByText("Offline username is required")).toBeVisible();
  const invoked = await page.evaluate(
    () => (window as typeof window & { __settingsValidationInvokes: string[] }).__settingsValidationInvokes,
  );
  expect(invoked).not.toContain("save_settings");
});

test("settings can manage preview Minecraft session", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.locator(".account-card")).toContainText("Not signed in");
  await page.getByRole("button", { name: "Save session" }).click();

  await expect(page.getByText("Minecraft session is mocked in web preview")).toBeVisible();
  await expect(page.locator(".account-card")).toContainText("Player");
  await expect(page.locator(".account-card")).toContainText("Player signed in");

  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByLabel("Settings account maintenance actions").getByRole("button", { name: "Clear" }).click();
  await expect(page.getByText("Clearing Minecraft session is mocked in web preview")).toBeVisible();
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
  await expect(page.getByLabel("Settings session actions")).toContainText("Add another account");
  await expect(page.getByLabel("Settings session actions")).toContainText("Refresh accounts");
  await expect(page.getByLabel("Settings session actions")).toContainText("Manage accounts");
  await expect(page.getByRole("button", { name: "Save session" })).toHaveCount(0);
  await page.getByRole("button", { name: "Manage accounts" }).click();
  await expect(page.getByRole("dialog", { name: "Manage Minecraft accounts" }).getByLabel("Minecraft accounts")).toContainText(
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
  await expect(page.getByLabel("Settings session actions")).toContainText("Add account");
  await expect(page.getByLabel("Settings session actions")).toContainText("Refresh accounts");
  await expect(page.getByLabel("Settings session actions")).toContainText("Manage accounts");
  await expect(page.getByRole("button", { name: "Save session" })).toHaveCount(0);
  await expect(page.locator(".account-card")).toContainText("Not signed in");
  await page.getByRole("button", { name: "Manage accounts" }).click();
  await expect(page.getByRole("dialog", { name: "Manage Minecraft accounts" })).toContainText("No saved accounts");
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
  await expect(accountsList.getByRole("button", { name: "Confirm remove" })).toBeVisible();
  await expect.poll(() => removeCallCount).toBe(0);

  await accountsList.getByRole("button", { name: "Confirm remove" }).click();
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
  await page.getByRole("button", { name: "Save session" }).click();
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
              message: "Social backend is reachable",
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

  await expect(page.getByLabel("Launcher operations")).toContainText("Microsoft token exchange failed: invalid_grant");
  await expect(page.getByRole("complementary").getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.locator(".account-card")).toContainText("Not signed in");

  await page.getByRole("complementary").getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("timed out waiting for Microsoft sign-in callback")).toBeVisible();
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

  await expect(page.getByLabel("Launcher operations")).toContainText("Microsoft token exchange failed: invalid_grant");
  await expect(page.getByRole("complementary").getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.getByRole("button", { name: "Activity" }).click();
  await page.getByRole("button", { name: "Events", exact: true }).click();
  const failedSessionEvent = page.locator(".event-row").filter({ hasText: "Microsoft token exchange failed" });
  await expect(failedSessionEvent.getByRole("button", { name: "Sign in" })).toBeVisible();
  await failedSessionEvent.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByLabel("Launcher status message")).toContainText("Signed in as Player");
  await expect(page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Play" })).toBeVisible();
  await page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Play" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Processes" })).toHaveClass(/active/);
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

  await expect(page.getByLabel("Launcher operations")).toContainText("Microsoft token exchange failed: invalid_grant");
  await expect(page.getByLabel("Launcher recovery actions").getByRole("button", { name: "Sign in" })).toBeVisible();

  await page.getByRole("button", { name: "Library" }).click();
  await profile.getByRole("button", { name: "Play" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Processes" })).toHaveClass(/active/);
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
          if (cmd === "start_stored_authenticated_launch_process") return process;
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
  await page.getByRole("button", { name: "Save session" }).click();
  await page.getByRole("button", { name: "Library" }).click();
  await page.locator(".profile-row").filter({ hasText: "WinterPack" }).getByRole("button", { name: "Play" }).click();

  await expect.poll(() => minecraftExchangeRequests).toBe(1);
  await expect.poll(() => presenceAuthorizations.at(-1)).toBe("Bearer minecraft-session-upgraded-token");
  expect(devSessionRequests).toBe(1);
});

test("stored session switches launch actions to authenticated preview path", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Save session" }).click();
  await expect(page.getByText("Minecraft session is mocked in web preview")).toBeVisible();

  await page.getByRole("button", { name: "Library" }).click();
  const profile = page.locator(".profile-row").filter({ hasText: "WinterPack" });
  await profile.getByRole("button", { name: "Launch details" }).click();
  await expect(page.getByText("Signed-in launch details are mocked in web preview")).toBeVisible();

  await profile.getByRole("button", { name: "Play" }).click();
  await expect(page.getByText("Authenticated launch is mocked in web preview")).toBeVisible();
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
  await expect(page.getByLabel("Activity views").getByRole("button", { name: "Processes" })).toHaveClass(/active/);
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

test("settings Java discovery action falls back to web preview mock", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByRole("button", { name: "Java" }).click();

  await expect(page.getByText("Java discovery is mocked in web preview")).toBeVisible();
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
  await page.getByRole("button", { name: "Java" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText("Java runtime scan failed");
  await expect(page.getByText("Java discovery is mocked in web preview")).toHaveCount(0);
  await expect(page.locator(".runtime-row").filter({ hasText: "Preview/TheBoysLauncher/runtimes/java-21" })).toHaveCount(0);
  await expect(page.getByLabel("Detected Java runtimes").locator(".runtime-row")).toHaveCount(0);

  await page.getByRole("button", { name: "Recommended" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText("Java recommendation manifest unavailable");
  await expect(page.getByText("Java recommendations are mocked in web preview")).toHaveCount(0);
  await expect(page.getByLabel("Recommended Java runtimes").locator(".runtime-row")).toHaveCount(0);
});

test("settings managed Java install falls back to web preview mock", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByRole("button", { name: "Recommended" }).click();
  await expect(page.getByText("Java recommendations are mocked in web preview")).toBeVisible();
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

  await expect(page.getByText("Managed Java install is mocked in web preview")).toBeVisible();
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
  await page.getByRole("button", { name: "Recommended" }).click();
  await page.getByLabel("Recommended Java runtimes").getByRole("button", { name: "Use" }).click();
  await page.getByRole("button", { name: "Install runtime" }).click();

  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Events", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".event-row").filter({ hasText: "Java runtime archive downloaded." })).toBeVisible();
  await expect(page.locator(".event-row").filter({ hasText: "Java runtime temurin-21-windows-x64 is installed." })).toBeVisible();
  await expect(page.getByRole("complementary")).toContainText("Java runtime temurin-21-windows-x64 is installed.");

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
  await page.getByRole("button", { name: "Recommended" }).click();

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
      message: "Local social backend is not reachable; packaged binary can be started",
    };
    const onlineStatus = {
      ...offlineStatus,
      running: true,
      message: "Local social backend is reachable",
    };

    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (cmd: string) => {
          if (cmd === "social_backend_status") {
            if (started) statusChecksAfterStart += 1;
            return started && statusChecksAfterStart > 1 ? onlineStatus : offlineStatus;
          }
          if (cmd === "start_social_backend") {
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
  await page.getByRole("button", { name: "Start local" }).click();

  await expect(page.getByText("Local social backend is reachable")).toBeVisible();
  await expect(page.locator(".setting").filter({ hasText: "Social backend" })).toContainText("Reachable");
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
      message: "Hosted social backend is configured at https://launcher.dylan.lol but is not reachable; local launcher features remain available",
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
            throw new Error("Hosted mode must not start local backend");
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

  await expect(page.getByLabel("Launcher status message")).toContainText("Hosted social backend is configured");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Advanced" }).click();
  await expect(page.locator(".setting", { has: page.getByText("Social backend", { exact: true }) })).toContainText("Hosted offline");
  await expect(page.locator(".setting", { has: page.getByText("Backend mode", { exact: true }) }).first()).toContainText("Hosted backend");
  await expect(page.getByRole("button", { name: "Start local" })).toBeDisabled();
  const invoked = await page.evaluate(() => (window as typeof window & { __backendStartupInvokes: string[] }).__backendStartupInvokes);
  expect(invoked).toContain("social_backend_status");
  expect(invoked).not.toContain("start_social_backend");
});

test("settings backend action falls back to web preview mock", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByRole("button", { name: "Backend", exact: true }).click();
  await expect(page.getByText("Social backend status is mocked in web preview")).toBeVisible();

  await page.getByRole("button", { name: "Start local" }).click();
  await expect(page.getByText("Starting social backend is mocked in web preview")).toBeVisible();

  await page.getByRole("button", { name: "Stop local" }).click();
  await expect(page.getByText("Stopping social backend is mocked in web preview")).toBeVisible();
});

test("settings native backend action failures surface real errors", async ({ page }) => {
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
              canStart: true,
              message: "Packaged backend is offline",
            };
          }
          if (cmd === "start_social_backend") {
            throw new Error("packaged backend executable is missing");
          }
          if (cmd === "stop_social_backend") {
            throw new Error("backend process is not responding");
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

  await page.getByRole("button", { name: "Start local" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText("packaged backend executable is missing");
  await expect(page.getByText("Starting social backend is mocked in web preview")).toHaveCount(0);

  await page.getByRole("button", { name: "Stop local" }).click();
  await expect(page.getByLabel("Launcher status message")).toContainText("backend process is not responding");
  await expect(page.getByText("Stopping social backend is mocked in web preview")).toHaveCount(0);
});

