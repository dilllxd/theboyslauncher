import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import {
  Activity,
  Box,
  Copy,
  Download,
  FolderInput,
  Gamepad2,
  Library,
  MessageCircle,
  MoreVertical,
  Play,
  Archive,
  RefreshCw,
  Square,
  Trash2,
  Terminal,
  Save,
  Search,
  Server,
  Settings,
  ShieldCheck,
  UserPlus,
  Wrench,
  X,
} from "lucide-react";
import "./styles.css";

type ActivityMode = "overview" | "processes" | "events";

const CURRENT_UPDATE_CHANNEL: LauncherUpdateChannel =
  import.meta.env.VITE_THEBOYS_RELEASE_CHANNEL === "dev" ? "dev" : "stable";

const UPDATE_MANIFEST_ENDPOINTS: Record<LauncherUpdateChannel, string> = {
  stable: "https://github.com/dilllxd/theboyslauncher/releases/latest/download/latest.json",
  dev: "https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/latest-dev.json",
};

const RELEASE_DOWNLOAD_PREFIX = "https://github.com/dilllxd/theboyslauncher/releases/download/";

type LauncherSettings = {
  maxMemoryMb: number;
  minMemoryMb: number;
  offlineUsername: string;
  telemetryEnabled: boolean;
  javaRuntimeOverridePath?: string;
};

type LauncherDirectories = {
  dataDir: string;
  configDir: string;
  cacheDir: string;
  logDir: string;
};

type SocialBackendStatus = {
  endpointKind?: "hosted" | "local" | string;
  endpointUrl?: string;
  bindAddr: string;
  healthUrl: string;
  running: boolean;
  managed: boolean;
  canStart?: boolean;
  processId?: number;
  message: string;
};

type LauncherUpdateState = {
  status: "idle" | "checking" | "available" | "current" | "downloading" | "ready" | "error";
  message: string;
  version?: string;
  downloadedBytes?: number;
  totalBytes?: number;
};

type LauncherUpdateChannel = "stable" | "dev";

type LauncherUpdateManifest = {
  version: string;
  notes?: string;
  pub_date?: string;
  url: string;
  signature?: string;
};

type ActionReceipt = {
  id: string;
  action:
    | "microsoft_login"
    | "launch_profile"
    | "install_pack"
    | "install_modpack_archive"
    | "repair_profile"
    | "delete_profile"
    | "scan_imports";
  subjectId?: string;
  status: "queued" | "mocked" | "completed";
  message: string;
};

type MicrosoftAuthStart = {
  authUrl: string;
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
};

type MicrosoftAuthCallback = {
  callbackUrl: string;
  expectedState: string;
  codeVerifier: string;
  clientId: string;
};

type MicrosoftTokenExchangePlan = {
  tokenUrl: string;
  method: string;
  clientId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
  scopes: string[];
  formFields: Array<{
    key: string;
    value: string;
  }>;
  nextStep: string;
};

type MicrosoftOAuthTokens = {
  tokenType: string;
  expiresIn: number;
  scope?: string;
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  userId?: string;
};

type XboxLiveAuthToken = {
  token: string;
  userHash: string;
  expiresAt?: string;
};

type MinecraftServicesToken = {
  tokenType: string;
  expiresIn: number;
  accessToken: string;
  username?: string;
};

type MinecraftEntitlements = {
  ownsMinecraft: boolean;
  items: Array<{
    name: string;
    signature?: string;
  }>;
};

type MinecraftProfile = {
  id: string;
  name: string;
};

type MinecraftSession = {
  username: string;
  uuid: string;
  accessToken: string;
};

type StoredMinecraftSession = {
  session: MinecraftSession;
  accountId?: string;
  expiresAtUnixSeconds?: number;
  microsoftRefreshToken?: string;
  microsoftClientId?: string;
  microsoftUserId?: string;
  microsoftScopes?: string;
  storedAtUnixSeconds: number;
};

type StoredMinecraftAccountSummary = {
  accountId: string;
  username: string;
  uuid: string;
  expiresAtUnixSeconds?: number;
  active: boolean;
};

type JavaRuntimeSummary = {
  id: string;
  path: string;
  version: string;
  majorVersion: number;
  source: "java_home" | "path" | "bundled";
};

type JavaRuntimeDownloadRequest = {
  runtimeId: string;
  url: string;
  sha1?: string;
  size?: number;
  archiveFileName?: string;
};

type JavaRuntimeManifestEntry = {
  runtimeId: string;
  label: string;
  vendor: string;
  majorVersion: number;
  platform: string;
  url: string;
  sha1?: string;
  size?: number;
  archiveFileName?: string;
  notes: string;
};

type MinecraftVersionType = "release" | "snapshot" | "old_beta" | "old_alpha" | "unknown";

type MinecraftVersionSummary = {
  id: string;
  versionType: MinecraftVersionType;
  url: string;
  sha1?: string;
  releaseTime: string;
};

type FriendPresence = {
  id: string;
  name: string;
  avatarColor: string;
  state: "online" | "idle" | "playing";
  packName?: string;
  serverName?: string;
  joinable: boolean;
};

type PresenceUpdate = {
  accountId: string;
  state: FriendPresence["state"];
  packId?: string;
  serverId?: string;
  updatedAtUnixSeconds: number;
};

type PresencePayload = {
  state: FriendPresence["state"];
  packId?: string;
  serverId?: string;
};

type FriendRequestStatus = "pending_inbound" | "pending_outbound";

type FriendRequestSummary = {
  id: string;
  name: string;
  status: FriendRequestStatus;
};

type AccountSearchResult = {
  accountId: string;
  minecraftUuid: string;
  minecraftName: string;
};

type DevSessionResponse = {
  accountId: string;
  tokenType: string;
  sessionKind?: "dev" | "minecraft";
  minecraftUuid?: string;
  minecraftName?: string;
  accessToken: string;
  authorizationHeader: string;
  issuedAtUnixSeconds?: number;
  expiresAtUnixSeconds?: number;
};

type CurrentSessionResponse = {
  accountId: string;
  tokenType: string;
  sessionKind?: "dev" | "minecraft";
  minecraftUuid?: string;
  minecraftName?: string;
  expiresAtUnixSeconds: number;
  secondsRemaining: number;
};

type MinecraftSessionExchangeRequest = {
  minecraftUuid: string;
  minecraftName: string;
  accessToken: string;
  expiresAtUnixSeconds?: number;
};

type BlockedAccountSummary = {
  id: string;
  name: string;
};

type MutedAccountSummary = {
  id: string;
  name: string;
};

type PackSummary = {
  id: string;
  name: string;
  tagline: string;
  version: string;
  status: "not_installed" | "installed" | "update_available" | "repair_needed";
  accent: string;
  installedPlayers: number;
  defaultServer?: string;
};

type ProfileSummary = {
  id: string;
  name: string;
  loader: "vanilla" | "fabric" | "quilt" | "forge" | "neoforge";
  gameVersion: string;
  installedPackVersion?: string;
  lastPlayed?: string;
  memoryMb: number;
  jvmArgs: string[];
  resolution?: ProfileResolution;
  defaultServer?: ServerLaunchTarget;
  javaRuntimeOverridePath?: string;
};

type ProfileResolution = {
  width: number;
  height: number;
};

type CreateProfileRequest = {
  name: string;
  loader: ProfileSummary["loader"];
  gameVersion: string;
  memoryMb: number;
};

type UpdateProfileRequest = {
  id: string;
  name?: string;
  loader?: ProfileSummary["loader"];
  gameVersion?: string;
  memoryMb?: number;
  jvmArgs?: string[];
  resolution?: ProfileResolution;
  clearResolution?: boolean;
  defaultServer?: ServerLaunchTarget;
  clearDefaultServer?: boolean;
  javaRuntimeOverridePath?: string;
  clearJavaRuntimeOverride?: boolean;
};

type ArchiveProfileRequest = {
  id: string;
};

type DeleteProfileRequest = {
  id: string;
};

const profileLoaders: ProfileSummary["loader"][] = ["vanilla", "fabric", "quilt", "forge", "neoforge"];
const previewAccountId = "00000000-0000-4000-8000-000000000001";
const fallbackMinecraftVersions: MinecraftVersionSummary[] = ["1.21.8", "1.21.4", "1.21.1", "1.20.1", "1.19.4", "1.18.2", "1.16.5", "1.12.2", "1.8.9", "1.7.10"].map((id) => ({
  id,
  versionType: "release",
  url: "",
  releaseTime: "",
}));

type ServerLaunchTarget = {
  name?: string;
  address: string;
  port?: number;
};

type LaunchRecoveryAction = "repair" | "repair_and_launch" | "repair_and_join";

type JoinRecoveryTarget = {
  profileId: string;
  profileName?: string;
  server: ServerLaunchTarget;
  serverLabel: string;
};

type LauncherOperation =
  | "launch_profile"
  | "install_pack"
  | "repair_profile"
  | "import_profile"
  | "delete_profile"
  | "download_artifacts"
  | "install_java_runtime"
  | "managed_process";

type OperationPlan = {
  operationId: string;
  operation: LauncherOperation;
  subjectId: string;
  events: Array<{
    kind: string;
    message: string;
    progressPercent?: number;
  }>;
};

type DownloadPlan = {
  versionId: string;
  items: Array<{
    id: string;
    kind: string;
    url: string;
    sha1?: string;
    sha256?: string;
    sha512?: string;
    md5?: string;
    murmur2?: string;
    size?: number;
    destination: string;
  }>;
};

type LauncherEvent = {
  id: string;
  operationId: string;
  operation?: LauncherOperation;
  subjectId?: string;
  kind: string;
  message: string;
  progressPercent?: number;
  occurredAtUnixSeconds: number;
};

type LauncherOperationSummary = {
  operationId: string;
  operation?: LauncherOperation;
  subjectId?: string;
  latestEvent: LauncherEvent;
  eventCount: number;
  progressPercent?: number;
};

type ArtifactOperationSummary = {
  currentArtifact?: string;
  pending: number;
  downloading: number;
  finished: number;
  failed: number;
};

type ProcessCommandSpec = {
  executable: string;
  args: string[];
  workingDir: string;
  env?: Array<{
    key: string;
    value: string;
  }>;
};

type LaunchCommandPreview = {
  profileId: string;
  profileName: string;
  authenticated: boolean;
  spec: ProcessCommandSpec;
};

type ManagedProcessSummary = {
  id: string;
  processId: number;
  command: ProcessCommandSpec;
  state: "running" | "exited" | "stop_requested";
  stopRequested?: boolean;
  exitCode?: number;
  startedAtUnixSeconds: number;
  exitedAtUnixSeconds?: number;
  runtimeSeconds: number;
  totalOutputLineCount: number;
  droppedOutputLineCount: number;
  output: Array<{
    stream: "stdout" | "stderr";
    line: string;
  }>;
};

type ProcessLogExport = {
  managedProcessId: string;
  processId: number;
  path: string;
  lineCount: number;
  totalOutputLineCount?: number;
  droppedOutputLineCount?: number;
};

type ImportCandidate = {
  id: string;
  source: string;
  name: string;
  path: string;
  kind: "prism" | "multimc" | "minecraft" | "gdlauncher" | "atlauncher";
  detectedLoader?: ProfileSummary["loader"];
  detectedGameVersion?: string;
  detectedName?: string;
  detectedSummary?: string;
  detectedIconPath?: string;
  importableFileCount?: number;
  importableTotalBytes?: number;
  lastModifiedUnixSeconds?: number;
};

type ImportPlan = {
  profileId: string;
  profileName: string;
  sourcePath: string;
  destinationPath: string;
  detectedLoader?: ProfileSummary["loader"];
  detectedGameVersion?: string;
  items: Array<{
    kind: string;
    source: string;
    destination: string;
    exists: boolean;
    destinationExists: boolean;
    resolution?: ImportConflictResolution;
    fileCount?: number;
    totalBytes?: number;
  }>;
};

type ImportConflictResolution = "abort" | "skip" | "overwrite" | "rename";

type DiscoverProviderId = "curseforge" | "modrinth" | "atlauncher" | "ftb" | "ftb_legacy" | "technic";

type DiscoverProvider = {
  id: DiscoverProviderId;
  name: string;
  status: "available" | "coming_soon";
  summary: string;
};

type ModrinthModpackSearchResult = {
  projectId: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  iconUrl?: string;
  downloads: number;
  follows: number;
  gameVersions: string[];
  loaders: string[];
  latestVersionId?: string;
};

type ModrinthModpackArchiveResolution = {
  projectId: string;
  versionId: string;
  versionName: string;
  fileName: string;
  url: string;
  size?: number;
};

type AppSnapshot = {
  settings: LauncherSettings;
  directories: LauncherDirectories;
  minecraftSession?: StoredMinecraftSession;
  friends: FriendPresence[];
  packs: PackSummary[];
  profiles: ProfileSummary[];
  imports: ImportCandidate[];
};

