# TheBoysLauncher v4 Rewrite Handoff

## Context

This repository originally contained a Go/Fyne Minecraft launcher that used Prism Launcher as its backend. The desired direction changed: the new launcher should be a fresh foundation, not a Prism wrapper, not a `cmd-launcher` fork, and not constrained by the old Go app.

The product goal is a modern, easy-to-use, cross-platform Minecraft launcher for friends:

- one-click curated modpack installs and updates;
- custom vanilla/modloader profiles for normal Minecraft use;
- social-first home screen showing what friends are playing;
- pack-bound servers and one-click join;
- migration/import from old TheBoysLauncher/Prism and other launchers;
- hosted backend for friends/presence/pack metadata;
- strong E2E testing to reduce regressions.

## Chosen Foundation

Use:

- Tauri v2 for the desktop shell;
- React + TypeScript + Vite for the frontend;
- Rust for the local launcher core;
- Rust backend with Postgres and WebSockets for social features.

Do not preserve Fyne. Do not keep Go as the main foundation. Do not rely on Prism, MultiMC instance format, or a third-party launcher core as a black box.

## Current Branch

Branch created for this rewrite:

```text
codex/fresh-foundation-rewrite
```

The repository has no commits yet, so this branch currently contains the working tree state.

## What Has Been Added So Far

At the repository root:

- `Cargo.toml` Rust workspace with members:
  - `src-tauri`
  - `crates/shared`
  - `crates/launcher-core`
  - `crates/social-backend`
- `package.json` with React, Vite, Tauri CLI, Tailwind, TypeScript dependencies.
- `frontend/` containing a React/Tailwind UI prototype:
  - social-first home screen;
  - library screen;
  - friends placeholder;
  - import placeholder;
  - settings screen;
  - Tauri command calls mocked gracefully when running as web preview.
- root `.gitignore`.

The legacy app remains in the repository root as the existing Go/Fyne source files. It has not been deleted on this branch.

It should be treated as migration/reference material only while new v4 code is added alongside it.

## Important Environment Finding From Old PC

On the original PC:

- Node.js was installed: `node.exe 24.18.0`.
- `npm` was installed.
- Rust/Cargo were not installed.
- Go was not on PATH.

The next PC should be checked fresh; do not assume anything is installed.

## Required Tooling On New PC

Minimum:

- Git
- Node.js 20+
- Rust stable via rustup
- Microsoft C++ Build Tools with "Desktop development with C++" workload
- WebView2 Runtime
- npm dependencies via `npm install`

Recommended for full E2E/integration workflow:

- Playwright browsers: `npx playwright install`
- Docker Desktop for Postgres-backed backend integration tests
- VS Build Tools or full Visual Studio C++ workload

Initial verification commands:

```powershell
git status --short --branch
node --version
npm --version
rustc --version
cargo --version
docker --version
```

## Plan To Continue

1. Verify tools on the new PC.
2. Install dependencies with `npm install`.
3. Add missing Rust workspace members:
   - `src-tauri/`
   - `crates/shared/`
   - `crates/launcher-core/`
   - `crates/social-backend/`
4. Add Playwright E2E harness early.
5. Verify frontend web preview with `npm run dev`.
6. Verify Tauri desktop shell with `npm run tauri:dev`.
7. Implement desktop commands:
   - `bootstrap_snapshot`
   - `start_microsoft_login`
   - `launch_profile`
   - `install_pack`
   - `repair_profile`
   - `scan_imports`
8. Implement Rust local services:
   - data directories;
   - settings load/save;
   - profile model;
   - event stream;
   - process runner;
   - import scanner skeleton.
9. Build first launcher-core milestone:
   - vanilla version manifest resolution;
   - assets/libraries download plan;
   - Java runtime strategy;
   - offline launch command builder;
   - Microsoft auth after the launch skeleton is stable.
10. Build backend scaffold:
   - Rust API service;
   - Postgres schema;
   - WebSocket presence model;
   - account linking by Minecraft UUID.

## Fresh Foundation Plan

### Summary

Start from zero. The best route is:

```text
Tauri v2 + React/TypeScript frontend + Rust launcher core + Rust hosted backend
```

This gives a modern web-quality UI, small native desktop apps, cross-platform packaging, safe filesystem/process/download code, and a clean foundation for social presence.

