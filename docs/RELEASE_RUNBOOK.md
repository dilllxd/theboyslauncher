# TheBoysLauncher v4 Release Runbook

## One-Time Secrets

These GitHub Actions secrets are required before pushing a release tag:

- `TAURI_SIGNING_PRIVATE_KEY`: contents of the updater private key.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: password used when the updater key was generated.

They were set for `dilllxd/theboyslauncher` on 2026-06-29 during the release-readiness pass. The committed updater public key lives in `src-tauri/tauri.conf.json`. The local validation key and password are under ignored `target/tauri-updater.key` and `target/tauri-updater-password.txt`; do not commit them.

## Hosted Social Backend

Release clients default to `https://launcher.dylan.lol` and do not start a local backend on players' PCs.

WSL/server deployment:

```powershell
npm run social:secret
$env:THEBOYS_BACKEND_SESSION_SECRET="<strong secret>"
npm run social:build
npm run social:up
```

Default local exposure is `http://127.0.0.1:4074`. Put the production reverse proxy for `https://launcher.dylan.lol` in front of that port, or set `THEBOYS_BACKEND_HOST` / `THEBOYS_BACKEND_PORT` before `social:up`.

Useful commands:

```powershell
npm run social:status
npm run social:logs
npm run social:down
```

The GitHub Container Registry image workflow lives at `.github/workflows/social-backend-image.yml`.
GitHub only exposes newly added workflows after they exist on the default branch, so this workflow
becomes manually dispatchable after the v4 branch replaces `main` or after a release tag includes it.

## Release Build

Normal PR and branch pushes run verification only. Windows packaging runs only for `v*` tags or manual dispatch with `package_windows=true` or `publish_release=true`.

The legacy Go/Fyne release workflows (`stable-release.yml`, `dev-prerelease.yml`, and
`reset-dev-after-release.yml`) are preserved for reference but are manual-only in the
v4 branch. This keeps the old release automation from running on the first v4 `main`
promotion or consuming Actions minutes with obsolete Go builds.

For the first v4 release:

```powershell
git fetch origin main dev codex/fresh-foundation-rewrite
git push origin 022b8e3c81c0132140cff279387e10110b03d893:refs/heads/backup/main-v3-2026-06-29
```

The backup branch already exists as of this handoff.

Current v4 release-readiness evidence from `codex/fresh-foundation-rewrite`:

- Push verification run `28343669378` succeeded for commit `9cff831ea6ed57886ca5736f73622e1b5bbf2bdb`.
- Manual package validation run `28343968252` succeeded with `package_windows=true`, `publish_release=false`, and `release_tag=v4.0.0`.
- The package run uploaded artifact `TheBoysLauncher-windows-9cff831ea6ed57886ca5736f73622e1b5bbf2bdb` containing the MSI, NSIS setup exe, both `.sig` files, and `latest.json`.

Final v4.0.0 release evidence from 2026-06-29:

- `main`, `codex/fresh-foundation-rewrite`, and tag `v4.0.0` point at `f594466be1b8e82e0e132d3b9958f37d57ae70e8`.
- `backup/main-v3-2026-06-29` preserves old v3 `main` at `022b8e3c81c0132140cff279387e10110b03d893`.
- V4 Foundation tag run `28345109064` succeeded, including verification, signed Windows packaging, bundle verification, artifact upload, and release publishing.
- Social Backend Image tag run `28345109081` succeeded and published `ghcr.io/dilllxd/theboyslauncher/social-backend:v4.0.0` plus `latest`.
- GitHub Release `v4.0.0` is published, not draft, not prerelease, targeting `main`.
- Release assets are present: MSI, setup exe, both `.sig` files, and `latest.json`.
- `https://github.com/dilllxd/theboyslauncher/releases/latest/download/latest.json` returns updater metadata for version `4.0.0`.
- The setup exe URL in `latest.json` returns HTTP 200.
- The GHCR backend image was pulled and started through `npm run social:up`; `http://127.0.0.1:4074/health` returned `{"ok":true,"service":"social-backend"}`.

Remaining operations note: `https://launcher.dylan.lol/health` did not resolve on 2026-06-29. The backend container is verified locally through WSL/Docker, but production DNS/reverse proxy still needs to point `launcher.dylan.lol` at the hosted backend.

After reviewing and committing the v4 rewrite branch, replace `main` only with explicit approval:

```powershell
npm run preflight:v4-release -- v4.0.0
git push origin codex/fresh-foundation-rewrite:main --force-with-lease
git tag v4.0.0
git push origin v4.0.0
```

Expected release assets:

- `TheBoysLauncher_4.0.0_x64_en-US.msi`
- `TheBoysLauncher_4.0.0_x64-setup.exe`
- both `.sig` files
- `latest.json`

The updater endpoint is:

```text
https://github.com/dilllxd/theboyslauncher/releases/latest/download/latest.json
```