const fallbackSnapshot: AppSnapshot = {
  settings: {
    maxMemoryMb: 6144,
    minMemoryMb: 2048,
    offlineUsername: "Player",
    telemetryEnabled: false,
  },
  directories: {
    dataDir: "Native data directory unavailable in web preview",
    configDir: "Native config directory unavailable in web preview",
    cacheDir: "Native cache directory unavailable in web preview",
    logDir: "Native log directory unavailable in web preview",
  },
  minecraftSession: undefined,
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
      name: "Mason",
      avatarColor: "#f59e5b",
      state: "online",
      joinable: false,
    },
    {
      id: "3",
      name: "Jordan",
      avatarColor: "#7dd3fc",
      state: "idle",
      joinable: false,
    },
  ],
  packs: [
    {
      id: "winterpack",
      name: "WinterPack",
      tagline: "Cozy survival, performance tuning, and shared server defaults.",
      version: "1.0.3",
      status: "update_available",
      accent: "#67e8b9",
      installedPlayers: 4,
      defaultServer: "The Cabin",
    },
    {
      id: "vanilla-plus",
      name: "Vanilla Plus",
      tagline: "A clean profile for normal Minecraft nights.",
      version: "1.21.8",
      status: "installed",
      accent: "#7dd3fc",
      installedPlayers: 2,
      defaultServer: "Survival",
    },
  ],
  profiles: [
    {
      id: "winterpack",
      name: "WinterPack",
      loader: "fabric",
      gameVersion: "1.21.1",
      lastPlayed: "Yesterday",
      memoryMb: 6144,
      jvmArgs: ["-Dtheboyslauncher.pack=winterpack"],
      resolution: { width: 1280, height: 720 },
      defaultServer: { name: "The Cabin", address: "play.theboys.example", port: 25565 },
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
};

const discoverProviders: DiscoverProvider[] = [
  {
    id: "curseforge",
    name: "CurseForge",
    status: "available",
    summary: "Install exported CurseForge zip packs now; searchable catalog support can follow.",
  },
  {
    id: "modrinth",
    name: "Modrinth",
    status: "available",
    summary: "Search public Modrinth modpacks and install the latest .mrpack build.",
  },
  {
    id: "atlauncher",
    name: "ATLauncher",
    status: "coming_soon",
    summary: "Planned provider browsing based on ATLauncher pack metadata.",
  },
  {
    id: "ftb",
    name: "FTB",
    status: "coming_soon",
    summary: "Planned support for current FTB app pack metadata.",
  },
  {
    id: "ftb_legacy",
    name: "FTB Legacy",
    status: "coming_soon",
    summary: "Planned support for the legacy FTB pack feeds.",
  },
  {
    id: "technic",
    name: "Technic",
    status: "coming_soon",
    summary: "Planned Technic and Solder provider support.",
  },
];

const fallbackBackendStatus: SocialBackendStatus = {
  endpointKind: "local",
  endpointUrl: "http://127.0.0.1:4074",
  bindAddr: "127.0.0.1:4074",
  healthUrl: "http://127.0.0.1:4074/health",
  running: false,
  managed: false,
  canStart: false,
  message: "Social backend status is unavailable in web preview",
};

function statusLabel(status: PackSummary["status"]) {
  switch (status) {
    case "installed":
      return "Ready";
    case "update_available":
      return "Update";
    case "repair_needed":
      return "Getting ready";
    default:
      return "Install";
  }
}

function packActionProgressLabel(status: PackSummary["status"]) {
  switch (status) {
    case "update_available":
      return "Updating pack";
    case "installed":
      return "Reinstalling pack";
    case "repair_needed":
      return "Setting up files";
    default:
      return "Installing pack";
  }
}

function mergeBackendPackWithLocalState(localPack: PackSummary | undefined, backendPack: PackSummary): PackSummary {
  if (!localPack) return backendPack;
  const localPackHasInstallState = localPack.status !== "not_installed";
  return {
    ...backendPack,
    status: localPackHasInstallState ? localPack.status : backendPack.status,
    version: localPackHasInstallState ? localPack.version : backendPack.version,
    defaultServer: localPack.defaultServer ?? backendPack.defaultServer,
  };
}

function mergeBackendPacksWithLocalState(localPacks: PackSummary[], backendPacks: PackSummary[]) {
  const localById = new Map(localPacks.map((pack) => [pack.id, pack]));
  const backendIds = new Set(backendPacks.map((pack) => pack.id));
  return [
    ...backendPacks.map((pack) => mergeBackendPackWithLocalState(localById.get(pack.id), pack)),
    ...localPacks.filter((pack) => !backendIds.has(pack.id)),
  ];
}

function importMetadataLabel(candidate: ImportCandidate) {
  const fileCount =
    typeof candidate.importableFileCount === "number"
      ? `${candidate.importableFileCount} importable files`
      : "Importable files unknown";
  const size =
    typeof candidate.importableTotalBytes === "number" ? formatBytes(candidate.importableTotalBytes) : null;
  const baseLabel = size ? `${fileCount} - ${size}` : fileCount;
  if (typeof candidate.lastModifiedUnixSeconds !== "number") {
    return baseLabel;
  }
  const modified = new Date(candidate.lastModifiedUnixSeconds * 1000);
  if (Number.isNaN(modified.getTime())) return baseLabel;
  return `${baseLabel} - modified ${modified.toLocaleDateString()}`;
}

function importProfileName(candidate: ImportCandidate) {
  return candidate.detectedName?.trim() || candidate.name;
}

function importPlanReadySummary(plan: ImportPlan) {
  const readyItems = plan.items.filter((item) => item.exists && (!item.destinationExists || item.resolution));
  const totalBytes = readyItems.reduce((sum, item) => sum + (item.totalBytes ?? 0), 0);
  const itemLabel = readyItems.length === 1 ? "1 item ready" : `${readyItems.length} items ready`;
  if (!readyItems.some((item) => typeof item.totalBytes === "number")) {
    return itemLabel;
  }
  return `${itemLabel} - ${formatBytes(totalBytes)}`;
}

function formatDurationSeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "runtime unknown";
  const wholeSeconds = Math.floor(seconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainingSeconds = wholeSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function formatUnixDate(seconds: number) {
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return "unknown time";
  return date.toLocaleString();
}

function profileLastPlayedLabel(lastPlayed?: string) {
  const value = lastPlayed?.trim();
  if (!value) return "Never launched";
  if (value.startsWith("unix:")) {
    const seconds = Number(value.slice("unix:".length));
    return `Last played ${formatUnixDate(seconds)}`;
  }
  return `Last played ${value}`;
}

function processTimingLabel(process: ManagedProcessSummary) {
  const runtime = `runtime ${formatDurationSeconds(process.runtimeSeconds)}`;
  const started = `started ${formatUnixDate(process.startedAtUnixSeconds)}`;
  if (typeof process.exitedAtUnixSeconds === "number") {
    return `${runtime} - ${started} - exited ${formatUnixDate(process.exitedAtUnixSeconds)}`;
  }
  return `${runtime} - ${started}`;
}

function processOutputSummary(process: ManagedProcessSummary) {
  const total = process.totalOutputLineCount ?? process.output.length;
  const retained = process.output.length;
  const dropped = process.droppedOutputLineCount ?? Math.max(0, total - retained);
  if (dropped > 0) {
    return `${retained}/${total} output lines retained - ${dropped} dropped`;
  }
  return `${retained}/${total} output lines retained`;
}

function processOutputText(process: ManagedProcessSummary) {
  const lines = process.output.slice(-8);
  if (lines.length === 0) {
    return "stdout: Waiting for process output";
  }
  return lines.map((line) => `${line.stream}: ${line.line}`).join("\n");
}

function processLogExportSummary(log: ProcessLogExport) {
  const total = log.totalOutputLineCount ?? log.lineCount;
  const dropped = log.droppedOutputLineCount ?? Math.max(0, total - log.lineCount);
  if (dropped > 0) {
    return `${log.lineCount}/${total} lines retained - ${dropped} dropped`;
  }
  return `${log.lineCount} lines retained`;
}

function processStatusLabel(process: ManagedProcessSummary) {
  if (process.state === "running") return "Running";
  if (process.state === "stop_requested") return "Stop requested";
  if (process.stopRequested) return "Stopped";
  if (typeof process.exitCode === "number") {
    return process.exitCode === 0 ? "Exited cleanly" : `Crashed with exit code ${process.exitCode}`;
  }
  return "Exited";
}

function processStatusClass(process: ManagedProcessSummary) {
  if (process.state === "running") return "status-pill active";
  if (process.state === "stop_requested") return "status-pill pending";
  if (process.stopRequested) return "status-pill completed";
  if (typeof process.exitCode === "number" && process.exitCode !== 0) return "status-pill failed";
  return "status-pill completed";
}

function processStopActionLabel(process: ManagedProcessSummary) {
  if (process.state === "running") return "Stop";
  if (process.state === "stop_requested") return "Stopping";
  return "Stopped";
}

function managedProcessProfileId(process: ManagedProcessSummary) {
  return process.command.env?.find((entry) => entry.key === "THEBOYSLAUNCHER_PROFILE_ID")?.value;
}

function managedProcessDisplayName(process: ManagedProcessSummary, profiles: ProfileSummary[]) {
  const profileId = managedProcessProfileId(process);
  const profile = profileId ? profiles.find((item) => item.id === profileId) : undefined;
  return profile?.name ?? "Minecraft";
}

function managedProcessActivitySummary(process: ManagedProcessSummary, profiles: ProfileSummary[]) {
  const displayName = managedProcessDisplayName(process, profiles);
  if (process.state === "running") return `${displayName} is running`;
  if (process.state === "stop_requested") return `Stopping ${displayName}`;
  if (typeof process.exitCode === "number") {
    return process.exitCode === 0 ? `${displayName} closed` : `${displayName} closed unexpectedly`;
  }
  return `${displayName} process updated`;
}

function activeManagedProfileIds(processes: ManagedProcessSummary[]) {
  return new Set(
    processes
      .filter((process) => process.state === "running" || process.state === "stop_requested")
      .map(managedProcessProfileId)
      .filter((profileId): profileId is string => Boolean(profileId)),
  );
}

function profileIdFromName(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "profile"
  );
}

function uniqueProfileIdFromName(name: string, profiles: ProfileSummary[]) {
  const base = profileIdFromName(name);
  const ids = new Set(profiles.map((profile) => profile.id));
  if (!ids.has(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!ids.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

function mergeManagedProcessSummary(
  existing: ManagedProcessSummary | undefined,
  incoming: ManagedProcessSummary,
) {
  if (!existing) return incoming;
  const existingOutputCount = existing.totalOutputLineCount ?? existing.output.length;
  const incomingOutputCount = incoming.totalOutputLineCount ?? incoming.output.length;
  if (existingOutputCount > incomingOutputCount) {
    return {
      ...incoming,
      output: existing.output,
      totalOutputLineCount: existing.totalOutputLineCount,
      droppedOutputLineCount: existing.droppedOutputLineCount,
    };
  }
  return incoming;
}

function upsertManagedProcessSummary(current: ManagedProcessSummary[], incoming: ManagedProcessSummary) {
  const existing = current.find((process) => process.id === incoming.id);
  const merged = mergeManagedProcessSummary(existing, incoming);
  return [merged, ...current.filter((process) => process.id !== incoming.id)].slice(0, 25);
}

function mergeManagedProcessList(current: ManagedProcessSummary[], incoming: ManagedProcessSummary[]) {
  return incoming
    .map((process) => mergeManagedProcessSummary(current.find((existing) => existing.id === process.id), process))
    .slice(0, 25);
}

function settingsDraftValidationMessage(settings: LauncherSettings) {
  if (!Number.isFinite(settings.minMemoryMb) || settings.minMemoryMb < 512) {
    return "Minimum memory must be at least 512 MB";
  }
  if (!Number.isFinite(settings.maxMemoryMb) || settings.maxMemoryMb < settings.minMemoryMb) {
    return "Maximum memory must be greater than or equal to minimum memory";
  }
  if (settings.maxMemoryMb > 32768) {
    return "Maximum memory must be 32768 MB or lower";
  }
  if (!settings.offlineUsername.trim()) {
    return "Offline username is required";
  }
  if (settings.javaRuntimeOverridePath !== undefined && !settings.javaRuntimeOverridePath.trim()) {
    return "Java override path must be blank automatic or a valid java executable path";
  }
  return null;
}

function createProfileValidationMessage(request: CreateProfileRequest) {
  if (!request.name.trim()) return "Profile name is required";
  if (!request.gameVersion.trim()) return "Profile game version is required";
  if (!Number.isFinite(request.memoryMb) || request.memoryMb < 512) return "Profile memory must be at least 512 MB";
  if (request.memoryMb > 32768) return "Profile memory must be 32768 MB or lower";
  return null;
}

function releaseMinecraftVersions(versions: MinecraftVersionSummary[]) {
  const releases = versions.filter((version) => version.versionType === "release");
  return releases.length > 0 ? releases : fallbackMinecraftVersions;
}

const createProfileVersionTypes: MinecraftVersionType[] = ["release", "snapshot", "old_beta", "old_alpha"];

function minecraftVersionTypeLabel(versionType: MinecraftVersionType) {
  switch (versionType) {
    case "release":
      return "Releases";
    case "snapshot":
      return "Snapshots";
    case "old_beta":
      return "Old beta";
    case "old_alpha":
      return "Old alpha";
    default:
      return "Other";
  }
}

function minecraftVersionUnavailableMessage(versionType: MinecraftVersionType) {
  return `No versions are available for ${minecraftVersionTypeLabel(versionType)} right now. Try Releases or refresh later.`;
}

function minecraftVersionsForType(versions: MinecraftVersionSummary[], versionType: MinecraftVersionType) {
  const matches = versions.filter((version) => version.versionType === versionType);
  if (matches.length > 0) return matches;
  return versionType === "release" ? fallbackMinecraftVersions : [];
}

function minecraftVersionTypeForVersion(versionId: string, versions: MinecraftVersionSummary[]) {
  return versions.find((version) => version.id === versionId)?.versionType ?? "release";
}

function profileVersionOptions(currentVersion: string, versions: MinecraftVersionSummary[], useReleaseFallback = true) {
  const options = versions.length > 0 ? versions : useReleaseFallback ? fallbackMinecraftVersions : [];
  if (options.some((version) => version.id === currentVersion)) return options;
  if (!currentVersion.trim()) return options;
  return [
    {
      id: currentVersion,
      versionType: "unknown" as const,
      url: "",
      releaseTime: "",
    },
    ...options,
  ];
}

function jvmArgsFromDraft(value: string) {
  return value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function commandWorkingDir(spec: ProcessCommandSpec) {
  return spec.workingDir || (spec as ProcessCommandSpec & { workingDirectory?: string }).workingDirectory || "Unknown";
}

function quoteCommandPart(value: string) {
  if (!value) return "\"\"";
  if (!/[\s"]/u.test(value)) return value;
  return `"${value.replace(/(["\\])/gu, "\\$1")}"`;
}

function commandPreviewText(spec: ProcessCommandSpec) {
  const parts = [spec.executable, ...spec.args].map(quoteCommandPart);
  const env = spec.env ?? [];
  const envLines = env.length
    ? ["", "# Environment", ...env.map((item) => `${item.key}=${item.value}`)]
    : [];
  return [`# Working directory: ${commandWorkingDir(spec)}`, parts.join(" "), ...envLines].join("\n");
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.append(textarea);
  textarea.select();
  try {
    if (!document.execCommand("copy")) {
      throw new Error("copy command was rejected");
    }
  } finally {
    textarea.remove();
  }
}

function jvmArgsDraft(args: string[]) {
  return args.join(" ");
}

function minecraftSessionLabel(session?: StoredMinecraftSession) {
  if (!session) return "No stored session";
  const expiresAt = session.expiresAtUnixSeconds;
  if (typeof expiresAt === "number" && storedMinecraftSessionExpired(session)) {
    if (storedMinecraftSessionRefreshable(session)) {
      return `${session.session.username} - ${session.session.uuid} - expired ${formatUnixDate(expiresAt)} - refreshes on launch`;
    }
    return `${session.session.username} - ${session.session.uuid} - expired ${formatUnixDate(expiresAt)}`;
  }
  const expires =
    typeof expiresAt === "number"
      ? `expires ${formatUnixDate(expiresAt)}`
      : "no expiration recorded";
  return `${session.session.username} - ${session.session.uuid} - ${expires}`;
}

function sessionExpiryLabel(expiresAtUnixSeconds: number) {
  return `expires ${formatUnixDate(expiresAtUnixSeconds)}`;
}

function accountExpiryStatus(account: StoredMinecraftAccountSummary) {
  if (typeof account.expiresAtUnixSeconds !== "number") return "Saved for play";
  const expired = account.expiresAtUnixSeconds <= Math.floor(Date.now() / 1000);
  return expired ? "Needs refresh on next play" : "Ready for online play";
}

const memoryPresetsMb = [
  { label: "4 GB", value: 4096 },
  { label: "6 GB", value: 6144 },
  { label: "8 GB", value: 8192 },
];

function minecraftSessionQuickLabel(session?: StoredMinecraftSession) {
  if (!session) return "Offline ready";
  if (storedMinecraftSessionExpired(session)) {
    return storedMinecraftSessionRefreshable(session) ? `${session.session.username} - refreshes` : `${session.session.username} - expired`;
  }
  return `${session.session.username} signed in`;
}

function storedMinecraftSessionExpired(session: StoredMinecraftSession, nowUnixSeconds = Math.floor(Date.now() / 1000)) {
  return typeof session.expiresAtUnixSeconds === "number" && session.expiresAtUnixSeconds <= nowUnixSeconds;
}

function storedMinecraftSessionUsable(session?: StoredMinecraftSession) {
  return Boolean(session && !storedMinecraftSessionExpired(session));
}

function storedMinecraftSessionRefreshable(session?: StoredMinecraftSession) {
  return Boolean(session?.microsoftClientId);
}

function storedMinecraftSessionCanAuthenticate(session?: StoredMinecraftSession) {
  return Boolean(session && (storedMinecraftSessionUsable(session) || storedMinecraftSessionRefreshable(session)));
}

function devSessionUsable(session?: DevSessionResponse, nowUnixSeconds = Math.floor(Date.now() / 1000)) {
  return typeof session?.expiresAtUnixSeconds === "number" && session.expiresAtUnixSeconds > nowUnixSeconds + 30;
}

function backendSessionShouldUpgradeToMinecraft(session: DevSessionResponse, storedSession?: StoredMinecraftSession) {
  if (!storedMinecraftSessionCanAuthenticate(storedSession)) return false;
  return session.sessionKind !== "minecraft" || !backendMinecraftSessionMatchesStoredSession(session, storedSession);
}

function backendMinecraftSessionMatchesStoredSession(
  session: Pick<DevSessionResponse, "sessionKind" | "minecraftUuid" | "minecraftName">,
  storedSession?: StoredMinecraftSession,
) {
  if (session.sessionKind !== "minecraft") return false;
  if (!storedSession || storedMinecraftSessionExpired(storedSession)) return false;
  return (
    session.minecraftUuid?.toLowerCase() === storedSession.session.uuid.toLowerCase() &&
    session.minecraftName?.toLowerCase() === storedSession.session.username.toLowerCase()
  );
}

function launcherEventKey(event: LauncherEvent) {
  return `${event.operationId}:${event.kind}:${event.message}:${event.progressPercent ?? ""}`;
}

function mergeLauncherEvents(current: LauncherEvent[], incoming: LauncherEvent[]) {
  const supersededPlanOperationIds = supersededLocalPlanOperationIds(current, incoming);
  const next = current.filter((event) => !supersededPlanOperationIds.has(event.operationId));
  for (const event of incoming) {
    const key = launcherEventKey(event);
    const existingIndex = next.findIndex((item) => launcherEventKey(item) === key);
    if (existingIndex >= 0) {
      next[existingIndex] = event;
    } else {
      next.push(event);
    }
  }
  return next.slice(-25);
}

function supersededLocalPlanOperationIds(current: LauncherEvent[], incoming: LauncherEvent[]) {
  const incomingSubjects = new Set(
    incoming
      .filter((event) => event.operation && event.subjectId)
      .map((event) => `${event.operation}:${event.subjectId}`),
  );
  if (incomingSubjects.size === 0) return new Set<string>();

  const grouped = new Map<string, LauncherEvent[]>();
  for (const event of current) {
    const events = grouped.get(event.operationId) ?? [];
    events.push(event);
    grouped.set(event.operationId, events);
  }

  const superseded = new Set<string>();
  for (const [operationId, events] of grouped) {
    const metadataEvent = events.find((event) => event.operation && event.subjectId);
    if (!metadataEvent?.operation || !metadataEvent.subjectId) continue;
    if (!incomingSubjects.has(`${metadataEvent.operation}:${metadataEvent.subjectId}`)) continue;
    if (incoming.some((event) => event.operationId === operationId)) continue;
    if (events.some((event) => /(?:plan is ready to execute|setup is ready to start)/i.test(event.message))) {
      superseded.add(operationId);
    }
  }
  return superseded;
}

function launcherEventsFromOperationPlan(plan: OperationPlan): LauncherEvent[] {
  const now = Math.floor(Date.now() / 1000);
  return plan.events.map((event, index) => ({
    id: `${plan.operationId}-${index}-${event.kind}`,
    operationId: plan.operationId,
    operation: plan.operation,
    subjectId: plan.subjectId,
    kind: event.kind,
    message: event.message,
    progressPercent: event.progressPercent,
    occurredAtUnixSeconds: now,
  }));
}

function launcherOperationActiveEvent(plan: OperationPlan, message: string): LauncherEvent {
  const plannedProgress = latestProgressPercent(launcherEventsFromOperationPlan(plan)) ?? 1;
  return {
    id: `${plan.operationId}-active-ui`,
    operationId: plan.operationId,
    operation: plan.operation,
    subjectId: plan.subjectId,
    kind: "active",
    message,
    progressPercent: Math.min(plannedProgress, 95),
    occurredAtUnixSeconds: Math.floor(Date.now() / 1000),
  };
}

function completedLifecycleMessage(event: LauncherEvent) {
  if (event.kind === "failed") return true;
  if (event.kind !== "completed") return false;
  if (event.operation === "install_pack") {
    return /^Pack (installed|updated|reinstalled) successfully\.$/.test(event.message);
  }
  if (event.operation === "repair_profile") {
    return event.message === "Profile repair completed." || event.message === "Profile setup completed.";
  }
  if (event.operation === "delete_profile") {
    return event.message === "Profile deleted." || event.message.includes("shared Minecraft downloads were kept");
  }
  return false;
}

function latestProgressPercent(events: LauncherEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (typeof events[index].progressPercent === "number") {
      return events[index].progressPercent;
    }
  }
  return undefined;
}

function summarizeLauncherOperations(events: LauncherEvent[]): LauncherOperationSummary[] {
  const grouped = new Map<string, { events: LauncherEvent[]; latestIndex: number }>();
  for (const [index, event] of events.entries()) {
    const group = grouped.get(event.operationId) ?? { events: [], latestIndex: index };
    group.events.push(event);
    group.latestIndex = index;
    grouped.set(event.operationId, group);
  }
  return [...grouped.entries()]
    .map(([operationId, group]) => {
      const operationEvents = group.events;
      const terminalLifecycleEvent = [...operationEvents]
        .reverse()
        .find((event) => completedLifecycleMessage(event));
      const latestEvent = terminalLifecycleEvent ?? operationEvents[operationEvents.length - 1];
      const progressPercent =
        terminalLifecycleEvent || latestEvent.kind === "completed" ? 100 : latestProgressPercent(operationEvents);
      const metadataEvent = [...operationEvents]
        .reverse()
        .find((event) => event.operation || event.subjectId);
      return {
        operationId,
        operation: metadataEvent?.operation,
        subjectId: metadataEvent?.subjectId,
        latestEvent,
        eventCount: operationEvents.length,
        progressPercent,
        latestIndex: group.latestIndex,
      };
    })
    .sort((left, right) => right.latestIndex - left.latestIndex)
    .slice(0, 5);
}

function operationLabel(operation?: LauncherOperation) {
  switch (operation) {
    case "launch_profile":
      return "Launch profile";
    case "install_pack":
      return "Install pack";
    case "repair_profile":
      return "Set up files";
    case "import_profile":
      return "Import profile";
    case "delete_profile":
      return "Delete profile";
    case "download_artifacts":
      return "Download files";
    case "install_java_runtime":
      return "Install Java runtime";
    case "managed_process":
      return "Managed process";
    default:
      return "Launcher operation";
  }
}

function operationLabelForMessage(operation: LauncherOperation | undefined, message?: string) {
  if (operation === "repair_profile" && message === "Profile setup completed.") return "Set up files";
  return operationLabel(operation);
}

function operationContextLabel(operation?: LauncherOperation, subjectId?: string, message?: string) {
  const label = operationLabelForMessage(operation, message);
  return subjectId ? `${label} - ${friendlyOperationSubject(subjectId)}` : label;
}

function friendlyOperationSubject(subjectId: string) {
  return subjectId
    .replace(/-(?:modloader-artifacts|direct-pack-files|metafile-downloads|auxiliary|dependencies)$/u, "")
    .replace(/-/gu, " ");
}

function operationSubjectRoot(subjectId: string) {
  return subjectId.replace(/-(?:modloader-artifacts|direct-pack-files|metafile-downloads|auxiliary|dependencies)$/u, "");
}

function operationRowClass(event: LauncherEvent) {
  if (event.kind === "failed") return "operation-row failed";
  if (event.kind === "completed") return "operation-row completed";
  return "operation-row active";
}

function operationStepBreakdown(events: LauncherEvent[]) {
  const failed = events.filter((event) => event.kind === "failed").length;
  const completed = events.filter((event) => event.kind !== "failed" && (event.kind === "completed" || event.progressPercent === 100)).length;
  const pending = events.filter((event) => event.kind === "queued" || event.progressPercent === 0).length;
  const active = Math.max(0, events.length - completed - pending - failed);
  return { completed, active, pending, failed };
}

function artifactLabelFromEventMessage(message: string) {
  const match =
    /^(?:Artifact pending:|File pending:|Downloading artifact:|Downloading file:|Downloaded artifact:|Downloaded file:|Failed artifact:|Failed file:|Artifact already present:|File already present:) (.+)$/i.exec(
      message,
    );
  return match?.[1];
}

function fileEventMessageKind(message: string) {
  if (/^(?:Artifact pending:|File pending:)/i.test(message)) return "pending";
  if (/^Downloading (?:artifact|file):/i.test(message)) return "started";
  if (/^(?:Downloaded (?:artifact|file):|(?:Artifact|File) already present:)/i.test(message)) return "finished";
  if (/^Failed (?:artifact|file):/i.test(message)) return "failed";
  return undefined;
}

function downloadArtifactCategory(label: string, subjectId?: string) {
  const normalized = label.toLowerCase();
  if (normalized.startsWith("asset-object-minecraft/") || normalized.includes("(asset object")) return "Minecraft assets";
  if (normalized.includes("(client jar")) return "Minecraft client";
  if (normalized.includes("(native")) return "Minecraft native files";
  if (subjectId?.includes("modloader") || /\b(forge|neoforge|fabric|quilt|bootstrap)\b/i.test(label)) {
    return "mod loader files";
  }
  if (normalized.includes("(library")) return "Minecraft libraries";
  if (normalized.includes("(pack file") || normalized.includes("(preserved pack file") || normalized.includes("(mod")) {
    return "pack files";
  }
  return "game files";
}

function sidebarDownloadStatusMessage(event: LauncherEvent) {
  const artifact = artifactLabelFromEventMessage(event.message);
  if (!artifact) {
    if (/processor/i.test(event.message)) return "Verifying mod loader setup";
    return userFacingLauncherEventMessage(event.message);
  }

  const category = downloadArtifactCategory(artifact, event.subjectId);
  switch (fileEventMessageKind(event.message)) {
    case "pending":
      return `Waiting to download ${category}`;
    case "started":
      return `Downloading ${category}`;
    case "finished":
      return `${category} ready`;
    case "failed":
      return `${category} failed`;
    default:
      return userFacingLauncherEventMessage(event.message);
  }
}

function isVerboseDownloadFileEvent(event: LauncherEvent) {
  if (event.operation !== "download_artifacts") return false;
  const kind = fileEventMessageKind(event.message);
  return kind === "pending" || kind === "started" || kind === "finished";
}

function userFacingLauncherEventMessage(message: string) {
  return message
    .replace(/^Stop requested for pid \d+ \(.+\)\.?$/i, "Stop requested")
    .replace(
      /Minecraft requires Java (\d+) or newer,.*?Install a managed Java runtime from Settings before launching\./i,
      "Preparing Java $1 automatically for this Minecraft version.",
    )
    .replace(
      /^Install a managed Java runtime from Settings before launching\.?$/i,
      "Preparing the right Java automatically for this Minecraft version.",
    )
    .replace(
      /Java executable .*? is missing\. Install a managed Java runtime from Settings before launching\./i,
      "Preparing Java automatically for this Minecraft version.",
    )
    .replace(/^Artifact download queued/i, "File download queued")
    .replace(/^Artifact pending:/i, "File pending:")
    .replace(/^Downloading artifact:/i, "Downloading file:")
    .replace(/^Downloaded artifact:/i, "Downloaded file:")
    .replace(/^Artifact already present:/i, "File already present:")
    .replace(/^Failed artifact:/i, "Failed file:")
    .replace(/^Repair queued for/i, "Setup queued for")
    .replace(/^Repair plan is ready to execute\./i, "Setup is ready to start.")
    .replace(/^Profile repair completed\./i, "Files are ready.")
    .replace(/^Profile setup completed\./i, "Files are ready.")
    .replace(/^(?:Error:\s*)?Profile repair failed:/i, "Setup failed:")
    .replace(/^(?:Error:\s*)?Profile setup failed:/i, "Setup failed:")
    .replace(/^Automatic profile repair before launch failed:/i, "Automatic profile setup before launch failed:")
    .replace(/^launch artifact is missing:\s*asset index is missing\..*$/i, "Game files are missing. The launcher will set them up automatically.")
    .replace(/^launch artifact is missing:\s*natives directory is missing\..*$/i, "Game files are missing. The launcher will set them up automatically.")
    .replace(/^launch artifacts? (?:is|are) missing:.*$/i, "Game files are missing. The launcher will set them up automatically.")
    .replace(/^asset index is missing:.*$/i, "Game files are missing. The launcher will set them up automatically.")
    .replace(/^natives directory is missing:.*$/i, "Game files are missing. The launcher will set them up automatically.")
    .replace(/\s*Install or repair the profile before launching\./i, " The launcher will set up missing files automatically.")
    .replace(/\brepair the profile\b/i, "set up the profile files");
}

function userFacingNativeErrorMessage(message: string) {
  return userFacingLauncherEventMessage(message);
}

function summarizeArtifactOperation(events: LauncherEvent[]): ArtifactOperationSummary | undefined {
  const artifactEvents = events
    .map((event) => ({
      event,
      artifact: artifactLabelFromEventMessage(event.message),
    }))
    .filter((entry): entry is { event: LauncherEvent; artifact: string } => Boolean(entry.artifact));

  if (artifactEvents.length === 0) return undefined;

  const pending = artifactEvents.filter((entry) => fileEventMessageKind(entry.event.message) === "pending");
  const downloading = artifactEvents.filter((entry) => fileEventMessageKind(entry.event.message) === "started");
  const finished = artifactEvents.filter(
    (entry) => fileEventMessageKind(entry.event.message) === "finished",
  );
  const failed = artifactEvents.filter((entry) => fileEventMessageKind(entry.event.message) === "failed");
  const latestByArtifact = new Map<string, (typeof artifactEvents)[number]>();
  for (const entry of artifactEvents) {
    latestByArtifact.set(entry.artifact, entry);
  }
  const current =
    [...artifactEvents]
      .reverse()
      .find((entry) => {
        if (latestByArtifact.get(entry.artifact) !== entry) return false;
        const kind = fileEventMessageKind(entry.event.message);
        return kind === "started" || kind === "pending";
      }) ?? artifactEvents[artifactEvents.length - 1];

  return {
    currentArtifact: current.artifact,
    pending: pending.length,
    downloading: downloading.length,
    finished: finished.length,
    failed: failed.length,
  };
}

function latestActiveDownloadEvent(events: LauncherEvent[]) {
  const downloadOperations = new Map<string, { events: LauncherEvent[]; latestIndex: number }>();
  const completedLifecycleIndexesBySubject = new Map<string, number>();
  let latestCompletedLifecycleIndex = -1;
  events.forEach((event, index) => {
    if (
      event.subjectId &&
      event.kind === "completed" &&
      (event.operation === "install_pack" || event.operation === "repair_profile")
    ) {
      completedLifecycleIndexesBySubject.set(operationSubjectRoot(event.subjectId), index);
      latestCompletedLifecycleIndex = Math.max(latestCompletedLifecycleIndex, index);
    }
    if (event.operation !== "download_artifacts") return;
    const operationKey = event.operationId || `${event.subjectId ?? "download"}-${event.id}`;
    const operation = downloadOperations.get(operationKey) ?? { events: [], latestIndex: index };
    operation.events.push(event);
    operation.latestIndex = index;
    downloadOperations.set(operationKey, operation);
  });

  return [...downloadOperations.values()]
    .sort((left, right) => right.latestIndex - left.latestIndex)
    .map((operation) => operation.events[operation.events.length - 1])
    .find((event) => {
      if (event.kind === "completed" || event.kind === "failed" || event.progressPercent === 100) return false;
      if (!event.subjectId) return true;
      const completedLifecycleIndex = completedLifecycleIndexesBySubject.get(operationSubjectRoot(event.subjectId));
      const operation = downloadOperations.get(event.operationId || `${event.subjectId ?? "download"}-${event.id}`);
      if (completedLifecycleIndex !== undefined && operation && completedLifecycleIndex >= operation.latestIndex) return false;
      if (operation && latestCompletedLifecycleIndex >= operation.latestIndex) return false;
      return true;
    });
}

function sidebarStatusTitle(isNative: boolean, event?: LauncherEvent) {
  if (!isNative) return "Web preview";
  if (event?.operation === "download_artifacts") return "Downloading files";
  if (event?.operation) return operationLabelForMessage(event.operation, event.message);
  return "Desktop connected";
}

function sidebarStatusMessage(event: LauncherEvent | undefined, fallback: string) {
  if (!event) return fallback;
  if (event.operation === "download_artifacts" && event.subjectId) {
    return `${friendlyOperationSubject(event.subjectId)} - ${sidebarDownloadStatusMessage(event)}`;
  }
  return userFacingLauncherEventMessage(event.message);
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function socialBackendOrigin(healthUrl: string) {
  try {
    return new URL(healthUrl).origin;
  } catch {
    return "http://127.0.0.1:4074";
  }
}

function socialBackendModeLabel(status: SocialBackendStatus) {
  return status.endpointKind === "hosted" ? "Hosted backend" : "Local backend";
}

function socialBackendAddress(status: SocialBackendStatus) {
  return status.endpointUrl || status.bindAddr;
}

function updateChannelLabel(channel: LauncherUpdateChannel) {
  return channel === "dev" ? "Dev" : "Stable";
}

function updateChannelInstallLabel(channel: LauncherUpdateChannel) {
  return channel === "dev" ? "Open Dev installer" : "Open Stable installer";
}

async function fetchUpdateManifest(channel: LauncherUpdateChannel) {
  const response = await fetch(UPDATE_MANIFEST_ENDPOINTS[channel], { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Update manifest returned ${response.status}`);
  }
  const manifest = (await response.json()) as LauncherUpdateManifest;
  if (!manifest.version || !manifest.url || !manifest.url.startsWith(RELEASE_DOWNLOAD_PREFIX)) {
    throw new Error("Update manifest is missing a trusted installer URL");
  }
  return manifest;
}

function socialBackendAvailability(status: SocialBackendStatus) {
  if (status.running) return "Reachable";
  return status.endpointKind === "hosted" ? "Hosted offline" : "Offline";
}

function socialBackendPresenceWebSocketUrl(healthUrl: string, accessToken?: string) {
  const url = new URL(socialBackendOrigin(healthUrl));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/presence/ws";
  url.search = "";
  if (accessToken) {
    url.searchParams.set("access_token", accessToken);
  }
  url.hash = "";
  return url.toString();
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 800) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

function previewUuidForSocialId(id: string) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return id;
  }
  let hash = 0x811c9dc5;
  for (const char of id) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return `${hex.slice(0, 8)}-${hex.slice(0, 4)}-4000-8000-${hex.padEnd(12, "0").slice(0, 12)}`;
}

function colorForAccount(id: string) {
  const palette = ["#67e8f9", "#86efac", "#f9a8d4", "#fde68a", "#c4b5fd", "#fca5a5"];
  let hash = 0;
  for (const char of id) {
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  }
  return palette[hash % palette.length];
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  for (const unit of units) {
    if (value < 1024 || unit === "GB") {
      return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
    }
    value /= 1024;
  }
  return `${bytes} B`;
}

function friendFromPresenceUpdate(
  update: PresenceUpdate,
  friends: FriendPresence[],
  packs: PackSummary[],
): FriendPresence {
  const existing = friends.find((friend) => friend.id === update.accountId);
  const pack = packs.find((item) => item.id === update.packId);
  const serverName = update.serverId ?? pack?.defaultServer;
  return {
    id: update.accountId,
    name: existing?.name ?? `Player ${update.accountId.slice(-4)}`,
    avatarColor: existing?.avatarColor ?? colorForAccount(update.accountId),
    state: update.state,
    packName: pack?.name ?? update.packId,
    serverName,
    joinable: update.state === "playing" && Boolean(serverName),
  };
}

function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(fallbackSnapshot);
  const [settingsDraft, setSettingsDraft] = useState<LauncherSettings>(fallbackSnapshot.settings);
  const [profileCreatorOpen, setProfileCreatorOpen] = useState(false);
  const [newProfileAdvancedOpen, setNewProfileAdvancedOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState("New Vanilla Profile");
  const [newProfileLoader, setNewProfileLoader] = useState<ProfileSummary["loader"]>("vanilla");
  const [newProfileVersionType, setNewProfileVersionType] = useState<MinecraftVersionType>("release");
  const [newProfileGameVersion, setNewProfileGameVersion] = useState("1.21.8");
  const [newProfileMemoryMb, setNewProfileMemoryMb] = useState(fallbackSnapshot.settings.maxMemoryMb);
  const [minecraftVersions, setMinecraftVersions] = useState<MinecraftVersionSummary[]>(fallbackMinecraftVersions);
  const [minecraftVersionsLoading, setMinecraftVersionsLoading] = useState(false);
  const [minecraftVersionsLoadFailed, setMinecraftVersionsLoadFailed] = useState(false);
  const newProfileVersionOptions = minecraftVersionsLoadFailed
    ? []
    : minecraftVersionsForType(minecraftVersions, newProfileVersionType);
  const newProfileVersionUnavailableMessage =
    minecraftVersionsLoadFailed
      ? "Minecraft versions could not load. Check your connection and try again."
      : !minecraftVersionsLoading && newProfileVersionOptions.length === 0
        ? minecraftVersionUnavailableMessage(newProfileVersionType)
        : null;
  const newProfileDraft: CreateProfileRequest = {
    name: newProfileName.trim(),
    loader: newProfileLoader,
    gameVersion: newProfileGameVersion.trim(),
    memoryMb: newProfileMemoryMb,
  };
  const newProfileValidationMessage = createProfileValidationMessage(newProfileDraft);
  const [minecraftSession, setMinecraftSession] = useState<StoredMinecraftSession | undefined>(
    fallbackSnapshot.minecraftSession,
  );
  const [minecraftAccounts, setMinecraftAccounts] = useState<StoredMinecraftAccountSummary[]>([]);
  const [removeMinecraftAccountConfirmId, setRemoveMinecraftAccountConfirmId] = useState<string | null>(null);
  const [javaRuntimes, setJavaRuntimes] = useState<JavaRuntimeSummary[]>([]);
  const [javaRuntimeDraft, setJavaRuntimeDraft] = useState<JavaRuntimeDownloadRequest>({
    runtimeId: "Java 21",
    url: "",
    archiveFileName: "java-21.zip",
  });
  const [recommendedJavaRuntimes, setRecommendedJavaRuntimes] = useState<JavaRuntimeManifestEntry[]>([]);
  const [backendStatus, setBackendStatus] = useState<SocialBackendStatus>(fallbackBackendStatus);
  const [launcherUpdateState, setLauncherUpdateState] = useState<LauncherUpdateState>({
    status: "idle",
    message: "Updates are checked automatically.",
  });
  const [availableLauncherUpdate, setAvailableLauncherUpdate] = useState<Update | null>(null);
  const [selectedUpdateChannel, setSelectedUpdateChannel] =
    useState<LauncherUpdateChannel>(CURRENT_UPDATE_CHANNEL);
  const [availableChannelManifest, setAvailableChannelManifest] = useState<LauncherUpdateManifest | null>(null);
  const [launcherEvents, setLauncherEvents] = useState<LauncherEvent[]>([]);
  const [managedProcesses, setManagedProcesses] = useState<ManagedProcessSummary[]>([]);
  const [lastProcessLogExport, setLastProcessLogExport] = useState<ProcessLogExport | null>(null);
  const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);
  const [launchCommandPreview, setLaunchCommandPreview] = useState<LaunchCommandPreview | null>(null);
  const [processAutoRefresh, setProcessAutoRefresh] = useState(false);
  const [activityMode, setActivityMode] = useState<ActivityMode>("overview");
  const [presenceStreamUrl, setPresenceStreamUrl] = useState<string | null>(null);
  const devSessionCache = useRef<Record<string, DevSessionResponse>>({});
  const recentLaunchedProcesses = useRef<Record<string, { process: ManagedProcessSummary; expiresAt: number }>>({});
  const clearedPresenceProcessIds = useRef<Set<string>>(new Set());
  const launcherOperationSummaries = useMemo(
    () => summarizeLauncherOperations(launcherEvents),
    [launcherEvents],
  );
  const latestOperationEvents = useMemo(() => {
    const latestOperation = launcherOperationSummaries[0];
    if (!latestOperation) return [];
    return launcherEvents.filter((event) => event.operationId === latestOperation.operationId);
  }, [launcherEvents, launcherOperationSummaries]);
  const latestOperationBreakdown = useMemo(
    () => operationStepBreakdown(latestOperationEvents),
    [latestOperationEvents],
  );
  const latestArtifactSummary = useMemo(
    () => summarizeArtifactOperation(latestOperationEvents),
    [latestOperationEvents],
  );
  const visibleActivityEvents = useMemo(() => {
    if (activityMode === "overview") return launcherEvents.slice(-5);
    if (activityMode === "events") return launcherEvents.filter((event) => !isVerboseDownloadFileEvent(event));
    return launcherEvents;
  }, [activityMode, launcherEvents]);
  const verboseDownloadFileEvents = useMemo(
    () => (activityMode === "events" ? launcherEvents.filter(isVerboseDownloadFileEvent) : []),
    [activityMode, launcherEvents],
  );
  const activeProcessProfileIds = useMemo(
    () => activeManagedProfileIds(managedProcesses),
    [managedProcesses],
  );
  const activeManagedProcessCount = useMemo(
    () => managedProcesses.filter((process) => process.state === "running" || process.state === "stop_requested").length,
    [managedProcesses],
  );
  const activeProcessByProfileId = useMemo(() => {
    const activeProcesses = new Map<string, ManagedProcessSummary>();
    for (const process of managedProcesses) {
      if (process.state !== "running" && process.state !== "stop_requested") continue;
      const profileId = managedProcessProfileId(process);
      if (profileId && !activeProcesses.has(profileId)) {
        activeProcesses.set(profileId, process);
      }
    }
    return activeProcesses;
  }, [managedProcesses]);
  const hasExitedManagedProcesses = useMemo(
    () => managedProcesses.some((process) => process.state === "exited"),
    [managedProcesses],
  );
  const [friendSearchDraft, setFriendSearchDraft] = useState("");
  const [friendSearchResults, setFriendSearchResults] = useState<AccountSearchResult[]>([]);
  const [friendSearchStatus, setFriendSearchStatus] = useState("Search Minecraft names to queue friend requests");
  const [friendRequests, setFriendRequests] = useState<FriendRequestSummary[]>([]);
  const [blockedAccounts, setBlockedAccounts] = useState<BlockedAccountSummary[]>([]);
  const [mutedAccounts, setMutedAccounts] = useState<MutedAccountSummary[]>([]);
  const [activeView, setActiveView] = useState("home");
  const [discoverProvider, setDiscoverProvider] = useState<DiscoverProviderId>("curseforge");
  const [discoverArchiveUrl, setDiscoverArchiveUrl] = useState(
    "https://i.dylan.lol/dylan/Enigmatica9Expert-1.27.0.zip",
  );
  const [discoverArchiveName, setDiscoverArchiveName] = useState("Enigmatica 9 Expert");
  const [discoverInstallInProgress, setDiscoverInstallInProgress] = useState(false);
  const [discoverSearchQuery, setDiscoverSearchQuery] = useState("optimization");
  const [discoverSearchResults, setDiscoverSearchResults] = useState<ModrinthModpackSearchResult[]>([]);
  const [discoverSearchStatus, setDiscoverSearchStatus] = useState("Search Modrinth for public modpacks.");
  const [discoverSearchInProgress, setDiscoverSearchInProgress] = useState(false);
  const [discoverInstallingProjectId, setDiscoverInstallingProjectId] = useState<string | null>(null);
  const [selectedPackDetailsId, setSelectedPackDetailsId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState("Launcher ready");
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showAccountsModal, setShowAccountsModal] = useState(false);
  const [repairInProgressProfileId, setRepairInProgressProfileId] = useState<string | null>(null);
  const [setupInProgressProfileId, setSetupInProgressProfileId] = useState<string | null>(null);
  const [installInProgressPackId, setInstallInProgressPackId] = useState<string | null>(null);
  const [deleteInProgressProfileId, setDeleteInProgressProfileId] = useState<string | null>(null);
  const [lifecycleActionInProgressKey, setLifecycleActionInProgressKey] = useState<string | null>(null);
  const profileCreatorSetupInProgress =
    setupInProgressProfileId === uniqueProfileIdFromName(newProfileName, snapshot.profiles);
  const [importInProgress, setImportInProgress] = useState(false);
  const [managedJavaInstallInProgress, setManagedJavaInstallInProgress] = useState(false);
  const lifecycleActionInProgressRef = useRef<string | null>(null);
  const [launchInProgressProfileIds, setLaunchInProgressProfileIds] = useState<Set<string>>(() => new Set());
  const launchInProgressProfileIdsRef = useRef<Set<string>>(new Set());
  const [launchRecoveryProfileId, setLaunchRecoveryProfileId] = useState<string | null>(null);
  const [launchRecoveryAction, setLaunchRecoveryAction] = useState<LaunchRecoveryAction>("repair");
  const [joinRecoveryTarget, setJoinRecoveryTarget] = useState<JoinRecoveryTarget | null>(null);
  const [launchJavaRecoveryProfileId, setLaunchJavaRecoveryProfileId] = useState<string | null>(null);
  const [launchJavaRecoveryNeeded, setLaunchJavaRecoveryNeeded] = useState(false);
  const [sessionRecoveryProfileId, setSessionRecoveryProfileId] = useState<string | null>(null);
  const [sessionRecoveryNeeded, setSessionRecoveryNeeded] = useState(false);
  const [isNative, setIsNative] = useState(false);
  const [microsoftAuthFlow, setMicrosoftAuthFlow] = useState<MicrosoftAuthStart | null>(null);
  const [microsoftCallbackDraft, setMicrosoftCallbackDraft] = useState("");

  async function loadBootstrapSnapshot() {
    const data = await invoke<AppSnapshot>("bootstrap_snapshot");
    setSnapshot(data);
    setSettingsDraft(data.settings);
    setMinecraftSession(data.minecraftSession);
    setMinecraftAccounts(await loadMinecraftAccounts());
    setIsNative(true);
    return data;
  }

  async function loadMinecraftAccounts() {
    try {
      return await invoke<StoredMinecraftAccountSummary[]>("list_minecraft_accounts");
    } catch {
      return [];
    }
  }

  async function refreshMinecraftAccounts() {
    const accounts = await loadMinecraftAccounts();
    setMinecraftAccounts(accounts);
    setRemoveMinecraftAccountConfirmId((current) =>
      current && accounts.some((account) => account.accountId === current) ? current : null,
    );
    return accounts;
  }

  useEffect(() => {
    loadBootstrapSnapshot().catch((error) => {
      setActivity(nativeFailureActivity(error, "Native bootstrap failed"));
      setIsNative(false);
    });
  }, []);

  function reconcileCompletedLifecycleEvent(event: LauncherEvent) {
    if (!event.subjectId || !completedLifecycleMessage(event)) return;
    if (event.operation === "install_pack") {
      setInstallInProgressPackId((current) => (current === event.subjectId ? null : current));
      if (lifecycleActionInProgressRef.current === `install:${event.subjectId}`) {
        lifecycleActionInProgressRef.current = null;
        setLifecycleActionInProgressKey(null);
      }
      void loadBootstrapSnapshot().catch(() => undefined);
    } else if (event.operation === "repair_profile") {
      setRepairInProgressProfileId((current) => (current === event.subjectId ? null : current));
      if (lifecycleActionInProgressRef.current === `repair:${event.subjectId}`) {
        lifecycleActionInProgressRef.current = null;
        setLifecycleActionInProgressKey(null);
      }
      if (event.message === "Profile setup completed.") {
        setSetupInProgressProfileId((current) => (current === event.subjectId ? null : current));
        if (lifecycleActionInProgressRef.current === `setup:${event.subjectId}`) {
          lifecycleActionInProgressRef.current = null;
          setLifecycleActionInProgressKey(null);
        }
      }
      void loadBootstrapSnapshot().catch(() => undefined);
    } else if (event.operation === "delete_profile") {
      setDeleteInProgressProfileId((current) => (current === event.subjectId ? null : current));
      if (lifecycleActionInProgressRef.current === `delete:${event.subjectId}`) {
        lifecycleActionInProgressRef.current = null;
        setLifecycleActionInProgressKey(null);
      }
      void loadBootstrapSnapshot().catch(() => undefined);
    }
  }

  useEffect(() => {
    if (!isNative) return;
    let unlistenLauncherEvent: (() => void) | undefined;
    let unlistenManagedProcess: (() => void) | undefined;
    listen<LauncherEvent>("launcher-event", (event) => {
      setLauncherEvents((current) => mergeLauncherEvents(current, [event.payload]));
      reconcileCompletedLifecycleEvent(event.payload);
      setActivity(sidebarStatusMessage(event.payload, event.payload.message));
    }).then((cleanup) => {
      unlistenLauncherEvent = cleanup;
    });
    listen<ManagedProcessSummary>("managed-process", (event) => {
      setManagedProcesses((current) => upsertManagedProcessSummary(current, event.payload));
      void clearPlayingPresenceForExitedProcess(event.payload);
      setActivity(managedProcessActivitySummary(event.payload, snapshot.profiles));
    }).then((cleanup) => {
      unlistenManagedProcess = cleanup;
    });
    return () => {
      unlistenLauncherEvent?.();
      unlistenManagedProcess?.();
    };
  }, [isNative, snapshot.profiles]);

  useEffect(() => {
    if (!isNative) return;
    void initializeBackendService();
  }, [isNative]);

  useEffect(() => {
    if (!isNative) return;
    void checkForLauncherUpdate(true);
  }, [isNative]);

  useEffect(() => {
    devSessionCache.current = {};
  }, [backendStatus.healthUrl]);

  useEffect(() => {
    if (activeView !== "activity") return;
    void loadLauncherEvents();
    void loadManagedProcesses(true);
  }, [activeView]);

  useEffect(() => {
    if (activeView !== "home") return;
    void loadBackendPacks(true);
    void loadBackendPresence(true);
  }, [activeView, backendStatus.healthUrl]);

  useEffect(() => {
    if (activeView !== "friends") return;
    void loadBackendPresence(true);
  }, [activeView, backendStatus.healthUrl]);

  useEffect(() => {
    if (activeView !== "library") return;
    void loadMinecraftVersionsForProfileCreator();
  }, [activeView]);

  useEffect(() => {
    if (!presenceStreamUrl || typeof WebSocket === "undefined") return;
    const socket = new WebSocket(presenceStreamUrl);
    socket.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data) as PresenceUpdate;
        mergeBackendPresence([update]);
      } catch {
        // Ignore malformed preview/backend messages; the polling fallback remains available.
      }
    };
    return () => {
      socket.close();
    };
  }, [presenceStreamUrl]);

  const filteredPacks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return snapshot.packs;
    return snapshot.packs.filter((pack) => {
      return pack.name.toLowerCase().includes(q) || pack.tagline.toLowerCase().includes(q);
    });
  }, [query, snapshot.packs]);
  const filteredProfiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return snapshot.profiles;
    return snapshot.profiles.filter((profile) =>
      [
        profile.name,
        profile.gameVersion,
        profile.loader,
        profile.installedPackVersion,
        profile.defaultServer?.name,
        profile.defaultServer?.address,
      ].some((value) => value?.toLowerCase().includes(q)),
    );
  }, [query, snapshot.profiles]);

  const primaryPack = snapshot.packs[0];
  const hasProfiles = snapshot.profiles.length > 0;
  const primaryPackNeedsInstall =
    primaryPack?.status === "not_installed" ||
    primaryPack?.status === "update_available" ||
    primaryPack?.status === "installed";
  const primaryPackNeedsRepair = primaryPack?.status === "repair_needed";
  const primaryPackCanPlay = primaryPack?.status === "installed" || primaryPackNeedsRepair;
  const primaryPackIsInstalling = Boolean(primaryPack && installInProgressPackId === primaryPack.id);
  const primaryPackIsRepairing = Boolean(primaryPack && repairInProgressProfileId === primaryPack.id);
  const primaryPackHasActiveProcess = Boolean(primaryPack && activeProcessProfileIds.has(primaryPack.id));
  const lifecycleActionInProgress = Boolean(
    installInProgressPackId ||
      setupInProgressProfileId ||
      repairInProgressProfileId ||
      deleteInProgressProfileId ||
      lifecycleActionInProgressKey ||
      importInProgress ||
      managedJavaInstallInProgress ||
      launchInProgressProfileIds.size > 0,
  );
  const lifecycleActionLabel = installInProgressPackId
    ? "Installing..."
    : setupInProgressProfileId
      ? "Setting up..."
    : repairInProgressProfileId
      ? "Setting up..."
      : deleteInProgressProfileId
        ? "Deleting..."
        : importInProgress
          ? "Importing..."
          : managedJavaInstallInProgress
            ? "Installing Java..."
            : launchInProgressProfileIds.size > 0
              ? "Launching..."
              : "Busy";
  const beginProfileLaunch = (profileId: string) => {
    const next = new Set(launchInProgressProfileIdsRef.current);
    next.add(profileId);
    launchInProgressProfileIdsRef.current = next;
    setLaunchInProgressProfileIds(next);
  };
  const endProfileLaunch = (profileId: string) => {
    const next = new Set(launchInProgressProfileIdsRef.current);
    next.delete(profileId);
    launchInProgressProfileIdsRef.current = next;
    setLaunchInProgressProfileIds(next);
  };
  const profileLifecycleInProgress = (profileId?: string | null) =>
    Boolean(
      profileId &&
        (installInProgressPackId === profileId ||
          setupInProgressProfileId === profileId ||
          repairInProgressProfileId === profileId ||
          deleteInProgressProfileId === profileId ||
          launchInProgressProfileIds.has(profileId) ||
          lifecycleActionInProgressKey?.endsWith(`:${profileId}`)),
    );
  const profileLifecycleLabel = (profileId?: string | null) => {
    if (!profileId) return lifecycleActionLabel;
    if (installInProgressPackId === profileId) return "Installing...";
    if (setupInProgressProfileId === profileId) return "Setting up...";
    if (repairInProgressProfileId === profileId) return "Setting up...";
    if (deleteInProgressProfileId === profileId) return "Deleting...";
    if (profileId && launchInProgressProfileIds.has(profileId)) return "Launching...";
    return lifecycleActionLabel;
  };
  const primaryPackLifecycleBlocked = Boolean(primaryPack && profileLifecycleInProgress(primaryPack.id));
  const PrimaryPackActionIcon = primaryPack ? (primaryPackCanPlay ? Play : Download) : Gamepad2;
  const PrimaryPackSecondaryIcon = Search;
  const primaryPackSecondaryLabel = primaryPack ? "Details" : "Discover packs";
  const selectedPackDetails = selectedPackDetailsId
    ? snapshot.packs.find((pack) => pack.id === selectedPackDetailsId)
    : undefined;
  const primaryPackActionLabel = primaryPack
    ? primaryPackHasActiveProcess
      ? "Running"
      : primaryPackCanPlay
        ? "Play"
        : primaryPackIsInstalling
          ? primaryPack.status === "update_available"
            ? "Updating..."
            : "Installing..."
          : statusLabel(primaryPack.status)
    : "Create profile";
  const latestLauncherEvent = launcherOperationSummaries[0]?.latestEvent;
  const sidebarDownloadEvent = latestActiveDownloadEvent(launcherEvents);
  const sidebarActiveOperationEvent = launcherOperationSummaries.find(
    (operation) =>
      typeof operation.progressPercent === "number" &&
      operation.progressPercent >= 0 &&
      operation.progressPercent < 100 &&
      operation.latestEvent.operation !== "download_artifacts" &&
      operation.latestEvent.kind !== "completed" &&
      operation.latestEvent.kind !== "failed",
  )?.latestEvent;
  const sidebarProgressEvent = sidebarDownloadEvent ?? sidebarActiveOperationEvent;
  const sidebarProgressPercent = sidebarProgressEvent?.progressPercent;
  const sidebarProgressVisible =
    typeof sidebarProgressPercent === "number" && sidebarProgressPercent >= 0 && sidebarProgressPercent < 100;
  const sidebarProgressWidth = sidebarProgressVisible ? Math.max(6, sidebarProgressPercent) : 0;
  const latestOperationQuickLabel = lifecycleActionInProgress
    ? lifecycleActionLabel
    : latestLauncherEvent
      ? `${operationLabelForMessage(latestLauncherEvent.operation, latestLauncherEvent.message)} - ${latestLauncherEvent.kind}`
      : "No operation yet";
  const processQuickLabel =
    activeManagedProcessCount === 0
      ? "No active process"
      : activeManagedProcessCount === 1
        ? "1 active process"
        : `${activeManagedProcessCount} active processes`;
  const activeSocialAccountId =
    minecraftSession && storedMinecraftSessionCanAuthenticate(minecraftSession)
      ? minecraftSession.session.uuid
      : previewAccountId;
  const playingFriends = snapshot.friends.filter((friend) => friend.state === "playing");
  const nonPlayingFriendCount = snapshot.friends.length - playingFriends.length;
  const heroEyebrow = playingFriends.length > 0 ? "Friends are playing" : "Ready to play";
  const visibleFriends = snapshot.friends.filter(
    (friend) => !blockedAccounts.some((blocked) => blocked.id === friend.id),
  );

  function previewFriendSearchResults(queryText: string): AccountSearchResult[] {
    const query = queryText.trim().toLowerCase();
    if (query.length < 2) return [];
    const seededAccounts = [
      ...snapshot.friends.map((friend) => ({
        accountId: friend.id,
        minecraftUuid: friend.id,
        minecraftName: friend.name,
      })),
      ...friendRequests.map((request) => ({
        accountId: request.id,
        minecraftUuid: request.id,
        minecraftName: request.name,
      })),
    ];
    return seededAccounts
      .filter((account) => account.minecraftName.toLowerCase().includes(query))
      .filter((account, index, accounts) => {
        return accounts.findIndex((item) => item.minecraftName.toLowerCase() === account.minecraftName.toLowerCase()) === index;
      })
      .slice(0, 6);
  }

  async function searchFriendAccounts() {
    const name = friendSearchDraft.trim();
    if (name.length < 2) {
      setFriendSearchResults([]);
      setFriendSearchStatus("Enter at least 2 characters");
      return;
    }

    setActivity(`Searching for ${name}`);
    try {
      const response = await fetchWithDevSession(
        previewAccountId,
        `${socialBackendOrigin(backendStatus.healthUrl)}/accounts/search?minecraftName=${encodeURIComponent(name)}`,
      );
      if (!response.ok) throw new Error(`Search failed with ${response.status}`);
      const results = (await response.json()) as AccountSearchResult[];
      setFriendSearchResults(results);
      setFriendSearchStatus(results.length === 1 ? "Found 1 account" : `Found ${results.length} accounts`);
      setActivity(results.length === 0 ? `No accounts found for ${name}` : `Found ${results.length} account matches`);
    } catch {
      const results = previewFriendSearchResults(name);
      setFriendSearchResults(results);
      setFriendSearchStatus(
        results.length === 0
          ? "No preview matches"
          : results.length === 1
            ? "Found 1 preview match"
            : `Found ${results.length} preview matches`,
      );
      setActivity("Friend search is using preview roster data");
    }
  }

  async function loadBackendPacks(silent = false) {
    if (!silent) setActivity("Loading pack catalog");
    try {
      const response = await fetchWithTimeout(`${socialBackendOrigin(backendStatus.healthUrl)}/packs`);
      if (!response.ok) throw new Error(`Pack catalog failed with ${response.status}`);
      const packs = (await response.json()) as PackSummary[];
      setSnapshot((current) => ({
        ...current,
        packs: mergeBackendPacksWithLocalState(current.packs, packs),
      }));
      if (!silent) {
        setActivity(packs.length === 1 ? "Loaded 1 backend pack" : `Loaded ${packs.length} backend packs`);
      }
    } catch {
      if (!silent) setActivity("Pack catalog is using preview data");
    }
  }

  async function loadBackendPackDetails(packId: string) {
    setSelectedPackDetailsId(packId);
    setActivity("Loading pack details");
    try {
      const response = await fetchWithTimeout(`${socialBackendOrigin(backendStatus.healthUrl)}/packs/${encodeURIComponent(packId)}`);
      if (!response.ok) throw new Error(`Pack details failed with ${response.status}`);
      const pack = (await response.json()) as PackSummary;
      setSnapshot((current) => ({
        ...current,
        packs: current.packs.some((item) => item.id === pack.id)
          ? current.packs.map((item) => (item.id === pack.id ? mergeBackendPackWithLocalState(item, pack) : item))
          : [pack, ...current.packs],
      }));
      setActivity(`Loaded ${pack.name} details`);
    } catch {
      setActivity("Pack details are using preview data");
    }
  }

  async function loadBackendPresence(silent = false) {
    if (!silent) setActivity("Loading friend presence");
    try {
      const response = await fetchWithDevSession(activeSocialAccountId, `${socialBackendOrigin(backendStatus.healthUrl)}/presence`);
      if (!response.ok) throw new Error(`Presence failed with ${response.status}`);
      const presence = (await response.json()) as PresenceUpdate[];
      replaceBackendPresence(presence);
      const session = await issueDevSession(activeSocialAccountId);
      setPresenceStreamUrl(socialBackendPresenceWebSocketUrl(backendStatus.healthUrl, session.accessToken));
      if (!silent) {
        setActivity(presence.length === 1 ? "Loaded 1 presence update" : `Loaded ${presence.length} presence updates`);
      }
    } catch {
      setPresenceStreamUrl(null);
      if (!silent) setActivity("Friend presence is using preview data");
    }
  }

  function replaceBackendPresence(presence: PresenceUpdate[]) {
    setSnapshot((current) => ({
      ...current,
      friends: visibleBackendPresence(presence).map((update) => friendFromPresenceUpdate(update, current.friends, current.packs)),
    }));
  }

  function mergeBackendPresence(presence: PresenceUpdate[]) {
    setSnapshot((current) => ({
      ...current,
      friends: [
        ...current.friends.filter((friend) => !presence.some((update) => update.accountId === friend.id)),
        ...visibleBackendPresence(presence).map((update) => friendFromPresenceUpdate(update, current.friends, current.packs)),
      ],
    }));
  }

  function visibleBackendPresence(presence: PresenceUpdate[]) {
    return presence.filter((update) => {
      if (update.accountId === activeSocialAccountId) return false;
      return !(minecraftSession && update.accountId === previewAccountId);
    });
  }

  function mergeLocalPresence(payload: PresencePayload) {
    setSnapshot((current) => {
      const pack = current.packs.find((item) => item.id === payload.packId);
      const serverName = payload.serverId ?? pack?.defaultServer;
      const localPresence: FriendPresence = {
        id: activeSocialAccountId,
        name: current.settings.offlineUsername || "You",
        avatarColor: "#67e8f9",
        state: payload.state,
        packName: pack?.name ?? payload.packId,
        serverName,
        joinable: false,
      };
      return {
        ...current,
        friends: [
          localPresence,
          ...current.friends.filter((friend) => friend.id !== activeSocialAccountId),
        ],
      };
    });
  }

  async function publishBackendPresence(payload: PresencePayload) {
    const response = await fetchWithDevSession(activeSocialAccountId, `${socialBackendOrigin(backendStatus.healthUrl)}/presence/${activeSocialAccountId}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Presence update failed with ${response.status}`);
    mergeLocalPresence(payload);
  }

  async function clearPlayingPresenceForExitedProcess(process: ManagedProcessSummary) {
    if (process.state !== "exited") return;
    if (clearedPresenceProcessIds.current.has(process.id)) return;
    const profileId = managedProcessProfileId(process);
    if (!profileId) return;
    clearedPresenceProcessIds.current.add(process.id);
    await publishBackendPresence({ state: "online" }).catch(() => undefined);
  }

  async function issueMinecraftBackendSession() {
    const storedSession = minecraftSession;
    if (!storedSession) return null;
    if (isNative) {
      if (!storedMinecraftSessionCanAuthenticate(storedSession)) return null;
    } else if (!storedMinecraftSessionUsable(storedSession)) {
      return null;
    }
    const accountId = storedSession.session.uuid;
    if (isNative) {
      try {
        return await invoke<DevSessionResponse>("exchange_stored_minecraft_session_for_backend_session", {
          accountId,
          healthUrl: backendStatus.healthUrl,
        });
      } catch (error) {
        const message = nativeFailureActivity(error, "");
        if (sessionFailureNeedsSignIn(message)) {
          markStoredSessionNeedsSignIn();
          setActivity(message);
        }
        return null;
      }
    }
    const payload: MinecraftSessionExchangeRequest = {
      minecraftUuid: storedSession.session.uuid,
      minecraftName: storedSession.session.username,
      accessToken: storedSession.session.accessToken,
      expiresAtUnixSeconds: storedSession.expiresAtUnixSeconds,
    };
    const response = await fetchWithTimeout(`${socialBackendOrigin(backendStatus.healthUrl)}/sessions/minecraft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return null;
    return (await response.json()) as DevSessionResponse;
  }

  async function validateCachedBackendSession(accountId: string, session: DevSessionResponse) {
    if (!devSessionUsable(session)) return false;
    try {
      const response = await fetchWithTimeout(`${socialBackendOrigin(backendStatus.healthUrl)}/sessions/current`, {
        method: "GET",
        headers: withAuthorizationHeader(undefined, session.authorizationHeader),
      });
      if (!response.ok) return false;
      const current = (await response.json()) as CurrentSessionResponse;
      return (
        current.accountId === accountId &&
        current.tokenType.toLowerCase() === "bearer" &&
        typeof current.secondsRemaining === "number" &&
        current.secondsRemaining > 30 &&
        (current.sessionKind !== "minecraft" || backendMinecraftSessionMatchesStoredSession(current, minecraftSession))
      );
    } catch {
      return false;
    }
  }

  async function issueDevSession(accountId: string) {
    const cached = devSessionCache.current[accountId];
    if (
      cached &&
      !backendSessionShouldUpgradeToMinecraft(cached, minecraftSession) &&
      (await validateCachedBackendSession(accountId, cached))
    ) {
      return cached;
    }
    if (cached) {
      delete devSessionCache.current[accountId];
    }

    const session =
      (await issueMinecraftBackendSession()) ??
      (await (async () => {
        const response = await fetchWithTimeout(`${socialBackendOrigin(backendStatus.healthUrl)}/dev/sessions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ accountId }),
        });
        if (!response.ok) throw new Error(`Dev session failed with ${response.status}`);
        return (await response.json()) as DevSessionResponse;
      })());
    if (devSessionUsable(session)) {
      devSessionCache.current[accountId] = session;
    } else {
      delete devSessionCache.current[accountId];
    }
    return session;
  }

  async function fetchWithDevSession(accountId: string, url: string, init: RequestInit = {}) {
    const session = await issueDevSession(accountId);
    const response = await fetchWithTimeout(url, {
      ...init,
      headers: withAuthorizationHeader(init.headers, session.authorizationHeader),
    });
    if (response.status !== 401) return response;

    delete devSessionCache.current[accountId];
    const refreshed = await issueDevSession(accountId);
    return fetchWithTimeout(url, {
      ...init,
      headers: withAuthorizationHeader(init.headers, refreshed.authorizationHeader),
    });
  }

  function withAuthorizationHeader(headers: RequestInit["headers"], authorizationHeader: string) {
    const next = new Headers(headers);
    next.set("authorization", authorizationHeader);
    return next;
  }

  async function createBackendFriendRequest(targetAccountId: string) {
    const response = await fetchWithDevSession(
      activeSocialAccountId,
      `${socialBackendOrigin(backendStatus.healthUrl)}/friends/${activeSocialAccountId}/requests`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ targetAccountId }),
      },
    );
    if (!response.ok) throw new Error(`Friend request failed with ${response.status}`);
  }

  async function acceptBackendFriendRequest(requesterAccountId: string) {
    const response = await fetchWithDevSession(
      activeSocialAccountId,
      `${socialBackendOrigin(backendStatus.healthUrl)}/friends/${activeSocialAccountId}/requests/${requesterAccountId}/accept`,
      {
        method: "POST",
      },
    );
    if (!response.ok) throw new Error(`Friend acceptance failed with ${response.status}`);
  }

  async function blockBackendAccount(targetAccountId: string) {
    const response = await fetchWithDevSession(activeSocialAccountId, `${socialBackendOrigin(backendStatus.healthUrl)}/blocks/${activeSocialAccountId}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ targetAccountId }),
    });
    if (!response.ok) throw new Error(`Block failed with ${response.status}`);
  }

  async function unblockBackendAccount(targetAccountId: string) {
    const response = await fetchWithDevSession(
      activeSocialAccountId,
      `${socialBackendOrigin(backendStatus.healthUrl)}/blocks/${activeSocialAccountId}/${targetAccountId}`,
      {
        method: "DELETE",
      },
    );
    if (!response.ok) throw new Error(`Unblock failed with ${response.status}`);
  }

  async function muteBackendAccount(targetAccountId: string) {
    const response = await fetchWithDevSession(activeSocialAccountId, `${socialBackendOrigin(backendStatus.healthUrl)}/mutes/${activeSocialAccountId}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ targetAccountId }),
    });
    if (!response.ok) throw new Error(`Mute failed with ${response.status}`);
  }

  async function unmuteBackendAccount(targetAccountId: string) {
    const response = await fetchWithDevSession(
      activeSocialAccountId,
      `${socialBackendOrigin(backendStatus.healthUrl)}/mutes/${activeSocialAccountId}/${targetAccountId}`,
      {
        method: "DELETE",
      },
    );
    if (!response.ok) throw new Error(`Unmute failed with ${response.status}`);
  }

  async function requestFriendBySearchResult(result: AccountSearchResult) {
    await queueFriendRequest(result.accountId, result.minecraftName);
  }

  async function queueFriendRequest(id: string, name: string) {
    if (
      snapshot.friends.some((friend) => friend.name.toLowerCase() === name.toLowerCase()) ||
      friendRequests.some((request) => request.name.toLowerCase() === name.toLowerCase())
    ) {
      setActivity(`${name} is already in your social roster`);
      return;
    }
    setActivity(`Sending friend request to ${name}`);
    try {
      await createBackendFriendRequest(previewUuidForSocialId(id));
      setActivity(`Friend request sent to ${name}`);
    } catch {
      setActivity(`Friend request queued for ${name}`);
    }
    setFriendRequests((current) => [...current, { id, name, status: "pending_outbound" }]);
    setFriendSearchDraft("");
    setFriendSearchResults([]);
    setFriendSearchStatus("Friend request queued");
  }

  async function addFriendRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = friendSearchDraft.trim();
    if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || `friend-${Date.now()}`;
    await queueFriendRequest(id, name);
  }

  async function acceptFriendRequest(request: FriendRequestSummary) {
    setActivity(`Accepting friend request from ${request.name}`);
    try {
      await acceptBackendFriendRequest(previewUuidForSocialId(request.id));
      setActivity(`${request.name} added as a friend`);
    } catch {
      setActivity(`${request.name} added as a friend`);
    }
    setFriendRequests((current) => current.filter((item) => item.id !== request.id));
    setSnapshot((current) => ({
      ...current,
      friends: [
        ...current.friends,
        {
          id: request.id,
          name: request.name,
          avatarColor: "#c4b5fd",
          state: "online",
          joinable: false,
        },
      ],
    }));
  }

  function cancelFriendRequest(requestId: string) {
    setFriendRequests((current) => current.filter((request) => request.id !== requestId));
    setActivity("Friend request removed");
  }

  async function blockAccount(account: { id: string; name: string }) {
    setActivity(`Blocking ${account.name}`);
    try {
      await blockBackendAccount(previewUuidForSocialId(account.id));
      setActivity(`${account.name} blocked`);
    } catch {
      setActivity(`${account.name} blocked`);
    }
    setBlockedAccounts((current) =>
      current.some((blocked) => blocked.id === account.id)
        ? current
        : [...current, { id: account.id, name: account.name }],
    );
    setFriendRequests((current) => current.filter((request) => request.id !== account.id));
  }

  async function unblockAccount(accountId: string) {
    setActivity("Unblocking account");
    try {
      await unblockBackendAccount(previewUuidForSocialId(accountId));
      setActivity("Account unblocked");
    } catch {
      setActivity("Account unblocked");
    }
    setBlockedAccounts((current) => current.filter((account) => account.id !== accountId));
  }

  async function muteAccount(account: { id: string; name: string }) {
    setActivity(`Muting ${account.name}`);
    try {
      await muteBackendAccount(previewUuidForSocialId(account.id));
      setActivity(`${account.name} muted`);
    } catch {
      setActivity(`${account.name} muted`);
    }
    setMutedAccounts((current) =>
      current.some((muted) => muted.id === account.id)
        ? current
        : [...current, { id: account.id, name: account.name }],
    );
  }

  async function unmuteAccount(account: { id: string; name: string }) {
    setActivity(`Unmuting ${account.name}`);
    try {
      await unmuteBackendAccount(previewUuidForSocialId(account.id));
      setActivity(`${account.name} unmuted`);
    } catch {
      setActivity(`${account.name} unmuted`);
    }
    setMutedAccounts((current) => current.filter((muted) => muted.id !== account.id));
  }

  function serverTargetForFriend(friend: FriendPresence): ServerLaunchTarget | null {
    if (!friend.serverName) return null;
    const serverAddresses: Record<string, ServerLaunchTarget> = {
      "The Cabin": { name: "The Cabin", address: "play.theboys.example", port: 25565 },
      Survival: { name: "Survival", address: "survival.theboys.example", port: 25565 },
    };
    return serverAddresses[friend.serverName] ?? { name: friend.serverName, address: friend.serverName };
  }

  function packIdForPresence(packNameOrId?: string) {
    if (!packNameOrId) return "winterpack";
    const normalized = packNameOrId.trim().toLowerCase();
    const pack = snapshot.packs.find((item) => {
      return item.id.toLowerCase() === normalized || item.name.toLowerCase() === normalized;
    });
    return pack?.id ?? normalized.replace(/[^a-z0-9]+/g, "-");
  }

  function friendProfileId(friend: FriendPresence) {
    return packIdForPresence(friend.packName);
  }

  function friendHasActiveProfileProcess(friend: FriendPresence) {
    return activeProcessProfileIds.has(friendProfileId(friend));
  }

  function launchCommandName() {
    return storedMinecraftSessionCanAuthenticate(minecraftSession) ? "start_stored_authenticated_launch_process" : "start_launch_process";
  }

  function serverLaunchCommandName() {
    return storedMinecraftSessionCanAuthenticate(minecraftSession)
      ? "start_stored_authenticated_launch_process"
      : "start_launch_process_for_server";
  }

  function inspectLaunchCommandName() {
    return storedMinecraftSessionCanAuthenticate(minecraftSession)
      ? "build_stored_authenticated_launch_command"
      : "build_launch_command";
  }

  function nativeFailureActivity(error: unknown, fallback: string) {
    if (!isNative) return fallback;
    const message = error instanceof Error ? error.message : String(error || "");
    return userFacingNativeErrorMessage(message).trim() || fallback;
  }

  function launchFailureNeedsRepair(message: string) {
    return /install or repair|launch artifacts? (is|are) missing|asset index is missing|natives directory is missing|game files are missing|missing files/i.test(message);
  }

  function completedLifecycleEventCanLaunch(event: LauncherEvent) {
    if (event.kind !== "completed") return false;
    if (event.operation === "install_pack") {
      return /pack (installed|updated|reinstalled) successfully/i.test(event.message);
    }
    if (event.operation === "repair_profile") {
      return /profile (repair|setup) completed/i.test(event.message);
    }
    return false;
  }

  function lifecycleEventLaunchTarget(event: LauncherEvent) {
    if (!completedLifecycleEventCanLaunch(event) || !event.subjectId) return undefined;
    const profile = snapshot.profiles.find((candidate) => candidate.id === event.subjectId);
    if (profile) {
      return { id: profile.id, name: profile.name };
    }
    const pack = snapshot.packs.find((candidate) => candidate.id === event.subjectId);
    return { id: event.subjectId, name: pack?.name ?? event.subjectId };
  }

  function launchFailureNeedsJava(message: string) {
    return /requires Java \d+ or newer|Install a managed Java runtime from Settings|Preparing (?:Java(?: \d+)?|the right Java) automatically/i.test(
      message,
    );
  }

  function requiredJavaMajorVersionFromLaunchFailure(message: string) {
    const match = /requires Java (\d+) or newer/i.exec(message);
    return match ? Number(match[1]) : 21;
  }

  function sessionFailureNeedsSignIn(message: string) {
    return /stored Minecraft session has expired|no stored Minecraft session|does not include a Microsoft refresh token|Microsoft token exchange failed|invalid_grant|refresh token|sign in again/i.test(
      message,
    );
  }

  function markStoredSessionNeedsSignIn(profileId?: string) {
    setMinecraftSession(undefined);
    setSnapshot((current) => ({ ...current, minecraftSession: undefined }));
    setSessionRecoveryProfileId(profileId ?? null);
    setSessionRecoveryNeeded(true);
  }

  function clearRecoveryForProfile(profileId: string) {
    setLaunchRecoveryProfileId((current) => (current === profileId ? null : current));
    setLaunchRecoveryAction("repair");
    setJoinRecoveryTarget((current) => (current?.profileId === profileId ? null : current));
    setLaunchJavaRecoveryProfileId((current) => (current === profileId ? null : current));
    setSessionRecoveryProfileId((current) => (current === profileId ? null : current));
  }

  async function openJavaRuntimeSettings() {
    setActiveView("settings");
    setShowAdvancedSettings(true);
    const [manifest] = await Promise.all([
      loadRecommendedJavaRuntimes().catch(() => []),
      discoverJava().catch(() => undefined),
    ]);
    const recommended = selectRecommendedJavaRuntime(manifest, 21);
    if (recommended) {
      applyRecommendedJavaRuntime(recommended);
    }
  }

  async function showLaunchedProcess(process: ManagedProcessSummary) {
    clearedPresenceProcessIds.current.delete(process.id);
    recentLaunchedProcesses.current[process.id] = {
      process,
      expiresAt: Date.now() + 5_000,
    };
    setManagedProcesses((current) => upsertManagedProcessSummary(current, process));
    await loadManagedProcesses(true).catch(() => undefined);
    setManagedProcesses((current) =>
      current.some((candidate) => candidate.id === process.id)
        ? current
        : upsertManagedProcessSummary(current, process),
    );
  }

  async function launchProfile(
    profileId: string | undefined,
    profileName?: string,
    options?: { repairAttempted?: boolean; javaAttempted?: boolean },
  ) {
    if (!profileId) {
      setActivity("Choose a profile before launching");
      return;
    }
    if (profileLifecycleInProgress(profileId) || launchInProgressProfileIdsRef.current.has(profileId)) {
      setActivity("Wait for this profile to finish its current launcher operation before launching");
      return;
    }
    const knownPack = snapshot.packs.find((pack) => pack.id === profileId);
    if (knownPack?.status === "repair_needed" && !options?.repairAttempted) {
      setActivity(`Setting up files for ${knownPack.name} before launch`);
      const repaired = await repairProfile(profileId);
      if (!repaired) return;
      await launchProfile(profileId, profileName, { ...options, repairAttempted: true });
      return;
    }
    const authenticated = storedMinecraftSessionCanAuthenticate(minecraftSession);
    setActivity(authenticated ? "Launching authenticated profile" : "Launching profile");
    let launchStarted = false;
    let shouldAutoRepairAndLaunch = false;
    let shouldAutoInstallJavaAndLaunch = false;
    let javaFailureMessage = "";
    beginProfileLaunch(profileId);
    try {
      setLaunchRecoveryProfileId(null);
      setLaunchRecoveryAction("repair");
      setJoinRecoveryTarget(null);
      setLaunchJavaRecoveryProfileId(null);
      setSessionRecoveryProfileId(null);
      setLaunchJavaRecoveryNeeded(false);
      const process = await invoke<ManagedProcessSummary>(launchCommandName(), { profileId });
      launchStarted = true;
      setSessionRecoveryNeeded(false);
      if (isNative) {
        await showLaunchedProcess(process);
        await loadLauncherEvents(true).catch(() => undefined);
        setActiveView("activity");
        setActivityMode("processes");
        setProcessAutoRefresh(true);
      }
      setActivity(managedProcessActivitySummary(process, snapshot.profiles));
    } catch (error) {
      const message = nativeFailureActivity(
        error,
        authenticated
          ? "Authenticated launch is mocked in web preview"
          : "Launching profile is mocked in web preview",
      );
      const needsJava = launchFailureNeedsJava(message);
      const needsSignIn = authenticated && sessionFailureNeedsSignIn(message);
      shouldAutoInstallJavaAndLaunch = needsJava && !options?.javaAttempted;
      javaFailureMessage = message;
      if (needsSignIn) {
        markStoredSessionNeedsSignIn(profileId);
      }
      setLaunchJavaRecoveryNeeded(needsJava && !shouldAutoInstallJavaAndLaunch);
      setLaunchJavaRecoveryProfileId(needsJava && !shouldAutoInstallJavaAndLaunch ? profileId : null);
      const needsRepair = !needsJava && !needsSignIn && launchFailureNeedsRepair(message);
      setLaunchRecoveryAction(needsRepair ? "repair_and_launch" : "repair");
      setJoinRecoveryTarget(null);
      setLaunchRecoveryProfileId(needsRepair ? profileId : null);
      shouldAutoRepairAndLaunch = needsRepair && !options?.repairAttempted;
      if (isNative) {
        await loadLauncherEvents(true).catch(() => undefined);
        setActiveView("activity");
        setActivityMode("overview");
      }
      setActivity(
        shouldAutoInstallJavaAndLaunch
          ? "Installing the right Java for this Minecraft version"
          : shouldAutoRepairAndLaunch
            ? "Setting up missing files before launch"
            : message,
      );
      launchStarted = !isNative;
    } finally {
      endProfileLaunch(profileId);
    }
    if (shouldAutoInstallJavaAndLaunch) {
      const javaReady = await installManagedJavaForLaunch(javaFailureMessage);
      if (javaReady) {
        await launchProfile(profileId, profileName, { ...options, javaAttempted: true });
      } else {
        setLaunchJavaRecoveryNeeded(true);
        setLaunchJavaRecoveryProfileId(profileId);
      }
      return;
    }
    if (shouldAutoRepairAndLaunch) {
      await repairProfileAndLaunch(profileId, profileName, true);
      return;
    }
    if (!launchStarted) return;
    if (isNative) {
      await loadBootstrapSnapshot().catch(() => undefined);
    }
    try {
      await publishBackendPresence({ state: "playing", packId: profileId });
      setActivity(`Presence shared for ${profileName ?? profileId}`);
    } catch {
      // Presence sharing is best-effort; launching should not fail when social is unavailable.
    }
  }

  async function ensurePackReadyBeforeJoin(profileId: string, friend: FriendPresence): Promise<boolean> {
    const pack = snapshot.packs.find((candidate) => candidate.id === profileId);
    if (!pack || pack.status === "installed") return true;

    if (pack.status === "repair_needed") {
      setActivity(`Setting up files for ${pack.name} before joining ${friend.name}`);
      return repairProfile(profileId);
    }

    if (pack.status === "not_installed" || pack.status === "update_available") {
      setActivity(`${packActionProgressLabel(pack.status)} before joining ${friend.name}`);
      return installPack(profileId);
    }

    return true;
  }

  async function joinFriend(friend: FriendPresence) {
    const server = serverTargetForFriend(friend);
    if (!server) {
      setActivity(`${friend.name} is not on a joinable server`);
      return;
    }
    const profileId = packIdForPresence(friend.packName);
    if (activeProcessProfileIds.has(profileId)) {
      setActiveView("activity");
      setActivityMode("processes");
      setProcessAutoRefresh(true);
      setActivity(`${friend.packName ?? profileId} is already running; stop it before joining ${friend.name}`);
      return;
    }
    if (profileLifecycleInProgress(profileId) || launchInProgressProfileIdsRef.current.has(profileId)) {
      setActivity("Wait for this profile to finish its current launcher operation before joining");
      return;
    }
    beginProfileLaunch(profileId);
    const packReady = await ensurePackReadyBeforeJoin(profileId, friend);
    if (!packReady) {
      endProfileLaunch(profileId);
      return;
    }
    const authenticated = storedMinecraftSessionCanAuthenticate(minecraftSession);
    setActivity(
      authenticated
        ? `Joining ${friend.name} with stored session`
        : `Joining ${friend.name} on ${server.name ?? server.address}`,
    );
    let launchStarted = false;
    let shouldAutoRepairAndJoin: JoinRecoveryTarget | null = null;
    try {
      setLaunchRecoveryProfileId(null);
      setLaunchRecoveryAction("repair");
      setJoinRecoveryTarget(null);
      setLaunchJavaRecoveryProfileId(null);
      setSessionRecoveryProfileId(null);
      setLaunchJavaRecoveryNeeded(false);
      const process = await invoke<ManagedProcessSummary>(serverLaunchCommandName(), {
        profileId,
        server,
      });
      launchStarted = true;
      setSessionRecoveryNeeded(false);
      if (isNative) {
        await showLaunchedProcess(process);
        await loadLauncherEvents(true).catch(() => undefined);
        setActiveView("activity");
        setActivityMode("processes");
        setProcessAutoRefresh(true);
      }
      setActivity(authenticated ? `Authenticated join queued` : `Joining ${server.name ?? server.address}`);
    } catch (error) {
      const message = nativeFailureActivity(
        error,
        authenticated
          ? "Authenticated friend join is mocked in web preview"
          : "Joining friend is mocked in web preview",
      );
      const needsJava = launchFailureNeedsJava(message);
      const needsSignIn = authenticated && sessionFailureNeedsSignIn(message);
      if (needsSignIn) {
        markStoredSessionNeedsSignIn(profileId);
      }
      setLaunchJavaRecoveryNeeded(needsJava);
      setLaunchJavaRecoveryProfileId(needsJava ? profileId : null);
      const needsRepair = !needsJava && !needsSignIn && launchFailureNeedsRepair(message);
      setLaunchRecoveryAction(needsRepair ? "repair_and_join" : "repair");
      const recoveryTarget = needsRepair
        ? {
            profileId,
            profileName: friend.packName,
            server,
            serverLabel: server.name ?? server.address,
          }
        : null;
      setJoinRecoveryTarget(recoveryTarget);
      setLaunchRecoveryProfileId(needsRepair ? profileId : null);
      shouldAutoRepairAndJoin = recoveryTarget;
      if (isNative) {
        await loadLauncherEvents(true).catch(() => undefined);
        setActiveView("activity");
        setActivityMode("overview");
      }
      setActivity(shouldAutoRepairAndJoin ? "Setting up missing files before joining" : message);
      launchStarted = !isNative;
    } finally {
      endProfileLaunch(profileId);
    }
    if (shouldAutoRepairAndJoin) {
      await repairProfileAndJoin(shouldAutoRepairAndJoin);
      return;
    }
    if (!launchStarted) return;
    if (isNative) {
      await loadBootstrapSnapshot().catch(() => undefined);
    }
    try {
      await publishBackendPresence({
        state: "playing",
        packId: profileId,
        serverId: friend.serverName ?? server.name ?? server.address,
      });
      setActivity(`Presence shared for ${server.name ?? server.address}`);
    } catch {
      // Presence sharing is best-effort; joining should not fail when social is unavailable.
    }
  }

  async function runNativeAction(label: string, command: string, payload?: Record<string, unknown>) {
    setActivity(label);
    try {
      await invoke(command, payload);
      setActivity(`${label} queued`);
    } catch (error) {
      setActivity(nativeFailureActivity(error, `${label} is mocked in web preview`));
    }
  }

  async function installPack(packId: string): Promise<boolean> {
    if (lifecycleActionInProgress || lifecycleActionInProgressRef.current) return false;
    const pack = snapshot.packs.find((candidate) => candidate.id === packId);
    const progressLabel = packActionProgressLabel(pack?.status ?? "not_installed");
    const operationKey = `install:${packId}`;
    lifecycleActionInProgressRef.current = operationKey;
    setLifecycleActionInProgressKey(operationKey);
    setInstallInProgressPackId(packId);
    setActivity(progressLabel);
    try {
      const plan = await invoke<OperationPlan>("plan_install_pack", { packId });
      const finalEvent = plan.events[plan.events.length - 1];
      setLauncherEvents((current) =>
        mergeLauncherEvents(current, [
          ...launcherEventsFromOperationPlan(plan),
          launcherOperationActiveEvent(plan, `${progressLabel} is running`),
        ]),
      );
      setActivity(finalEvent?.message ?? `${progressLabel} plan ready`);
      setActiveView("activity");
      setActivityMode("events");
      const receipt = await invoke<ActionReceipt>("install_pack", { packId });
      await loadBootstrapSnapshot();
      await loadLauncherEvents();
      setActiveView("activity");
      setActivityMode("events");
      setLaunchRecoveryProfileId((current) => (current === packId ? null : current));
      setLaunchRecoveryAction("repair");
      setJoinRecoveryTarget((current) => (current?.profileId === packId ? null : current));
      setActivity(userFacingLauncherEventMessage(receipt.message));
      return true;
    } catch (error) {
      if (isNative) {
        await loadLauncherEvents(true).catch(() => undefined);
        setActiveView("activity");
        setActivityMode("events");
      }
      setActivity(nativeFailureActivity(error, `${progressLabel} is mocked in web preview`));
      return !isNative;
    } finally {
      if (lifecycleActionInProgressRef.current === operationKey) {
        lifecycleActionInProgressRef.current = null;
        setLifecycleActionInProgressKey(null);
      }
      setInstallInProgressPackId(null);
    }
  }

  async function startMicrosoftLogin() {
    setActivity("Starting Microsoft login");
    try {
      const flow = await invoke<MicrosoftAuthStart>("start_microsoft_auth_flow");
      setMicrosoftAuthFlow(flow);
      const callbackPromise = invoke<StoredMinecraftSession>("complete_microsoft_login_with_local_callback", { flow });
      if (isNative) {
        await invoke("open_microsoft_auth_url", { authUrl: flow.authUrl });
      } else {
        window.open(flow.authUrl, "_blank", "noopener,noreferrer");
      }
      setActivity("Microsoft login opened; waiting for browser callback");
      try {
        const stored = await callbackPromise;
        setMinecraftSession(stored);
        setSnapshot((current) => ({ ...current, minecraftSession: stored }));
        await refreshMinecraftAccounts();
        setSessionRecoveryNeeded(false);
        setMicrosoftCallbackDraft("");
        setActivity(`Signed in as ${stored.session.username}`);
      } catch (error) {
        if (sessionRecoveryProfileId) {
          setSessionRecoveryNeeded(true);
        }
        if (isNative) {
          setActiveView("settings");
        }
        setActivity(nativeFailureActivity(error, "Microsoft login opened; paste callback URL to finish"));
      }
    } catch (error) {
      setMicrosoftAuthFlow(null);
      setActivity(nativeFailureActivity(error, "Microsoft login is mocked in web preview"));
    }
  }

  async function planMicrosoftTokenExchange(callbackUrl: string, flow: MicrosoftAuthStart) {
    const callback: MicrosoftAuthCallback = {
      callbackUrl,
      expectedState: flow.state,
      codeVerifier: flow.codeVerifier,
      clientId: flow.clientId,
    };
    return invoke<MicrosoftTokenExchangePlan>("plan_microsoft_token_exchange", { callback });
  }

  async function completeMicrosoftLogin() {
    const callbackUrl = microsoftCallbackDraft.trim();
    if (!microsoftAuthFlow) {
      setActivity("Start Microsoft login first");
      return;
    }
    if (!callbackUrl) {
      setActivity("Paste Microsoft callback URL");
      return;
    }

    setActivity("Completing Microsoft login");
    try {
      const plan = await planMicrosoftTokenExchange(callbackUrl, microsoftAuthFlow);
      const tokens = await invoke<MicrosoftOAuthTokens>("exchange_microsoft_authorization_code", { plan });
      const stored = await invoke<StoredMinecraftSession>("authenticate_and_save_minecraft_session", { tokens });
      setMinecraftSession(stored);
      setSnapshot((current) => ({ ...current, minecraftSession: stored }));
      await refreshMinecraftAccounts();
      setSessionRecoveryNeeded(false);
      setMicrosoftCallbackDraft("");
      setActivity(`Signed in as ${stored.session.username}`);
    } catch (error) {
      setActivity(nativeFailureActivity(error, "Microsoft login completion is mocked in web preview"));
    }
  }

  async function scanImports() {
    setActivity("Scanning imports");
    try {
      const imports = await invoke<ImportCandidate[]>("scan_imports");
      setSnapshot((current) => ({ ...current, imports }));
      setImportPlan(null);
      setActivity(imports.length === 1 ? "Found 1 import candidate" : `Found ${imports.length} import candidates`);
    } catch {
      setSnapshot((current) => ({
        ...current,
        imports: [
          {
            id: "preview-prism-winterpack",
            source: "Prism Launcher",
            name: "WinterPack Instance",
            path: "Preview/PrismLauncher/instances/WinterPack",
            kind: "prism",
            detectedLoader: "fabric",
            detectedGameVersion: "1.21.1",
            detectedName: "WinterPack",
            detectedSummary: "Preview import with saves, options, config, and mods.",
            detectedIconPath: "Preview/PrismLauncher/instances/WinterPack/icon.png",
            importableFileCount: 42,
            importableTotalBytes: 98_304,
            lastModifiedUnixSeconds: 1710000000,
          },
        ],
      }));
      setImportPlan(null);
      setActivity("Scanning imports is mocked in web preview");
    }
  }

  async function planImport(candidate: ImportCandidate) {
    setActivity("Planning import");
    const profileName = importProfileName(candidate);
    try {
      const plan = await invoke<ImportPlan>("plan_profile_import", {
        request: { name: profileName, sourcePath: candidate.path },
      });
      setImportPlan(plan);
      const copyable = plan.items.filter((item) => item.exists).length;
      setActivity(copyable === 1 ? "Planned 1 import item" : `Planned ${copyable} import items`);
    } catch {
      setImportPlan({
        profileId: candidate.id,
        profileName,
        sourcePath: candidate.path,
        destinationPath: "Native destination unavailable in web preview",
        detectedLoader: "fabric",
        detectedGameVersion: "1.21.1",
        items: [
          {
            kind: "saves",
            source: `${candidate.path}/saves`,
            destination: "Preview destination/saves",
            exists: true,
            destinationExists: false,
            resolution: undefined,
            fileCount: 8,
            totalBytes: 32768,
          },
          {
            kind: "options",
            source: `${candidate.path}/options.txt`,
            destination: "Preview destination/options.txt",
            exists: true,
            destinationExists: false,
            resolution: undefined,
            fileCount: 1,
            totalBytes: 512,
          },
          {
            kind: "config",
            source: `${candidate.path}/config`,
            destination: "Preview destination/config",
            exists: true,
            destinationExists: true,
            resolution: undefined,
            fileCount: 12,
            totalBytes: 65536,
          },
        ],
      });
      setActivity("Import planning is mocked in web preview");
    }
  }

  function setImportConflictResolution(kind: string, destination: string, resolution: ImportConflictResolution) {
    setImportPlan((current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((item) => {
          if (item.kind !== kind || item.destination !== destination) return item;
          return { ...item, resolution };
        }),
      };
    });
  }

  async function executeImportPlan() {
    if (!importPlan) return;
    if (importInProgress || lifecycleActionInProgress || lifecycleActionInProgressRef.current) return;
    const plan = importPlan;
    if (importPlan.items.some((item) => item.exists && item.destinationExists && !item.resolution)) {
      setActivity("Choose what to do with conflicts before importing");
      return;
    }
    const operationKey = `import:${plan.profileId}`;
    lifecycleActionInProgressRef.current = operationKey;
    setLifecycleActionInProgressKey(operationKey);
    setImportInProgress(true);
    setActivity("Importing profile");
    try {
      const operation = await invoke<OperationPlan>("execute_profile_import", { plan });
      const finalEvent = operation.events[operation.events.length - 1];
      setLauncherEvents((current) => mergeLauncherEvents(current, launcherEventsFromOperationPlan(operation)));
      const snapshot = await invoke<AppSnapshot>("bootstrap_snapshot");
      setSnapshot(snapshot);
      setSettingsDraft(snapshot.settings);
      setMinecraftSession(snapshot.minecraftSession);
      setImportPlan(null);
      setActiveView("library");
      await loadLauncherEvents(true);
      setActivity(finalEvent?.message ?? "Import completed");
    } catch (error) {
      if (isNative) {
        setActivity(nativeFailureActivity(error, "Import failed"));
        return;
      }
      const importedProfile: ProfileSummary = {
        id: plan.profileId,
        name: plan.profileName,
        loader: plan.detectedLoader ?? "vanilla",
        gameVersion: plan.detectedGameVersion ?? "1.21.1",
        installedPackVersion: undefined,
        memoryMb: settingsDraft.maxMemoryMb,
        jvmArgs: [],
      };
      setSnapshot((current) => ({
        ...current,
        profiles: [
          importedProfile,
          ...current.profiles.filter((profile) => profile.id !== importedProfile.id),
        ],
      }));
      setImportPlan(null);
      setActiveView("library");
      setActivity("Profile imported in web preview");
    } finally {
      if (lifecycleActionInProgressRef.current === operationKey) {
        lifecycleActionInProgressRef.current = null;
        setLifecycleActionInProgressKey(null);
      }
      setImportInProgress(false);
    }
  }

  async function searchDiscoverModrinth(event?: React.FormEvent) {
    event?.preventDefault();
    if (discoverSearchInProgress) return;
    setDiscoverProvider("modrinth");
    setDiscoverSearchInProgress(true);
    setDiscoverSearchStatus("Searching Modrinth...");
    try {
      const results = await invoke<ModrinthModpackSearchResult[]>("search_modrinth_modpacks", {
        query: discoverSearchQuery.trim(),
        limit: 12,
      });
      setDiscoverSearchResults(results);
      setDiscoverSearchStatus(
        results.length === 0 ? "No Modrinth modpacks found." : `Found ${results.length} Modrinth modpacks.`,
      );
    } catch (error) {
      if (isNative) {
        setDiscoverSearchStatus(nativeFailureActivity(error, "Modrinth search failed"));
      } else {
        const previewResults: ModrinthModpackSearchResult[] = [
          {
            projectId: "1KVo5zza",
            slug: "fabulously-optimized",
            title: "Fabulously Optimized",
            description: "A fast client modpack focused on performance and smooth play.",
            author: "robotkoer",
            downloads: 12_000_000,
            follows: 18_000,
            gameVersions: ["1.21.8", "1.21.7", "1.21.6"],
            loaders: ["fabric"],
            latestVersionId: "preview",
          },
          {
            projectId: "5FFgwNNP",
            slug: "cobblemon-fabric",
            title: "Cobblemon Official Modpack [Fabric]",
            description: "The official Cobblemon modpack for Fabric.",
            author: "CobbledStudios",
            downloads: 8_000_000,
            follows: 2_400,
            gameVersions: ["1.21.1", "1.20.1"],
            loaders: ["fabric"],
            latestVersionId: "preview",
          },
        ];
        setDiscoverSearchResults(previewResults);
        setDiscoverSearchStatus("Showing preview Modrinth results.");
      }
    } finally {
      setDiscoverSearchInProgress(false);
    }
  }

  async function installModrinthSearchResult(result: ModrinthModpackSearchResult) {
    if (discoverInstallInProgress || lifecycleActionInProgress) return;
    setDiscoverProvider("modrinth");
    setDiscoverInstallingProjectId(result.projectId);
    setDiscoverInstallInProgress(true);
    setActivity(`Preparing ${result.title}`);
    if (isNative) {
      try {
        const resolution = await invoke<ModrinthModpackArchiveResolution>("resolve_modrinth_modpack_archive", {
          projectId: result.projectId,
        });
        const receipt = await invoke<ActionReceipt>("install_modpack_archive", {
          request: {
            url: resolution.url,
            name: result.title,
          },
        });
        setActivity(receipt.message);
        await Promise.all([loadBootstrapSnapshot(), loadLauncherEvents(true)]);
        setActiveView("library");
      } catch (error) {
        setActivity(nativeFailureActivity(error, "Modrinth install failed"));
        await loadLauncherEvents(true);
        setActiveView("activity");
        setActivityMode("events");
      } finally {
        setDiscoverInstallingProjectId(null);
        setDiscoverInstallInProgress(false);
      }
      return;
    }
    window.setTimeout(() => {
      setActivity("Modrinth installs require the desktop app");
      setDiscoverInstallingProjectId(null);
      setDiscoverInstallInProgress(false);
    }, 350);
  }

  async function installDiscoveredArchive(event?: React.FormEvent) {
    event?.preventDefault();
    const url = discoverArchiveUrl.trim();
    if (!url) {
      setActivity("Paste a modpack archive URL first");
      return;
    }
    setDiscoverInstallInProgress(true);
    setActivity("Installing discovered modpack");
    if (isNative) {
      try {
        const receipt = await invoke<ActionReceipt>("install_modpack_archive", {
          request: {
            url,
            name: discoverArchiveName.trim() || undefined,
          },
        });
        setActivity(receipt.message);
        await Promise.all([loadBootstrapSnapshot(), loadLauncherEvents(true)]);
        setActiveView("library");
      } catch (error) {
        setActivity(nativeFailureActivity(error, "Modpack install failed"));
        await loadLauncherEvents(true);
        setActiveView("activity");
        setActivityMode("events");
      } finally {
        setDiscoverInstallInProgress(false);
      }
      return;
    }
    window.setTimeout(() => {
      setActivity("Discover installs require the desktop app");
      setDiscoverInstallInProgress(false);
    }, 350);
  }

  async function saveSettings() {
    const validationMessage = settingsDraftValidationMessage(settingsDraft);
    if (validationMessage) {
      setActivity(validationMessage);
      return;
    }
    setActivity("Saving settings");
    try {
      const normalizedSettings: LauncherSettings = {
        ...settingsDraft,
        javaRuntimeOverridePath: settingsDraft.javaRuntimeOverridePath?.trim() || undefined,
      };
      const settings = await invoke<LauncherSettings>("save_settings", { settings: normalizedSettings });
      setSnapshot((current) => ({ ...current, settings }));
      setSettingsDraft(settings);
      setActivity("Settings saved");
    } catch (error) {
      setActivity(nativeFailureActivity(error, "Saving settings is mocked in web preview"));
    }
  }

  async function refreshMinecraftSession() {
    setActivity("Refreshing Minecraft session");
    try {
      let session: StoredMinecraftSession | null;
      try {
        session = await invoke<StoredMinecraftSession>("refresh_saved_minecraft_session");
      } catch (error) {
        if (isNative && minecraftSession) {
          throw error;
        }
        session = await invoke<StoredMinecraftSession | null>("load_minecraft_session");
      }
      setMinecraftSession(session ?? undefined);
      setSnapshot((current) => ({ ...current, minecraftSession: session ?? undefined }));
      await refreshMinecraftAccounts();
      setSessionRecoveryNeeded(false);
      setActivity(
        session
          ? storedMinecraftSessionUsable(session)
            ? `Ready session for ${session.session.username}`
            : `Stored session for ${session.session.username} is expired`
          : "No stored Minecraft session",
      );
    } catch (error) {
      setMinecraftSession(undefined);
      if (isNative) {
        markStoredSessionNeedsSignIn();
      }
      setActivity(nativeFailureActivity(error, "Minecraft session loading is mocked in web preview"));
    }
  }

  async function savePreviewMinecraftSession() {
    setActivity("Saving Minecraft session");
    const now = Math.floor(Date.now() / 1000);
    const session: StoredMinecraftSession = {
      session: {
        username: settingsDraft.offlineUsername.trim() || "Player",
        uuid: previewUuidForSocialId(previewAccountId),
        accessToken: "preview-access-token",
      },
      accountId: previewAccountId,
      storedAtUnixSeconds: now,
      expiresAtUnixSeconds: now + 3600,
    };
    try {
      const stored = await invoke<StoredMinecraftSession>("save_minecraft_session", { session });
      setMinecraftSession(stored);
      setSnapshot((current) => ({ ...current, minecraftSession: stored }));
      await refreshMinecraftAccounts();
      setSessionRecoveryNeeded(false);
      setActivity(`Minecraft session saved for ${stored.session.username}`);
    } catch (error) {
      if (!isNative) {
        setMinecraftSession(session);
        setSnapshot((current) => ({ ...current, minecraftSession: session }));
        setSessionRecoveryNeeded(false);
      }
      setActivity(nativeFailureActivity(error, "Minecraft session is mocked in web preview"));
    }
  }

  async function clearMinecraftSession() {
    setActivity("Clearing Minecraft session");
    try {
      await invoke("clear_minecraft_session");
      const session = await invoke<StoredMinecraftSession | null>("load_minecraft_session").catch(() => null);
      setMinecraftSession(session ?? undefined);
      setSnapshot((current) => ({ ...current, minecraftSession: session ?? undefined }));
      await refreshMinecraftAccounts();
      setSessionRecoveryNeeded(false);
      setActivity(session ? `Switched to ${session.session.username}` : "Minecraft session cleared");
    } catch (error) {
      if (!isNative) {
        setMinecraftSession(undefined);
        setSnapshot((current) => ({ ...current, minecraftSession: undefined }));
        setSessionRecoveryNeeded(false);
      }
      setActivity(nativeFailureActivity(error, "Clearing Minecraft session is mocked in web preview"));
    }
  }

  async function selectMinecraftAccount(accountId: string) {
    setActivity("Switching Minecraft account");
    try {
      const session = await invoke<StoredMinecraftSession>("select_minecraft_account", { accountId });
      setMinecraftSession(session);
      setSnapshot((current) => ({ ...current, minecraftSession: session }));
      await refreshMinecraftAccounts();
      setSessionRecoveryNeeded(false);
      setActivity(`Switched to ${session.session.username}`);
    } catch (error) {
      setActivity(nativeFailureActivity(error, "Minecraft account switching is unavailable in web preview"));
    }
  }

  async function removeMinecraftAccount(account: StoredMinecraftAccountSummary) {
    if (removeMinecraftAccountConfirmId !== account.accountId) {
      setRemoveMinecraftAccountConfirmId(account.accountId);
      setActivity(`Confirm removing ${account.username}`);
      return;
    }
    setActivity(`Removing ${account.username}`);
    try {
      const session = await invoke<StoredMinecraftSession | null>("remove_minecraft_account", {
        accountId: account.accountId,
      });
      setMinecraftSession(session ?? undefined);
      setSnapshot((current) => ({ ...current, minecraftSession: session ?? undefined }));
      await refreshMinecraftAccounts();
      setSessionRecoveryNeeded(false);
      setActivity(session ? `Removed ${account.username}; switched to ${session.session.username}` : `Removed ${account.username}`);
    } catch (error) {
      setActivity(nativeFailureActivity(error, "Removing Minecraft accounts is unavailable in web preview"));
    }
  }

  async function refreshMinecraftAccountList() {
    setActivity("Refreshing Minecraft accounts");
    const accounts = await refreshMinecraftAccounts();
    setActivity(
      accounts.length === 1
        ? "Loaded 1 Minecraft account"
        : `Loaded ${accounts.length} Minecraft accounts`,
    );
  }

  async function discoverJava() {
    setActivity("Discovering Java");
    try {
      const runtimes = await invoke<JavaRuntimeSummary[]>("discover_java_runtimes");
      setJavaRuntimes(runtimes);
      setActivity(runtimes.length === 1 ? "Found 1 Java runtime" : `Found ${runtimes.length} Java runtimes`);
    } catch (error) {
      if (isNative) {
        setJavaRuntimes([]);
        setActivity(nativeFailureActivity(error, "Java discovery failed"));
        return;
      }
      setJavaRuntimes([
        {
          id: "preview-bundled-java-21",
          path: "Preview/TheBoysLauncher/runtimes/java-21/bin/java.exe",
          version: "21.0.4",
          majorVersion: 21,
          source: "bundled",
        },
      ]);
      setActivity("Java discovery is mocked in web preview");
    }
  }

  async function loadRecommendedJavaRuntimes(): Promise<JavaRuntimeManifestEntry[]> {
    setActivity("Loading Java recommendations");
    try {
      const manifest = await invoke<JavaRuntimeManifestEntry[]>("recommended_java_runtime_manifest");
      setRecommendedJavaRuntimes(manifest);
      setActivity(manifest.length === 1 ? "Loaded 1 Java recommendation" : `Loaded ${manifest.length} Java recommendations`);
      return manifest;
    } catch (error) {
      if (isNative) {
        setRecommendedJavaRuntimes([]);
        setActivity(nativeFailureActivity(error, "Java recommendations failed to load"));
        return [];
      }
      const previewManifest = [
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
        {
          runtimeId: "temurin-17-windows-x64",
          label: "Temurin 17 LTS",
          vendor: "Eclipse Adoptium",
          majorVersion: 17,
          platform: "windows-x64",
          url: "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse",
          archiveFileName: "temurin-17-windows-x64.zip",
          notes: "Recommended for Minecraft 1.18 through 1.20.4.",
        },
      ];
      setRecommendedJavaRuntimes(previewManifest);
      setActivity("Java recommendations are mocked in web preview");
      return previewManifest;
    }
  }

  function selectRecommendedJavaRuntime(entries: JavaRuntimeManifestEntry[], minimumMajorVersion: number) {
    return [...entries]
      .filter((entry) => entry.majorVersion >= minimumMajorVersion)
      .sort((left, right) => left.majorVersion - right.majorVersion || left.label.localeCompare(right.label))[0];
  }

  function applyRecommendedJavaRuntime(entry: JavaRuntimeManifestEntry) {
    setJavaRuntimeDraft({
      runtimeId: entry.runtimeId,
      url: entry.url,
      sha1: entry.sha1,
      size: entry.size,
      archiveFileName: entry.archiveFileName,
    });
    setActivity(`${entry.label} selected`);
  }

  function javaRuntimeDownloadRequestFromManifestEntry(entry: JavaRuntimeManifestEntry): JavaRuntimeDownloadRequest {
    return {
      runtimeId: entry.runtimeId,
      url: entry.url,
      sha1: entry.sha1,
      size: entry.size,
      archiveFileName: entry.archiveFileName,
    };
  }

  async function executeManagedJavaRuntimeInstall(
    request: JavaRuntimeDownloadRequest,
    options?: { failureFallback?: string; successFallback?: string; previewRuntimeMajorVersion?: number },
  ): Promise<boolean> {
    const runtimeSlug = request.runtimeId.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "java-runtime";

    if (!request.runtimeId || !request.url) {
      setActivity("Managed Java runtime id and archive URL are required");
      return false;
    }

    setManagedJavaInstallInProgress(true);
    setActivity("Planning managed Java runtime install");
    try {
      const downloadPlan = await invoke<DownloadPlan>("build_managed_java_runtime_download_plan", { request });
      setActiveView("activity");
      setActivityMode("events");
      const downloadOperation = await invoke<OperationPlan>("execute_download_plan", { plan: downloadPlan });
      setLauncherEvents((current) => mergeLauncherEvents(current, launcherEventsFromOperationPlan(downloadOperation)));
      const installOperation = await invoke<OperationPlan>("execute_managed_java_runtime_install", { plan: downloadPlan });
      setLauncherEvents((current) => mergeLauncherEvents(current, launcherEventsFromOperationPlan(installOperation)));
      const runtimes = await invoke<JavaRuntimeSummary[]>("discover_java_runtimes");
      setJavaRuntimes(runtimes);
      setLaunchJavaRecoveryNeeded(false);
      setLaunchJavaRecoveryProfileId(null);
      const finalEvent = installOperation.events[installOperation.events.length - 1];
      await loadLauncherEvents(true).catch(() => undefined);
      setActivity(finalEvent?.message ?? options?.successFallback ?? "Managed Java runtime installed");
      return true;
    } catch (error) {
      if (isNative) {
        await loadLauncherEvents(true).catch(() => undefined);
        setActiveView("activity");
        setActivityMode("events");
        setActivity(nativeFailureActivity(error, options?.failureFallback ?? "Managed Java runtime install failed"));
        return false;
      }
      const previewRuntime: JavaRuntimeSummary = {
        id: `preview-${runtimeSlug}`,
        path: `Preview/TheBoysLauncher/runtimes/${runtimeSlug}/bin/java.exe`,
        version: `${options?.previewRuntimeMajorVersion ?? 21}.0.4`,
        majorVersion: options?.previewRuntimeMajorVersion ?? 21,
        source: "bundled",
      };
      setJavaRuntimes((current) => [
        previewRuntime,
        ...current.filter((runtime) => runtime.id !== previewRuntime.id),
      ]);
      setActivity("Managed Java install is mocked in web preview");
      return true;
    } finally {
      setManagedJavaInstallInProgress(false);
    }
  }

  async function installManagedJavaForLaunch(failureMessage: string): Promise<boolean> {
    const requiredMajorVersion = requiredJavaMajorVersionFromLaunchFailure(failureMessage);
    setActivity(`Preparing Java ${requiredMajorVersion} for Minecraft`);
    const manifest =
      recommendedJavaRuntimes.length > 0 ? recommendedJavaRuntimes : await loadRecommendedJavaRuntimes();
    const recommended = selectRecommendedJavaRuntime(manifest, requiredMajorVersion);
    if (!recommended) {
      setActivity(`No Java ${requiredMajorVersion} runtime recommendation is available`);
      return false;
    }
    applyRecommendedJavaRuntime(recommended);
    return executeManagedJavaRuntimeInstall(javaRuntimeDownloadRequestFromManifestEntry(recommended), {
      failureFallback: `Java ${requiredMajorVersion} install failed`,
      successFallback: `Java ${requiredMajorVersion} is ready`,
      previewRuntimeMajorVersion: recommended.majorVersion,
    });
  }

  async function installManagedJavaRuntime() {
    if (lifecycleActionInProgress) return;
    const normalizedRuntimeId = javaRuntimeDraft.runtimeId.trim();
    const normalizedUrl = javaRuntimeDraft.url.trim();
    const request: JavaRuntimeDownloadRequest = {
      runtimeId: normalizedRuntimeId,
      url: normalizedUrl,
      archiveFileName: javaRuntimeDraft.archiveFileName?.trim() || undefined,
      sha1: javaRuntimeDraft.sha1?.trim() || undefined,
      size: javaRuntimeDraft.size,
    };

    await executeManagedJavaRuntimeInstall(request);
  }

  async function refreshBackendStatus() {
    setActivity("Checking social backend");
    try {
      const status = await invoke<SocialBackendStatus>("social_backend_status");
      setBackendStatus(status);
      setActivity(status.message);
    } catch {
      setBackendStatus(fallbackBackendStatus);
      setActivity("Social backend status is mocked in web preview");
    }
  }

  async function checkForLauncherUpdate(silent = false, channel = selectedUpdateChannel) {
    if (!silent) {
      setActivity("Checking for launcher updates");
    }
    setSelectedUpdateChannel(channel);
    setLauncherUpdateState({
      status: "checking",
      message: `Checking ${updateChannelLabel(channel)} updates...`,
    });
    try {
      if (channel !== CURRENT_UPDATE_CHANNEL) {
        const manifest = await fetchUpdateManifest(channel);
        setAvailableLauncherUpdate(null);
        setAvailableChannelManifest(manifest);
        const message = `${updateChannelLabel(channel)} build ${manifest.version} is ready. Installing will open the signed installer.`;
        setLauncherUpdateState({ status: "available", message, version: manifest.version });
        if (!silent) setActivity(message);
        return null;
      }

      setAvailableChannelManifest(null);
      const update = await check();
      setAvailableLauncherUpdate(update);
      if (update) {
        const message = `${updateChannelLabel(channel)} version ${update.version} is ready to install.`;
        setLauncherUpdateState({ status: "available", message, version: update.version });
        if (!silent) setActivity(message);
        return update;
      }
      setLauncherUpdateState({ status: "current", message: `${updateChannelLabel(channel)} is up to date.` });
      if (!silent) setActivity(`${updateChannelLabel(channel)} is up to date`);
      return null;
    } catch (error) {
      const message = nativeFailureActivity(error, "Update check is unavailable right now");
      setLauncherUpdateState({ status: "error", message });
      if (!silent) setActivity(message);
      return null;
    }
  }

  async function installLauncherUpdate() {
    setActivity("Installing launcher update");
    if (selectedUpdateChannel !== CURRENT_UPDATE_CHANNEL) {
      try {
        const manifest = availableChannelManifest ?? (await fetchUpdateManifest(selectedUpdateChannel));
        setAvailableChannelManifest(manifest);
        setLauncherUpdateState({
          status: "ready",
          message: `${updateChannelLabel(selectedUpdateChannel)} build ${manifest.version} installer is opening.`,
          version: manifest.version,
        });
        if (isNative) {
          await invoke("open_external_url", { url: manifest.url });
        } else {
          window.open(manifest.url, "_blank", "noopener,noreferrer");
        }
        setActivity(`${updateChannelLabel(selectedUpdateChannel)} installer opened`);
      } catch (error) {
        const message = nativeFailureActivity(error, `${updateChannelLabel(selectedUpdateChannel)} installer could not be opened`);
        setLauncherUpdateState({ status: "error", message });
        setActivity(message);
      }
      return;
    }

    let update = availableLauncherUpdate;
    if (!update) {
      update = await checkForLauncherUpdate(true, selectedUpdateChannel);
    }
    if (!update) {
      setActivity("No launcher update is available");
      return;
    }

    let downloadedBytes = 0;
    let totalBytes: number | undefined;
    setLauncherUpdateState({
      status: "downloading",
      message: `Downloading version ${update.version}...`,
      version: update.version,
    });
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          totalBytes = event.data.contentLength;
          downloadedBytes = 0;
        } else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
        }
        setLauncherUpdateState({
          status: event.event === "Finished" ? "ready" : "downloading",
          message:
            event.event === "Finished"
              ? `Version ${update.version} is installed. Restarting...`
              : `Downloading version ${update.version}...`,
          version: update.version,
          downloadedBytes,
          totalBytes,
        });
      });
      setLauncherUpdateState({
        status: "ready",
        message: `Version ${update.version} is installed. Restarting...`,
        version: update.version,
        downloadedBytes,
        totalBytes,
      });
      await relaunch();
    } catch (error) {
      const message = nativeFailureActivity(error, "Launcher update failed");
      setLauncherUpdateState({ status: "error", message, version: update.version });
      setActivity(message);
    }
  }

  async function initializeBackendService() {
    try {
      const status = await invoke<SocialBackendStatus>("social_backend_status");
      setBackendStatus(status);
      if (status.running || !status.canStart) {
        setActivity(status.message);
        return;
      }

      setActivity("Starting social backend");
      const startedStatus = await invoke<SocialBackendStatus>("start_social_backend");
      const reachableStatus = await waitForReachableBackend(startedStatus);
      setBackendStatus(reachableStatus);
      setActivity(reachableStatus.message);
    } catch (error) {
      setBackendStatus(fallbackBackendStatus);
      setActivity(nativeFailureActivity(error, "Social backend status is mocked in web preview"));
    }
  }

  async function waitForReachableBackend(initialStatus: SocialBackendStatus) {
    if (initialStatus.running) {
      return initialStatus;
    }

    let latest = initialStatus;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await delay(300);
      latest = await invoke<SocialBackendStatus>("social_backend_status");
      if (latest.running) {
        return latest;
      }
    }
    return latest;
  }

  async function startBackendService() {
    setActivity("Starting social backend");
    try {
      const startedStatus = await invoke<SocialBackendStatus>("start_social_backend");
      const status = await waitForReachableBackend(startedStatus);
      setBackendStatus(status);
      setActivity(status.message);
    } catch (error) {
      if (isNative) {
        setActivity(nativeFailureActivity(error, "Starting social backend failed"));
        return;
      }
      setBackendStatus(fallbackBackendStatus);
      setActivity("Starting social backend is mocked in web preview");
    }
  }

  async function stopBackendService() {
    setActivity("Stopping social backend");
    try {
      const status = await invoke<SocialBackendStatus>("stop_social_backend");
      setBackendStatus(status);
      setActivity(status.message);
    } catch (error) {
      if (isNative) {
        setActivity(nativeFailureActivity(error, "Stopping social backend failed"));
        return;
      }
      setBackendStatus(fallbackBackendStatus);
      setActivity("Stopping social backend is mocked in web preview");
    }
  }

  async function loadMinecraftVersionsForProfileCreator() {
    setMinecraftVersionsLoading(true);
    setMinecraftVersionsLoadFailed(false);
    try {
      const versions = await invoke<MinecraftVersionSummary[]>("list_minecraft_versions");
      setMinecraftVersions(versions);
      return versions;
    } catch (error) {
      if (isNative) {
        setMinecraftVersions([]);
        setMinecraftVersionsLoadFailed(true);
        setActivity(nativeFailureActivity(error, "Minecraft versions failed to load"));
        return [];
      }
      setMinecraftVersions(fallbackMinecraftVersions);
      setMinecraftVersionsLoadFailed(false);
      return fallbackMinecraftVersions;
    } finally {
      setMinecraftVersionsLoading(false);
    }
  }

  async function openProfileCreator() {
    const nextIndex = snapshot.profiles.length + 1;
    const versions = await loadMinecraftVersionsForProfileCreator();
    setNewProfileName(`Custom Profile ${nextIndex}`);
    setNewProfileLoader("vanilla");
    setNewProfileVersionType("release");
    setNewProfileGameVersion(versions.length > 0 ? minecraftVersionsForType(versions, "release")[0]?.id ?? "" : "");
    setNewProfileMemoryMb(snapshot.settings.maxMemoryMb);
    setNewProfileAdvancedOpen(false);
    setProfileCreatorOpen(true);
  }

  function startFirstProfileSetup() {
    setActiveView("library");
    void openProfileCreator();
  }

  function selectNewProfileVersionType(versionType: MinecraftVersionType) {
    const options = minecraftVersionsLoadFailed ? [] : minecraftVersionsForType(minecraftVersions, versionType);
    setNewProfileVersionType(versionType);
    setNewProfileGameVersion(options[0]?.id ?? "");
  }

  async function createProfile(request: CreateProfileRequest) {
    const validationMessage = createProfileValidationMessage(request);
    if (validationMessage) {
      setActivity(validationMessage);
      return;
    }

    setActivity("Creating profile");
    try {
      const profile = await invoke<ProfileSummary>("create_profile", { request });
      await loadBootstrapSnapshot();
      setProfileCreatorOpen(false);
      setNewProfileAdvancedOpen(false);
      setActivity(`${profile.name} created. Setting up files...`);
      if (isNative) {
        setSetupInProgressProfileId(profile.id);
        setLifecycleActionInProgressKey(`setup:${profile.id}`);
        lifecycleActionInProgressRef.current = `setup:${profile.id}`;
        try {
          await invoke<ActionReceipt>("prepare_profile", { profileId: profile.id });
          await loadBootstrapSnapshot();
          await loadLauncherEvents(true).catch(() => undefined);
          setActivity(`${profile.name} created and ready`);
        } catch (setupError) {
          await loadLauncherEvents(true).catch(() => undefined);
          setActivity(nativeFailureActivity(setupError, `${profile.name} created; setup will retry on Play`));
        } finally {
          setSetupInProgressProfileId((current) => (current === profile.id ? null : current));
          if (lifecycleActionInProgressRef.current === `setup:${profile.id}`) {
            lifecycleActionInProgressRef.current = null;
            setLifecycleActionInProgressKey(null);
          }
        }
      } else {
        setActivity(`${profile.name} created`);
      }
    } catch (error) {
      if (isNative) {
        setActivity(nativeFailureActivity(error, "Creating profile failed"));
        return;
      }
      const profile: ProfileSummary = {
        id: uniqueProfileIdFromName(request.name, snapshot.profiles),
        name: request.name.trim(),
        loader: request.loader,
        gameVersion: request.gameVersion.trim(),
        memoryMb: request.memoryMb,
        jvmArgs: [],
        javaRuntimeOverridePath: undefined,
      };
      setSnapshot((current) => ({
        ...current,
        profiles: [...current.profiles, profile],
      }));
      setProfileCreatorOpen(false);
      setNewProfileAdvancedOpen(false);
      setActivity("Creating profile is mocked in web preview");
    }
  }

  async function updateProfile(request: UpdateProfileRequest) {
    if (lifecycleActionInProgress || activeProcessProfileIds.has(request.id)) return;
    const existingProfile = snapshot.profiles.find((profile) => profile.id === request.id);
    const requestedLaunchSetupChanged =
      Boolean(existingProfile) &&
      ((request.gameVersion !== undefined && request.gameVersion !== existingProfile?.gameVersion) ||
        (request.loader !== undefined && request.loader !== existingProfile?.loader));
    setActivity("Saving profile");
    try {
      const profile = await invoke<ProfileSummary>("update_profile", { request });
      await loadBootstrapSnapshot();
      const savedLaunchSetupChanged =
        Boolean(existingProfile) &&
        (profile.gameVersion !== existingProfile?.gameVersion || profile.loader !== existingProfile?.loader);
      const launchSetupChanged = requestedLaunchSetupChanged || savedLaunchSetupChanged;
      if (isNative && launchSetupChanged) {
        const operationKey = `setup:${profile.id}`;
        setSetupInProgressProfileId(profile.id);
        setLifecycleActionInProgressKey(operationKey);
        lifecycleActionInProgressRef.current = operationKey;
        setActivity(`${profile.name} updated. Setting up files...`);
        try {
          await invoke<ActionReceipt>("prepare_profile", { profileId: profile.id });
          await loadBootstrapSnapshot();
          await loadLauncherEvents(true).catch(() => undefined);
          setActivity(`${profile.name} updated and ready`);
        } catch (setupError) {
          await loadLauncherEvents(true).catch(() => undefined);
          setActivity(nativeFailureActivity(setupError, `${profile.name} updated; setup will retry on Play`));
        } finally {
          setSetupInProgressProfileId((current) => (current === profile.id ? null : current));
          if (lifecycleActionInProgressRef.current === operationKey) {
            lifecycleActionInProgressRef.current = null;
            setLifecycleActionInProgressKey(null);
          }
        }
      } else {
        setActivity(`${profile.name} updated`);
      }
    } catch (error) {
      if (isNative) {
        setActivity(nativeFailureActivity(error, "Saving profile failed"));
        return;
      }
      setSnapshot((current) => ({
        ...current,
        profiles: current.profiles.map((profile) =>
          profile.id === request.id
            ? {
                ...profile,
                name: request.name ?? profile.name,
                loader: request.loader ?? profile.loader,
                gameVersion: request.gameVersion ?? profile.gameVersion,
                memoryMb: request.memoryMb ?? profile.memoryMb,
                jvmArgs: request.jvmArgs ?? profile.jvmArgs,
                resolution: request.clearResolution ? undefined : request.resolution ?? profile.resolution,
                defaultServer: request.clearDefaultServer ? undefined : request.defaultServer ?? profile.defaultServer,
                javaRuntimeOverridePath: request.clearJavaRuntimeOverride
                  ? undefined
                  : request.javaRuntimeOverridePath ?? profile.javaRuntimeOverridePath,
              }
            : profile,
        ),
      }));
      setActivity("Profile update saved in web preview");
    }
  }

  async function archiveProfile(request: ArchiveProfileRequest) {
    if (lifecycleActionInProgress || activeProcessProfileIds.has(request.id)) return;
    setActivity("Archiving profile");
    try {
      const profile = await invoke<ProfileSummary>("archive_profile", { request });
      await loadBootstrapSnapshot();
      clearRecoveryForProfile(request.id);
      setActivity(`${profile.name} archived`);
    } catch (error) {
      if (isNative) {
        setActivity(nativeFailureActivity(error, "Archiving profile failed"));
        return;
      }
      setSnapshot((current) => ({
        ...current,
        profiles: current.profiles.filter((profile) => profile.id !== request.id),
      }));
      setActivity("Profile archived in web preview");
    }
  }

  async function deleteProfile(request: DeleteProfileRequest) {
    if (lifecycleActionInProgress || lifecycleActionInProgressRef.current) return;
    const operationKey = `delete:${request.id}`;
    lifecycleActionInProgressRef.current = operationKey;
    setLifecycleActionInProgressKey(operationKey);
    setDeleteInProgressProfileId(request.id);
    setActivity("Deleting profile");
    try {
      const receipt = await invoke<ActionReceipt>("delete_profile", { request });
      await loadBootstrapSnapshot();
      await loadLauncherEvents();
      setActiveView("activity");
      setActivityMode("events");
      clearRecoveryForProfile(request.id);
      setActivity(receipt.message);
    } catch (error) {
      if (isNative) {
        await loadLauncherEvents(true).catch(() => undefined);
        setActiveView("activity");
        setActivityMode("events");
        setActivity(nativeFailureActivity(error, "Profile delete failed"));
        return;
      }
      setSnapshot((current) => ({
        ...current,
        profiles: current.profiles.filter((profile) => profile.id !== request.id),
      }));
      setActivity("Profile deleted in web preview");
    } finally {
      if (lifecycleActionInProgressRef.current === operationKey) {
        lifecycleActionInProgressRef.current = null;
        setLifecycleActionInProgressKey(null);
      }
      setDeleteInProgressProfileId(null);
    }
  }

  async function repairProfile(profileId?: string): Promise<boolean> {
    if (!profileId) return false;
    if (lifecycleActionInProgress || lifecycleActionInProgressRef.current) return false;
    const operationKey = `repair:${profileId}`;
    lifecycleActionInProgressRef.current = operationKey;
    setLifecycleActionInProgressKey(operationKey);
    setRepairInProgressProfileId(profileId);
    setActivity("Planning setup");
    try {
      const plan = await invoke<OperationPlan>("plan_repair_profile", { profileId });
      const finalEvent = plan.events[plan.events.length - 1];
      setLauncherEvents((current) =>
        mergeLauncherEvents(current, [
          ...launcherEventsFromOperationPlan(plan),
          launcherOperationActiveEvent(plan, "Setup is running"),
        ]),
      );
      setActivity(finalEvent ? userFacingLauncherEventMessage(finalEvent.message) : "Setup ready");
      setActiveView("activity");
      setActivityMode("events");
      setActivity("Setting up profile files");
      const receipt = await invoke<ActionReceipt>("repair_profile", { profileId });
      const receiptEvent: LauncherEvent = {
        id: `${plan.operationId}-receipt-completed`,
        operationId: plan.operationId,
        operation: "repair_profile",
        subjectId: profileId,
        kind: "completed",
        message: receipt.message,
        progressPercent: 100,
        occurredAtUnixSeconds: Math.floor(Date.now() / 1000),
      };
      setLauncherEvents((current) => mergeLauncherEvents(current, [receiptEvent]));
      await loadBootstrapSnapshot();
      await loadLauncherEvents();
      setActiveView("activity");
      setActivityMode("events");
      setLaunchRecoveryProfileId(null);
      setLaunchRecoveryAction("repair");
      setJoinRecoveryTarget(null);
      setActivity(userFacingLauncherEventMessage(receipt.message));
      return true;
    } catch (error) {
      if (isNative) {
        await loadLauncherEvents(true).catch(() => undefined);
        setActiveView("activity");
        setActivityMode("events");
      }
      setActivity(userFacingLauncherEventMessage(nativeFailureActivity(error, "Setting up profile files is mocked in web preview")));
      return !isNative;
    } finally {
      if (lifecycleActionInProgressRef.current === operationKey) {
        lifecycleActionInProgressRef.current = null;
        setLifecycleActionInProgressKey(null);
      }
      setRepairInProgressProfileId(null);
    }
  }

  async function repairProfileAndLaunch(profileId?: string, profileName?: string, repairAttempted = false): Promise<boolean> {
    if (!profileId) return false;
    const repaired = await repairProfile(profileId);
    if (!repaired) return false;
    await launchProfile(profileId, profileName, { repairAttempted });
    return true;
  }

  async function repairProfileAndJoin(target: JoinRecoveryTarget | null): Promise<boolean> {
    if (!target) return false;
    const repaired = await repairProfile(target.profileId);
    if (!repaired) return false;
    if (activeProcessProfileIds.has(target.profileId) || launchInProgressProfileIdsRef.current.has(target.profileId)) {
      setActivity(`${target.profileName ?? target.profileId} is already running`);
      return false;
    }
    setActivity(`Joining ${target.serverLabel}`);
    let launchStarted = false;
    beginProfileLaunch(target.profileId);
    try {
      setLaunchRecoveryProfileId(null);
      setLaunchRecoveryAction("repair");
      setJoinRecoveryTarget(null);
      setLaunchJavaRecoveryProfileId(null);
      setSessionRecoveryProfileId(null);
      setLaunchJavaRecoveryNeeded(false);
      const process = await invoke<ManagedProcessSummary>(serverLaunchCommandName(), {
        profileId: target.profileId,
        server: target.server,
      });
      launchStarted = true;
      setSessionRecoveryNeeded(false);
      if (isNative) {
        await showLaunchedProcess(process);
        await loadLauncherEvents(true).catch(() => undefined);
        setActiveView("activity");
        setActivityMode("processes");
        setProcessAutoRefresh(true);
      }
      setActivity(`Joining ${target.serverLabel}`);
    } catch (error) {
      const message = nativeFailureActivity(error, "Joining friend is mocked in web preview");
      const needsJava = launchFailureNeedsJava(message);
      const needsSignIn = storedMinecraftSessionCanAuthenticate(minecraftSession) && sessionFailureNeedsSignIn(message);
      if (needsSignIn) {
        markStoredSessionNeedsSignIn(target.profileId);
      }
      setLaunchJavaRecoveryNeeded(needsJava);
      setLaunchJavaRecoveryProfileId(needsJava ? target.profileId : null);
      const needsRepair = !needsJava && !needsSignIn && launchFailureNeedsRepair(message);
      setLaunchRecoveryAction(needsRepair ? "repair_and_join" : "repair");
      setJoinRecoveryTarget(needsRepair ? target : null);
      setLaunchRecoveryProfileId(needsRepair ? target.profileId : null);
      if (isNative) {
        await loadLauncherEvents(true).catch(() => undefined);
        setActiveView("activity");
        setActivityMode("overview");
      }
      setActivity(message);
      launchStarted = !isNative;
    } finally {
      endProfileLaunch(target.profileId);
    }
    if (!launchStarted) return false;
    if (isNative) {
      await loadBootstrapSnapshot().catch(() => undefined);
    }
    try {
      await publishBackendPresence({
        state: "playing",
        packId: target.profileId,
        serverId: target.serverLabel,
      });
      setActivity(`Presence shared for ${target.serverLabel}`);
    } catch {
      // Presence sharing is best-effort; joining should not fail when social is unavailable.
    }
    return true;
  }

  async function inspectLaunchCommand(profile: ProfileSummary) {
    const authenticated = storedMinecraftSessionCanAuthenticate(minecraftSession);
    setActivity(authenticated ? "Building signed-in launch details" : "Building launch details");
    try {
      const spec = await invoke<ProcessCommandSpec>(inspectLaunchCommandName(), { profileId: profile.id });
      setLaunchCommandPreview({
        profileId: profile.id,
        profileName: profile.name,
        authenticated,
        spec,
      });
      setLaunchRecoveryProfileId((current) => (current === profile.id ? null : current));
      setLaunchRecoveryAction("repair");
      setJoinRecoveryTarget((current) => (current?.profileId === profile.id ? null : current));
      setLaunchJavaRecoveryProfileId((current) => (current === profile.id ? null : current));
      setLaunchJavaRecoveryNeeded(false);
      if (authenticated) {
        setSessionRecoveryProfileId((current) => (current === profile.id ? null : current));
        setSessionRecoveryNeeded(false);
      }
      setActivity(`Launch details ready for ${profile.name}`);
    } catch (error) {
      if (isNative) {
        setLaunchCommandPreview(null);
      }
      const message = nativeFailureActivity(
        error,
        authenticated
          ? "Signed-in launch details are mocked in web preview"
          : "Launch details are mocked in web preview",
      );
      const needsJava = launchFailureNeedsJava(message);
      const needsSignIn = authenticated && sessionFailureNeedsSignIn(message);
      if (needsSignIn) {
        markStoredSessionNeedsSignIn(profile.id);
      }
      setLaunchJavaRecoveryNeeded(needsJava);
      setLaunchJavaRecoveryProfileId(needsJava ? profile.id : null);
      const needsRepair = !needsJava && !needsSignIn && launchFailureNeedsRepair(message);
      setLaunchRecoveryAction("repair");
      setJoinRecoveryTarget(null);
      setLaunchRecoveryProfileId(needsRepair ? profile.id : null);
      setActivity(message);
    }
  }

  async function copyLaunchCommandPreview(preview: LaunchCommandPreview) {
    const command = commandPreviewText(preview.spec);
    try {
      await copyTextToClipboard(command);
      setActivity(`Copied launch details for ${preview.profileName}`);
    } catch {
      setActivity("Copy launch details is unavailable in this environment");
    }
  }

  async function copyManagedProcessOutput(process: ManagedProcessSummary) {
    try {
      await copyTextToClipboard(processOutputText(process));
      setActivity(`Copied process output for pid ${process.processId}`);
    } catch {
      setActivity("Copy process output is unavailable in this environment");
    }
  }

  async function loadLauncherEvents(silent = false) {
    if (!silent) setActivity("Loading launcher events");
    try {
      const events = await invoke<LauncherEvent[]>("list_launcher_events", { limit: 25 });
      setLauncherEvents((current) => mergeLauncherEvents(current, events));
      events.forEach(reconcileCompletedLifecycleEvent);
      if (!silent) {
        setActivity(events.length === 1 ? "Loaded 1 launcher event" : `Loaded ${events.length} launcher events`);
      }
    } catch (error) {
      if (isNative) {
        if (!silent) {
          setActivity(nativeFailureActivity(error, "Launcher event log failed to load"));
        }
        return;
      }
      if (!silent) {
        setLauncherEvents([
          {
            id: "preview-process-event",
            operationId: "preview-process",
            operation: "managed_process",
            subjectId: "preview-process",
            kind: "failed",
            message: "Preview process exited with exit code 7",
            progressPercent: 100,
            occurredAtUnixSeconds: 1_710_000_000,
          },
          {
            id: "preview-event",
            operationId: "preview-operation",
            operation: "repair_profile",
            subjectId: "winterpack",
            kind: "completed",
            message: "Event log is mocked in web preview",
            progressPercent: 100,
            occurredAtUnixSeconds: 1_710_000_000,
          },
          {
            id: "preview-download-queued",
            operationId: "preview-download-operation",
            operation: "download_artifacts",
            subjectId: "winterpack",
            kind: "queued",
            message: "Artifact download queued for winterpack",
            progressPercent: 0,
            occurredAtUnixSeconds: 1_710_000_000,
          },
          {
            id: "preview-download-start-client",
            operationId: "preview-download-operation",
            operation: "download_artifacts",
            subjectId: "winterpack",
            kind: "downloading",
            message: "Downloading artifact: client-1.20.1 (client jar, 24.1 MB)",
            progressPercent: 10,
            occurredAtUnixSeconds: 1_710_000_001,
          },
          {
            id: "preview-download-done-client",
            operationId: "preview-download-operation",
            operation: "download_artifacts",
            subjectId: "winterpack",
            kind: "downloading",
            message: "Downloaded artifact: client-1.20.1 (client jar, 24.1 MB)",
            progressPercent: 42,
            occurredAtUnixSeconds: 1_710_000_002,
          },
          {
            id: "preview-download-start-library",
            operationId: "preview-download-operation",
            operation: "download_artifacts",
            subjectId: "winterpack",
            kind: "downloading",
            message: "Downloading artifact: forge-bootstrap (library, 2.4 MB)",
            progressPercent: 55,
            occurredAtUnixSeconds: 1_710_000_003,
          },
          {
            id: "preview-download-pending-mod",
            operationId: "preview-download-operation",
            operation: "download_artifacts",
            subjectId: "winterpack",
            kind: "downloading",
            message: "Artifact pending: cabin-mod (mod jar, 8.1 MB)",
            progressPercent: 62,
            occurredAtUnixSeconds: 1_710_000_003,
          },
          {
            id: "preview-download-present-config",
            operationId: "preview-download-operation",
            operation: "download_artifacts",
            subjectId: "winterpack",
            kind: "downloading",
            message: "Artifact already present: user-options (preserved pack file, 1.2 KB)",
            progressPercent: 70,
            occurredAtUnixSeconds: 1_710_000_004,
          },
        ]);
        setActivity("Event log is mocked in web preview");
      }
    }
  }

  async function loadManagedProcesses(
    options: boolean | { silent?: boolean; suppressSuccessActivity?: boolean } = false,
  ) {
    const silent = typeof options === "boolean" ? options : Boolean(options.silent);
    const suppressSuccessActivity =
      typeof options === "boolean" ? false : Boolean(options.suppressSuccessActivity);
    if (!silent) setActivity("Loading processes");
    try {
      const processes = await invoke<ManagedProcessSummary[]>("list_managed_processes");
      const now = Date.now();
      const processIds = new Set(processes.map((process) => process.id));
      for (const process of processes) {
        delete recentLaunchedProcesses.current[process.id];
      }
      const recentProcesses = Object.entries(recentLaunchedProcesses.current).flatMap(([id, entry]) => {
        if (entry.expiresAt <= now) {
          delete recentLaunchedProcesses.current[id];
          return [];
        }
        return processIds.has(id) ? [] : [entry.process];
      });
      setManagedProcesses((current) => mergeManagedProcessList(current, [...processes, ...recentProcesses]));
      if (!silent && !suppressSuccessActivity) {
        setActivity(processes.length === 1 ? "Loaded 1 process" : `Loaded ${processes.length} processes`);
      }
    } catch (error) {
      if (isNative) {
        for (const id of Object.keys(recentLaunchedProcesses.current)) {
          delete recentLaunchedProcesses.current[id];
        }
        setManagedProcesses([]);
        if (!silent) {
          setActivity(nativeFailureActivity(error, "Process registry failed to load"));
        }
        return;
      }
      setManagedProcesses([
        {
          id: "preview-process",
          processId: 0,
          command: {
            executable: "javaw.exe",
            args: ["-Xmx6144M", "net.minecraft.client.main.Main"],
            workingDir: "Preview/TheBoysLauncher/profiles/WinterPack",
            env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "winterpack" }],
          },
          state: "running",
          startedAtUnixSeconds: 1_710_000_000,
          runtimeSeconds: 732,
          totalOutputLineCount: 2,
          droppedOutputLineCount: 0,
          output: [
            { stream: "stdout", line: "Process registry is mocked in web preview" },
            { stream: "stdout", line: "Live process output will stream here in the desktop shell" },
          ],
        },
        {
          id: "preview-crashed-process",
          processId: 0,
          command: {
            executable: "javaw.exe",
            args: ["-Xmx6144M", "net.minecraft.client.main.Main"],
            workingDir: "Preview/TheBoysLauncher/profiles/BrokenPack",
            env: [{ key: "THEBOYSLAUNCHER_PROFILE_ID", value: "brokenpack" }],
          },
          state: "exited",
          exitCode: 7,
          startedAtUnixSeconds: 1_710_000_000,
          exitedAtUnixSeconds: 1_710_000_006,
          runtimeSeconds: 6,
          totalOutputLineCount: 3,
          droppedOutputLineCount: 0,
          output: [
            { stream: "stdout", line: "Launching preview process" },
            { stream: "stderr", line: "Preview crash: missing dependency" },
            { stream: "stderr", line: "Process exited with exit code 7" },
          ],
        },
      ]);
      if (!silent) setActivity("Process registry is mocked in web preview");
    }
  }

  async function stopManagedProcess(processId: string) {
    setActivity("Stopping process");
    try {
      const process = await invoke<ManagedProcessSummary>("stop_managed_process", { managedProcessId: processId });
      setManagedProcesses((current) => upsertManagedProcessSummary(current, process));
      await loadLauncherEvents(true).catch(() => undefined);
      await clearPlayingPresenceForExitedProcess(process);
      const displayName = managedProcessDisplayName(process, snapshot.profiles);
      setActivity(process.state === "exited" ? `${displayName} stopped` : `Stopping ${displayName}`);
    } catch (error) {
      if (isNative) {
        setActivity(nativeFailureActivity(error, "Process stop failed"));
        return;
      }
      setManagedProcesses((current) =>
        current.map((process) =>
          process.id === processId
            ? {
                ...process,
                state: "stop_requested",
                runtimeSeconds: Math.max(process.runtimeSeconds, 733),
              }
            : process,
        ),
      );
      setActivity("Stopping process is mocked in web preview");
    }
  }

  async function clearExitedProcesses() {
    setActivity("Clearing exited processes");
    try {
      const processes = await invoke<ManagedProcessSummary[]>("clear_exited_managed_processes");
      const remainingProcessIds = new Set(processes.map((process) => process.id));
      for (const id of Object.keys(recentLaunchedProcesses.current)) {
        if (!remainingProcessIds.has(id)) {
          delete recentLaunchedProcesses.current[id];
        }
      }
      setManagedProcesses(processes);
      setActivity(processes.length === 1 ? "1 process remains" : `${processes.length} processes remain`);
    } catch (error) {
      if (isNative) {
        setActivity(nativeFailureActivity(error, "Clearing exited processes failed"));
        return;
      }
      for (const [id, entry] of Object.entries(recentLaunchedProcesses.current)) {
        if (entry.process.state === "exited") {
          delete recentLaunchedProcesses.current[id];
        }
      }
      setManagedProcesses((current) => current.filter((process) => process.state !== "exited"));
      setActivity("Clearing exited processes is mocked in web preview");
    }
  }

  async function exportManagedProcessLog(processId: string) {
    setActivity("Exporting process log");
    try {
      const log = await invoke<ProcessLogExport>("export_managed_process_log", { managedProcessId: processId });
      setLastProcessLogExport(log);
      await loadManagedProcesses(true).catch(() => undefined);
      setActiveView("activity");
      setActivityMode("processes");
      setActivity(`Process log saved (${processLogExportSummary(log)})`);
    } catch (error) {
      setLastProcessLogExport(null);
      if (isNative) {
        setActivity(nativeFailureActivity(error, "Process log export failed"));
        return;
      }
      setActivity("Process log export is mocked in web preview");
    }
  }

  async function revealExportedProcessLog(log: ProcessLogExport) {
    setActivity("Opening process log location");
    try {
      await invoke("reveal_exported_process_log", { path: log.path });
      setActivity(`Opened process log location for pid ${log.processId}`);
    } catch (error) {
      if (isNative) {
        setActivity(nativeFailureActivity(error, "Opening process log location failed"));
        return;
      }
      setActivity("Opening process log location is mocked in web preview");
    }
  }

  useEffect(() => {
    if (!isNative) return;
    if (
      !lifecycleActionInProgress &&
      !importInProgress &&
      !managedJavaInstallInProgress &&
      launchInProgressProfileIds.size === 0
    ) {
      return;
    }
    void loadLauncherEvents(true);
    const interval = window.setInterval(() => {
      void loadLauncherEvents(true);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [
    isNative,
    lifecycleActionInProgress,
    importInProgress,
    managedJavaInstallInProgress,
    launchInProgressProfileIds,
  ]);

  useEffect(() => {
    if (activeView !== "activity" || !processAutoRefresh) return;
    void loadManagedProcesses(true);
    const interval = window.setInterval(() => {
      void loadManagedProcesses(true);
    }, 2000);
    return () => window.clearInterval(interval);
  }, [activeView, processAutoRefresh]);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">TB</div>
          <div>
            <strong>TheBoys</strong>
            <span>{isNative ? "Desktop alpha" : "Web preview"}</span>
          </div>
        </div>

        <nav>
          {[
            ["home", Gamepad2, "Play"],
            ["discover", Download, "Discover"],
            ["library", Library, "Library"],
            ["friends", MessageCircle, "Friends"],
            ["imports", FolderInput, "Import"],
            ["activity", Activity, "Activity"],
            ["settings", Settings, "Settings"],
          ].map(([id, Icon, label]) => (
            <button
              key={id as string}
              className={activeView === id ? "nav-item active" : "nav-item"}
              onClick={() => setActiveView(id as string)}
            >
              {React.createElement(Icon as typeof Gamepad2, { size: 19 })}
              {label as string}
            </button>
          ))}
        </nav>

        <div className="connection-card" aria-label="Launcher status">
          <ShieldCheck size={18} />
          <div className="status-copy">
            <strong>{sidebarStatusTitle(isNative, sidebarProgressEvent)}</strong>
            <span aria-label="Launcher status message">{sidebarStatusMessage(sidebarProgressEvent, activity)}</span>
            {sidebarProgressVisible && (
              <div
                className={sidebarProgressPercent === 0 ? "connection-progress starting" : "connection-progress"}
                aria-label="Launcher status progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={sidebarProgressPercent}
              >
                <span style={{ width: `${sidebarProgressWidth}%` }} />
              </div>
            )}
            {(launchRecoveryProfileId ||
              launchJavaRecoveryNeeded ||
              launchJavaRecoveryProfileId ||
              sessionRecoveryNeeded ||
              sessionRecoveryProfileId) && (
              <div className="status-actions" aria-label="Launcher recovery actions">
                {launchRecoveryProfileId && (
                  <button
                    className="inline-action"
                    disabled={
                      activeProcessProfileIds.has(launchRecoveryProfileId) ||
                      repairInProgressProfileId === launchRecoveryProfileId ||
                      lifecycleActionInProgress
                    }
                    onClick={() => {
                      const profile = snapshot.profiles.find((candidate) => candidate.id === launchRecoveryProfileId);
                      if (launchRecoveryAction === "repair_and_join") {
                        void repairProfileAndJoin(joinRecoveryTarget);
                      } else if (launchRecoveryAction === "repair_and_launch") {
                        void repairProfileAndLaunch(launchRecoveryProfileId, profile?.name);
                      } else {
                        void repairProfile(launchRecoveryProfileId);
                      }
                    }}
                  >
                    <Download size={14} />
                    {activeProcessProfileIds.has(launchRecoveryProfileId)
                      ? "Running"
                      : repairInProgressProfileId === launchRecoveryProfileId
                        ? "Setting up..."
                        : launchRecoveryAction === "repair_and_join"
                          ? "Try join again"
                          : launchRecoveryAction === "repair_and_launch"
                          ? "Try play again"
                          : "Set up again"}
                  </button>
                )}
                {launchJavaRecoveryNeeded && (
                  <button className="inline-action" onClick={openJavaRuntimeSettings}>
                    <Download size={14} />
                    Java
                  </button>
                )}
                {launchJavaRecoveryProfileId && !launchJavaRecoveryNeeded && (
                  <button
                    className="inline-action"
                    disabled={
                      activeProcessProfileIds.has(launchJavaRecoveryProfileId) ||
                      profileLifecycleInProgress(launchJavaRecoveryProfileId)
                    }
                    onClick={() => launchProfile(launchJavaRecoveryProfileId)}
                  >
                    <Play size={14} />
                    {activeProcessProfileIds.has(launchJavaRecoveryProfileId)
                      ? "Running"
                      : profileLifecycleInProgress(launchJavaRecoveryProfileId)
                        ? profileLifecycleLabel(launchJavaRecoveryProfileId)
                        : "Play"}
                  </button>
                )}
                {sessionRecoveryNeeded && (
                  <button className="inline-action" onClick={startMicrosoftLogin}>
                    <ShieldCheck size={14} />
                    Sign in
                  </button>
                )}
                {sessionRecoveryProfileId && !sessionRecoveryNeeded && (
                  <button
                    className="inline-action"
                    disabled={
                      activeProcessProfileIds.has(sessionRecoveryProfileId) ||
                      profileLifecycleInProgress(sessionRecoveryProfileId)
                    }
                    onClick={() => launchProfile(sessionRecoveryProfileId)}
                  >
                    <Play size={14} />
                    {activeProcessProfileIds.has(sessionRecoveryProfileId)
                      ? "Running"
                      : profileLifecycleInProgress(sessionRecoveryProfileId)
                        ? profileLifecycleLabel(sessionRecoveryProfileId)
                        : "Play"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="search">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search packs, profiles, friends..."
            />
          </div>
          {minecraftSession ? (
            <button
              className="ghost-button account-button"
              aria-label={`Minecraft account ${minecraftSession.session.username} signed in`}
              onClick={() => setShowAccountsModal(true)}
            >
              <ShieldCheck size={16} />
              <span>
                <small>Signed in</small>
                <strong>{minecraftSession.session.username}</strong>
              </span>
            </button>
          ) : (
            <button className="ghost-button" onClick={startMicrosoftLogin}>
              Sign in
            </button>
          )}
        </header>

        <div className="launcher-strip" aria-label="Launcher quick status">
          <button className="strip-item" onClick={() => setActiveView("settings")}>
            <ShieldCheck size={16} />
            <span>Session</span>
            <strong>{minecraftSessionQuickLabel(minecraftSession)}</strong>
          </button>
          <button
            className={activeManagedProcessCount > 0 ? "strip-item active" : "strip-item"}
            onClick={() => {
              setActivityMode("processes");
              setActiveView("activity");
              void loadManagedProcesses();
            }}
          >
            <Terminal size={16} />
            <span>Processes</span>
            <strong>{processQuickLabel}</strong>
          </button>
          <button
            className={latestLauncherEvent?.kind === "failed" ? "strip-item failed" : "strip-item"}
            onClick={() => {
              setActivityMode("overview");
              setActiveView("activity");
              void loadLauncherEvents();
            }}
          >
            <Activity size={16} />
            <span>Latest</span>
            <strong>{latestOperationQuickLabel}</strong>
          </button>
        </div>

        {activeView === "home" && (
          <div className="view-grid">
            <div className="home-top-grid">
              <section className="hero">
                <div className="hero-copy">
                  <div>
                    <span className="eyebrow">{heroEyebrow}</span>
                    <h1>{primaryPack?.name ?? "Set up Minecraft"}</h1>
                    <p>
                      {primaryPack?.tagline ??
                        "Create a vanilla profile or discover a pack. The launcher will set up the files automatically."}
                    </p>
                  </div>
                  <div className="hero-status" aria-label="Primary pack status">
                    <span>{primaryPack ? statusLabel(primaryPack.status) : "Ready"}</span>
                    <strong>{primaryPack?.defaultServer ?? "No profiles yet"}</strong>
                    <span>{primaryPack?.version ?? "Start here"}</span>
                  </div>
                  <div className="hero-stats" aria-label="Launcher overview">
                    <span>
                      <strong>{snapshot.profiles.length}</strong>
                      Profiles
                    </span>
                    <span>
                      <strong>{snapshot.friends.length}</strong>
                      Online
                    </span>
                    <span>
                      <strong>{playingFriends.length}</strong>
                      Parties
                    </span>
                  </div>
                </div>
                <div className="hero-actions" aria-label="Primary pack actions">
                  <button
                    className="primary-button"
                    disabled={
                      primaryPack
                        ? primaryPackIsInstalling ||
                          primaryPackIsRepairing ||
                          primaryPackHasActiveProcess ||
                          primaryPackLifecycleBlocked
                        : false
                    }
                    onClick={() =>
                      primaryPack
                        ? primaryPackNeedsRepair
                          ? launchProfile(primaryPack.id, primaryPack.name)
                          : primaryPack.status === "installed"
                            ? launchProfile(primaryPack.id, primaryPack.name)
                            : primaryPackNeedsInstall
                              ? installPack(primaryPack.id)
                              : undefined
                        : startFirstProfileSetup()
                    }
                  >
                    <PrimaryPackActionIcon size={20} />
                    {primaryPackActionLabel}
                  </button>
                  <button
                    className="secondary-button"
                    disabled={false}
                    onClick={() =>
                      primaryPack
                        ? loadBackendPackDetails(primaryPack.id)
                        : setActiveView("discover")
                    }
                  >
                    <PrimaryPackSecondaryIcon size={18} />
                    {primaryPackSecondaryLabel}
                  </button>
                </div>
              </section>

              <section className="panel friends-panel home-rail" aria-label="Home party panel">
                <div className="section-title">
                  <h2>Now Online</h2>
                  <span>{playingFriends.length} {playingFriends.length === 1 ? "party" : "parties"}</span>
                </div>
                {playingFriends.length > 0 ? (
                  playingFriends.map((friend) => {
                    const activeProfileProcess = friendHasActiveProfileProcess(friend);
                    const friendProfileId = packIdForPresence(friend.packName);
                    const joinBlocked = activeProfileProcess || profileLifecycleInProgress(friendProfileId);
                    return (
                      <div className="friend-row" key={friend.id}>
                        <div className="avatar" style={{ background: friend.avatarColor }}>
                          {friend.name.slice(0, 1)}
                        </div>
                        <div>
                          <strong>{friend.name}</strong>
                          <span>{friend.packName} - {friend.serverName}</span>
                        </div>
                        {friend.joinable && (
                          <button className="tiny-button" disabled={joinBlocked} onClick={() => joinFriend(friend)}>
                            {activeProfileProcess ? "Running" : profileLifecycleInProgress(friendProfileId) ? profileLifecycleLabel(friendProfileId) : "Join"}
                          </button>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="social-empty compact-empty">
                    <MessageCircle size={32} />
                    <h3>No parties yet</h3>
                    <p>Friends who are playing will show up here.</p>
                  </div>
                )}
                {nonPlayingFriendCount > 0 && (
                  <div className="home-rail-note">
                    {nonPlayingFriendCount} {nonPlayingFriendCount === 1 ? "friend" : "friends"} online or away
                  </div>
                )}
              </section>
            </div>

            {selectedPackDetails && (
              <PackDetailsPanel
                pack={selectedPackDetails}
                hasActiveProcess={activeProcessProfileIds.has(selectedPackDetails.id)}
                repairingPackId={repairInProgressProfileId}
                installingPackId={installInProgressPackId}
                lifecycleActionInProgress={profileLifecycleInProgress(selectedPackDetails.id)}
                lifecycleActionLabel={profileLifecycleLabel(selectedPackDetails.id)}
                globalLifecycleActionInProgress={lifecycleActionInProgress}
                onClose={() => setSelectedPackDetailsId(null)}
                onInstall={installPack}
                onPlay={(packId, packName) => launchProfile(packId, packName)}
              />
            )}

            <section className="panel span-2">
              <div className="section-title">
                <h2>Featured Packs</h2>
                <div className="button-cluster">
                  <button className="secondary-button compact" onClick={() => loadBackendPacks()}>
                    <Search size={17} />
                    Refresh
                  </button>
                </div>
              </div>
              <div className="pack-grid">
                {filteredPacks.map((pack) => (
                  <PackCard
                    key={pack.id}
                    pack={pack}
                    onInstall={installPack}
                    onPlay={(packId, packName) => launchProfile(packId, packName)}
                    onDetails={loadBackendPackDetails}
                    hasActiveProcess={activeProcessProfileIds.has(pack.id)}
                    repairingPackId={repairInProgressProfileId}
                    installingPackId={installInProgressPackId}
                    lifecycleActionInProgress={profileLifecycleInProgress(pack.id)}
                    lifecycleActionLabel={profileLifecycleLabel(pack.id)}
                    globalLifecycleActionInProgress={lifecycleActionInProgress}
                  />
                ))}
              </div>
            </section>
          </div>
        )}

        {activeView === "discover" && (
          <section className="panel full discover-panel">
            <div className="section-title">
              <div>
                <h2>Discover Modpacks</h2>
                <span>Browse providers, install packs, and keep setup automatic.</span>
              </div>
            </div>
            <div className="discover-layout">
              <section className="discover-main">
                <div className="discover-hero">
                  <span className="section-kicker">Install from archive</span>
                  <h3>Paste a modpack download link</h3>
                  <p>
                    Standard CurseForge zip exports and Modrinth .mrpack archives can be installed now.
                    The launcher copies overrides, downloads pack files in parallel, prepares Minecraft,
                    and sets up the right loader automatically.
                  </p>
                  <form className="discover-install-form" onSubmit={installDiscoveredArchive}>
                    <label>
                      <span>Pack name</span>
                      <input
                        value={discoverArchiveName}
                        onChange={(event) => setDiscoverArchiveName(event.target.value)}
                        placeholder="Enigmatica 9 Expert"
                      />
                    </label>
                    <label>
                      <span>Archive URL</span>
                      <input
                        value={discoverArchiveUrl}
                        onChange={(event) => setDiscoverArchiveUrl(event.target.value)}
                        placeholder="https://example.com/modpack.zip or .mrpack"
                      />
                    </label>
                    <button
                      className="primary-button"
                      disabled={discoverInstallInProgress || lifecycleActionInProgress}
                      type="submit"
                    >
                      <Download size={17} />
                      {discoverInstallInProgress ? "Installing..." : "Install"}
                    </button>
                  </form>
                </div>
                <div className="discover-provider-grid" aria-label="Discover providers">
                  {discoverProviders.map((provider) => (
                    <button
                      key={provider.id}
                      className={discoverProvider === provider.id ? "discover-provider-card active" : "discover-provider-card"}
                      onClick={() => setDiscoverProvider(provider.id)}
                      type="button"
                    >
                      <div>
                        <strong>{provider.name}</strong>
                        <span className={provider.status === "available" ? "status-pill ready" : "status-pill muted"}>
                          {provider.status === "available" ? "Available" : "Planned"}
                        </span>
                      </div>
                      <p>{provider.summary}</p>
                    </button>
                  ))}
                </div>
                {discoverProvider === "modrinth" && (
                  <div className="discover-search-panel" aria-label="Modrinth search">
                    <div className="discover-search-heading">
                      <div>
                        <span className="section-kicker">Modrinth</span>
                        <h3>Search public modpacks</h3>
                      </div>
                      <span className="status-pill ready">Live catalog</span>
                    </div>
                    <form className="discover-search-form" onSubmit={searchDiscoverModrinth}>
                      <label>
                        <span>Search</span>
                        <input
                          value={discoverSearchQuery}
                          onChange={(event) => setDiscoverSearchQuery(event.target.value)}
                          placeholder="Optimization, Cobblemon, SkyFactory..."
                        />
                      </label>
                      <button className="secondary-button" type="submit" disabled={discoverSearchInProgress}>
                        <Search size={17} />
                        {discoverSearchInProgress ? "Searching..." : "Search"}
                      </button>
                    </form>
                    <span className="discover-search-status">{discoverSearchStatus}</span>
                    <div className="discover-result-list">
                      {discoverSearchResults.map((result) => {
                        const installing = discoverInstallingProjectId === result.projectId;
                        const versions = result.gameVersions.slice(0, 3).join(", ");
                        const loaders = result.loaders.length > 0 ? result.loaders.join(", ") : "Modpack";
                        return (
                          <article className="discover-result-row" key={result.projectId}>
                            <div className="discover-result-icon" aria-hidden="true">
                              {result.iconUrl ? <img src={result.iconUrl} alt="" /> : result.title[0]}
                            </div>
                            <div>
                              <strong>{result.title}</strong>
                              <span>
                                by {result.author} - {loaders}
                                {versions ? ` - ${versions}` : ""}
                              </span>
                              <p>{result.description}</p>
                              <span className="muted-line">
                                {result.downloads.toLocaleString()} downloads - {result.follows.toLocaleString()} follows
                              </span>
                            </div>
                            <button
                              className="primary-button compact"
                              disabled={discoverInstallInProgress || lifecycleActionInProgress}
                              onClick={() => installModrinthSearchResult(result)}
                              type="button"
                            >
                              <Download size={16} />
                              {installing ? "Installing..." : "Install"}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
              <aside className="discover-side">
                <span className="section-kicker">Provider plan</span>
                <h3>{discoverProviders.find((provider) => provider.id === discoverProvider)?.name}</h3>
                <p>
                  Modrinth search can install public .mrpack builds now. CurseForge archives can be
                  pasted above, and ATLauncher, FTB, FTB Legacy, and Technic browsing can follow.
                </p>
                <div className="settings-mini-grid">
                  <Setting label="Archive imports" value="CurseForge zip, Modrinth .mrpack" />
                  <Setting label="Search catalogs" value="Modrinth live" />
                  <Setting label="Mod downloads" value="Parallel" />
                  <Setting label="Java" value="Automatic" />
                </div>
              </aside>
            </div>
          </section>
        )}

        {activeView === "library" && (
          <section className="panel full">
            <div className="section-title">
              <div>
                <h2>Library</h2>
                <span>
                  {filteredProfiles.length} of {snapshot.profiles.length} profiles
                </span>
              </div>
              <div className="button-cluster">
                <button className="secondary-button" onClick={openProfileCreator}>
                  <Box size={18} />
                  New profile
                </button>
              </div>
            </div>
            <div className="library-toolbar" aria-label="Library filters">
              <Search size={18} />
              <div>
                <strong>{query.trim() ? `Searching "${query.trim()}"` : "All profiles"}</strong>
                <span>Use the search bar above to filter by name, version, loader, or server.</span>
              </div>
            </div>
            {profileCreatorOpen && (
              <div className="profile-row new-profile-row">
                <Box size={20} />
                <div className="profile-main">
                  <strong>Create profile</strong>
                  <div className="profile-meta" aria-label="New profile summary">
                    <span>{minecraftVersionsLoading ? "Loading versions" : newProfileGameVersion.trim() || "No version"}</span>
                    <span>{minecraftVersionTypeLabel(newProfileVersionType)}</span>
                    <span>{newProfileLoader}</span>
                    <span>{Math.round(newProfileMemoryMb / 1024)} GB RAM</span>
                  </div>
                  <div className="profile-editor" aria-label="New profile editor">
                    <label>
                      <span>Name</span>
                      <input
                        aria-label="New profile name"
                        value={newProfileName}
                        onChange={(event) => setNewProfileName(event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Version type</span>
                      <select
                        aria-label="New profile version type"
                        value={newProfileVersionType}
                        onChange={(event) => selectNewProfileVersionType(event.target.value as MinecraftVersionType)}
                      >
                        {createProfileVersionTypes.map((versionType) => (
                          <option key={versionType} value={versionType}>
                            {minecraftVersionTypeLabel(versionType)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Version</span>
                      <select
                        aria-label="New profile game version"
                        value={newProfileGameVersion}
                        onChange={(event) => setNewProfileGameVersion(event.target.value)}
                        disabled={newProfileVersionOptions.length === 0}
                      >
                        {newProfileVersionOptions.map((version) => (
                          <option key={version.id} value={version.id}>
                            {version.id}
                          </option>
                        ))}
                      </select>
                      {newProfileVersionUnavailableMessage && (
                        <span className="field-hint">{newProfileVersionUnavailableMessage}</span>
                      )}
                    </label>
                    <div className="profile-advanced-toggle">
                      <button
                        className="secondary-button compact subtle-button"
                        type="button"
                        onClick={() => setNewProfileAdvancedOpen((current) => !current)}
                      >
                        <Wrench size={16} />
                        {newProfileAdvancedOpen ? "Basic" : "Advanced"}
                      </button>
                    </div>
                    {newProfileAdvancedOpen && (
                      <div className="profile-advanced-fields" aria-label="New profile advanced settings">
                        <label>
                          <span>Loader</span>
                          <select
                            aria-label="New profile loader"
                            value={newProfileLoader}
                            onChange={(event) => setNewProfileLoader(event.target.value as ProfileSummary["loader"])}
                          >
                            {profileLoaders.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Memory</span>
                          <input
                            aria-label="New profile memory"
                            min={512}
                            max={32768}
                            step={512}
                            type="number"
                            value={newProfileMemoryMb}
                            onChange={(event) => setNewProfileMemoryMb(Number(event.target.value))}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
                <div className="profile-actions" aria-label="New profile actions">
                  <div className="profile-action-group">
                    <button
                      className="primary-button compact"
                      disabled={Boolean(newProfileValidationMessage) || profileCreatorSetupInProgress}
                      onClick={() => createProfile(newProfileDraft)}
                    >
                      <Save size={17} />
                      {profileCreatorSetupInProgress ? "Setting up..." : "Create and set up"}
                    </button>
                    <button
                      className="secondary-button compact"
                      onClick={() => {
                        setProfileCreatorOpen(false);
                        setNewProfileAdvancedOpen(false);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
            {launchCommandPreview && (
              <div className="command-preview" aria-label="Launch details preview">
                <div className="command-preview-heading">
                  <div>
                    <span className="section-kicker">
                      {launchCommandPreview.authenticated ? "Signed-in launch details" : "Offline launch details"}
                    </span>
                    <h3>{launchCommandPreview.profileName}</h3>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Close launch details preview"
                    onClick={() => setLaunchCommandPreview(null)}
                  >
                    <X size={17} />
                  </button>
                </div>
                <div className="command-preview-actions">
                  <button
                    className="secondary-button compact"
                    aria-label={`Copy launch details for ${launchCommandPreview.profileName}`}
                    onClick={() => copyLaunchCommandPreview(launchCommandPreview)}
                  >
                    <Copy size={17} />
                    Copy details
                  </button>
                </div>
                <div className="command-grid">
                  <div>
                    <span>Executable</span>
                    <strong>{launchCommandPreview.spec.executable}</strong>
                  </div>
                  <div>
                    <span>Working directory</span>
                    <strong>{commandWorkingDir(launchCommandPreview.spec)}</strong>
                  </div>
                  <div>
                    <span>Arguments</span>
                    <strong>{launchCommandPreview.spec.args.length}</strong>
                  </div>
                  <div>
                    <span>Environment</span>
                    <strong>{launchCommandPreview.spec.env?.length ?? 0}</strong>
                  </div>
                </div>
                <div className="command-args" aria-label="Launch detail arguments">
                  {launchCommandPreview.spec.args.slice(0, 12).map((arg, index) => (
                    <code key={`${launchCommandPreview.profileId}-${index}`}>{arg}</code>
                  ))}
                  {launchCommandPreview.spec.args.length > 12 && (
                    <code>{launchCommandPreview.spec.args.length - 12} more args</code>
                  )}
                  {launchCommandPreview.spec.args.length === 0 && <code>No launch arguments</code>}
                </div>
              </div>
            )}
            <div className="profile-list">
              {filteredProfiles.map((profile) => (
                <ProfileEditor
                  key={profile.id}
                  profile={profile}
                  versionCatalog={minecraftVersions}
                  packStatus={snapshot.packs.find((pack) => pack.id === profile.id)?.status}
                  onPlay={() => launchProfile(profile.id, profile.name)}
                  onInspect={() => inspectLaunchCommand(profile)}
                  onUpdate={() => installPack(profile.id)}
                  onSave={updateProfile}
                  onArchive={archiveProfile}
                  onDelete={deleteProfile}
                  onDeleteCancel={() => setActivity("Profile deletion canceled")}
                  hasActiveProcess={activeProcessProfileIds.has(profile.id)}
                  activeProcess={activeProcessByProfileId.get(profile.id)}
                  onStopProcess={stopManagedProcess}
                  onExportProcessLog={exportManagedProcessLog}
                  lifecycleActionInProgress={profileLifecycleInProgress(profile.id)}
                  lifecycleActionLabel={profileLifecycleLabel(profile.id)}
                  globalLifecycleActionInProgress={lifecycleActionInProgress}
                  updateInProgress={installInProgressPackId === profile.id}
                  repairInProgress={repairInProgressProfileId === profile.id}
                  deleteInProgress={deleteInProgressProfileId === profile.id}
                />
              ))}
              {filteredProfiles.length === 0 && !hasProfiles && (
                <div className="social-empty compact-empty">
                  <Gamepad2 size={36} />
                  <h3>No profiles yet</h3>
                  <p>Create one and the launcher will set up the right Minecraft files automatically.</p>
                  <button className="primary-button compact" onClick={startFirstProfileSetup}>
                    <Gamepad2 size={16} />
                    Create and set up profile
                  </button>
                </div>
              )}
              {filteredProfiles.length === 0 && hasProfiles && (
                <div className="social-empty compact-empty">
                  <Search size={36} />
                  <h3>No profiles found</h3>
                  <p>Try another name, version, loader, or server.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {activeView === "friends" && (
          <section className="panel full">
            <div className="section-title">
              <h2>Friends</h2>
              <span>
                {visibleFriends.length} friends - {friendRequests.length} requests
              </span>
            </div>
            <div className="friends-hero-grid">
              <div className="friends-summary-card">
                <span className="section-kicker">Play together</span>
                <h3>{visibleFriends.length === 1 ? "1 friend" : `${visibleFriends.length} friends`}</h3>
                <p>
                  {visibleFriends.some((friend) => friend.state === "playing")
                    ? "Join friends who are already playing from the roster below."
                    : "Add Minecraft friends here, then join them when they are online."}
                </p>
              </div>
              <form className="friend-search friends-summary-card" onSubmit={addFriendRequest}>
                <span className="section-kicker">Find a friend</span>
                <input
                  aria-label="Friend name"
                  value={friendSearchDraft}
                  onChange={(event) => setFriendSearchDraft(event.target.value)}
                  placeholder="Minecraft name"
                />
                <button className="secondary-button" type="button" onClick={searchFriendAccounts}>
                  <Search size={18} />
                  Search
                </button>
                <button className="secondary-button" type="submit">
                  <UserPlus size={18} />
                  Add
                </button>
              </form>
            </div>
            <div className="friend-search-results" aria-label="Friend search results">
              <span>{friendSearchStatus}</span>
              {friendSearchResults.map((result) => {
                const existingFriend = snapshot.friends.some(
                  (friend) => friend.name.toLowerCase() === result.minecraftName.toLowerCase(),
                );
                const existingRequest = friendRequests.some(
                  (request) => request.name.toLowerCase() === result.minecraftName.toLowerCase(),
                );
                const isBlocked = blockedAccounts.some(
                  (account) => account.name.toLowerCase() === result.minecraftName.toLowerCase(),
                );
                const unavailable = existingFriend || existingRequest || isBlocked;
                return (
                  <div className="friend-search-result" key={result.accountId}>
                    <Search size={18} />
                    <div>
                      <strong>{result.minecraftName}</strong>
                      <span>
                        {existingFriend
                          ? "Already a friend"
                          : existingRequest
                            ? "Request already exists"
                            : isBlocked
                              ? "Blocked account"
                              : "Minecraft account match"}
                      </span>
                    </div>
                    <button
                      className="primary-button compact"
                      disabled={unavailable}
                      onClick={() => requestFriendBySearchResult(result)}
                    >
                      <UserPlus size={17} />
                      Request
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="social-grid">
              <div>
                <div className="section-kicker">Roster</div>
                <div className="friend-list">
                  {visibleFriends.map((friend) => {
                    const muted = mutedAccounts.some((account) => account.id === friend.id);
                    const activeProfileProcess = friendHasActiveProfileProcess(friend);
                    const targetProfileId = friendProfileId(friend);
                    const joinBlocked = activeProfileProcess || profileLifecycleInProgress(targetProfileId);
                    return (
                      <div className="friend-row" key={friend.id}>
                        <span className="avatar" style={{ background: friend.avatarColor }}>
                          {friend.name[0]}
                        </span>
                        <div>
                          <strong>{friend.name}</strong>
                          <span>
                            {friend.state === "playing"
                              ? `${friend.packName} - ${friend.serverName}`
                              : friend.state}
                            {muted ? " - Muted" : ""}
                          </span>
                        </div>
                        {friend.joinable && (
                          <div className="friend-actions">
                            <button
                              className="primary-button compact"
                              disabled={joinBlocked}
                              onClick={() => joinFriend(friend)}
                            >
                              <Play size={17} />
                              {activeProfileProcess ? "Running" : profileLifecycleInProgress(targetProfileId) ? profileLifecycleLabel(targetProfileId) : "Join"}
                            </button>
                            <button
                              className="secondary-button compact"
                              onClick={() => (muted ? unmuteAccount(friend) : muteAccount(friend))}
                            >
                              <MessageCircle size={17} />
                              {muted ? "Unmute" : "Mute"}
                            </button>
                            <button className="secondary-button compact" onClick={() => blockAccount(friend)}>
                              <ShieldCheck size={17} />
                              Block
                            </button>
                          </div>
                        )}
                        {!friend.joinable && (
                          <div className="friend-actions">
                            <button
                              className="secondary-button compact"
                              onClick={() => (muted ? unmuteAccount(friend) : muteAccount(friend))}
                            >
                              <MessageCircle size={17} />
                              {muted ? "Unmute" : "Mute"}
                            </button>
                            <button className="secondary-button compact" onClick={() => blockAccount(friend)}>
                              <ShieldCheck size={17} />
                              Block
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="section-kicker">Requests</div>
                <div className="friend-list">
                  {friendRequests.map((request) => (
                    <div className="friend-row" key={request.id}>
                      <MessageCircle size={20} />
                      <div>
                        <strong>{request.name}</strong>
                        <span>{request.status === "pending_inbound" ? "Incoming request" : "Request sent"}</span>
                      </div>
                      {request.status === "pending_inbound" && (
                        <button className="primary-button compact" onClick={() => acceptFriendRequest(request)}>
                          <UserPlus size={17} />
                          Accept
                        </button>
                      )}
                      <button className="secondary-button compact" onClick={() => cancelFriendRequest(request.id)}>
                        Cancel
                      </button>
                      <button className="secondary-button compact" onClick={() => blockAccount(request)}>
                        <ShieldCheck size={17} />
                        Block
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="span-2">
                <div className="section-kicker">Blocked</div>
                <div className="friend-list">
                  {blockedAccounts.map((account) => (
                    <div className="friend-row" key={account.id}>
                      <ShieldCheck size={20} />
                      <div>
                        <strong>{account.name}</strong>
                        <span>Blocked account</span>
                      </div>
                      <button className="secondary-button compact" onClick={() => unblockAccount(account.id)}>
                        Unblock
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {visibleFriends.length === 0 && friendRequests.length === 0 && blockedAccounts.length === 0 && (
              <div className="social-empty">
                <UserPlus size={18} />
                <h3>No social activity yet</h3>
              </div>
            )}
          </section>
        )}

        {activeView === "imports" && (
          <section className="panel full">
            <div className="section-title">
              <h2>Import Profiles</h2>
              <button className="secondary-button" onClick={scanImports}>
                <FolderInput size={18} />
                Scan
              </button>
            </div>
            <div className="import-guide-grid">
              <div className="import-guide-card">
                <span className="section-kicker">Bring profiles over</span>
                <h3>{snapshot.imports.length > 0 ? `${snapshot.imports.length} found` : "Ready to scan"}</h3>
                <p>Find profiles from other launchers, review what will move, then choose how to handle conflicts.</p>
              </div>
              <div className="import-guide-card compact-import-guide">
                <span className="section-kicker">Import flow</span>
                <div className="import-step-strip" aria-label="Import steps">
                  <span>Scan</span>
                  <span>Review</span>
                  <span>Import</span>
                </div>
              </div>
            </div>
            {snapshot.imports.length > 0 ? (
              <div className="import-list">
                {snapshot.imports.map((candidate) => (
                  <div className="import-row" key={candidate.id}>
                    <FolderInput size={20} />
                    <div>
                      <strong>{importProfileName(candidate)}</strong>
                      {candidate.detectedName && candidate.detectedName !== candidate.name && (
                        <span>Detected as {candidate.detectedName}</span>
                      )}
                      {candidate.detectedSummary && <span>{candidate.detectedSummary}</span>}
                      <span>
                        {candidate.detectedGameVersion ?? "Unknown version"} - {candidate.detectedLoader ?? "unknown loader"}
                      </span>
                      <span>{importMetadataLabel(candidate)}</span>
                      <details className="technical-details">
                        <summary>View source details</summary>
                        <span>
                          {candidate.source} - {candidate.path}
                        </span>
                        {candidate.detectedIconPath && <span>Icon: {candidate.detectedIconPath}</span>}
                      </details>
                    </div>
                    <button className="secondary-button compact" onClick={() => planImport(candidate)}>
                      Review
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="social-empty">
                <FolderInput size={42} />
                <h3>No import candidates yet</h3>
                <p>Scanners will detect Prism, MultiMC, official Minecraft, GDLauncher, and ATLauncher profiles.</p>
              </div>
            )}
            {importPlan && (
              <div className="modal-backdrop" role="presentation">
                <section className="modal-panel import-review-modal" role="dialog" aria-modal="true" aria-label="Review profile import">
                  <div className="modal-heading">
                    <div>
                      <span className="section-kicker">Review import</span>
                      <h2>{importPlan.profileName}</h2>
                      <p>Choose what to bring over. The source profile will not be changed.</p>
                    </div>
                    <button
                      className="icon-button"
                      aria-label="Close import review"
                      disabled={importInProgress}
                      onClick={() => setImportPlan(null)}
                    >
                      <X size={17} />
                    </button>
                  </div>
                  <div className="import-plan-summary" aria-label="Import review summary">
                    {(importPlan.detectedLoader || importPlan.detectedGameVersion) && (
                      <span>
                        {importPlan.detectedGameVersion ?? "Unknown version"} - {importPlan.detectedLoader ?? "vanilla"}
                      </span>
                    )}
                    <span>{importPlanReadySummary(importPlan)}</span>
                  </div>
                  <div className="import-list modal-import-list">
                    {importPlan.items.map((item) => (
                      <div className="import-row" key={`${item.kind}-${item.destination}`}>
                        <FolderInput size={20} />
                        <div>
                          <strong>{item.kind}</strong>
                          <span>
                            {item.destinationExists
                              ? item.resolution
                                ? `Conflict will ${item.resolution}`
                                : "Conflict in target profile"
                              : item.exists
                                ? item.destination
                                : "Not found in source profile"}
                          </span>
                          {typeof item.fileCount === "number" && (
                            <span>{item.fileCount === 1 ? "1 file" : `${item.fileCount} files`}</span>
                          )}
                          {typeof item.totalBytes === "number" && <span>{formatBytes(item.totalBytes)}</span>}
                          {item.exists && item.destinationExists && (
                            <div className="resolution-controls" aria-label={`${item.kind} conflict resolution`}>
                              {(["skip", "overwrite", "rename"] as const).map((resolution) => (
                                <button
                                  key={resolution}
                                  className={item.resolution === resolution ? "tiny-button active" : "tiny-button"}
                                  onClick={() => setImportConflictResolution(item.kind, item.destination, resolution)}
                                >
                                  {resolution}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="modal-footer">
                    <button
                      className="secondary-button"
                      disabled={importInProgress}
                      onClick={() => setImportPlan(null)}
                    >
                      Cancel
                    </button>
                    <button
                      className="primary-button"
                      disabled={importInProgress || lifecycleActionInProgress}
                      onClick={executeImportPlan}
                    >
                      <FolderInput size={17} />
                      {importInProgress ? "Importing..." : "Import"}
                    </button>
                  </div>
                </section>
              </div>
            )}
          </section>
        )}

        {activeView === "activity" && (
          <section className="panel full">
            <div className="section-title">
              <h2>Activity</h2>
              <span>
                {managedProcesses.length} processes - {launcherEvents.length} events
              </span>
            </div>
            <div className="activity-toolbar" aria-label="Activity actions">
              <div className="toolbar-group" aria-label="Activity views">
                <button
                  className={activityMode === "overview" ? "secondary-button active" : "secondary-button"}
                  onClick={() => setActivityMode("overview")}
                >
                  <Activity size={18} />
                  Overview
                </button>
                <button
                  className={activityMode === "processes" ? "secondary-button active" : "secondary-button"}
                  onClick={() => {
                    setActivityMode("processes");
                    loadManagedProcesses();
                  }}
                >
                  <Terminal size={18} />
                  Processes
                </button>
                <button
                  className={activityMode === "events" ? "secondary-button active" : "secondary-button"}
                  onClick={() => {
                    setActivityMode("events");
                    loadLauncherEvents();
                  }}
                >
                  <Activity size={18} />
                  Events
                </button>
              </div>
              <div className="toolbar-group activity-tools" aria-label="Activity tools">
                <button
                  className="secondary-button"
                  onClick={() => {
                    loadLauncherEvents();
                    loadManagedProcesses({ suppressSuccessActivity: true });
                  }}
                >
                  <RefreshCw size={18} />
                  Refresh
                </button>
                <button className="secondary-button" disabled={!hasExitedManagedProcesses} onClick={clearExitedProcesses}>
                  <Archive size={18} />
                  Clear exited
                </button>
                <button
                  className={processAutoRefresh ? "secondary-button active" : "secondary-button"}
                  onClick={() => setProcessAutoRefresh((enabled) => !enabled)}
                >
                  <Activity size={18} />
                  Live
                </button>
              </div>
            </div>
            {activityMode === "processes" && lastProcessLogExport && (
              <div className="log-export-panel" aria-label="Last process log export">
                <Terminal size={20} />
                <div>
                  <strong>Process log exported</strong>
                  <span>
                    pid {lastProcessLogExport.processId} - {processLogExportSummary(lastProcessLogExport)}
                  </span>
                  <code>{lastProcessLogExport.path}</code>
                </div>
                <button
                  className="secondary-button compact"
                  onClick={() => revealExportedProcessLog(lastProcessLogExport)}
                >
                  <FolderInput size={17} />
                  Open logs
                </button>
                <button
                  className="icon-button"
                  aria-label="Dismiss process log export"
                  onClick={() => setLastProcessLogExport(null)}
                >
                  <X size={18} />
                </button>
              </div>
            )}
            {activityMode === "processes" && managedProcesses.length > 0 && (
              <div className="process-list">
                {managedProcesses.map((process) => {
                  const processProfileId = managedProcessProfileId(process);
                  const relaunchProfile = processProfileId
                    ? snapshot.profiles.find((profile) => profile.id === processProfileId)
                    : undefined;
                  const canRelaunch = Boolean(
                    relaunchProfile &&
                      process.state === "exited" &&
                      !activeProcessProfileIds.has(relaunchProfile.id),
                  );
                  const processDisplayName = managedProcessDisplayName(process, snapshot.profiles);

                  return (
                    <div className="process-row" key={process.id}>
                      <Terminal size={20} />
                      <div>
                        <strong>{processDisplayName}</strong>
                        <span className={processStatusClass(process)}>{processStatusLabel(process)}</span>
                        <span>
                          pid {process.processId}
                          {typeof process.exitCode === "number" ? ` - exit ${process.exitCode}` : ""} - {process.command.args.length} launch args
                        </span>
                        <span>{processTimingLabel(process)}</span>
                        <span>{processOutputSummary(process)}</span>
                        <details className="technical-details process-output-details">
                          <summary>View technical details</summary>
                          <div className="process-technical-details" aria-label={`${processDisplayName} technical details`}>
                            <code>executable: {process.command.executable}</code>
                            <code>working directory: {process.command.workingDir}</code>
                            {(process.command.env?.length ?? 0) > 0 && (
                              <code>environment: {process.command.env?.length ?? 0} launcher variables</code>
                            )}
                          </div>
                        </details>
                        <details className="technical-details process-output-details">
                          <summary>View output</summary>
                          <div className="process-output" aria-label={`${processDisplayName} output`}>
                            {process.output.length > 0 ? (
                              process.output.slice(-8).map((line, index) => (
                                <code key={`${process.id}-${index}`}>
                                  {line.stream}: {line.line}
                                </code>
                              ))
                            ) : (
                              <code>stdout: Waiting for process output</code>
                            )}
                          </div>
                        </details>
                      </div>
                      <div className="process-actions" aria-label={`${processDisplayName} process actions`}>
                        {canRelaunch && relaunchProfile && (
                          <button
                            className="primary-button compact"
                            disabled={profileLifecycleInProgress(relaunchProfile.id)}
                            onClick={() => launchProfile(relaunchProfile.id, relaunchProfile.name)}
                          >
                            <Play size={17} />
                            {profileLifecycleInProgress(relaunchProfile.id) ? profileLifecycleLabel(relaunchProfile.id) : "Play"}
                          </button>
                        )}
                        {process.state !== "exited" && (
                          <button
                            className="secondary-button compact"
                            disabled={process.state !== "running"}
                            onClick={() => stopManagedProcess(process.id)}
                          >
                            {processStopActionLabel(process)}
                          </button>
                        )}
                        <button className="secondary-button compact" onClick={() => exportManagedProcessLog(process.id)}>
                          Save log
                        </button>
                        <button className="secondary-button compact" onClick={() => copyManagedProcessOutput(process)}>
                          <Copy size={17} />
                          Copy output
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {activityMode === "processes" && managedProcesses.length === 0 && (
              <div className="social-empty compact-empty">
                <Terminal size={38} />
                <h3>No managed processes</h3>
                <p>Minecraft will appear here while it is running, with stop controls and saved logs.</p>
              </div>
            )}
            {activityMode === "overview" && launcherOperationSummaries.length > 0 && (
              <div className="operation-list" aria-label="Launcher operations">
                {launcherOperationSummaries.map((operation) => (
                  <div className={operationRowClass(operation.latestEvent)} key={operation.operationId}>
                    <Activity size={20} />
                    <div className="operation-main">
                      <div className="operation-heading">
                        <strong>{userFacingLauncherEventMessage(operation.latestEvent.message)}</strong>
                        <span>{typeof operation.progressPercent === "number" ? `${operation.progressPercent}%` : "--"}</span>
                      </div>
                      <div
                        className="operation-progress"
                        role="progressbar"
                        aria-label={`${userFacingLauncherEventMessage(operation.latestEvent.message)} progress`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={operation.progressPercent}
                      >
                        <span style={{ width: `${operation.progressPercent ?? 0}%` }} />
                      </div>
                      <span>
                        {operationContextLabel(operation.operation, operation.subjectId, operation.latestEvent.message)} - {operation.latestEvent.kind} -{" "}
                        {operation.eventCount} events
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {activityMode === "overview" && latestOperationEvents.length > 0 && (
              <div className="operation-detail" aria-label="Latest operation steps">
                <div className="operation-detail-heading">
                  <div>
                    <span className="section-kicker">
                      Latest operation -{" "}
                      {operationContextLabel(
                        latestOperationEvents[latestOperationEvents.length - 1].operation,
                        latestOperationEvents[latestOperationEvents.length - 1].subjectId,
                        latestOperationEvents[latestOperationEvents.length - 1].message,
                      )}
                    </span>
                    <h3>{userFacingLauncherEventMessage(latestOperationEvents[latestOperationEvents.length - 1].message)}</h3>
                  </div>
                  <span>{latestOperationEvents.length === 1 ? "1 step" : `${latestOperationEvents.length} steps`}</span>
                </div>
                <div className="operation-breakdown" aria-label="Latest operation breakdown">
                  <span>{latestOperationBreakdown.completed} completed</span>
                  <span>{latestOperationBreakdown.active} active</span>
                  <span>{latestOperationBreakdown.pending} pending</span>
                  {latestOperationBreakdown.failed > 0 && (
                    <span className="failed-count">{latestOperationBreakdown.failed} failed</span>
                  )}
                </div>
                {latestArtifactSummary && (
                  <div className="artifact-breakdown" aria-label="Latest file progress">
                    <span>
                      Current: <strong>{downloadArtifactCategory(latestArtifactSummary.currentArtifact ?? "game files")}</strong>
                    </span>
                    <span>{latestArtifactSummary.pending} pending</span>
                    <span>{latestArtifactSummary.downloading} downloading</span>
                    <span>{latestArtifactSummary.finished} finished</span>
                    <span>{latestArtifactSummary.failed} failed</span>
                  </div>
                )}
                <details className="technical-details operation-step-details">
                  <summary>View details</summary>
                  <div className="operation-steps">
                    {latestOperationEvents.map((event, index) => (
                      <div className="operation-step" key={event.id}>
                        <span className="step-index">{index + 1}</span>
                        <div>
                          <strong>{userFacingLauncherEventMessage(event.message)}</strong>
                          <span>
                            {event.kind}
                            {typeof event.progressPercent === "number" ? ` - ${event.progressPercent}%` : ""} -{" "}
                            {operationContextLabel(event.operation, event.subjectId, event.message)} - {formatUnixDate(event.occurredAtUnixSeconds)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}
            {activityMode !== "processes" && visibleActivityEvents.length > 0 && (
              <div className="event-list" aria-label={activityMode === "overview" ? "Recent launcher events" : "Launcher events"}>
                {visibleActivityEvents.map((event) => {
                  const playableProfile = lifecycleEventLaunchTarget(event);
                  const playableProfileIsActive = Boolean(
                    playableProfile && activeProcessProfileIds.has(playableProfile.id),
                  );
                  const playableProfileLifecycleBlocked = Boolean(
                    playableProfile && profileLifecycleInProgress(playableProfile.id),
                  );
                  const playableProfileIsBlocked = playableProfileIsActive || playableProfileLifecycleBlocked;
                  const repairableFailedLaunchProfile =
                    event.kind === "failed" &&
                    event.subjectId &&
                    event.operation === "launch_profile" &&
                    launchFailureNeedsRepair(event.message)
                      ? snapshot.profiles.find((profile) => profile.id === event.subjectId)
                      : undefined;
                  const javaFailedLaunchProfile =
                    event.kind === "failed" &&
                    event.subjectId &&
                    event.operation === "launch_profile" &&
                    launchFailureNeedsJava(event.message) &&
                    launchJavaRecoveryNeeded &&
                    launchJavaRecoveryProfileId === event.subjectId
                      ? snapshot.profiles.find((profile) => profile.id === event.subjectId)
                      : undefined;
                  const sessionFailedLaunchProfile =
                    event.kind === "failed" &&
                    event.subjectId &&
                    event.operation === "launch_profile" &&
                    sessionFailureNeedsSignIn(event.message)
                      ? snapshot.profiles.find((profile) => profile.id === event.subjectId)
                      : undefined;
                  const repairableFailedLaunchIsRepairing = Boolean(
                    repairableFailedLaunchProfile &&
                      repairInProgressProfileId === repairableFailedLaunchProfile.id,
                  );
                  const repairableFailedLaunchIsActive = Boolean(
                    repairableFailedLaunchProfile && activeProcessProfileIds.has(repairableFailedLaunchProfile.id),
                  );
                  const failedLaunchRecoveryAction =
                    repairableFailedLaunchProfile && launchRecoveryProfileId === repairableFailedLaunchProfile.id
                      ? launchRecoveryAction
                      : "repair_and_launch";
                  const failedInstallPack =
                    event.kind === "failed" && event.operation === "install_pack" && event.subjectId
                      ? snapshot.packs.find((pack) => pack.id === event.subjectId)
                      : undefined;
                  const failedInstallIsRetrying = Boolean(failedInstallPack && installInProgressPackId === failedInstallPack.id);
                  const failedInstallIsActive = Boolean(failedInstallPack && activeProcessProfileIds.has(failedInstallPack.id));
                  const failedRepairProfile =
                    event.kind === "failed" && event.operation === "repair_profile" && event.subjectId
                      ? snapshot.profiles.find((profile) => profile.id === event.subjectId)
                      : undefined;
                  const failedRepairIsRetrying = Boolean(
                    failedRepairProfile && repairInProgressProfileId === failedRepairProfile.id,
                  );
                  const failedRepairIsActive = Boolean(failedRepairProfile && activeProcessProfileIds.has(failedRepairProfile.id));
                  return (
                    <div className="event-row" key={event.id}>
                      <Activity size={20} />
                      <div>
                        <strong>{userFacingLauncherEventMessage(event.message)}</strong>
                        <span>
                          {event.kind}
                          {typeof event.progressPercent === "number" ? ` - ${event.progressPercent}%` : ""}
                        </span>
                        <span>{operationContextLabel(event.operation, event.subjectId, event.message)}</span>
                        <span>{formatUnixDate(event.occurredAtUnixSeconds)}</span>
                      </div>
                      {playableProfile && (
                        <button
                          className="primary-button compact"
                          disabled={playableProfileIsBlocked}
                          onClick={() => launchProfile(playableProfile.id, playableProfile.name)}
                        >
                          <Play size={17} />
                          {playableProfileIsActive
                            ? "Running"
                            : playableProfileLifecycleBlocked
                              ? profileLifecycleLabel(playableProfile?.id)
                              : "Play"}
                        </button>
                      )}
                      {repairableFailedLaunchProfile && (
                        <button
                          className="secondary-button compact"
                          disabled={repairableFailedLaunchIsActive || repairableFailedLaunchIsRepairing || lifecycleActionInProgress}
                          onClick={() => {
                            if (failedLaunchRecoveryAction === "repair_and_join") {
                              void repairProfileAndJoin(joinRecoveryTarget);
                            } else {
                              void repairProfileAndLaunch(repairableFailedLaunchProfile.id, repairableFailedLaunchProfile.name);
                            }
                          }}
                        >
                          <Play size={17} />
                          {repairableFailedLaunchIsActive
                            ? "Running"
                            : repairableFailedLaunchIsRepairing
                              ? "Setting up..."
                              : failedLaunchRecoveryAction === "repair_and_join"
                                ? "Try join again"
                                : "Try play again"}
                        </button>
                      )}
                      {javaFailedLaunchProfile && (
                        <button
                          className="secondary-button compact"
                          disabled={managedJavaInstallInProgress}
                          onClick={() => {
                            setLaunchJavaRecoveryProfileId(javaFailedLaunchProfile.id);
                            setLaunchJavaRecoveryNeeded(true);
                            void openJavaRuntimeSettings();
                          }}
                        >
                          <Download size={17} />
                          Java
                        </button>
                      )}
                      {sessionFailedLaunchProfile && (
                        <button
                          className="secondary-button compact"
                          onClick={() => {
                            setSessionRecoveryProfileId(sessionFailedLaunchProfile.id);
                            setSessionRecoveryNeeded(true);
                            void startMicrosoftLogin();
                          }}
                        >
                          <ShieldCheck size={17} />
                          Sign in
                        </button>
                      )}
                      {failedInstallPack && (
                        <button
                          className="secondary-button compact"
                          disabled={failedInstallIsActive || failedInstallIsRetrying || lifecycleActionInProgress}
                          onClick={() => installPack(failedInstallPack.id)}
                        >
                          <Download size={17} />
                          {failedInstallIsActive ? "Running" : failedInstallIsRetrying ? "Retrying..." : "Retry"}
                        </button>
                      )}
                      {failedRepairProfile && (
                        <button
                          className="secondary-button compact"
                          disabled={failedRepairIsActive || failedRepairIsRetrying || lifecycleActionInProgress}
                          onClick={() => repairProfile(failedRepairProfile.id)}
                        >
                          <RefreshCw size={17} />
                          {failedRepairIsActive ? "Running" : failedRepairIsRetrying ? "Setting up..." : "Set up again"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {activityMode === "events" && verboseDownloadFileEvents.length > 0 && (
              <details className="technical-details operation-step-details" aria-label="File download details">
                <summary>
                  View file details ({verboseDownloadFileEvents.length}{" "}
                  {verboseDownloadFileEvents.length === 1 ? "file event" : "file events"})
                </summary>
                <div className="operation-steps">
                  {verboseDownloadFileEvents.map((event, index) => (
                    <div className="operation-step event-row" key={event.id}>
                      <span className="step-index">{index + 1}</span>
                      <div>
                        <strong>{userFacingLauncherEventMessage(event.message)}</strong>
                        <span>
                          {event.kind}
                          {typeof event.progressPercent === "number" ? ` - ${event.progressPercent}%` : ""} -{" "}
                          {operationContextLabel(event.operation, event.subjectId, event.message)} - {formatUnixDate(event.occurredAtUnixSeconds)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
            {activityMode !== "processes" &&
            visibleActivityEvents.length === 0 &&
            !(activityMode === "events" && verboseDownloadFileEvents.length > 0) ? (
              <div className="social-empty compact-empty">
                <Activity size={42} />
                <h3>No launcher events yet</h3>
                <p>Installs, setup, launches, and errors will show progress here.</p>
              </div>
            ) : null}
          </section>
        )}

        {activeView === "settings" && (
          <section className="panel full">
            <div className="section-title">
              <h2>Settings</h2>
              <span>{backendStatus.running ? `${socialBackendModeLabel(backendStatus)} reachable` : `${socialBackendModeLabel(backendStatus)} offline`}</span>
            </div>
            <div className="settings-overview">
              <div className="settings-card account-card">
                <div>
                  <span className="section-kicker">Minecraft account</span>
                  <h3>{minecraftSession ? minecraftSession.session.username : "Not signed in"}</h3>
                  <p>{minecraftSession ? minecraftSessionQuickLabel(minecraftSession) : "Sign in once, then play without extra setup."}</p>
                </div>
                <div className="settings-button-row" aria-label="Settings session actions">
                  {microsoftAuthFlow ? (
                    <button className="primary-button" onClick={completeMicrosoftLogin}>
                      <ShieldCheck size={18} />
                      Finish sign in
                    </button>
                  ) : (
                    <>
                      {isNative ? (
                        <button
                          className={minecraftSession ? "secondary-button" : "primary-button"}
                          onClick={startMicrosoftLogin}
                        >
                          <UserPlus size={18} />
                          {minecraftSession ? "Add another account" : "Add account"}
                        </button>
                      ) : (
                        <button className="primary-button" onClick={savePreviewMinecraftSession}>
                          <UserPlus size={18} />
                          Save session
                        </button>
                      )}
                    </>
                  )}
                  {isNative && (
                    <button className="secondary-button" onClick={refreshMinecraftAccountList}>
                      <RefreshCw size={18} />
                      Refresh accounts
                    </button>
                  )}
                  <button className="secondary-button" onClick={() => setShowAccountsModal(true)}>
                    <ShieldCheck size={18} />
                    Manage accounts
                  </button>
                </div>
                {minecraftAccounts.length > 0 && (
                  <div className="account-summary-strip" aria-label="Minecraft account summary">
                    <ShieldCheck size={18} />
                    <div>
                      <strong>
                        {minecraftAccounts.length} saved {minecraftAccounts.length === 1 ? "account" : "accounts"}
                      </strong>
                      <span>Switch, refresh, or sign out from Manage accounts.</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="settings-card">
                <div>
                  <span className="section-kicker">Game performance</span>
                  <h3>Memory</h3>
                  <p>{`${settingsDraft.maxMemoryMb / 1024} GB set aside for Minecraft. The recommended setting is fine for most PCs.`}</p>
                </div>
                <div className="memory-presets" aria-label="Memory presets">
                  {memoryPresetsMb.map((preset) => (
                    <button
                      className={settingsDraft.maxMemoryMb === preset.value ? "preset-button active" : "preset-button"}
                      key={preset.value}
                      onClick={() => setSettingsDraft((current) => ({ ...current, maxMemoryMb: preset.value }))}
                      type="button"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="settings-editor compact-editor">
                  <label>
                    <span>Custom memory (MB)</span>
                    <input
                      aria-label="Minecraft memory"
                      type="number"
                      min={512}
                      step={512}
                      value={settingsDraft.maxMemoryMb}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({ ...current, maxMemoryMb: Number(event.target.value) }))
                      }
                    />
                  </label>
                </div>
                <div className="settings-button-row">
                  <button className="primary-button" onClick={saveSettings}>
                    <Save size={18} />
                    Save changes
                  </button>
                </div>
              </div>
            </div>
            <div className="settings-section-grid" aria-label="Settings overview">
              <div className="settings-card compact-settings-card">
                <span className="section-kicker">Launcher</span>
                <h3>{backendStatus.running ? "Online" : "Offline"}</h3>
                <p>
                  {backendStatus.running
                    ? "Social features are available."
                    : "The launcher still works offline. Social features can reconnect later."}
                </p>
                <div className="settings-mini-grid">
                  <Setting label="Social backend" value={socialBackendAvailability(backendStatus)} />
                  <Setting label="Backend mode" value={socialBackendModeLabel(backendStatus)} />
                  <Setting label="Backend address" value={socialBackendAddress(backendStatus)} />
                </div>
              </div>
              <div className="settings-card compact-settings-card">
                <span className="section-kicker">Updates</span>
                <h3>
                  {launcherUpdateState.status === "available"
                    ? "Update available"
                    : launcherUpdateState.status === "downloading"
                      ? "Installing update"
                      : launcherUpdateState.status === "error"
                        ? "Check failed"
                        : "Launcher updates"}
                </h3>
                <div className="update-channel-row" aria-label="Launcher update channel">
                  {(["stable", "dev"] as LauncherUpdateChannel[]).map((channel) => (
                    <button
                      key={channel}
                      className={channel === selectedUpdateChannel ? "selected" : ""}
                      disabled={launcherUpdateState.status === "checking" || launcherUpdateState.status === "downloading"}
                      onClick={() => {
                        setSelectedUpdateChannel(channel);
                        setAvailableLauncherUpdate(null);
                        setAvailableChannelManifest(null);
                        setLauncherUpdateState({
                          status: "idle",
                          message:
                            channel === CURRENT_UPDATE_CHANNEL
                              ? `${updateChannelLabel(channel)} is the installed channel.`
                              : `${updateChannelLabel(channel)} installs as a separate signed app.`,
                        });
                      }}
                    >
                      {updateChannelLabel(channel)}
                    </button>
                  ))}
                </div>
                <p className="settings-helper-text">
                  Installed: {updateChannelLabel(CURRENT_UPDATE_CHANNEL)}. Selected: {updateChannelLabel(selectedUpdateChannel)}.
                </p>
                <p>{launcherUpdateState.message}</p>
                {launcherUpdateState.status === "downloading" && launcherUpdateState.totalBytes && (
                  <div className="connection-progress" aria-label="Launcher update progress">
                    <span
                      style={{
                        width: `${Math.min(100, Math.round(((launcherUpdateState.downloadedBytes ?? 0) / launcherUpdateState.totalBytes) * 100))}%`,
                      }}
                    />
                  </div>
                )}
                <div className="settings-button-row">
                  <button
                    className="secondary-button"
                    disabled={launcherUpdateState.status === "checking" || launcherUpdateState.status === "downloading"}
                    onClick={() => checkForLauncherUpdate(false, selectedUpdateChannel)}
                  >
                    <RefreshCw size={18} />
                    Check
                  </button>
                  {launcherUpdateState.status === "available" && (
                    <button className="primary-button" onClick={installLauncherUpdate}>
                      <Download size={18} />
                      {selectedUpdateChannel === CURRENT_UPDATE_CHANNEL ? "Install" : updateChannelInstallLabel(selectedUpdateChannel)}
                    </button>
                  )}
                </div>
              </div>
              <div className="settings-card compact-settings-card">
                <span className="section-kicker">Privacy</span>
                <h3>Diagnostics</h3>
                <p>Choose whether the launcher can save basic troubleshooting details when something fails.</p>
                <label className="toggle-row settings-toggle-card simple-toggle">
                  <input
                    type="checkbox"
                    checked={settingsDraft.telemetryEnabled}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({ ...current, telemetryEnabled: event.target.checked }))
                    }
                  />
                  <span>{settingsDraft.telemetryEnabled ? "Diagnostics enabled" : "Diagnostics disabled"}</span>
                </label>
              </div>
              <div className="settings-card compact-settings-card">
                <span className="section-kicker">Storage</span>
                <h3>Launcher files</h3>
                <p>Profiles, downloads, logs, and cached Minecraft files are kept on this PC.</p>
                <details className="technical-details">
                  <summary>View folders</summary>
                  <div className="settings-mini-grid">
                    <Setting label="Data directory" value={snapshot.directories.dataDir} />
                    <Setting label="Logs directory" value={snapshot.directories.logDir} />
                  </div>
                </details>
              </div>
            </div>
            {showAdvancedSettings && recommendedJavaRuntimes.length > 0 && (
              <div className="runtime-list" aria-label="Recommended Java runtimes">
                {recommendedJavaRuntimes.map((runtime) => (
                  <div className="runtime-row" key={runtime.runtimeId}>
                    <Download size={20} />
                    <div>
                      <strong>{runtime.label}</strong>
                      <span>
                        {runtime.vendor} - Java {runtime.majorVersion} - {runtime.platform}
                      </span>
                      <span>{runtime.notes}</span>
                    </div>
                    <button className="secondary-button compact" onClick={() => applyRecommendedJavaRuntime(runtime)}>
                      Use
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="advanced-settings-toggle">
              <button className="secondary-button subtle-button" onClick={() => setShowAdvancedSettings((current) => !current)}>
                <Wrench size={18} />
                {showAdvancedSettings ? "Hide advanced tools" : "Advanced tools"}
              </button>
            </div>
            {showAdvancedSettings && (
              <div className="advanced-settings" aria-label="Advanced settings">
                <div className="advanced-settings-panel">
                  <div className="advanced-settings-header">
                    <div>
                      <span className="section-kicker">Advanced tools</span>
                      <h3>Sign-in, Java, and backend setup</h3>
                    </div>
                    <p>Most players never need these. Use them when sign-in, Java detection, or the desktop service needs help.</p>
                  </div>
                <div className="desktop-toolbar split-toolbar settings-tools" aria-label="Settings actions">
                  <div className="settings-action-group">
                    <span>Account</span>
                    <div className="toolbar-group" aria-label="Settings account maintenance actions">
                      <button className="secondary-button" onClick={refreshMinecraftSession}>
                        <RefreshCw size={18} />
                        Renew
                      </button>
                      <button className="secondary-button" onClick={completeMicrosoftLogin}>
                        <ShieldCheck size={18} />
                        Finish sign in
                      </button>
                      <button className="secondary-button danger" onClick={clearMinecraftSession}>
                        <Archive size={18} />
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="settings-action-group">
                    <span>Runtime</span>
                    <div className="toolbar-group" aria-label="Settings runtime actions">
                      <button className="secondary-button" onClick={discoverJava}>
                        <Search size={18} />
                        Java
                      </button>
                      <button className="secondary-button" onClick={loadRecommendedJavaRuntimes}>
                        <Download size={18} />
                        Recommended
                      </button>
                      <button className="secondary-button" onClick={refreshBackendStatus}>
                        <Server size={18} />
                        Backend
                      </button>
                    </div>
                  </div>
                  <div className="settings-action-group">
                    <span>Service</span>
                    <div className="toolbar-group" aria-label="Settings service actions">
                      <button
                        className="secondary-button"
                        onClick={startBackendService}
                        disabled={backendStatus.endpointKind === "hosted"}
                        title={
                          backendStatus.endpointKind === "hosted"
                            ? "A hosted backend is configured for this build"
                            : "Start the local social backend"
                        }
                      >
                        <Play size={18} />
                        Start local
                      </button>
                      <button className="secondary-button" onClick={stopBackendService}>
                        <ShieldCheck size={18} />
                        Stop local
                      </button>
                    </div>
                  </div>
                </div>
                <div className="advanced-settings-grid">
                  <div className="advanced-card">
                    <span className="section-kicker">Sign in recovery</span>
                    <label className="settings-field">
                      <span>Microsoft callback URL</span>
                      <input
                        value={microsoftCallbackDraft}
                        onChange={(event) => setMicrosoftCallbackDraft(event.target.value)}
                        placeholder="http://localhost:53682/?code=..."
                      />
                    </label>
                    <label className="settings-field">
                      <span>Offline username</span>
                      <input
                        value={settingsDraft.offlineUsername}
                        onChange={(event) =>
                          setSettingsDraft((current) => ({ ...current, offlineUsername: event.target.value }))
                        }
                      />
                    </label>
                    <label className="settings-field">
                      <span>Minimum memory</span>
                      <input
                        type="number"
                        min={512}
                        step={512}
                        value={settingsDraft.minMemoryMb}
                        onChange={(event) =>
                          setSettingsDraft((current) => ({ ...current, minMemoryMb: Number(event.target.value) }))
                        }
                      />
                    </label>
                    <label className="settings-field">
                      <span>Global Java override</span>
                      <input
                        aria-label="Global Java override path"
                        placeholder="Automatic"
                        value={settingsDraft.javaRuntimeOverridePath ?? ""}
                        onChange={(event) =>
                          setSettingsDraft((current) => ({
                            ...current,
                            javaRuntimeOverridePath: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="advanced-card">
                    <span className="section-kicker">Managed Java</span>
                    <div className="settings-editor java-editor">
                      <label>
                        <span>Runtime ID</span>
                        <input
                          aria-label="Managed Java runtime ID"
                          value={javaRuntimeDraft.runtimeId}
                          onChange={(event) =>
                            setJavaRuntimeDraft((current) => ({ ...current, runtimeId: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        <span>Archive URL</span>
                        <input
                          aria-label="Managed Java archive URL"
                          value={javaRuntimeDraft.url}
                          onChange={(event) =>
                            setJavaRuntimeDraft((current) => ({ ...current, url: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        <span>Archive file</span>
                        <input
                          aria-label="Managed Java archive file"
                          value={javaRuntimeDraft.archiveFileName ?? ""}
                          onChange={(event) =>
                            setJavaRuntimeDraft((current) => ({ ...current, archiveFileName: event.target.value }))
                          }
                        />
                      </label>
                      <button
                        className="primary-button"
                        disabled={lifecycleActionInProgress}
                        onClick={installManagedJavaRuntime}
                      >
                        <Download size={18} />
                        {managedJavaInstallInProgress
                          ? "Installing..."
                          : lifecycleActionInProgress
                            ? lifecycleActionLabel
                            : "Install runtime"}
                      </button>
                    </div>
                  </div>
                </div>
                  <div className="advanced-card advanced-readout" aria-label="Advanced diagnostics">
                    <div>
                      <span className="section-kicker">Diagnostics</span>
                      <h4>Current launcher state</h4>
                    </div>
                    <div className="settings-grid">
                      <Setting label="Minimum memory" value={`${snapshot.settings.minMemoryMb / 1024} GB`} />
                      <Setting label="Maximum memory" value={`${snapshot.settings.maxMemoryMb / 1024} GB`} />
                      <Setting label="Offline username" value={snapshot.settings.offlineUsername} />
                      <Setting label="Java selection" value={snapshot.settings.javaRuntimeOverridePath ? "Advanced override" : "Automatic"} />
                      <Setting label="Diagnostics" value={snapshot.settings.telemetryEnabled ? "Enabled" : "Disabled"} />
                      <Setting label="Data directory" value={snapshot.directories.dataDir} />
                      <Setting label="Logs directory" value={snapshot.directories.logDir} />
                      <Setting label="Minecraft session" value={minecraftSessionLabel(minecraftSession)} />
                      <Setting label="Backend status" value={socialBackendAvailability(backendStatus)} />
                      <Setting label="Backend mode" value={socialBackendModeLabel(backendStatus)} />
                      <Setting label="Backend health" value={backendStatus.healthUrl} />
                      <Setting
                        label="Backend process"
                        value={
                          backendStatus.managed && backendStatus.processId
                            ? `Managed pid ${backendStatus.processId}`
                            : backendStatus.message
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
            {showAdvancedSettings && javaRuntimes.length > 0 && (
              <div className="runtime-list" aria-label="Detected Java runtimes">
                {javaRuntimes.map((runtime) => (
                  <div className="runtime-row" key={runtime.id}>
                    <Settings size={20} />
                    <div>
                      <strong>Java {runtime.majorVersion}</strong>
                      <span>
                        {runtime.version} - {runtime.source} - {runtime.path}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </section>
      {showAccountsModal && (
        <AccountsModal
          accounts={minecraftAccounts}
          minecraftSession={minecraftSession ?? null}
          microsoftAuthFlowActive={Boolean(microsoftAuthFlow)}
          isNative={isNative}
          removeConfirmId={removeMinecraftAccountConfirmId}
          onClose={() => {
            setShowAccountsModal(false);
            setRemoveMinecraftAccountConfirmId(null);
          }}
          onStartLogin={startMicrosoftLogin}
          onCompleteLogin={completeMicrosoftLogin}
          onSavePreviewSession={savePreviewMinecraftSession}
          onRefresh={refreshMinecraftAccountList}
          onSelect={selectMinecraftAccount}
          onRemove={removeMinecraftAccount}
          onCancelRemove={() => setRemoveMinecraftAccountConfirmId(null)}
        />
      )}
    </main>
  );
}

function AccountsModal({
  accounts,
  minecraftSession,
  microsoftAuthFlowActive,
  isNative,
  removeConfirmId,
  onClose,
  onStartLogin,
  onCompleteLogin,
  onSavePreviewSession,
  onRefresh,
  onSelect,
  onRemove,
  onCancelRemove,
}: {
  accounts: StoredMinecraftAccountSummary[];
  minecraftSession: StoredMinecraftSession | null;
  microsoftAuthFlowActive: boolean;
  isNative: boolean;
  removeConfirmId: string | null;
  onClose: () => void;
  onStartLogin: () => void;
  onCompleteLogin: () => void;
  onSavePreviewSession: () => void;
  onRefresh: () => void;
  onSelect: (accountId: string) => void;
  onRemove: (account: StoredMinecraftAccountSummary) => void;
  onCancelRemove: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel accounts-modal" role="dialog" aria-modal="true" aria-label="Manage Minecraft accounts">
        <div className="modal-heading">
          <div>
            <span className="section-kicker">Minecraft accounts</span>
            <h2>Manage accounts</h2>
            <p>
              {minecraftSession
                ? `${minecraftSession.session.username} is selected for launching.`
                : "Add a Microsoft account to launch Minecraft."}
            </p>
          </div>
          <button className="icon-button" aria-label="Close account manager" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <div className="settings-button-row modal-actions" aria-label="Account manager actions">
          {microsoftAuthFlowActive ? (
            <button className="primary-button" onClick={onCompleteLogin}>
              <ShieldCheck size={18} />
              Finish sign in
            </button>
          ) : isNative ? (
            <button className={minecraftSession ? "secondary-button" : "primary-button"} onClick={onStartLogin}>
              <UserPlus size={18} />
              {minecraftSession ? "Add another account" : "Add account"}
            </button>
          ) : (
            <button className="primary-button" onClick={onSavePreviewSession}>
              <UserPlus size={18} />
              Save session
            </button>
          )}
          {isNative && (
            <button className="secondary-button" onClick={onRefresh}>
              <RefreshCw size={18} />
              Refresh accounts
            </button>
          )}
        </div>
        {accounts.length > 0 ? (
          <div className="settings-account-list modal-account-list" aria-label="Minecraft accounts">
            {accounts.map((account) => (
              <div className="settings-account-row runtime-row" key={account.accountId}>
                <ShieldCheck size={18} />
                <div>
                  <strong>{account.username}</strong>
                  {account.active ? (
                    <span>
                      Selected account <span className="sr-only">Signed in and selected</span>
                    </span>
                  ) : (
                    <span>{accountExpiryStatus(account)}</span>
                  )}
                </div>
                <div className="row-actions">
                  <button className="secondary-button compact" disabled={account.active} onClick={() => onSelect(account.accountId)}>
                    {account.active ? "Active" : "Use"}
                  </button>
                  {removeConfirmId === account.accountId ? (
                    <>
                      <button className="secondary-button danger compact" onClick={() => onRemove(account)}>
                        Confirm sign out
                      </button>
                      <button className="secondary-button compact" onClick={onCancelRemove}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button className="secondary-button compact quiet-danger" onClick={() => onRemove(account)}>
                      Sign out
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="social-empty compact-empty modal-empty">
            <ShieldCheck size={38} />
            <h3>No saved accounts</h3>
            <p>Sign in once and this launcher will remember the account for future launches.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function PackDetailsPanel({
  pack,
  hasActiveProcess,
  repairingPackId,
  installingPackId,
  lifecycleActionInProgress,
  lifecycleActionLabel,
  globalLifecycleActionInProgress,
  onClose,
  onInstall,
  onPlay,
}: {
  pack: PackSummary;
  hasActiveProcess: boolean;
  repairingPackId: string | null;
  installingPackId: string | null;
  lifecycleActionInProgress: boolean;
  lifecycleActionLabel: string;
  globalLifecycleActionInProgress: boolean;
  onClose: () => void;
  onInstall: (packId: string) => void;
  onPlay: (packId: string, packName: string) => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const isRepairAction = pack.status === "repair_needed";
  const isPlayAction = pack.status === "installed";
  const isRepairing = isRepairAction && repairingPackId === pack.id;
  const isInstalling = !isRepairAction && !isPlayAction && installingPackId === pack.id;
  const ActionIcon = isRepairAction || isPlayAction ? Play : Download;
  const pendingActionLabel = pack.status === "update_available" ? "Updating..." : "Installing...";
  const blockedPlayActionLabel = repairingPackId === pack.id || installingPackId === pack.id ? "Busy" : lifecycleActionLabel;
  const visibleActionLabel = isRepairAction || isPlayAction
    ? hasActiveProcess
      ? "Running"
      : lifecycleActionInProgress
        ? blockedPlayActionLabel
        : "Play"
    : hasActiveProcess
      ? "Running"
      : statusLabel(pack.status);

  return (
    <section className="pack-detail-panel span-2" aria-label={`${pack.name} pack details`}>
      <div className="pack-detail-mark" style={{ "--accent": pack.accent } as React.CSSProperties}>
        {pack.name.slice(0, 1)}
      </div>
      <div className="pack-detail-main">
        <div className="pack-detail-heading">
          <div>
            <span className="section-kicker">Pack details</span>
            <h2>{pack.name}</h2>
          </div>
          <button className="icon-button" aria-label={`Close ${pack.name} details`} onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <p>{pack.tagline}</p>
        <div className="pack-detail-meta" aria-label={`${pack.name} metadata`}>
          <span>{statusLabel(pack.status)}</span>
          <span>{pack.version}</span>
          <span>{pack.defaultServer ?? "No server set"}</span>
          <span>{pack.installedPlayers} friends playing</span>
        </div>
      </div>
      <div className="pack-detail-actions" aria-label={`${pack.name} detail actions`}>
        <button
          className="primary-button"
          disabled={
            isRepairing ||
            isInstalling ||
            (!isRepairAction && !isPlayAction && (hasActiveProcess || globalLifecycleActionInProgress)) ||
            ((isRepairAction || isPlayAction) && (hasActiveProcess || lifecycleActionInProgress))
          }
          onClick={() => (isRepairAction || isPlayAction ? onPlay(pack.id, pack.name) : onInstall(pack.id))}
        >
          <ActionIcon size={18} />
          {isRepairing ? "Setting up..." : isInstalling ? pendingActionLabel : visibleActionLabel}
        </button>
        <div className="pack-more-menu">
          <button
            className="secondary-button"
            type="button"
            aria-expanded={moreOpen}
            aria-label={`${pack.name} more actions`}
            onClick={() => setMoreOpen((current) => !current)}
          >
            <MoreVertical size={18} />
            More
          </button>
          {moreOpen && (
            <div className="pack-more-menu-list" role="menu" aria-label={`${pack.name} more menu`}>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  onClose();
                }}
              >
                <X size={16} />
                Close details
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PackCard({
  pack,
  onInstall,
  onPlay,
  onDetails,
  hasActiveProcess,
  repairingPackId,
  installingPackId,
  lifecycleActionInProgress,
  lifecycleActionLabel,
  globalLifecycleActionInProgress,
}: {
  pack: PackSummary;
  onInstall: (packId: string) => void;
  onPlay: (packId: string, packName: string) => void;
  onDetails: (packId: string) => void;
  hasActiveProcess: boolean;
  repairingPackId: string | null;
  installingPackId: string | null;
  lifecycleActionInProgress: boolean;
  lifecycleActionLabel: string;
  globalLifecycleActionInProgress: boolean;
}) {
  const actionLabel = statusLabel(pack.status);
  const isRepairAction = pack.status === "repair_needed";
  const isPlayAction = pack.status === "installed";
  const isRepairing = isRepairAction && repairingPackId === pack.id;
  const isInstalling = !isRepairAction && !isPlayAction && installingPackId === pack.id;
  const ActionIcon = isRepairAction || isPlayAction ? Play : Download;
  const pendingActionLabel =
    pack.status === "update_available"
      ? "Updating..."
      : "Installing...";
  const blockedPlayActionLabel = repairingPackId === pack.id || installingPackId === pack.id ? "Busy" : lifecycleActionLabel;
  const visibleActionLabel = isRepairAction || isPlayAction
    ? hasActiveProcess
      ? "Running"
      : lifecycleActionInProgress
        ? blockedPlayActionLabel
        : "Play"
    : hasActiveProcess
      ? "Running"
      : actionLabel;

  return (
    <article className="pack-card" style={{ "--accent": pack.accent } as React.CSSProperties}>
      <div className="pack-topline">
        <span>{pack.version}</span>
        <span>{actionLabel}</span>
      </div>
      <h3>{pack.name}</h3>
      <p>{pack.tagline}</p>
      <div className="pack-meta">
        <span>
          <Server size={15} />
          {pack.defaultServer ?? "No server"}
        </span>
        <span>
          <Activity size={15} />
          {pack.installedPlayers} friends
        </span>
      </div>
      <div className="pack-actions">
        <button className="secondary-button compact" onClick={() => onDetails(pack.id)}>
          <Search size={17} />
          Details
        </button>
        <button
          className="card-button"
          disabled={
            isRepairing ||
            isInstalling ||
            (!isRepairAction && !isPlayAction && (hasActiveProcess || globalLifecycleActionInProgress)) ||
            ((isRepairAction || isPlayAction) && (hasActiveProcess || lifecycleActionInProgress))
          }
          onClick={() => (isRepairAction || isPlayAction ? onPlay(pack.id, pack.name) : onInstall(pack.id))}
        >
          <ActionIcon size={17} />
          {isRepairing ? "Setting up..." : isInstalling ? pendingActionLabel : visibleActionLabel}
        </button>
      </div>
    </article>
  );
}

function ProfileEditor({
  profile,
  versionCatalog,
  packStatus,
  onPlay,
  onInspect,
  onUpdate,
  onSave,
  onArchive,
  onDelete,
  onDeleteCancel,
  hasActiveProcess,
  activeProcess,
  onStopProcess,
  onExportProcessLog,
  lifecycleActionInProgress,
  lifecycleActionLabel,
  globalLifecycleActionInProgress,
  updateInProgress,
  repairInProgress,
  deleteInProgress,
}: {
  profile: ProfileSummary;
  versionCatalog: MinecraftVersionSummary[];
  packStatus?: PackSummary["status"];
  onPlay: () => void;
  onInspect: () => void;
  onUpdate: () => void;
  onSave: (request: UpdateProfileRequest) => void;
  onArchive: (request: ArchiveProfileRequest) => void;
  onDelete: (request: DeleteProfileRequest) => void;
  onDeleteCancel: () => void;
  hasActiveProcess: boolean;
  activeProcess?: ManagedProcessSummary;
  onStopProcess: (processId: string) => void;
  onExportProcessLog: (processId: string) => void;
  lifecycleActionInProgress: boolean;
  lifecycleActionLabel: string;
  globalLifecycleActionInProgress: boolean;
  updateInProgress: boolean;
  repairInProgress: boolean;
  deleteInProgress: boolean;
}) {
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [showAdvancedProfileSettings, setShowAdvancedProfileSettings] = useState(false);
  const [name, setName] = useState(profile.name);
  const [loader, setLoader] = useState<ProfileSummary["loader"]>(profile.loader);
  const [gameVersionType, setGameVersionType] = useState<MinecraftVersionType>(
    minecraftVersionTypeForVersion(profile.gameVersion, versionCatalog),
  );
  const [gameVersion, setGameVersion] = useState(profile.gameVersion);
  const [memoryMb, setMemoryMb] = useState(profile.memoryMb);
  const [resolutionWidth, setResolutionWidth] = useState(profile.resolution?.width ? String(profile.resolution.width) : "");
  const [resolutionHeight, setResolutionHeight] = useState(profile.resolution?.height ? String(profile.resolution.height) : "");
  const [defaultServerName, setDefaultServerName] = useState(profile.defaultServer?.name ?? "");
  const [defaultServerAddress, setDefaultServerAddress] = useState(profile.defaultServer?.address ?? "");
  const [defaultServerPort, setDefaultServerPort] = useState(
    typeof profile.defaultServer?.port === "number" ? String(profile.defaultServer.port) : "",
  );
  const [jvmArgsText, setJvmArgsText] = useState(jvmArgsDraft(profile.jvmArgs));
  const [javaRuntimeOverridePath, setJavaRuntimeOverridePath] = useState(profile.javaRuntimeOverridePath ?? "");

  useEffect(() => {
    setDeleteConfirming(false);
    setCustomizing(false);
    setShowAdvancedProfileSettings(false);
    setName(profile.name);
    setLoader(profile.loader);
    setGameVersionType(minecraftVersionTypeForVersion(profile.gameVersion, versionCatalog));
    setGameVersion(profile.gameVersion);
    setMemoryMb(profile.memoryMb);
    setResolutionWidth(profile.resolution?.width ? String(profile.resolution.width) : "");
    setResolutionHeight(profile.resolution?.height ? String(profile.resolution.height) : "");
    setDefaultServerName(profile.defaultServer?.name ?? "");
    setDefaultServerAddress(profile.defaultServer?.address ?? "");
    setDefaultServerPort(typeof profile.defaultServer?.port === "number" ? String(profile.defaultServer.port) : "");
    setJvmArgsText(jvmArgsDraft(profile.jvmArgs));
    setJavaRuntimeOverridePath(profile.javaRuntimeOverridePath ?? "");
  }, [profile.defaultServer, profile.gameVersion, profile.id, profile.javaRuntimeOverridePath, profile.jvmArgs, profile.loader, profile.memoryMb, profile.name, profile.resolution, versionCatalog]);

  const versionOptions = profileVersionOptions(
    gameVersion,
    minecraftVersionsForType(versionCatalog, gameVersionType),
    gameVersionType === "release",
  );
  const versionUnavailableMessage =
    versionOptions.length === 0 ? minecraftVersionUnavailableMessage(gameVersionType) : null;
  const selectGameVersionType = (versionType: MinecraftVersionType) => {
    const options = minecraftVersionsForType(versionCatalog, versionType);
    setGameVersionType(versionType);
    setGameVersion(options[0]?.id ?? "");
  };

  const trimmedName = name.trim();
  const trimmedGameVersion = gameVersion.trim();
  const trimmedServerName = defaultServerName.trim();
  const trimmedServerAddress = defaultServerAddress.trim();
  const parsedResolutionWidth = Number(resolutionWidth);
  const parsedResolutionHeight = Number(resolutionHeight);
  const parsedServerPort = Number(defaultServerPort);
  const nextJvmArgs = jvmArgsFromDraft(jvmArgsText);
  const nextJavaRuntimeOverridePath = javaRuntimeOverridePath.trim() || undefined;
  const clearJavaRuntimeOverride = !nextJavaRuntimeOverridePath && Boolean(profile.javaRuntimeOverridePath);
  const nextResolution =
    resolutionWidth.trim() && resolutionHeight.trim()
      ? { width: parsedResolutionWidth, height: parsedResolutionHeight }
      : undefined;
  const clearResolution = !nextResolution && Boolean(profile.resolution);
  const nextDefaultServer = trimmedServerAddress
    ? {
        name: trimmedServerName || undefined,
        address: trimmedServerAddress,
        port: defaultServerPort.trim() ? parsedServerPort : undefined,
      }
    : undefined;
  const clearDefaultServer = !nextDefaultServer && Boolean(profile.defaultServer);
  const resolutionComplete = !resolutionWidth.trim() && !resolutionHeight.trim()
    ? true
    : Boolean(resolutionWidth.trim() && resolutionHeight.trim());
  const resolutionValid =
    !nextResolution ||
    (Number.isFinite(nextResolution.width) &&
      Number.isFinite(nextResolution.height) &&
      nextResolution.width >= 320 &&
      nextResolution.height >= 240 &&
      nextResolution.width <= 7680 &&
      nextResolution.height <= 4320);
  const serverPortValid =
    !defaultServerPort.trim() ||
    (Number.isInteger(parsedServerPort) && parsedServerPort >= 1 && parsedServerPort <= 65535);
  const canSave =
    trimmedName.length > 0 &&
    trimmedGameVersion.length > 0 &&
    memoryMb >= 512 &&
    memoryMb <= 32768 &&
    resolutionComplete &&
    resolutionValid &&
    serverPortValid;
  const hasChanges =
    trimmedName !== profile.name ||
    loader !== profile.loader ||
    trimmedGameVersion !== profile.gameVersion ||
    memoryMb !== profile.memoryMb ||
    jvmArgsDraft(nextJvmArgs) !== jvmArgsDraft(profile.jvmArgs) ||
    clearResolution ||
    (nextResolution?.width ?? undefined) !== (profile.resolution?.width ?? undefined) ||
    (nextResolution?.height ?? undefined) !== (profile.resolution?.height ?? undefined) ||
    clearDefaultServer ||
    (nextDefaultServer?.name ?? undefined) !== (profile.defaultServer?.name ?? undefined) ||
    (nextDefaultServer?.address ?? undefined) !== (profile.defaultServer?.address ?? undefined) ||
    (nextDefaultServer?.port ?? undefined) !== (profile.defaultServer?.port ?? undefined) ||
    (nextJavaRuntimeOverridePath ?? undefined) !== (profile.javaRuntimeOverridePath ?? undefined);
  const playActionLabel = hasActiveProcess
    ? "Running"
    : updateInProgress || repairInProgress || deleteInProgress
      ? "Busy"
      : lifecycleActionInProgress
        ? lifecycleActionLabel
        : "Play";

  return (
    <div className="profile-row">
      <Gamepad2 size={20} />
      <div className="profile-main">
        <strong>{profile.name}</strong>
        <div className="profile-meta" aria-label={`${profile.name} profile summary`}>
          <span>{profile.gameVersion}</span>
          <span>{profile.loader}</span>
          <span>{Math.round(profile.memoryMb / 1024)} GB RAM</span>
          <span>{profile.resolution ? `${profile.resolution.width}x${profile.resolution.height}` : "Default window"}</span>
          <span>{profile.defaultServer?.name ?? profile.defaultServer?.address ?? "No default server"}</span>
          <span>{profileLastPlayedLabel(profile.lastPlayed)}</span>
        </div>
        {hasActiveProcess && <span className="profile-warning">Running process owns this profile</span>}
        {customizing && (
          <div className="profile-editor" aria-label={`${profile.name} profile editor`}>
            <label>
              <span>Name</span>
              <input
                aria-label={`${profile.name} profile name`}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              <span>Version type</span>
              <select
                aria-label={`${profile.name} version type`}
                value={gameVersionType}
                onChange={(event) => selectGameVersionType(event.target.value as MinecraftVersionType)}
              >
                {createProfileVersionTypes.map((versionType) => (
                  <option key={versionType} value={versionType}>
                    {minecraftVersionTypeLabel(versionType)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Version</span>
              <select
                aria-label={`${profile.name} game version`}
                value={gameVersion}
                onChange={(event) => setGameVersion(event.target.value)}
                disabled={versionOptions.length === 0}
              >
                {versionOptions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.id}
                  </option>
                ))}
              </select>
              {versionUnavailableMessage && <span className="field-hint">{versionUnavailableMessage}</span>}
            </label>
            <div className="profile-advanced-toggle">
              <button
                className="secondary-button compact subtle-button"
                type="button"
                onClick={() => setShowAdvancedProfileSettings((current) => !current)}
              >
                <Wrench size={16} />
                {showAdvancedProfileSettings ? "Basic" : "Advanced"}
              </button>
            </div>
            {showAdvancedProfileSettings && (
              <div className="profile-advanced-fields" aria-label={`${profile.name} advanced profile settings`}>
                <label>
                  <span>Loader</span>
                  <select
                    aria-label={`${profile.name} loader`}
                    value={loader}
                    onChange={(event) => setLoader(event.target.value as ProfileSummary["loader"])}
                  >
                    {profileLoaders.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Memory</span>
                  <input
                    aria-label={`${profile.name} memory`}
                    min={512}
                    max={32768}
                    step={512}
                    type="number"
                    value={memoryMb}
                    onChange={(event) => setMemoryMb(Number(event.target.value))}
                  />
                </label>
                <label>
                  <span>Window width</span>
                  <input
                    aria-label={`${profile.name} window width`}
                    min={320}
                    max={7680}
                    step={1}
                    type="number"
                    value={resolutionWidth}
                    onChange={(event) => setResolutionWidth(event.target.value)}
                  />
                </label>
                <label>
                  <span>Window height</span>
                  <input
                    aria-label={`${profile.name} window height`}
                    min={240}
                    max={4320}
                    step={1}
                    type="number"
                    value={resolutionHeight}
                    onChange={(event) => setResolutionHeight(event.target.value)}
                  />
                </label>
                <label>
                  <span>Server name</span>
                  <input
                    aria-label={`${profile.name} default server name`}
                    value={defaultServerName}
                    onChange={(event) => setDefaultServerName(event.target.value)}
                  />
                </label>
                <label>
                  <span>Server address</span>
                  <input
                    aria-label={`${profile.name} default server address`}
                    value={defaultServerAddress}
                    onChange={(event) => setDefaultServerAddress(event.target.value)}
                  />
                </label>
                <label>
                  <span>Server port</span>
                  <input
                    aria-label={`${profile.name} default server port`}
                    min={1}
                    max={65535}
                    step={1}
                    type="number"
                    value={defaultServerPort}
                    onChange={(event) => setDefaultServerPort(event.target.value)}
                  />
                </label>
                <label>
                  <span>JVM args</span>
                  <input
                    aria-label={`${profile.name} JVM args`}
                    value={jvmArgsText}
                    onChange={(event) => setJvmArgsText(event.target.value)}
                  />
                </label>
                <label>
                  <span>Java override</span>
                  <input
                    aria-label={`${profile.name} Java override path`}
                    placeholder="Automatic"
                    value={javaRuntimeOverridePath}
                    onChange={(event) => setJavaRuntimeOverridePath(event.target.value)}
                  />
                </label>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="profile-actions" aria-label={`${profile.name} profile actions`}>
        <div className="profile-action-group" aria-label={`${profile.name} launch actions`}>
          <button className="primary-button compact" disabled={hasActiveProcess || lifecycleActionInProgress} onClick={onPlay}>
            <Play size={17} />
            {playActionLabel}
          </button>
          {packStatus === "update_available" && (
            <button
              className="secondary-button compact"
              disabled={hasActiveProcess || globalLifecycleActionInProgress}
              onClick={onUpdate}
            >
              <Download size={17} />
              {updateInProgress ? "Updating..." : hasActiveProcess ? "Running" : "Update"}
            </button>
          )}
          <button className="secondary-button compact" onClick={onInspect}>
            <Terminal size={17} />
            Launch details
          </button>
        </div>
        {activeProcess && (
          <div className="profile-action-group" aria-label={`${profile.name} process actions`}>
            <button
              className="secondary-button compact"
              disabled={activeProcess.state !== "running"}
              onClick={() => onStopProcess(activeProcess.id)}
            >
              <Square size={17} />
              {activeProcess.state === "running" ? "Stop" : "Stopping"}
            </button>
            <button className="secondary-button compact" onClick={() => onExportProcessLog(activeProcess.id)}>
              <Terminal size={17} />
              Save log
            </button>
          </div>
        )}
        <div className="profile-action-group" aria-label={`${profile.name} edit actions`}>
          <button
            className="secondary-button compact"
            disabled={hasActiveProcess || globalLifecycleActionInProgress}
            onClick={() => setCustomizing((current) => !current)}
          >
            <Settings size={17} />
            {customizing ? "Done" : "Customize"}
          </button>
          {customizing && (
            <button
              className="secondary-button compact"
                  disabled={!hasChanges || !canSave || hasActiveProcess || globalLifecycleActionInProgress}
            onClick={() =>
              onSave({
                id: profile.id,
                name: trimmedName,
                loader,
                gameVersion: trimmedGameVersion,
                memoryMb,
                jvmArgs: nextJvmArgs,
                resolution: nextResolution,
                clearResolution,
                defaultServer: nextDefaultServer,
                clearDefaultServer,
                javaRuntimeOverridePath: nextJavaRuntimeOverridePath,
                clearJavaRuntimeOverride,
              })
            }
            >
              <Save size={17} />
              Save
            </button>
          )}
        </div>
        {(customizing || deleteConfirming) && (
          <div className="profile-action-group" aria-label={`${profile.name} danger actions`}>
            {deleteConfirming ? (
              <>
                <span className="profile-delete-note">
                  Deletes this profile's files. Shared Minecraft downloads are kept for faster reinstalls.
                </span>
                <button
                  className="secondary-button compact danger"
                  disabled={hasActiveProcess || globalLifecycleActionInProgress}
                  onClick={() => onDelete({ id: profile.id })}
                >
                  <Trash2 size={17} />
                  {deleteInProgress ? "Deleting..." : "Confirm delete"}
                </button>
                <button
                  className="secondary-button compact"
                  disabled={deleteInProgress}
                  onClick={() => {
                    setDeleteConfirming(false);
                    onDeleteCancel();
                  }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  className="secondary-button compact danger"
                  disabled={hasActiveProcess || globalLifecycleActionInProgress}
                  onClick={() => onArchive({ id: profile.id })}
                >
                  <Archive size={17} />
                  {hasActiveProcess ? "Running" : "Archive"}
                </button>
                <button
                  className="secondary-button compact danger"
                  disabled={hasActiveProcess || lifecycleActionInProgress}
                  onClick={() => setDeleteConfirming(true)}
                >
                  <Trash2 size={17} />
                  {deleteInProgress ? "Deleting..." : hasActiveProcess ? "Running" : "Delete"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Setting({ label, value }: { label: string; value: string }) {
  return (
    <div className="setting">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

declare global {
  interface Window {
    __theBoysLauncherRoot?: Root;
  }
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("TheBoysLauncher root element was not found");
}

const root = window.__theBoysLauncherRoot ?? createRoot(rootElement);
window.__theBoysLauncherRoot = root;
root.render(<App />);

