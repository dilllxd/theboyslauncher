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

## Release Build

Normal PR and branch pushes run verification only. Windows packaging runs only for `v*` tags or manual dispatch with `package_windows=true` or `publish_release=true`.

For the first v4 release:

```powershell
git fetch origin main dev codex/fresh-foundation-rewrite
git push origin 022b8e3c81c0132140cff279387e10110b03d893:refs/heads/backup/main-v3-2026-06-29
```

The backup branch already exists as of this handoff.

After reviewing and committing the v4 rewrite branch, replace `main` only with explicit approval:

```powershell
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
