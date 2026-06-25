import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import {
  Activity,
  Box,
  Download,
  FolderInput,
  Gamepad2,
  Library,
  MessageCircle,
  Play,
  Search,
  Server,
  Settings,
  ShieldCheck,
  UserPlus,
  Wrench,
} from "lucide-react";
import "./styles.css";

type LauncherSettings = {
  maxMemoryMb: number;
  minMemoryMb: number;
  offlineUsername: string;
  telemetryEnabled: boolean;
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
  lastPlayed?: string;
  memoryMb: number;
};

type ImportCandidate = {
  id: string;
  source: string;
  name: string;
  path: string;
  kind: "prism" | "multimc" | "minecraft" | "gdlauncher" | "atlauncher";
};

type AppSnapshot = {
  settings: LauncherSettings;
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
    },
    {
      id: "latest-release",
      name: "Latest Release",
      loader: "vanilla",
      gameVersion: "1.21.8",
      memoryMb: 4096,
    },
  ],
  imports: [],
};

function statusLabel(status: PackSummary["status"]) {
  switch (status) {
    case "installed":
      return "Ready";
    case "update_available":
      return "Update";
    case "repair_needed":
      return "Repair";
    default:
      return "Install";
  }
}

function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(fallbackSnapshot);
  const [activeView, setActiveView] = useState("home");
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState("Launcher ready");
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    invoke<AppSnapshot>("bootstrap_snapshot")
      .then((data) => {
        setSnapshot(data);
        setIsNative(true);
      })
      .catch(() => {
        setIsNative(false);
      });
  }, []);

  const filteredPacks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return snapshot.packs;
    return snapshot.packs.filter((pack) => {
      return pack.name.toLowerCase().includes(q) || pack.tagline.toLowerCase().includes(q);
    });
  }, [query, snapshot.packs]);

  const primaryPack = snapshot.packs[0];
  const playingFriends = snapshot.friends.filter((friend) => friend.state === "playing");

  async function runNativeAction(label: string, command: string, payload?: Record<string, unknown>) {
    setActivity(label);
    try {
      await invoke(command, payload);
      setActivity(`${label} queued`);
    } catch {
      setActivity(`${label} is mocked in web preview`);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">TB</div>
          <div>
            <strong>TheBoys</strong>
            <span>Native alpha</span>
          </div>
        </div>

        <nav>
          {[
            ["home", Gamepad2, "Play"],
            ["library", Library, "Library"],
            ["friends", MessageCircle, "Friends"],
            ["imports", FolderInput, "Import"],
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

        <div className="connection-card">
          <ShieldCheck size={18} />
          <div>
            <strong>{isNative ? "Desktop connected" : "Web preview"}</strong>
            <span>{activity}</span>
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
          <button className="ghost-button" onClick={() => runNativeAction("Microsoft login", "start_microsoft_login")}>
            Sign in
          </button>
        </header>

        {activeView === "home" && (
          <div className="view-grid">
            <section className="hero">
              <div>
                <span className="eyebrow">Friends are playing</span>
                <h1>{primaryPack?.name ?? "Choose a pack"}</h1>
                <p>{primaryPack?.tagline ?? "Install a profile and jump in with everyone."}</p>
              </div>
              <div className="hero-actions">
                <button
                  className="primary-button"
                  onClick={() => runNativeAction("Launching profile", "launch_profile", { profileId: primaryPack?.id })}
                >
                  <Play size={20} />
                  Play
                </button>
                <button
                  className="secondary-button"
                  onClick={() => runNativeAction("Repairing profile", "repair_profile", { profileId: primaryPack?.id })}
                >
                  <Wrench size={18} />
                  Repair
                </button>
              </div>
            </section>

            <section className="panel friends-panel">
              <div className="section-title">
                <h2>Now Online</h2>
                <span>{snapshot.friends.length} friends</span>
              </div>
              {snapshot.friends.map((friend) => (
                <div className="friend-row" key={friend.id}>
                  <div className="avatar" style={{ background: friend.avatarColor }}>
                    {friend.name.slice(0, 1)}
                  </div>
                  <div>
                    <strong>{friend.name}</strong>
                    <span>
                      {friend.state === "playing"
                        ? `${friend.packName} - ${friend.serverName}`
                        : friend.state === "idle"
                          ? "Away"
                          : "Online"}
                    </span>
                  </div>
                  {friend.joinable && <button className="tiny-button">Join</button>}
                </div>
              ))}
            </section>

            <section className="panel span-2">
              <div className="section-title">
                <h2>Featured Packs</h2>
                <span>{playingFriends.length} active parties</span>
              </div>
              <div className="pack-grid">
                {filteredPacks.map((pack) => (
                  <PackCard key={pack.id} pack={pack} onAction={runNativeAction} />
                ))}
              </div>
            </section>
          </div>
        )}

        {activeView === "library" && (
          <section className="panel full">
            <div className="section-title">
              <h2>Profiles</h2>
              <button className="secondary-button">
                <Box size={18} />
                New profile
              </button>
            </div>
            <div className="profile-list">
              {snapshot.profiles.map((profile) => (
                <div className="profile-row" key={profile.id}>
                  <Gamepad2 size={20} />
                  <div>
                    <strong>{profile.name}</strong>
                    <span>
                      {profile.gameVersion} - {profile.loader} - {Math.round(profile.memoryMb / 1024)} GB RAM
                    </span>
                  </div>
                  <button
                    className="primary-button compact"
                    onClick={() => runNativeAction("Launching profile", "launch_profile", { profileId: profile.id })}
                  >
                    <Play size={17} />
                    Play
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeView === "friends" && (
          <section className="panel full">
            <div className="section-title">
              <h2>Friends</h2>
              <button className="secondary-button">
                <UserPlus size={18} />
                Add friend
              </button>
            </div>
            <div className="social-empty">
              <Activity size={42} />
              <h3>Presence backend scaffold is next</h3>
              <p>Friend requests, Minecraft UUID linking, and live activity will connect to the Rust backend.</p>
            </div>
          </section>
        )}

        {activeView === "imports" && (
          <section className="panel full">
            <div className="section-title">
              <h2>Import Profiles</h2>
              <button className="secondary-button" onClick={() => runNativeAction("Scanning imports", "scan_imports")}>
                <FolderInput size={18} />
                Scan
              </button>
            </div>
            <div className="social-empty">
              <FolderInput size={42} />
              <h3>No import candidates yet</h3>
              <p>Scanners will detect Prism, MultiMC, official Minecraft, GDLauncher, and ATLauncher profiles.</p>
            </div>
          </section>
        )}

        {activeView === "settings" && (
          <section className="panel full">
            <div className="section-title">
              <h2>Settings</h2>
              <span>Native data and launch preferences</span>
            </div>
            <div className="settings-grid">
              <Setting label="Minimum memory" value={`${snapshot.settings.minMemoryMb / 1024} GB`} />
              <Setting label="Maximum memory" value={`${snapshot.settings.maxMemoryMb / 1024} GB`} />
              <Setting label="Offline username" value={snapshot.settings.offlineUsername} />
              <Setting label="Diagnostics" value={snapshot.settings.telemetryEnabled ? "Enabled" : "Disabled"} />
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function PackCard({ pack, onAction }: { pack: PackSummary; onAction: (label: string, command: string, payload?: Record<string, unknown>) => void }) {
  return (
    <article className="pack-card" style={{ "--accent": pack.accent } as React.CSSProperties}>
      <div className="pack-topline">
        <span>{pack.version}</span>
        <span>{statusLabel(pack.status)}</span>
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
      <button className="card-button" onClick={() => onAction("Installing pack", "install_pack", { packId: pack.id })}>
        <Download size={17} />
        {statusLabel(pack.status)}
      </button>
    </article>
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

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