### Core Decisions

- Use Tauri v2 for desktop.
- Use React + TypeScript + Vite for UI.
- Use Rust for local launcher core.
- Build first-party Minecraft launch core instead of wrapping a launcher black box.
- Use Rust backend with Postgres and WebSockets.
- Use Microsoft/Minecraft login as the primary player identity; social backend links by Minecraft UUID/name.

### Product Shape

- Home screen is social-first:
  - Play CTA;
  - friends online;
  - active pack/server;
  - featured packs;
  - install/update/repair states.
- Library supports:
  - curated packs;
  - custom vanilla profiles;
  - Fabric, Quilt, Forge, NeoForge profiles;
  - imported profiles;
  - memory, Java, resolution, JVM args, server quick-join, logs, saves.
- Server experience:
  - packs define official/default servers;
  - friends can be joined if the profile is installed;
  - missing/outdated profiles install or update first, then join.

### Implementation Phases

1. Foundation spike:
   - Tauri + React + Rust workspace;
   - local directories, settings, logging, typed events, process runner;
   - prove vanilla Microsoft-auth launch and offline launch.
2. Native Minecraft core:
   - manifest resolution;
   - asset/library/native downloads;
   - Java runtime selection/download;
   - launch args;
   - process supervision;
   - Fabric, Quilt, Forge, NeoForge.
3. Pack/profile system:
   - curated catalog;
   - packwiz;
   - custom profiles;
   - repair/reinstall/update.
4. Modern UI:
   - onboarding;
   - Microsoft login;
   - Home, Library, Pack/Profile detail, Launch Progress, Logs, Settings.
5. Social backend:
   - Minecraft UUID account linking;
   - friend search/request/accept/block;
   - WebSocket presence;
   - pack/server metadata.
6. Migration/import:
   - old TheBoysLauncher/Prism data;
   - Prism, MultiMC, official Minecraft, GDLauncher, ATLauncher;
   - copy saves/options/resourcepacks/shaderpacks/screenshots/configs without mutating source.
7. Distribution:
   - signed Tauri updater;
   - CI builds for Windows/macOS/Linux;
   - code signing/notarization;
   - diagnostics upload.

## Testing Expectations

Add E2E early and keep it running throughout.

Recommended layers:

- Rust unit tests for launcher-core models/resolvers.
- Rust integration tests for filesystem/import behavior using temp dirs.
- Backend tests using Docker/Postgres.
- Playwright tests for frontend flows.
- Tauri command tests where practical.

Initial Playwright scenarios:

- home screen renders social launcher shell;
- search filters featured packs;
- library profile Play button calls launch action;
- import screen exposes scan action;
- settings render memory/offline profile data;
- no UI overlap at desktop and small-window sizes.

Later E2E:

- first-run onboarding;
- Microsoft login mocked;
- install/update/repair mocked;
- launch progress event stream mocked;
- friend presence mocked;
- migration scan with fixture directories.

## Prompt For Next Session

Use this prompt in the new Codex session on the development PC:

```text
We are continuing TheBoysLauncher v4 rewrite on branch `codex/fresh-foundation-rewrite`.

Context:
- This is a fresh foundation for a social Minecraft launcher.
- Do not preserve the old Go/Fyne/Prism app as the architecture.
- Use Tauri v2 + React/TypeScript + Vite + Rust launcher core + Rust backend.
- The legacy Go/Fyne app remains in the repo root and is reference/migration material only.
- Read `docs/REWRITE_HANDOFF.md` first.

First tasks:
1. Inspect the repo and confirm the branch/status.
2. Check installed tools: node, npm, rustc, cargo, docker.
3. If dependencies are available, run `npm install`.
4. Finish the scaffold that was started:
   - create `src-tauri/`;
   - create `crates/shared/`;
   - create `crates/launcher-core/`;
   - create `crates/social-backend/`;
   - wire Tauri commands used by `frontend/src/main.tsx`;
   - add Playwright E2E setup.
5. Verify frontend with `npm run build` and, if Rust/Tauri are available, `npm run tauri:dev` or `cargo check`.

Keep edits focused on the new v4 foundation. Do not delete legacy code. Add tests as you go.
```
