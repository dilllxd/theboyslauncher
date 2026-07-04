#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::{
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use launcher_core::{
    archive_profile as core_archive_profile,
    authenticate_and_save_minecraft_session as core_authenticate_and_save_minecraft_session,
    authenticate_minecraft_session as core_authenticate_minecraft_session,
    authenticate_with_xbox_live as core_authenticate_with_xbox_live,
    authorize_xsts_for_minecraft as core_authorize_xsts_for_minecraft,
    bootstrap_snapshot as core_bootstrap_snapshot,
    bootstrap_snapshot_with_remote_catalog as core_bootstrap_snapshot_with_remote_catalog,
    build_atlauncher_modpack_install_plan_from_config_json as core_build_atlauncher_modpack_install_plan_from_config_json,
    build_authenticated_launch_plan as core_build_authenticated_launch_plan,
    build_curated_pack_file_download_plan as core_build_curated_pack_file_download_plan,
    build_curseforge_modpack_archive_install_plan as core_build_curseforge_modpack_archive_install_plan,
    build_ftb_legacy_modpack_archive_install_plan as core_build_ftb_legacy_modpack_archive_install_plan,
    build_ftb_modpack_install_plan_from_version_json as core_build_ftb_modpack_install_plan_from_version_json,
    build_install_auxiliary_download_plan as core_build_install_auxiliary_download_plan,
    build_launch_failed_operation_plan as core_build_launch_failed_operation_plan,
    build_launch_operation_plan as core_build_launch_operation_plan,
    build_launch_planning_failed_operation_plan as core_build_launch_planning_failed_operation_plan,
    build_managed_java_runtime_download_plan as core_build_managed_java_runtime_download_plan,
    build_modloader_dependency_download_plan_for_profile as core_build_modloader_dependency_download_plan_for_profile,
    build_modloader_download_plan as core_build_modloader_download_plan,
    build_modloader_download_plan_for_profile_with_loader_version as core_build_modloader_download_plan_for_profile_with_loader_version,
    build_modrinth_modpack_archive_install_plan as core_build_modrinth_modpack_archive_install_plan,
    build_offline_launch_plan as core_build_offline_launch_plan,
    build_offline_launch_plan_with_server as core_build_offline_launch_plan_with_server,
    build_process_command_spec as core_build_process_command_spec,
    build_repair_auxiliary_download_plan as core_build_repair_auxiliary_download_plan,
    build_stored_authenticated_launch_plan as core_build_stored_authenticated_launch_plan,
    build_technic_modpack_archive_install_plan as core_build_technic_modpack_archive_install_plan,
    build_vanilla_download_plan as core_build_vanilla_download_plan,
    clear_minecraft_session as core_clear_minecraft_session, create_profile as core_create_profile,
    delete_profile as core_delete_profile,
    direct_pack_file_download_plan as core_direct_pack_file_download_plan,
    discover_java_runtimes as core_discover_java_runtimes,
    duplicate_profile as core_duplicate_profile,
    exchange_microsoft_authorization_code as core_exchange_microsoft_authorization_code,
    execute_download_plan_with_event_callback as core_execute_download_plan_with_event_callback,
    execute_import_plan_and_persist_profile as core_execute_import_plan_and_persist_profile,
    execute_managed_java_runtime_install as core_execute_managed_java_runtime_install,
    execute_modloader_installer_processors_for_profile_with_event_callback as core_execute_modloader_installer_processors_for_profile_with_event_callback,
    extract_atlauncher_archives as core_extract_atlauncher_archives,
    extract_curseforge_modpack_archive as core_extract_curseforge_modpack_archive,
    extract_ftb_legacy_modpack_archive as core_extract_ftb_legacy_modpack_archive,
    extract_modloader_installer_metadata_for_profile as core_extract_modloader_installer_metadata_for_profile,
    extract_modrinth_modpack_archive as core_extract_modrinth_modpack_archive,
    extract_native_libraries_from_download_plan as core_extract_native_libraries_from_download_plan,
    extract_technic_modpack_archive as core_extract_technic_modpack_archive,
    fetch_atlauncher_modpack_install_plan as core_fetch_atlauncher_modpack_install_plan,
    fetch_curseforge_modpack_download_plan as core_fetch_curseforge_modpack_download_plan,
    fetch_ftb_legacy_modpack_download_plan as core_fetch_ftb_legacy_modpack_download_plan,
    fetch_ftb_modpack_install_plan as core_fetch_ftb_modpack_install_plan,
    fetch_install_auxiliary_download_plan_for_catalog_entry_profile as core_fetch_install_auxiliary_download_plan_for_catalog_entry_profile,
    fetch_install_auxiliary_download_plan_for_pack_profile_with_remote_catalog as core_fetch_install_auxiliary_download_plan_for_pack_profile_with_remote_catalog,
    fetch_minecraft_entitlements as core_fetch_minecraft_entitlements,
    fetch_minecraft_profile as core_fetch_minecraft_profile, fetch_minecraft_version_manifest,
    fetch_pack_install_profile_from_catalog_entry as core_fetch_pack_install_profile_from_catalog_entry,
    fetch_pack_install_profile_with_remote_catalog as core_fetch_pack_install_profile_with_remote_catalog,
    fetch_packwiz_metafile_download_plan as core_fetch_packwiz_metafile_download_plan,
    fetch_recommended_java_runtime_manifest as core_fetch_recommended_java_runtime_manifest,
    fetch_repair_auxiliary_download_plan_for_profile_with_remote_catalog as core_fetch_repair_auxiliary_download_plan_for_profile_with_remote_catalog,
    fetch_technic_modpack_download_plan as core_fetch_technic_modpack_download_plan,
    java_runtime_request_from_manifest_entry as core_java_runtime_request_from_manifest_entry,
    launch_profile as core_launch_profile, list_minecraft_accounts as core_list_minecraft_accounts,
    load_minecraft_session as core_load_minecraft_session, load_profiles as core_load_profiles,
    load_settings as core_load_settings,
    login_minecraft_with_xbox as core_login_minecraft_with_xbox,
    managed_process_lifecycle_event as core_managed_process_lifecycle_event,
    mark_profile_launched as core_mark_profile_launched,
    minecraft_version_summaries as core_minecraft_version_summaries,
    modpack_archive_contains_modrinth_index as core_modpack_archive_contains_modrinth_index,
    persist_installed_pack_profile as core_persist_installed_pack_profile,
    plan_download_artifacts as core_plan_download_artifacts,
    plan_install_pack_with_remote_catalog as core_plan_install_pack_with_remote_catalog,
    plan_managed_java_runtime_install as core_plan_managed_java_runtime_install,
    plan_microsoft_token_exchange as core_plan_microsoft_token_exchange,
    plan_profile_import as core_plan_profile_import,
    plan_repair_profile as core_plan_repair_profile,
    prepare_launcher_directories as core_prepare_launcher_directories,
    recommended_java_runtime_manifest as core_recommended_java_runtime_manifest,
    refresh_saved_minecraft_session as core_refresh_saved_minecraft_session,
    remove_minecraft_account as core_remove_minecraft_account,
    required_java_major_for_minecraft as core_required_java_major_for_minecraft,
    resolve_minecraft_version as core_resolve_minecraft_version,
    resolve_modrinth_modpack_archive as core_resolve_modrinth_modpack_archive,
    resolve_modrinth_modpack_archive_version as core_resolve_modrinth_modpack_archive_version,
    save_minecraft_session as core_save_minecraft_session, save_settings as core_save_settings,
    scan_imports as core_scan_imports, search_discover_modpacks as core_search_discover_modpacks,
    search_modrinth_modpacks as core_search_modrinth_modpacks,
    select_java_runtime as core_select_java_runtime,
    select_minecraft_account as core_select_minecraft_account,
    start_microsoft_auth_flow as core_start_microsoft_auth_flow,
    start_microsoft_login as core_start_microsoft_login, update_profile as core_update_profile,
    FtbLegacyModpackDownloadPlan, LauncherEventLog, ProcessRegistry, TechnicModpackDownloadKind,
    TechnicModpackDownloadPlan,
};
use reqwest::Url;
use sha2::{Digest, Sha256};
use shared::{
    ActionReceipt, ActionStatus, AppSnapshot, ArchiveProfileRequest, CreateProfileRequest,
    DeleteProfileRequest, DiscoverModpackSearchResult, DownloadItem, DownloadKind, DownloadPlan,
    DuplicateProfileRequest, ImportCandidate, ImportPlan, ImportPlanRequest,
    InstallDiscoveredModpackRequest, InstallModpackArchiveRequest, JavaRuntimeDownloadRequest,
    JavaRuntimeManifestEntry, JavaRuntimeSummary, LaunchPlan, LauncherAction, LauncherDirectories,
    LauncherEvent, LauncherEventKind, LauncherOperation, LauncherSettings, ManagedProcessSummary,
    MicrosoftAuthCallback, MicrosoftAuthStart, MicrosoftOAuthTokens, MicrosoftTokenExchangePlan,
    MinecraftEntitlements, MinecraftProfile, MinecraftServicesToken, MinecraftSession,
    MinecraftVersionSummary, ModpackCatalogEntry, ModrinthModpackArchiveResolution,
    ModrinthModpackSearchResult, OperationPlan, ProcessCommandSpec, ProcessLogExport,
    ProfileSummary, ServerLaunchTarget, SocialBackendStatus, StoredMinecraftAccountSummary,
    StoredMinecraftSession, UpdateProfileRequest, XboxLiveAuthToken,
};
use tauri::{Emitter, Manager, State};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    time::timeout,
};
use uuid::Uuid;

const DEFAULT_BACKEND_BIND_ADDR: &str = "127.0.0.1:4074";
const DEFAULT_RELEASE_SOCIAL_BACKEND_URL: &str = "https://launcher.dylan.lol";
const SOCIAL_BACKEND_URL_ENV: &str = "THEBOYS_SOCIAL_BACKEND_URL";
const BACKEND_HEALTH_PATH: &str = "/health";
const MICROSOFT_CALLBACK_BIND_ADDR: &str = "localhost:53682";
const MICROSOFT_CALLBACK_IPV4_BIND_ADDR: &str = "127.0.0.1:53682";
const MICROSOFT_CALLBACK_IPV6_BIND_ADDR: &str = "[::1]:53682";
const MICROSOFT_CALLBACK_ORIGIN: &str = "http://localhost:53682";
const MICROSOFT_CALLBACK_PATH: &str = "/";
const MICROSOFT_CALLBACK_TIMEOUT: Duration = Duration::from_secs(180);
const MICROSOFT_CLIENT_ID_ENV: &str = "THEBOYS_MICROSOFT_CLIENT_ID";
const DEFAULT_MICROSOFT_CLIENT_ID: &str = "d10dfc60-1a42-44a8-b3af-edf4f5ee2c1f";
const PACKAGED_SMOKE_AUTH_FLOW_ENV: &str = "THEBOYS_PACKAGED_SMOKE_AUTH_FLOW";
const PACKAGED_SMOKE_AUTH_FLOW_FILE: &str = "packaged-auth-flow-smoke.json";
const PACKAGED_SMOKE_PROFILE_LIFECYCLE_ENV: &str = "THEBOYS_PACKAGED_SMOKE_PROFILE_LIFECYCLE";
const PACKAGED_SMOKE_PROFILE_LIFECYCLE_FILE: &str = "packaged-profile-lifecycle-smoke.json";
const PACKAGED_SMOKE_IMPORT_LIFECYCLE_ENV: &str = "THEBOYS_PACKAGED_SMOKE_IMPORT_LIFECYCLE";
const PACKAGED_SMOKE_IMPORT_LIFECYCLE_FILE: &str = "packaged-import-lifecycle-smoke.json";
const PACKAGED_SMOKE_PACKWIZ_INSTALL_ENV: &str = "THEBOYS_PACKAGED_SMOKE_PACKWIZ_INSTALL";
const PACKAGED_SMOKE_PACKWIZ_INSTALL_FILE: &str = "packaged-packwiz-install-smoke.json";
const PACKAGED_SMOKE_UPDATE_HANDOFF_ENV: &str = "THEBOYS_PACKAGED_SMOKE_UPDATE_HANDOFF";
const PACKAGED_SMOKE_UPDATE_HANDOFF_FILE: &str = "packaged-update-handoff-smoke.json";
const PACKAGED_SMOKE_LAUNCH_PREFLIGHT_ENV: &str = "THEBOYS_PACKAGED_SMOKE_LAUNCH_PREFLIGHT";
const PACKAGED_SMOKE_LAUNCH_PREFLIGHT_FILE: &str = "packaged-launch-preflight-smoke.json";
const PACKAGED_SMOKE_ACCOUNT_LIFECYCLE_ENV: &str = "THEBOYS_PACKAGED_SMOKE_ACCOUNT_LIFECYCLE";
const PACKAGED_SMOKE_ACCOUNT_LIFECYCLE_FILE: &str = "packaged-account-lifecycle-smoke.json";
const PACKAGED_SMOKE_AUTH_RECOVERY_ENV: &str = "THEBOYS_PACKAGED_SMOKE_AUTH_RECOVERY";
const PACKAGED_SMOKE_AUTH_RECOVERY_FILE: &str = "packaged-auth-recovery-smoke.json";
const PACKAGED_SMOKE_STORED_AUTH_LAUNCH_ENV: &str = "THEBOYS_PACKAGED_SMOKE_STORED_AUTH_LAUNCH";
const PACKAGED_SMOKE_STORED_AUTH_LAUNCH_FILE: &str = "packaged-stored-auth-launch-smoke.json";
const PACKAGED_SMOKE_MODRINTH_ARCHIVE_INSTALL_ENV: &str =
    "THEBOYS_PACKAGED_SMOKE_MODRINTH_ARCHIVE_INSTALL";
const PACKAGED_SMOKE_MODRINTH_ARCHIVE_INSTALL_FILE: &str =
    "packaged-modrinth-archive-install-smoke.json";
const PACKAGED_SMOKE_CURSEFORGE_ARCHIVE_INSTALL_ENV: &str =
    "THEBOYS_PACKAGED_SMOKE_CURSEFORGE_ARCHIVE_INSTALL";
const PACKAGED_SMOKE_CURSEFORGE_ARCHIVE_INSTALL_FILE: &str =
    "packaged-curseforge-archive-install-smoke.json";
const PACKAGED_SMOKE_FTB_LEGACY_ARCHIVE_INSTALL_ENV: &str =
    "THEBOYS_PACKAGED_SMOKE_FTB_LEGACY_ARCHIVE_INSTALL";
const PACKAGED_SMOKE_FTB_LEGACY_ARCHIVE_INSTALL_FILE: &str =
    "packaged-ftb-legacy-archive-install-smoke.json";
const PACKAGED_SMOKE_FTB_INSTALL_ENV: &str = "THEBOYS_PACKAGED_SMOKE_FTB_INSTALL";
const PACKAGED_SMOKE_FTB_INSTALL_FILE: &str = "packaged-ftb-install-smoke.json";
const PACKAGED_SMOKE_TECHNIC_ARCHIVE_INSTALL_ENV: &str =
    "THEBOYS_PACKAGED_SMOKE_TECHNIC_ARCHIVE_INSTALL";
const PACKAGED_SMOKE_TECHNIC_ARCHIVE_INSTALL_FILE: &str =
    "packaged-technic-archive-install-smoke.json";
const PACKAGED_SMOKE_ATLAUNCHER_INSTALL_ENV: &str = "THEBOYS_PACKAGED_SMOKE_ATLAUNCHER_INSTALL";
const PACKAGED_SMOKE_ATLAUNCHER_INSTALL_FILE: &str = "packaged-atlauncher-install-smoke.json";
const PACKAGED_SMOKE_ACTIVITY_PROGRESS_ENV: &str = "THEBOYS_PACKAGED_SMOKE_ACTIVITY_PROGRESS";
const PACKAGED_SMOKE_ACTIVITY_PROGRESS_FILE: &str = "packaged-activity-progress-smoke.json";
const PACKAGED_SMOKE_JAVA_RECOVERY_ENV: &str = "THEBOYS_PACKAGED_SMOKE_JAVA_RECOVERY";
const PACKAGED_SMOKE_JAVA_RECOVERY_FILE: &str = "packaged-java-recovery-smoke.json";
const PACKAGED_SMOKE_DISCOVER_ROUTING_ENV: &str = "THEBOYS_PACKAGED_SMOKE_DISCOVER_ROUTING";
const PACKAGED_SMOKE_DISCOVER_ROUTING_FILE: &str = "packaged-discover-routing-smoke.json";
const PACKAGED_SMOKE_PROCESS_LIFECYCLE_ENV: &str = "THEBOYS_PACKAGED_SMOKE_PROCESS_LIFECYCLE";
const PACKAGED_SMOKE_PROCESS_LIFECYCLE_FILE: &str = "packaged-process-lifecycle-smoke.json";
const REDACTED_RENDERER_TOKEN: &str = "[redacted]";
const ALLOW_RENDERER_SESSION_SAVE_ENV: &str = "THEBOYS_ALLOW_RENDERER_SESSION_SAVE";

#[derive(Default)]
struct LifecycleOperationGate {
    active: Mutex<Option<String>>,
}

struct LifecycleOperationGuard<'a> {
    gate: &'a LifecycleOperationGate,
}

impl LifecycleOperationGate {
    fn acquire(
        &self,
        description: impl Into<String>,
    ) -> Result<LifecycleOperationGuard<'_>, String> {
        let description = description.into();
        let mut active = self
            .active
            .lock()
            .map_err(|_| "launcher lifecycle operation lock poisoned".to_owned())?;
        if let Some(active) = active.as_ref() {
            return Err(format!(
                "another launcher lifecycle operation is already running: {active}"
            ));
        }
        *active = Some(description);
        Ok(LifecycleOperationGuard { gate: self })
    }

    #[cfg(test)]
    fn active_description(&self) -> Result<Option<String>, String> {
        self.active
            .lock()
            .map(|active| active.clone())
            .map_err(|_| "launcher lifecycle operation lock poisoned".to_owned())
    }
}

impl Drop for LifecycleOperationGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut active) = self.gate.active.lock() {
            *active = None;
        }
    }
}

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct BackendSessionResponse {
    account_id: String,
    token_type: String,
    #[serde(default)]
    session_kind: Option<String>,
    access_token: String,
    authorization_header: String,
    #[serde(default)]
    issued_at_unix_seconds: Option<u64>,
    #[serde(default)]
    expires_at_unix_seconds: Option<u64>,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct MinecraftSessionExchangeRequest {
    minecraft_uuid: Uuid,
    minecraft_name: String,
    access_token: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    expires_at_unix_seconds: Option<u64>,
}
const MICROSOFT_CALLBACK_MAX_REQUEST_BYTES: usize = 16 * 1024;
const LAUNCH_STARTUP_GRACE_PERIOD: Duration = Duration::from_secs(2);

#[derive(Clone, Debug, PartialEq, Eq)]
enum BackendExecutableSource {
    Env,
    Adjacent,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct BackendExecutable {
    path: PathBuf,
    source: BackendExecutableSource,
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum BackendEndpoint {
    Hosted { origin: String, health_url: String },
    Local { bind_addr: String },
    Disabled,
}

impl BackendEndpoint {
    fn kind(&self) -> &'static str {
        match self {
            BackendEndpoint::Hosted { .. } => "hosted",
            BackendEndpoint::Local { .. } => "local",
            BackendEndpoint::Disabled => "disabled",
        }
    }

    fn display_address(&self) -> String {
        match self {
            BackendEndpoint::Hosted { origin, .. } => origin.clone(),
            BackendEndpoint::Local { bind_addr } => bind_addr.clone(),
            BackendEndpoint::Disabled => "off".to_owned(),
        }
    }

    fn health_url(&self) -> String {
        match self {
            BackendEndpoint::Hosted { health_url, .. } => health_url.clone(),
            BackendEndpoint::Local { bind_addr } => backend_health_url(bind_addr),
            BackendEndpoint::Disabled => String::new(),
        }
    }

    fn is_local(&self) -> bool {
        matches!(self, BackendEndpoint::Local { .. })
    }
}

struct SocialBackendService {
    endpoint: BackendEndpoint,
    state_path: Option<PathBuf>,
    session_secret: Option<String>,
    executable: Option<BackendExecutable>,
    child: Mutex<Option<Child>>,
}

impl SocialBackendService {
    fn from_env(
        resource_dir: Option<PathBuf>,
        app_data_dir: Option<PathBuf>,
    ) -> Result<Self, String> {
        let bind_addr = std::env::var("THEBOYS_BACKEND_BIND")
            .unwrap_or_else(|_| DEFAULT_BACKEND_BIND_ADDR.to_owned());
        let endpoint = resolve_backend_endpoint(
            std::env::var_os(SOCIAL_BACKEND_URL_ENV),
            compile_time_social_backend_url(),
            default_release_social_backend_url(),
            bind_addr,
        )?;
        let (state_path, session_secret, executable) = if endpoint.is_local() {
            let state_path = resolve_backend_state_path(
                std::env::var_os("THEBOYS_BACKEND_STATE_PATH"),
                app_data_dir.clone(),
            );
            let session_secret = resolve_backend_session_secret(
                std::env::var_os("THEBOYS_BACKEND_SESSION_SECRET"),
                app_data_dir,
            )
            .unwrap_or_else(|error| {
                tracing::error!(%error, "failed to prepare social backend session secret");
                None
            });
            let executable = resolve_backend_executable(
                std::env::var_os("THEBOYS_BACKEND_EXE"),
                None,
                resource_dir,
            );
            (state_path, session_secret, executable)
        } else {
            (None, None, None)
        };
        Ok(Self {
            endpoint,
            state_path,
            session_secret,
            executable,
            child: Mutex::new(None),
        })
    }

    fn health_url(&self) -> String {
        self.endpoint.health_url()
    }

    async fn status(&self) -> SocialBackendStatus {
        let _ = self.reap_exited_child();
        let health_url = self.health_url();
        let running = if matches!(self.endpoint, BackendEndpoint::Disabled) {
            false
        } else {
            backend_health_check(&health_url).await
        };
        let process_id = self.managed_process_id();
        let managed = process_id.is_some();
        let can_start = self.endpoint.is_local() && !running && self.executable.is_some();
        let message = match &self.endpoint {
            BackendEndpoint::Hosted { origin, .. } => {
                if running {
                    format!("Hosted friends service is reachable at {origin}")
                } else {
                    format!("Hosted friends service is configured at {origin} but is not reachable; local launcher features remain available")
                }
            }
            BackendEndpoint::Local { .. } => {
                if running {
                    "Local friends service is reachable".to_owned()
                } else if let Some(executable) = self.executable.as_ref() {
                    match executable.source {
                        BackendExecutableSource::Env => {
                            "Local friends service is not reachable; configured service can be started".to_owned()
                        }
                        BackendExecutableSource::Adjacent => {
                            "Local friends service is not reachable; packaged service can be started".to_owned()
                        }
                    }
                } else {
                    "Local friends service is not reachable and no packaged service was found"
                        .to_owned()
                }
            }
            BackendEndpoint::Disabled => {
                "Friends service is turned off. Minecraft still works.".to_owned()
            }
        };
        SocialBackendStatus {
            endpoint_kind: self.endpoint.kind().to_owned(),
            endpoint_url: self.endpoint.display_address(),
            bind_addr: self.endpoint.display_address(),
            health_url,
            running,
            managed,
            can_start,
            process_id,
            message,
        }
    }

    async fn start(&self) -> Result<SocialBackendStatus, String> {
        if let BackendEndpoint::Hosted { origin, .. } = &self.endpoint {
            return Err(format!(
                "Hosted friends service is configured at {origin}; packaged clients do not start a local service unless {SOCIAL_BACKEND_URL_ENV}=local is set"
            ));
        }
        if matches!(self.endpoint, BackendEndpoint::Disabled) {
            return Err(format!(
                "Friends service is turned off; set {SOCIAL_BACKEND_URL_ENV}=local to start the packaged local service"
            ));
        }
        if backend_health_check(&self.health_url()).await {
            return Ok(self.status().await);
        }

        {
            self.reap_exited_child()?;
            let mut child = self.child.lock().map_err(|_| "backend lock poisoned")?;
            if child.is_none() {
                let executable = self.executable.as_ref().ok_or_else(|| {
                    "a packaged friends service or THEBOYS_BACKEND_EXE is required before it can be started"
                        .to_owned()
                })?;
                let mut command = backend_start_command(
                    &executable.path,
                    &self.endpoint.display_address(),
                    self.state_path.as_deref(),
                    self.session_secret.as_deref(),
                );
                let process = command
                    .spawn()
                    .map_err(|error| format!("failed to start friends service: {error}"))?;
                *child = Some(process);
            }
        }

        for _ in 0..50 {
            if backend_health_check(&self.health_url()).await {
                return Ok(self.status().await);
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }

        Ok(self.status().await)
    }

    async fn stop(&self) -> Result<SocialBackendStatus, String> {
        self.stop_managed_child()?;
        Ok(self.status().await)
    }

    fn stop_managed_child(&self) -> Result<(), String> {
        let mut child = {
            let mut managed = self.child.lock().map_err(|_| "backend lock poisoned")?;
            managed.take()
        };
        if let Some(process) = child.as_mut() {
            if process
                .try_wait()
                .map_err(|error| error.to_string())?
                .is_none()
            {
                process.kill().map_err(|error| error.to_string())?;
                process.wait().map_err(|error| error.to_string())?;
            }
        }
        Ok(())
    }

    fn reap_exited_child(&self) -> Result<(), String> {
        let mut child = self.child.lock().map_err(|_| "backend lock poisoned")?;
        if let Some(process) = child.as_mut() {
            if process
                .try_wait()
                .map_err(|error| error.to_string())?
                .is_some()
            {
                *child = None;
            }
        }
        Ok(())
    }

    fn managed_process_id(&self) -> Option<u32> {
        self.child
            .lock()
            .ok()
            .and_then(|child| child.as_ref().map(Child::id))
    }
}

fn compile_time_social_backend_url() -> Option<&'static str> {
    option_env!("THEBOYS_SOCIAL_BACKEND_URL")
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn default_release_social_backend_url() -> Option<&'static str> {
    if cfg!(debug_assertions) {
        None
    } else {
        Some(DEFAULT_RELEASE_SOCIAL_BACKEND_URL)
    }
}

fn resolve_backend_endpoint(
    env_override: Option<OsString>,
    compile_time_url: Option<&str>,
    release_default_url: Option<&str>,
    local_bind_addr: String,
) -> Result<BackendEndpoint, String> {
    if let Some(raw) = env_override {
        let value = raw.to_string_lossy().trim().to_owned();
        if hosted_backend_url_selects_local_mode(&value) {
            return Ok(BackendEndpoint::Local {
                bind_addr: local_bind_addr,
            });
        }
        if hosted_backend_url_disables_service(&value) {
            return Ok(BackendEndpoint::Disabled);
        }
        if !value.is_empty() {
            return hosted_backend_endpoint_from_url(&value);
        }
    }

    if let Some(url) = compile_time_url
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return hosted_backend_endpoint_from_url(url);
    }

    if let Some(url) = release_default_url
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return hosted_backend_endpoint_from_url(url);
    }

    Ok(BackendEndpoint::Local {
        bind_addr: local_bind_addr,
    })
}

fn hosted_backend_url_selects_local_mode(value: &str) -> bool {
    value.eq_ignore_ascii_case("local") || value.eq_ignore_ascii_case("loopback")
}

fn hosted_backend_url_disables_service(value: &str) -> bool {
    value.eq_ignore_ascii_case("disabled") || value.eq_ignore_ascii_case("off")
}

fn hosted_backend_endpoint_from_url(value: &str) -> Result<BackendEndpoint, String> {
    let parsed = Url::parse(value).map_err(|error| {
        format!("{SOCIAL_BACKEND_URL_ENV} must be a valid hosted backend origin: {error}")
    })?;
    validate_hosted_backend_url(&parsed)?;
    let origin = backend_url_origin(&parsed);
    Ok(BackendEndpoint::Hosted {
        health_url: format!("{origin}{BACKEND_HEALTH_PATH}"),
        origin,
    })
}

fn validate_hosted_backend_url(parsed: &Url) -> Result<(), String> {
    let host = parsed
        .host_str()
        .ok_or_else(|| format!("{SOCIAL_BACKEND_URL_ENV} must include a host"))?;
    let normalized_host = normalized_url_host(host);
    match parsed.scheme() {
        "https" => {}
        "http" if is_loopback_social_backend_host(normalized_host) => {}
        _ => {
            return Err(format!(
                "{SOCIAL_BACKEND_URL_ENV} must use https unless it targets loopback test infrastructure"
            ))
        }
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(format!(
            "{SOCIAL_BACKEND_URL_ENV} must not include username or password components"
        ));
    }
    if parsed.path() != "/" || parsed.query().is_some() || parsed.fragment().is_some() {
        return Err(format!(
            "{SOCIAL_BACKEND_URL_ENV} must be an origin without a path, query, or fragment"
        ));
    }
    Ok(())
}

fn normalized_url_host(host: &str) -> &str {
    host.strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(host)
}

fn backend_url_origin(parsed: &Url) -> String {
    let host = parsed
        .host_str()
        .expect("validated backend URLs always include a host");
    let normalized_host = normalized_url_host(host);
    let origin_host = if normalized_host.contains(':') {
        format!("[{normalized_host}]")
    } else {
        normalized_host.to_owned()
    };
    let mut origin = format!("{}://{}", parsed.scheme(), origin_host);
    if let Some(port) = parsed.port() {
        origin.push_str(&format!(":{port}"));
    }
    origin
}

fn resolve_backend_state_path(
    env_override: Option<OsString>,
    app_data_dir: Option<PathBuf>,
) -> Option<PathBuf> {
    if let Some(path) = env_override
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
    {
        return Some(path);
    }

    app_data_dir.map(|path| path.join("social-backend-state.json"))
}

fn resolve_backend_session_secret(
    env_override: Option<OsString>,
    app_data_dir: Option<PathBuf>,
) -> Result<Option<String>, String> {
    if let Some(secret) = env_override
        .map(|value| value.to_string_lossy().trim().to_owned())
        .filter(|value| !value.is_empty())
    {
        return Ok(Some(secret));
    }

    let Some(app_data_dir) = app_data_dir else {
        return Ok(None);
    };
    let secret_path = app_data_dir.join("social-backend-session-secret");
    if let Ok(existing) = std::fs::read_to_string(&secret_path) {
        let existing = existing.trim().to_owned();
        if !existing.is_empty() {
            return Ok(Some(existing));
        }
    }

    fs::create_dir_all(&app_data_dir).map_err(|error| {
        format!(
            "could not create social backend app data directory {}: {error}",
            app_data_dir.display()
        )
    })?;
    let secret = generate_backend_session_secret();
    write_private_text_file_atomic(&secret_path, &secret)?;
    Ok(Some(secret))
}

fn generate_backend_session_secret() -> String {
    format!(
        "tbl-v4-{}-{}-{}-{}",
        Uuid::new_v4(),
        Uuid::new_v4(),
        Uuid::new_v4(),
        Uuid::new_v4()
    )
}

fn write_private_text_file_atomic(path: &Path, contents: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "private file path must include a parent directory".to_owned())?;
    fs::create_dir_all(parent).map_err(|error| {
        format!(
            "could not create private file directory {}: {error}",
            parent.display()
        )
    })?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "private file path must include a valid file name".to_owned())?;
    let temporary_path = parent.join(format!(".{file_name}.{}.tmp", Uuid::new_v4()));
    fs::write(&temporary_path, contents).map_err(|error| {
        format!(
            "could not write private temporary file {}: {error}",
            temporary_path.display()
        )
    })?;
    set_private_file_permissions(&temporary_path).map_err(|error| {
        let _ = fs::remove_file(&temporary_path);
        error
    })?;
    fs::rename(&temporary_path, path).map_err(|error| {
        let _ = fs::remove_file(&temporary_path);
        format!(
            "could not replace private file {} with {}: {error}",
            path.display(),
            temporary_path.display()
        )
    })?;
    Ok(())
}

#[cfg(unix)]
fn set_private_file_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600)).map_err(|error| {
        format!(
            "could not set private permissions on {}: {error}",
            path.display()
        )
    })
}

#[cfg(windows)]
fn set_private_file_permissions(path: &Path) -> Result<(), String> {
    set_windows_owner_only_file_dacl(path)
}

#[cfg(all(not(unix), not(windows)))]
fn set_private_file_permissions(path: &Path) -> Result<(), String> {
    fs::metadata(path)
        .map(|_| ())
        .map_err(|error| format!("could not inspect private file {}: {error}", path.display()))
}

#[cfg(windows)]
fn set_windows_owner_only_file_dacl(path: &Path) -> Result<(), String> {
    use std::{ffi::OsStr, os::windows::ffi::OsStrExt, ptr};
    use windows_sys::Win32::{
        Foundation::{GetLastError, LocalFree},
        Security::{
            Authorization::{
                ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
            },
            SetFileSecurityW, DACL_SECURITY_INFORMATION, PROTECTED_DACL_SECURITY_INFORMATION,
            PSECURITY_DESCRIPTOR,
        },
    };

    let mut path_wide = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let mut sddl_wide = OsStr::new("D:P(A;;FA;;;OW)(A;;FA;;;SY)(A;;FA;;;BA)")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let mut security_descriptor: PSECURITY_DESCRIPTOR = ptr::null_mut();
    let converted = unsafe {
        ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl_wide.as_mut_ptr(),
            SDDL_REVISION_1,
            &mut security_descriptor,
            ptr::null_mut(),
        )
    };
    if converted == 0 {
        return Err(format!(
            "failed to build private Windows file security descriptor: {}",
            unsafe { GetLastError() }
        ));
    }

    let result = unsafe {
        SetFileSecurityW(
            path_wide.as_mut_ptr(),
            DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
            security_descriptor,
        )
    };
    let last_error = unsafe { GetLastError() };
    unsafe {
        LocalFree(security_descriptor);
    }
    if result == 0 {
        return Err(format!(
            "failed to apply private Windows file permissions to {}: {}",
            path.display(),
            last_error
        ));
    }
    Ok(())
}

fn backend_start_command(
    executable_path: &Path,
    bind_addr: &str,
    state_path: Option<&Path>,
    session_secret: Option<&str>,
) -> Command {
    let mut command = Command::new(executable_path);
    hide_backend_console_window(&mut command);
    command
        .env("THEBOYS_BACKEND_BIND", bind_addr)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    if let Some(state_path) = state_path {
        command.env("THEBOYS_BACKEND_STATE_PATH", state_path);
    }
    if let Some(session_secret) = session_secret {
        command.env("THEBOYS_BACKEND_SESSION_SECRET", session_secret);
    }
    command
}

#[cfg(windows)]
fn hide_backend_console_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_backend_console_window(_command: &mut Command) {}

fn resolve_backend_executable(
    env_override: Option<OsString>,
    current_exe: Option<PathBuf>,
    resource_dir: Option<PathBuf>,
) -> Option<BackendExecutable> {
    if let Some(path) = env_override
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
    {
        return Some(BackendExecutable {
            path,
            source: BackendExecutableSource::Env,
        });
    }

    let current_exe = current_exe.or_else(|| std::env::current_exe().ok())?;
    packaged_backend_candidates(&current_exe, resource_dir.as_deref())
        .into_iter()
        .find(|path| path.is_file())
        .map(|path| BackendExecutable {
            path,
            source: BackendExecutableSource::Adjacent,
        })
}

fn packaged_backend_candidates(current_exe: &Path, resource_dir: Option<&Path>) -> Vec<PathBuf> {
    let Some(app_dir) = current_exe.parent() else {
        return Vec::new();
    };
    let executable_name = backend_executable_name();
    let mut candidates = vec![
        app_dir.join(executable_name),
        app_dir.join("resources").join(executable_name),
        app_dir.join("bin").join(executable_name),
    ];
    if let Some(resource_dir) = resource_dir {
        candidates.push(resource_dir.join(executable_name));
    }
    candidates
}

fn backend_executable_name() -> &'static str {
    if cfg!(windows) {
        "social-backend.exe"
    } else {
        "social-backend"
    }
}

fn backend_health_url(bind_addr: &str) -> String {
    format!("http://{bind_addr}{BACKEND_HEALTH_PATH}")
}

async fn backend_health_check(health_url: &str) -> bool {
    reqwest::get(health_url)
        .await
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}

async fn execute_download_plan_recording_events(
    plan: &DownloadPlan,
    event_log: &LauncherEventLog,
) -> Result<OperationPlan, String> {
    core_execute_download_plan_with_event_callback(plan, |event| {
        event_log.record_event(event).map(|_| ())
    })
    .await
    .map_err(|error| error.to_string())
}

async fn execute_modloader_metadata_and_dependencies_for_profile(
    profile: &ProfileSummary,
    auxiliary_plan: &DownloadPlan,
    directories: &LauncherDirectories,
    event_log: &LauncherEventLog,
) -> Result<(), String> {
    let metadata_plan = DownloadPlan {
        version_id: format!("{}-modloader-artifacts", profile.id),
        items: auxiliary_plan
            .items
            .iter()
            .filter(|item| {
                matches!(
                    item.kind,
                    DownloadKind::ModLoaderMetadata | DownloadKind::ModLoaderInstaller
                )
            })
            .cloned()
            .collect(),
    };
    if metadata_plan.items.is_empty() {
        return Ok(());
    }
    execute_download_plan_recording_events(&metadata_plan, event_log).await?;
    if let Some(extract_operation) =
        core_extract_modloader_installer_metadata_for_profile(profile, &metadata_plan, directories)
            .map_err(|error| error.to_string())?
    {
        event_log
            .record_plan(&extract_operation)
            .map_err(|error| error.to_string())?;
    }
    if let Some(dependency_plan) =
        core_build_modloader_dependency_download_plan_for_profile(profile, directories)
            .map_err(|error| error.to_string())?
    {
        execute_download_plan_recording_events(&dependency_plan, event_log).await?;
    }
    execute_modloader_processors_for_profile(profile, directories, event_log)?;
    Ok(())
}

fn execute_modloader_processors_for_profile(
    profile: &ProfileSummary,
    directories: &LauncherDirectories,
    event_log: &LauncherEventLog,
) -> Result<(), String> {
    let settings = core_load_settings().map_err(|error| error.to_string())?;
    let mut streamed_events = false;
    let operation = core_execute_modloader_installer_processors_for_profile_with_event_callback(
        profile,
        &settings,
        directories,
        |event| {
            streamed_events = true;
            event_log.record_event(event).map(|_| ())
        },
    )
    .map_err(|error| error.to_string())?;
    record_unstreamed_operation_plan(operation.as_ref(), streamed_events, event_log)?;
    Ok(())
}

fn record_unstreamed_operation_plan(
    operation: Option<&OperationPlan>,
    streamed_events: bool,
    event_log: &LauncherEventLog,
) -> Result<(), String> {
    if !streamed_events {
        if let Some(operation) = operation {
            event_log
                .record_plan(operation)
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

async fn execute_direct_pack_files_from_auxiliary_plan(
    auxiliary_plan: &DownloadPlan,
    event_log: &LauncherEventLog,
) -> Result<(), String> {
    if let Some(direct_pack_plan) =
        core_direct_pack_file_download_plan(auxiliary_plan).map_err(|error| error.to_string())?
    {
        execute_download_plan_recording_events(&direct_pack_plan, event_log).await?;
    }
    if let Some(metafile_pack_plan) = core_fetch_packwiz_metafile_download_plan(auxiliary_plan)
        .await
        .map_err(|error| error.to_string())?
    {
        execute_download_plan_recording_events(&metafile_pack_plan, event_log).await?;
    }
    Ok(())
}

#[tauri::command]
async fn bootstrap_snapshot() -> Result<AppSnapshot, String> {
    match core_bootstrap_snapshot_with_remote_catalog().await {
        Ok(snapshot) => Ok(renderer_safe_snapshot(snapshot)),
        Err(remote_error) => core_bootstrap_snapshot()
            .map(renderer_safe_snapshot)
            .map_err(|fallback_error| {
                format!(
                    "remote catalog bootstrap failed ({remote_error}); local bootstrap also failed ({fallback_error})"
                )
            }),
    }
}

fn renderer_safe_snapshot(mut snapshot: AppSnapshot) -> AppSnapshot {
    snapshot.minecraft_session = snapshot
        .minecraft_session
        .map(renderer_safe_minecraft_session);
    snapshot
}

fn renderer_safe_minecraft_session(mut session: StoredMinecraftSession) -> StoredMinecraftSession {
    session.session.access_token = REDACTED_RENDERER_TOKEN.to_owned();
    session.microsoft_refresh_token = None;
    session.microsoft_user_id = None;
    session.microsoft_scopes = None;
    session
}

fn ensure_renderer_session_can_be_saved(session: &StoredMinecraftSession) -> Result<(), String> {
    if session.session.access_token.trim() == REDACTED_RENDERER_TOKEN {
        return Err(
            "renderer-redacted Minecraft sessions cannot be saved; refresh or sign in again"
                .to_owned(),
        );
    }
    if !renderer_session_save_allowed() {
        return Err(format!(
            "renderer-created Minecraft sessions cannot be saved by the packaged app; use Microsoft sign-in instead or set {ALLOW_RENDERER_SESSION_SAVE_ENV}=true for local development"
        ));
    }
    Ok(())
}

fn ensure_renderer_authenticated_launch_allowed(session: &MinecraftSession) -> Result<(), String> {
    ensure_renderer_authenticated_launch_allowed_for_mode(session, renderer_session_save_allowed())
}

fn ensure_renderer_authenticated_launch_allowed_for_mode(
    session: &MinecraftSession,
    allow_renderer_session: bool,
) -> Result<(), String> {
    if session.access_token.trim() == REDACTED_RENDERER_TOKEN {
        return Err(
            "Desktop authenticated launch uses the selected saved Microsoft account. Sign in again if needed."
                .to_owned(),
        );
    }
    if !allow_renderer_session {
        return Err(
            "Desktop authenticated launch uses the selected saved Microsoft account. Sign in with Microsoft first."
                .to_owned(),
        );
    }
    Ok(())
}

fn renderer_session_save_allowed() -> bool {
    renderer_session_save_allowed_from_env(std::env::var_os(ALLOW_RENDERER_SESSION_SAVE_ENV))
}

fn renderer_session_save_allowed_from_env(value: Option<OsString>) -> bool {
    value
        .and_then(|value| value.into_string().ok())
        .map(|value| value.eq_ignore_ascii_case("true") || value == "1")
        .unwrap_or(false)
}

#[tauri::command]
async fn start_microsoft_login() -> Result<ActionReceipt, String> {
    core_start_microsoft_login().map_err(|error| error.to_string())
}

#[tauri::command]
async fn start_microsoft_auth_flow() -> Result<MicrosoftAuthStart, String> {
    let client_id = microsoft_client_id();
    core_start_microsoft_auth_flow(&client_id).map_err(|error| error.to_string())
}

fn microsoft_client_id() -> String {
    std::env::var(MICROSOFT_CLIENT_ID_ENV)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_MICROSOFT_CLIENT_ID.to_owned())
}

fn packaged_smoke_auth_flow_enabled() -> bool {
    std::env::var(PACKAGED_SMOKE_AUTH_FLOW_ENV)
        .ok()
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn packaged_smoke_profile_lifecycle_enabled() -> bool {
    std::env::var(PACKAGED_SMOKE_PROFILE_LIFECYCLE_ENV)
        .ok()
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn packaged_smoke_import_lifecycle_enabled() -> bool {
    std::env::var(PACKAGED_SMOKE_IMPORT_LIFECYCLE_ENV)
        .ok()
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn packaged_smoke_packwiz_install_enabled() -> bool {
    std::env::var(PACKAGED_SMOKE_PACKWIZ_INSTALL_ENV)
        .ok()
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn packaged_smoke_update_handoff_enabled() -> bool {
    std::env::var(PACKAGED_SMOKE_UPDATE_HANDOFF_ENV)
        .ok()
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn packaged_smoke_launch_preflight_enabled() -> bool {
    std::env::var(PACKAGED_SMOKE_LAUNCH_PREFLIGHT_ENV)
        .ok()
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn packaged_smoke_account_lifecycle_enabled() -> bool {
    std::env::var(PACKAGED_SMOKE_ACCOUNT_LIFECYCLE_ENV)
        .ok()
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn packaged_smoke_auth_recovery_enabled() -> bool {
    std::env::var(PACKAGED_SMOKE_AUTH_RECOVERY_ENV)
        .ok()
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn packaged_smoke_stored_auth_launch_enabled() -> bool {
    std::env::var(PACKAGED_SMOKE_STORED_AUTH_LAUNCH_ENV)
        .ok()
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn packaged_smoke_modrinth_archive_install_enabled() -> bool {
    std::env::var(PACKAGED_SMOKE_MODRINTH_ARCHIVE_INSTALL_ENV)
        .ok()
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn packaged_smoke_curseforge_archive_install_enabled() -> bool {
    std::env::var(PACKAGED_SMOKE_CURSEFORGE_ARCHIVE_INSTALL_ENV)
        .ok()
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn packaged_smoke_ftb_legacy_archive_install_enabled() -> bool {
    std::env::var(PACKAGED_SMOKE_FTB_LEGACY_ARCHIVE_INSTALL_ENV)
        .ok()
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn packaged_smoke_ftb_install_enabled() -> bool {
    std::env::var(PACKAGED_SMOKE_FTB_INSTALL_ENV)
        .ok()
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn packaged_smoke_technic_archive_install_enabled() -> bool {
    std::env::var(PACKAGED_SMOKE_TECHNIC_ARCHIVE_INSTALL_ENV)
        .ok()
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn packaged_smoke_atlauncher_install_enabled() -> bool {
    std::env::var(PACKAGED_SMOKE_ATLAUNCHER_INSTALL_ENV)
        .ok()
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn packaged_smoke_activity_progress_enabled() -> bool {
    std::env::var(PACKAGED_SMOKE_ACTIVITY_PROGRESS_ENV)
        .ok()
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn packaged_smoke_java_recovery_enabled() -> bool {
    std::env::var(PACKAGED_SMOKE_JAVA_RECOVERY_ENV)
        .ok()
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn packaged_smoke_discover_routing_enabled() -> bool {
    std::env::var(PACKAGED_SMOKE_DISCOVER_ROUTING_ENV)
        .ok()
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn packaged_smoke_process_lifecycle_enabled() -> bool {
    std::env::var(PACKAGED_SMOKE_PROCESS_LIFECYCLE_ENV)
        .ok()
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn write_packaged_smoke_auth_flow_probe() -> Result<(), String> {
    if !packaged_smoke_auth_flow_enabled() {
        return Ok(());
    }

    let flow = core_start_microsoft_auth_flow(&microsoft_client_id())
        .map_err(|error| error.to_string())?;
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let probe_path = Path::new(&directories.config_dir).join(PACKAGED_SMOKE_AUTH_FLOW_FILE);
    let payload = serde_json::json!({
        "authUrl": flow.auth_url,
        "clientId": flow.client_id,
        "redirectUri": flow.redirect_uri,
        "scopes": flow.scopes,
        "stateLength": flow.state.len(),
        "codeChallenge": flow.code_challenge,
        "codeVerifierPresent": !flow.code_verifier.is_empty(),
    });
    fs::write(
        &probe_path,
        serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?,
    )
    .map_err(|error| {
        format!(
            "failed to write packaged Microsoft auth-flow smoke probe {}: {error}",
            probe_path.display()
        )
    })
}

fn cleanup_packaged_smoke_accounts() {
    if let Ok(accounts) = core_list_minecraft_accounts() {
        for account in accounts {
            if account.account_id.starts_with("packaged-smoke-account-") {
                let _ = core_remove_minecraft_account(&account.account_id);
            }
        }
    }
}

fn write_packaged_smoke_account_lifecycle_probe() -> Result<(), String> {
    if !packaged_smoke_account_lifecycle_enabled() {
        return Ok(());
    }

    cleanup_packaged_smoke_accounts();
    let result = write_packaged_smoke_account_lifecycle_probe_inner();
    if result.is_err() {
        cleanup_packaged_smoke_accounts();
    }
    result
}

fn write_packaged_smoke_account_lifecycle_probe_inner() -> Result<(), String> {
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let config_dir = Path::new(&directories.config_dir);
    let session_path = config_dir.join("minecraft-session.json");
    let accounts_path = config_dir.join("minecraft-accounts.json");

    let first = StoredMinecraftSession {
        session: MinecraftSession {
            username: "SmokeOne".to_owned(),
            uuid: Uuid::parse_str("aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa")
                .map_err(|error| error.to_string())?,
            access_token: "smoke-access-token-one-do-not-write".to_owned(),
        },
        account_id: Some("packaged-smoke-account-one".to_owned()),
        expires_at_unix_seconds: Some(2_000_000_001),
        microsoft_refresh_token: Some("smoke-refresh-token-one-do-not-write".to_owned()),
        microsoft_client_id: Some(microsoft_client_id()),
        microsoft_user_id: Some("smoke-ms-user-one".to_owned()),
        microsoft_scopes: Some("XboxLive.signin offline_access".to_owned()),
        stored_at_unix_seconds: 1_900_000_001,
    };
    let second = StoredMinecraftSession {
        session: MinecraftSession {
            username: "SmokeTwo".to_owned(),
            uuid: Uuid::parse_str("bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb")
                .map_err(|error| error.to_string())?,
            access_token: "smoke-access-token-two-do-not-write".to_owned(),
        },
        account_id: Some("packaged-smoke-account-two".to_owned()),
        expires_at_unix_seconds: Some(2_000_000_002),
        microsoft_refresh_token: Some("smoke-refresh-token-two-do-not-write".to_owned()),
        microsoft_client_id: Some(microsoft_client_id()),
        microsoft_user_id: Some("smoke-ms-user-two".to_owned()),
        microsoft_scopes: Some("XboxLive.signin offline_access".to_owned()),
        stored_at_unix_seconds: 1_900_000_002,
    };

    let saved_first = core_save_minecraft_session(first).map_err(|error| error.to_string())?;
    let saved_second = core_save_minecraft_session(second).map_err(|error| error.to_string())?;
    let accounts_after_save = core_list_minecraft_accounts().map_err(|error| error.to_string())?;
    if accounts_after_save.len() != 2 {
        return Err(format!(
            "packaged account lifecycle smoke expected 2 saved accounts, found {}",
            accounts_after_save.len()
        ));
    }
    let active_after_save = accounts_after_save
        .iter()
        .find(|account| account.active)
        .map(|account| account.account_id.clone())
        .ok_or_else(|| "packaged account lifecycle smoke found no active account".to_owned())?;
    if active_after_save != "packaged-smoke-account-two" {
        return Err(format!(
            "packaged account lifecycle smoke expected second account active after save, found {active_after_save}"
        ));
    }

    let selected =
        core_select_minecraft_account("packaged-smoke-account-one").map_err(|error| {
            format!("packaged account lifecycle smoke could not switch accounts: {error}")
        })?;
    if selected.session.username != "SmokeOne" {
        return Err(format!(
            "packaged account lifecycle smoke selected wrong account {}",
            selected.session.username
        ));
    }
    let accounts_after_select =
        core_list_minecraft_accounts().map_err(|error| error.to_string())?;
    let active_after_select = accounts_after_select
        .iter()
        .find(|account| account.active)
        .map(|account| account.account_id.clone())
        .ok_or_else(|| {
            "packaged account lifecycle smoke found no active account after switch".to_owned()
        })?;
    if active_after_select != "packaged-smoke-account-one" {
        return Err(format!(
            "packaged account lifecycle smoke expected first account active after switch, found {active_after_select}"
        ));
    }
    let raw_session = fs::read_to_string(&session_path).map_err(|error| {
        format!(
            "packaged account lifecycle smoke could not read persisted session file {}: {error}",
            session_path.display()
        )
    })?;
    let raw_accounts = fs::read_to_string(&accounts_path).map_err(|error| {
        format!(
            "packaged account lifecycle smoke could not read persisted accounts file {}: {error}",
            accounts_path.display()
        )
    })?;
    let smoke_secrets = [
        "smoke-access-token-one-do-not-write",
        "smoke-access-token-two-do-not-write",
        "smoke-refresh-token-one-do-not-write",
        "smoke-refresh-token-two-do-not-write",
    ];
    let raw_secrets_absent = smoke_secrets
        .iter()
        .all(|secret| !raw_session.contains(secret) && !raw_accounts.contains(secret));
    if !raw_secrets_absent {
        return Err(
            "packaged account lifecycle smoke found raw Minecraft auth secrets on disk".to_owned(),
        );
    }
    let persisted_session =
        serde_json::from_str::<serde_json::Value>(&raw_session).map_err(|error| {
            format!("packaged account lifecycle smoke session JSON did not parse: {error}")
        })?;
    let persisted_accounts =
        serde_json::from_str::<serde_json::Value>(&raw_accounts).map_err(|error| {
            format!("packaged account lifecycle smoke accounts JSON did not parse: {error}")
        })?;
    let protected_prefix = "dpapi:v1:";
    let session_access_token_protected = persisted_session
        .pointer("/session/accessToken")
        .and_then(|value| value.as_str())
        .is_some_and(|value| value.starts_with(protected_prefix));
    let session_refresh_token_protected = persisted_session
        .pointer("/microsoftRefreshToken")
        .and_then(|value| value.as_str())
        .is_some_and(|value| value.starts_with(protected_prefix));
    let account_secret_fields_protected = persisted_accounts
        .get("accounts")
        .and_then(|value| value.as_array())
        .filter(|accounts| accounts.len() == 2)
        .is_some_and(|accounts| {
            accounts.iter().all(|account| {
                let access_token_protected = account
                    .pointer("/session/accessToken")
                    .and_then(|value| value.as_str())
                    .is_some_and(|value| value.starts_with(protected_prefix));
                let refresh_token_protected = account
                    .pointer("/microsoftRefreshToken")
                    .and_then(|value| value.as_str())
                    .is_some_and(|value| value.starts_with(protected_prefix));
                access_token_protected && refresh_token_protected
            })
        });
    if cfg!(windows)
        && (!session_access_token_protected
            || !session_refresh_token_protected
            || !account_secret_fields_protected)
    {
        return Err(
            "packaged account lifecycle smoke did not DPAPI-protect stored Minecraft auth secrets"
                .to_owned(),
        );
    }
    let stored_secrets_protected = if cfg!(windows) {
        session_access_token_protected
            && session_refresh_token_protected
            && account_secret_fields_protected
    } else {
        false
    };

    let active_after_inactive_remove = core_remove_minecraft_account("packaged-smoke-account-two")
        .map_err(|error| error.to_string())?
        .ok_or_else(|| {
            "packaged account lifecycle smoke removed inactive account but lost active session"
                .to_owned()
        })?;
    if active_after_inactive_remove.session.username != "SmokeOne" {
        return Err(format!(
            "packaged account lifecycle smoke preserved wrong active account after inactive removal: {}",
            active_after_inactive_remove.session.username
        ));
    }
    let accounts_after_inactive_remove =
        core_list_minecraft_accounts().map_err(|error| error.to_string())?;
    if accounts_after_inactive_remove.len() != 1
        || accounts_after_inactive_remove[0].account_id != "packaged-smoke-account-one"
        || !accounts_after_inactive_remove[0].active
    {
        return Err(format!(
            "packaged account lifecycle smoke did not preserve only the selected account after inactive removal: {:?}",
            accounts_after_inactive_remove
        ));
    }

    let active_after_final_remove = core_remove_minecraft_account("packaged-smoke-account-one")
        .map_err(|error| error.to_string())?;
    if active_after_final_remove.is_some() {
        return Err(
            "packaged account lifecycle smoke expected no active account after final removal"
                .to_owned(),
        );
    }
    let final_accounts = core_list_minecraft_accounts().map_err(|error| error.to_string())?;
    if !final_accounts.is_empty() {
        return Err(format!(
            "packaged account lifecycle smoke left accounts behind: {:?}",
            final_accounts
        ));
    }
    if session_path.exists() || accounts_path.exists() {
        return Err(format!(
            "packaged account lifecycle smoke left account state files behind: session={}, accounts={}",
            session_path.exists(),
            accounts_path.exists()
        ));
    }

    let probe_path = config_dir.join(PACKAGED_SMOKE_ACCOUNT_LIFECYCLE_FILE);
    let payload = serde_json::json!({
        "savedAccountIds": [
            saved_first.account_id.unwrap_or_default(),
            saved_second.account_id.unwrap_or_default(),
        ],
        "savedUsernames": [
            saved_first.session.username,
            saved_second.session.username,
        ],
        "countAfterSave": accounts_after_save.len(),
        "activeAfterSave": active_after_save,
        "activeAfterSelect": active_after_select,
        "rawSecretsAbsent": raw_secrets_absent,
        "storedSecretsProtected": stored_secrets_protected,
        "sessionAccessTokenProtected": session_access_token_protected,
        "sessionRefreshTokenProtected": session_refresh_token_protected,
        "accountSecretFieldsProtected": account_secret_fields_protected,
        "countAfterInactiveRemove": accounts_after_inactive_remove.len(),
        "activeAfterInactiveRemove": active_after_inactive_remove.session.username,
        "finalCount": final_accounts.len(),
        "sessionStateRemoved": !session_path.exists(),
        "accountStateRemoved": !accounts_path.exists(),
    });
    fs::write(
        &probe_path,
        serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?,
    )
    .map_err(|error| {
        format!(
            "failed to write packaged account lifecycle smoke probe {}: {error}",
            probe_path.display()
        )
    })
}

async fn write_packaged_smoke_auth_recovery_probe(
    registry: &ProcessRegistry,
) -> Result<(), String> {
    if !packaged_smoke_auth_recovery_enabled() {
        return Ok(());
    }

    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let config_dir = Path::new(&directories.config_dir);
    let session_path = config_dir.join("minecraft-session.json");
    let accounts_path = config_dir.join("minecraft-accounts.json");
    let before_process_count = registry.list().map_err(|error| error.to_string())?.len();
    let expired = StoredMinecraftSession {
        session: MinecraftSession {
            username: "ExpiredSmoke".to_owned(),
            uuid: Uuid::parse_str("bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb")
                .map_err(|error| error.to_string())?,
            access_token: "expired-smoke-access-token-do-not-write".to_owned(),
        },
        account_id: Some("packaged-smoke-expired-account".to_owned()),
        expires_at_unix_seconds: Some(2),
        microsoft_refresh_token: None,
        microsoft_client_id: None,
        microsoft_user_id: Some("expired-smoke-ms-user".to_owned()),
        microsoft_scopes: None,
        stored_at_unix_seconds: 1,
    };

    core_save_minecraft_session(expired).map_err(|error| error.to_string())?;
    let saved_accounts = core_list_minecraft_accounts().map_err(|error| error.to_string())?;
    let raw_session = fs::read_to_string(&session_path).map_err(|error| error.to_string())?;
    let raw_accounts = fs::read_to_string(&accounts_path).map_err(|error| error.to_string())?;
    let raw_secret_absent = !raw_session.contains("expired-smoke-access-token-do-not-write")
        && !raw_accounts.contains("expired-smoke-access-token-do-not-write");
    let (refresh_error, refresh_unexpectedly_succeeded) =
        match load_or_refresh_stored_minecraft_session().await {
            Ok(_) => (
                "packaged auth recovery smoke unexpectedly accepted an expired stored session"
                    .to_owned(),
                true,
            ),
            Err(error) => (error, false),
        };
    let refresh_failure_matches =
        refresh_error.contains("does not include a Microsoft refresh token");
    let after_process_count = registry.list().map_err(|error| error.to_string())?.len();
    let managed_process_started = after_process_count != before_process_count;
    core_clear_minecraft_session().map_err(|error| error.to_string())?;
    let final_accounts = core_list_minecraft_accounts().map_err(|error| error.to_string())?;
    let state_removed = !session_path.exists() && !accounts_path.exists();

    let probe_path = config_dir.join(PACKAGED_SMOKE_AUTH_RECOVERY_FILE);
    let payload = serde_json::json!({
        "expiredAccountId": "packaged-smoke-expired-account",
        "savedAccountCount": saved_accounts.len(),
        "refreshAttemptedLocally": true,
        "refreshFailure": refresh_error,
        "refreshFailureMatches": refresh_failure_matches,
        "refreshUnexpectedlySucceeded": refresh_unexpectedly_succeeded,
        "rawSecretAbsent": raw_secret_absent,
        "processCountBefore": before_process_count,
        "processCountAfter": after_process_count,
        "managedProcessStarted": managed_process_started,
        "finalAccountCount": final_accounts.len(),
        "stateRemoved": state_removed,
    });
    fs::write(
        &probe_path,
        serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?,
    )
    .map_err(|error| {
        format!(
            "failed to write packaged auth recovery smoke probe {}: {error}",
            probe_path.display()
        )
    })
}

async fn write_packaged_smoke_stored_auth_launch_probe(
    registry: &ProcessRegistry,
    event_log: &LauncherEventLog,
) -> Result<(), String> {
    if !packaged_smoke_stored_auth_launch_enabled() {
        return Ok(());
    }

    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let config_dir = Path::new(&directories.config_dir);
    let session_path = config_dir.join("minecraft-session.json");
    let accounts_path = config_dir.join("minecraft-accounts.json");
    let created = core_create_profile(CreateProfileRequest {
        name: "Packaged Smoke Stored Auth".to_owned(),
        loader: shared::ModLoader::Vanilla,
        game_version: "1.21.8".to_owned(),
        memory_mb: 3072,
    })
    .map_err(|error| error.to_string())?;

    let result = async {
        let _ = build_packaged_smoke_launch_preflight_payload(&directories, &created.id)?;
        let stored_uuid = Uuid::parse_str("aaaaaaaa-3333-4444-8555-aaaaaaaaaaaa")
            .map_err(|error| error.to_string())?;
        let stored = StoredMinecraftSession {
            session: MinecraftSession {
                username: "StoredSmoke".to_owned(),
                uuid: stored_uuid,
                access_token: "stored-smoke-access-token-do-not-write".to_owned(),
            },
            account_id: Some("packaged-smoke-stored-auth-account".to_owned()),
            expires_at_unix_seconds: Some(4_102_444_800),
            microsoft_refresh_token: Some("stored-smoke-refresh-token-do-not-write".to_owned()),
            microsoft_client_id: Some(DEFAULT_MICROSOFT_CLIENT_ID.to_owned()),
            microsoft_user_id: Some("stored-smoke-ms-user".to_owned()),
            microsoft_scopes: Some("XboxLive.signin offline_access".to_owned()),
            stored_at_unix_seconds: 1,
        };
        core_save_minecraft_session(stored).map_err(|error| error.to_string())?;
        let raw_session = fs::read_to_string(&session_path).map_err(|error| error.to_string())?;
        let raw_accounts = fs::read_to_string(&accounts_path).map_err(|error| error.to_string())?;
        let raw_secrets_absent = !raw_session.contains("stored-smoke-access-token-do-not-write")
            && !raw_session.contains("stored-smoke-refresh-token-do-not-write")
            && !raw_accounts.contains("stored-smoke-access-token-do-not-write")
            && !raw_accounts.contains("stored-smoke-refresh-token-do-not-write");
        let stored_secrets_protected = raw_session.contains("dpapi:v1:")
            && raw_accounts.matches("dpapi:v1:").count() >= 2;
        let loaded = load_or_refresh_stored_minecraft_session_for_launch().await?;
        let settings = core_load_settings().map_err(|error| error.to_string())?;
        let server = ServerLaunchTarget {
            name: Some("Stored Auth Smoke Server".to_owned()),
            address: "stored-auth.theboys.example".to_owned(),
            port: Some(25567),
        };
        let launch_plan = core_build_stored_authenticated_launch_plan(
            &created.id,
            &settings,
            &directories,
            &loaded,
            Some(&server),
        )
        .map_err(|error| error.to_string())?;
        let command = core_build_process_command_spec(&launch_plan)
            .map(renderer_safe_process_command_spec)
            .map_err(|error| error.to_string())?;
        let access_token_redacted = command
            .args
            .windows(2)
            .any(|pair| pair[0] == "--accessToken" && pair[1] == REDACTED_RENDERER_TOKEN);
        let refresh_token_absent = !command
            .args
            .iter()
            .any(|arg| arg.contains("stored-smoke-refresh-token-do-not-write"));
        let access_token_absent = !command
            .args
            .iter()
            .any(|arg| arg.contains("stored-smoke-access-token-do-not-write"));
        if !access_token_redacted || !access_token_absent || !refresh_token_absent {
            return Err("packaged stored-auth launch leaked stored auth secrets".to_owned());
        }
        if !command
            .args
            .windows(2)
            .any(|pair| pair[0] == "--username" && pair[1] == "StoredSmoke")
        {
            return Err("packaged stored-auth launch did not use the stored username".to_owned());
        }
        if !command
            .args
            .windows(2)
            .any(|pair| pair[0] == "--uuid" && pair[1] == "aaaaaaaa333344448555aaaaaaaaaaaa")
        {
            return Err("packaged stored-auth launch did not use the stored UUID".to_owned());
        }
        if !command
            .args
            .windows(2)
            .any(|pair| pair[0] == "--server" && pair[1] == server.address)
        {
            return Err("packaged stored-auth launch did not include the explicit server".to_owned());
        }
        if !command
            .args
            .iter()
            .any(|arg| arg == "com.example.minecraft.Main")
        {
            return Err("packaged stored-auth launch did not use cached version metadata".to_owned());
        }
        let classpath = command_arg_value(&command.args, "-cp").unwrap_or_default();
        let fake_java = packaged_smoke_fake_java_path(&directories);
        write_packaged_smoke_long_running_java(&fake_java)?;
        let process_count_before = registry.list().map_err(|error| error.to_string())?.len();
        let started = start_managed_launch_plan(launch_plan, registry, event_log)?;
        if started.state != shared::ManagedProcessState::Running {
            return Err(format!(
                "packaged stored-auth launch expected managed process to be running, found {:?}",
                started.state
            ));
        }
        let active = active_managed_process_summary(registry, &created.id)?
            .ok_or_else(|| "packaged stored-auth launch did not find active process".to_owned())?;
        if active.id != started.id || active.process_id != started.process_id {
            return Err("packaged stored-auth launch active-process lookup mismatch".to_owned());
        }
        let stopped = registry.stop(started.id).map_err(|error| error.to_string())?;
        if stopped.state != shared::ManagedProcessState::Exited {
            return Err(format!(
                "packaged stored-auth launch expected stopped process to be exited, found {:?}",
                stopped.state
            ));
        }
        std::thread::sleep(Duration::from_secs(4));
        let remaining_processes = registry.clear_exited().map_err(|error| error.to_string())?;
        if remaining_processes
            .iter()
            .any(|process| managed_process_profile_id(process).as_deref() == Some(&created.id))
        {
            return Err("packaged stored-auth launch left managed processes behind".to_owned());
        }
        let process_count_after = registry.list().map_err(|error| error.to_string())?.len();
        let last_played_marked = core_load_profiles()
            .map_err(|error| error.to_string())?
            .iter()
            .find(|profile| profile.id == created.id)
            .and_then(|profile| profile.last_played.as_deref())
            .is_some_and(|last_played| last_played.starts_with("unix:"));
        if !last_played_marked {
            return Err("packaged stored-auth launch did not mark the profile launched".to_owned());
        }
        let launch_event_count = event_log
            .list(None)
            .map_err(|error| error.to_string())?
            .into_iter()
            .filter(|event| {
                event.operation == Some(LauncherOperation::LaunchProfile)
                    && event.subject_id.as_deref() == Some(&created.id)
            })
            .count();
        let profile_data_dir = Path::new(&directories.data_dir)
            .join("profiles")
            .join(&created.id);
        let payload = serde_json::json!({
            "profileId": created.id.clone(),
            "accountId": "packaged-smoke-stored-auth-account",
            "storedUsername": loaded.session.username,
            "storedUuid": loaded.session.uuid.to_string(),
            "argCount": command.args.len(),
            "accessTokenRedacted": access_token_redacted,
            "rawSecretsAbsent": raw_secrets_absent,
            "storedSecretsProtected": stored_secrets_protected,
            "accessTokenAbsentFromCommand": access_token_absent,
            "refreshTokenAbsentFromCommand": refresh_token_absent,
            "serverAddress": command_arg_value(&command.args, "--server"),
            "serverPort": command_arg_value(&command.args, "--port"),
            "mainClass": "com.example.minecraft.Main",
            "classpathHasClientJar": classpath.replace('\\', "/").contains("versions/1.21.8/client.jar"),
            "envProfileId": command.env.iter()
                .find(|env_var| env_var.key == "THEBOYSLAUNCHER_PROFILE_ID")
                .map(|env_var| env_var.value.clone()),
            "managedProcessStarted": true,
            "startedState": started.state,
            "stoppedState": stopped.state,
            "activeProcessMatched": true,
            "processCountBefore": process_count_before,
            "processCountAfter": process_count_after,
            "launchEventCount": launch_event_count,
            "lastPlayedMarked": last_played_marked,
            "profileDataDir": profile_data_dir.to_string_lossy(),
        });
        Ok::<serde_json::Value, String>(payload)
    }
    .await;

    for process in registry.list().unwrap_or_default() {
        if managed_process_profile_id(&process).as_deref() == Some(&created.id) {
            let _ = registry.stop(process.id);
        }
    }
    let _ = registry.clear_exited();
    let _ = core_clear_minecraft_session();
    let deleted_profile = core_delete_profile(DeleteProfileRequest {
        id: created.id.clone(),
    });
    let profile_data_removed = !Path::new(&directories.data_dir)
        .join("profiles")
        .join(&created.id)
        .exists();
    match result {
        Ok(mut payload) => {
            let deleted_profile = deleted_profile.map_err(|error| error.to_string())?;
            let final_accounts =
                core_list_minecraft_accounts().map_err(|error| error.to_string())?;
            let state_removed = !session_path.exists() && !accounts_path.exists();
            if !state_removed || !final_accounts.is_empty() || !profile_data_removed {
                return Err(
                    "packaged stored-auth launch smoke left profile or auth state behind"
                        .to_owned(),
                );
            }
            if let Some(object) = payload.as_object_mut() {
                object.insert(
                    "deletedProfileId".to_owned(),
                    serde_json::json!(deleted_profile.id),
                );
                object.insert("stateRemoved".to_owned(), serde_json::json!(state_removed));
                object.insert(
                    "finalAccountCount".to_owned(),
                    serde_json::json!(final_accounts.len()),
                );
                object.insert(
                    "profileDataRemoved".to_owned(),
                    serde_json::json!(profile_data_removed),
                );
            }
            let probe_path = config_dir.join(PACKAGED_SMOKE_STORED_AUTH_LAUNCH_FILE);
            fs::write(
                &probe_path,
                serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?,
            )
            .map_err(|error| {
                format!(
                    "failed to write packaged stored-auth launch smoke probe {}: {error}",
                    probe_path.display()
                )
            })
        }
        Err(error) => Err(error),
    }
}

fn write_packaged_smoke_modrinth_archive_install_probe(
    event_log: &LauncherEventLog,
) -> Result<(), String> {
    if !packaged_smoke_modrinth_archive_install_enabled() {
        return Ok(());
    }

    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let archive_path = Path::new(&directories.cache_dir)
        .join("packaged-modrinth-archive-install")
        .join("PackagedSmokeModrinth.mrpack");
    let profile_id = "packaged-smoke-modrinth";
    let _ = core_delete_profile(DeleteProfileRequest {
        id: profile_id.to_owned(),
    });
    write_packaged_smoke_modrinth_archive(&archive_path)?;

    let result = (|| {
        let plan = core_build_modrinth_modpack_archive_install_plan(
            &archive_path,
            Some("Packaged Smoke Modrinth"),
            &directories,
        )
        .map_err(|error| error.to_string())?;
        if plan.profile.id != profile_id {
            return Err(format!(
                "packaged Modrinth archive smoke expected profile id {profile_id}, found {}",
                plan.profile.id
            ));
        }
        if plan.profile.loader != shared::ModLoader::Vanilla {
            return Err(format!(
                "packaged Modrinth archive smoke expected vanilla loader, found {:?}",
                plan.profile.loader
            ));
        }
        if !plan.file_download_plan.items.is_empty() {
            return Err(
                "packaged Modrinth archive smoke should not require remote pack files".to_owned(),
            );
        }
        let extraction = core_extract_modrinth_modpack_archive(&archive_path, &plan, &directories)
            .map_err(|error| error.to_string())?;
        event_log
            .record_plan(&extraction)
            .map_err(|error| error.to_string())?;
        core_persist_installed_pack_profile(plan.profile.clone())
            .map_err(|error| error.to_string())?;
        event_log
            .record_event(completed_native_operation_event(
                LauncherOperation::InstallModpackArchive,
                plan.profile.id.clone(),
                "Packaged Smoke Modrinth installed successfully.",
            ))
            .map_err(|error| error.to_string())?;

        let profile_root = Path::new(&directories.data_dir)
            .join("profiles")
            .join(&plan.profile.id);
        let override_path = profile_root.join("config").join("packaged.toml");
        let client_override_path = profile_root.join("options.txt");
        let server_override_path = profile_root.join("server.properties");
        let metadata_path = profile_root.join(".theboys/modrinth/modrinth.index.json");
        let persisted_profile = core_load_profiles()
            .map_err(|error| error.to_string())?
            .into_iter()
            .find(|profile| profile.id == plan.profile.id)
            .ok_or_else(|| "packaged Modrinth archive smoke did not persist profile".to_owned())?;
        if fs::read_to_string(&override_path).map_err(|error| error.to_string())? != "enabled=true"
        {
            return Err("packaged Modrinth archive smoke did not extract overrides".to_owned());
        }
        if fs::read_to_string(&client_override_path).map_err(|error| error.to_string())?
            != "autoJump:false"
        {
            return Err(
                "packaged Modrinth archive smoke did not extract client overrides".to_owned(),
            );
        }
        if server_override_path.exists() {
            return Err(
                "packaged Modrinth archive smoke extracted server-only overrides".to_owned(),
            );
        }
        if !metadata_path.is_file() {
            return Err("packaged Modrinth archive smoke did not store metadata".to_owned());
        }

        let profile_data_path = profile_root.clone();
        let deleted = core_delete_profile(DeleteProfileRequest {
            id: plan.profile.id.clone(),
        })
        .map_err(|error| error.to_string())?;
        let profile_data_removed = !profile_data_path.exists();
        if !profile_data_removed {
            return Err("packaged Modrinth archive smoke left profile files behind".to_owned());
        }
        if core_load_profiles()
            .map_err(|error| error.to_string())?
            .iter()
            .any(|profile| profile.id == plan.profile.id)
        {
            return Err("packaged Modrinth archive smoke left profile metadata behind".to_owned());
        }
        if let Some(parent) = archive_path.parent() {
            let _ = fs::remove_dir_all(parent);
        }
        let archive_removed = !archive_path.exists();
        if !archive_removed {
            return Err("packaged Modrinth archive smoke left staged archive behind".to_owned());
        }
        let install_event_count = event_log
            .list(None)
            .map_err(|error| error.to_string())?
            .into_iter()
            .filter(|event| event.subject_id.as_deref() == Some(profile_id))
            .count();
        Ok::<serde_json::Value, String>(serde_json::json!({
            "profileId": plan.profile.id,
            "profileName": persisted_profile.name,
            "loader": format!("{:?}", persisted_profile.loader),
            "gameVersion": persisted_profile.game_version,
            "installedPackVersion": persisted_profile.installed_pack_version,
            "fileDownloadCount": plan.file_download_plan.items.len(),
            "extractionEventCount": extraction.events.len(),
            "overrideExtracted": true,
            "clientOverrideExtracted": true,
            "serverOverrideSkipped": true,
            "metadataStored": true,
            "persistedProfileFound": true,
            "installEventCount": install_event_count,
            "deletedProfileId": deleted.id,
            "profileDataRemoved": profile_data_removed,
            "archiveRemoved": archive_removed,
        }))
    })();

    if result.is_err() {
        let _ = core_delete_profile(DeleteProfileRequest {
            id: profile_id.to_owned(),
        });
        if let Some(parent) = archive_path.parent() {
            let _ = fs::remove_dir_all(parent);
        }
    }

    let payload = result?;
    let probe_path =
        Path::new(&directories.config_dir).join(PACKAGED_SMOKE_MODRINTH_ARCHIVE_INSTALL_FILE);
    fs::write(
        &probe_path,
        serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?,
    )
    .map_err(|error| {
        format!(
            "failed to write packaged Modrinth archive install smoke probe {}: {error}",
            probe_path.display()
        )
    })
}

fn write_packaged_smoke_curseforge_archive_install_probe(
    event_log: &LauncherEventLog,
) -> Result<(), String> {
    if !packaged_smoke_curseforge_archive_install_enabled() {
        return Ok(());
    }

    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let archive_path = Path::new(&directories.cache_dir)
        .join("packaged-curseforge-archive-install")
        .join("PackagedSmokeCurseForge.zip");
    let profile_id = "packaged-smoke-curseforge";
    let _ = core_delete_profile(DeleteProfileRequest {
        id: profile_id.to_owned(),
    });
    write_packaged_smoke_curseforge_archive(&archive_path)?;

    let result = (|| {
        let plan = core_build_curseforge_modpack_archive_install_plan(
            &archive_path,
            Some("Packaged Smoke CurseForge"),
            &directories,
        )
        .map_err(|error| error.to_string())?;
        if plan.profile.id != profile_id {
            return Err(format!(
                "packaged CurseForge archive smoke expected profile id {profile_id}, found {}",
                plan.profile.id
            ));
        }
        if plan.profile.loader != shared::ModLoader::Vanilla {
            return Err(format!(
                "packaged CurseForge archive smoke expected vanilla loader, found {:?}",
                plan.profile.loader
            ));
        }
        if plan.profile.game_version != "1.21.8" {
            return Err(format!(
                "packaged CurseForge archive smoke expected Minecraft 1.21.8, found {}",
                plan.profile.game_version
            ));
        }
        if !plan.mod_download_plan.items.is_empty() {
            return Err(
                "packaged CurseForge archive smoke should not require remote mod downloads"
                    .to_owned(),
            );
        }
        let extraction =
            core_extract_curseforge_modpack_archive(&archive_path, &plan, &directories)
                .map_err(|error| error.to_string())?;
        event_log
            .record_plan(&extraction)
            .map_err(|error| error.to_string())?;
        core_persist_installed_pack_profile(plan.profile.clone())
            .map_err(|error| error.to_string())?;
        event_log
            .record_event(completed_native_operation_event(
                LauncherOperation::InstallModpackArchive,
                plan.profile.id.clone(),
                "Packaged Smoke CurseForge installed successfully.",
            ))
            .map_err(|error| error.to_string())?;

        let profile_root = Path::new(&directories.data_dir)
            .join("profiles")
            .join(&plan.profile.id);
        let override_path = profile_root.join("config").join("packaged.cfg");
        let nested_override_path = profile_root.join("scripts").join("startup.zs");
        let metadata_path = profile_root.join(".theboys/curseforge/manifest.json");
        let persisted_profile = core_load_profiles()
            .map_err(|error| error.to_string())?
            .into_iter()
            .find(|profile| profile.id == plan.profile.id)
            .ok_or_else(|| {
                "packaged CurseForge archive smoke did not persist profile".to_owned()
            })?;
        if fs::read_to_string(&override_path).map_err(|error| error.to_string())? != "enabled=true"
        {
            return Err("packaged CurseForge archive smoke did not extract overrides".to_owned());
        }
        if fs::read_to_string(&nested_override_path).map_err(|error| error.to_string())?
            != "print('packaged')"
        {
            return Err(
                "packaged CurseForge archive smoke did not extract nested overrides".to_owned(),
            );
        }
        if !metadata_path.is_file() {
            return Err("packaged CurseForge archive smoke did not store metadata".to_owned());
        }

        let profile_data_path = profile_root.clone();
        let deleted = core_delete_profile(DeleteProfileRequest {
            id: plan.profile.id.clone(),
        })
        .map_err(|error| error.to_string())?;
        let profile_data_removed = !profile_data_path.exists();
        if !profile_data_removed {
            return Err("packaged CurseForge archive smoke left profile files behind".to_owned());
        }
        if core_load_profiles()
            .map_err(|error| error.to_string())?
            .iter()
            .any(|profile| profile.id == plan.profile.id)
        {
            return Err(
                "packaged CurseForge archive smoke left profile metadata behind".to_owned(),
            );
        }
        if let Some(parent) = archive_path.parent() {
            let _ = fs::remove_dir_all(parent);
        }
        let archive_removed = !archive_path.exists();
        if !archive_removed {
            return Err("packaged CurseForge archive smoke left staged archive behind".to_owned());
        }
        let install_event_count = event_log
            .list(None)
            .map_err(|error| error.to_string())?
            .into_iter()
            .filter(|event| event.subject_id.as_deref() == Some(profile_id))
            .count();
        Ok::<serde_json::Value, String>(serde_json::json!({
            "profileId": plan.profile.id,
            "profileName": persisted_profile.name,
            "loader": format!("{:?}", persisted_profile.loader),
            "gameVersion": persisted_profile.game_version,
            "installedPackVersion": persisted_profile.installed_pack_version,
            "modDownloadCount": plan.mod_download_plan.items.len(),
            "extractionEventCount": extraction.events.len(),
            "overrideExtracted": true,
            "nestedOverrideExtracted": true,
            "metadataStored": true,
            "persistedProfileFound": true,
            "installEventCount": install_event_count,
            "deletedProfileId": deleted.id,
            "profileDataRemoved": profile_data_removed,
            "archiveRemoved": archive_removed,
        }))
    })();

    if result.is_err() {
        let _ = core_delete_profile(DeleteProfileRequest {
            id: profile_id.to_owned(),
        });
        if let Some(parent) = archive_path.parent() {
            let _ = fs::remove_dir_all(parent);
        }
    }

    let payload = result?;
    let probe_path =
        Path::new(&directories.config_dir).join(PACKAGED_SMOKE_CURSEFORGE_ARCHIVE_INSTALL_FILE);
    fs::write(
        &probe_path,
        serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?,
    )
    .map_err(|error| {
        format!(
            "failed to write packaged CurseForge archive install smoke probe {}: {error}",
            probe_path.display()
        )
    })
}

fn write_packaged_smoke_ftb_legacy_archive_install_probe(
    event_log: &LauncherEventLog,
) -> Result<(), String> {
    if !packaged_smoke_ftb_legacy_archive_install_enabled() {
        return Ok(());
    }

    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let archive_path = Path::new(&directories.cache_dir)
        .join("packaged-ftb-legacy-archive-install")
        .join("PackagedSmokeFTBLegacy.zip");
    let profile_id = "ftb-legacy-packaged-smoke-ftb-legacy";
    let _ = core_delete_profile(DeleteProfileRequest {
        id: profile_id.to_owned(),
    });
    write_packaged_smoke_ftb_legacy_archive(&archive_path)?;

    let result = (|| {
        let download_plan = FtbLegacyModpackDownloadPlan {
            name: "Packaged Smoke FTB Legacy".to_owned(),
            feed_kind: "public".to_owned(),
            directory: "PackagedSmokeFTBLegacy".to_owned(),
            file_name: "PackagedSmokeFTBLegacy.zip".to_owned(),
            minecraft_version: "1.12.2".to_owned(),
            pack_version: "1.1.0".to_owned(),
            archive_download_plan: DownloadPlan {
                version_id: "packaged-ftb-legacy-archive".to_owned(),
                items: Vec::new(),
            },
            archive_path: archive_path.clone(),
        };
        let plan = core_build_ftb_legacy_modpack_archive_install_plan(
            &archive_path,
            &download_plan,
            Some("Packaged Smoke FTB Legacy"),
            &directories,
        )
        .map_err(|error| error.to_string())?;
        if plan.profile.id != profile_id {
            return Err(format!(
                "packaged FTB Legacy archive smoke expected profile id {profile_id}, found {}",
                plan.profile.id
            ));
        }
        if plan.profile.loader != shared::ModLoader::Forge {
            return Err(format!(
                "packaged FTB Legacy archive smoke expected Forge loader, found {:?}",
                plan.profile.loader
            ));
        }
        if plan.loader_version.as_deref() != Some("14.23.5.2860") {
            return Err(format!(
                "packaged FTB Legacy archive smoke expected Forge 14.23.5.2860, found {:?}",
                plan.loader_version
            ));
        }
        if plan.profile.game_version != "1.12.2" {
            return Err(format!(
                "packaged FTB Legacy archive smoke expected Minecraft 1.12.2, found {}",
                plan.profile.game_version
            ));
        }
        let extraction =
            core_extract_ftb_legacy_modpack_archive(&archive_path, &plan, &directories)
                .map_err(|error| error.to_string())?;
        event_log
            .record_plan(&extraction)
            .map_err(|error| error.to_string())?;
        core_persist_installed_pack_profile(plan.profile.clone())
            .map_err(|error| error.to_string())?;
        event_log
            .record_event(completed_native_operation_event(
                LauncherOperation::InstallModpackArchive,
                plan.profile.id.clone(),
                "Packaged Smoke FTB Legacy installed successfully.",
            ))
            .map_err(|error| error.to_string())?;

        let profile_root = Path::new(&directories.data_dir)
            .join("profiles")
            .join(&plan.profile.id);
        let pack_json_path = profile_root.join("pack.json");
        let config_path = profile_root.join("config").join("packaged.cfg");
        let script_path = profile_root.join("scripts").join("startup.zs");
        let persisted_profile = core_load_profiles()
            .map_err(|error| error.to_string())?
            .into_iter()
            .find(|profile| profile.id == plan.profile.id)
            .ok_or_else(|| {
                "packaged FTB Legacy archive smoke did not persist profile".to_owned()
            })?;
        if !pack_json_path.is_file() {
            return Err("packaged FTB Legacy archive smoke did not copy pack.json".to_owned());
        }
        if fs::read_to_string(&config_path).map_err(|error| error.to_string())? != "enabled=true" {
            return Err("packaged FTB Legacy archive smoke did not extract config".to_owned());
        }
        if fs::read_to_string(&script_path).map_err(|error| error.to_string())? != "print('legacy')"
        {
            return Err("packaged FTB Legacy archive smoke did not extract scripts".to_owned());
        }

        let profile_data_path = profile_root.clone();
        let deleted = core_delete_profile(DeleteProfileRequest {
            id: plan.profile.id.clone(),
        })
        .map_err(|error| error.to_string())?;
        let profile_data_removed = !profile_data_path.exists();
        if !profile_data_removed {
            return Err("packaged FTB Legacy archive smoke left profile files behind".to_owned());
        }
        if core_load_profiles()
            .map_err(|error| error.to_string())?
            .iter()
            .any(|profile| profile.id == plan.profile.id)
        {
            return Err(
                "packaged FTB Legacy archive smoke left profile metadata behind".to_owned(),
            );
        }
        if let Some(parent) = archive_path.parent() {
            let _ = fs::remove_dir_all(parent);
        }
        let archive_removed = !archive_path.exists();
        if !archive_removed {
            return Err("packaged FTB Legacy archive smoke left staged archive behind".to_owned());
        }
        let install_event_count = event_log
            .list(None)
            .map_err(|error| error.to_string())?
            .into_iter()
            .filter(|event| event.subject_id.as_deref() == Some(profile_id))
            .count();
        Ok::<serde_json::Value, String>(serde_json::json!({
            "profileId": plan.profile.id,
            "profileName": persisted_profile.name,
            "loader": format!("{:?}", persisted_profile.loader),
            "loaderVersion": plan.loader_version,
            "gameVersion": persisted_profile.game_version,
            "installedPackVersion": persisted_profile.installed_pack_version,
            "archiveDownloadCount": download_plan.archive_download_plan.items.len(),
            "extractionEventCount": extraction.events.len(),
            "packJsonExtracted": true,
            "configExtracted": true,
            "scriptExtracted": true,
            "persistedProfileFound": true,
            "installEventCount": install_event_count,
            "deletedProfileId": deleted.id,
            "profileDataRemoved": profile_data_removed,
            "archiveRemoved": archive_removed,
        }))
    })();

    if result.is_err() {
        let _ = core_delete_profile(DeleteProfileRequest {
            id: profile_id.to_owned(),
        });
        if let Some(parent) = archive_path.parent() {
            let _ = fs::remove_dir_all(parent);
        }
    }

    let payload = result?;
    let probe_path =
        Path::new(&directories.config_dir).join(PACKAGED_SMOKE_FTB_LEGACY_ARCHIVE_INSTALL_FILE);
    fs::write(
        &probe_path,
        serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?,
    )
    .map_err(|error| {
        format!(
            "failed to write packaged FTB Legacy archive install smoke probe {}: {error}",
            probe_path.display()
        )
    })
}

fn write_packaged_smoke_ftb_install_probe(event_log: &LauncherEventLog) -> Result<(), String> {
    if !packaged_smoke_ftb_install_enabled() {
        return Ok(());
    }

    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let profile_id = "ftb-424242";
    let _ = core_delete_profile(DeleteProfileRequest {
        id: profile_id.to_owned(),
    });

    let result = (|| {
        let plan = core_build_ftb_modpack_install_plan_from_version_json(
            "424242",
            "12482",
            Some("Packaged Smoke FTB"),
            &directories,
            packaged_smoke_ftb_version_json(),
        )
        .map_err(|error| error.to_string())?;
        if plan.profile.id != profile_id {
            return Err(format!(
                "packaged FTB install smoke expected profile id {profile_id}, found {}",
                plan.profile.id
            ));
        }
        if plan.profile.loader != shared::ModLoader::Neoforge {
            return Err(format!(
                "packaged FTB install smoke expected Neoforge loader, found {:?}",
                plan.profile.loader
            ));
        }
        if plan.loader_version.as_deref() != Some("21.1.51") {
            return Err(format!(
                "packaged FTB install smoke expected Neoforge 21.1.51, found {:?}",
                plan.loader_version
            ));
        }
        if plan.profile.game_version != "1.21.1" {
            return Err(format!(
                "packaged FTB install smoke expected Minecraft 1.21.1, found {}",
                plan.profile.game_version
            ));
        }
        if plan.profile.memory_mb != 6144 {
            return Err(format!(
                "packaged FTB install smoke expected recommended memory 6144, found {}",
                plan.profile.memory_mb
            ));
        }
        if plan.file_download_plan.items.len() != 1 {
            return Err(format!(
                "packaged FTB install smoke expected 1 planned client file, found {}",
                plan.file_download_plan.items.len()
            ));
        }

        write_packaged_smoke_ftb_planned_files(&plan.file_download_plan)?;
        core_persist_installed_pack_profile(plan.profile.clone())
            .map_err(|error| error.to_string())?;
        event_log
            .record_event(completed_native_operation_event(
                LauncherOperation::InstallModpackArchive,
                plan.profile.id.clone(),
                "Packaged Smoke FTB installed successfully.",
            ))
            .map_err(|error| error.to_string())?;

        let profile_root = Path::new(&directories.data_dir)
            .join("profiles")
            .join(&plan.profile.id);
        let config_path = profile_root
            .join("config")
            .join("CoroUtil")
            .join("General.toml");
        let skipped_server_path = profile_root.join("mods").join("server-only.jar");
        let skipped_optional_path = profile_root.join("mods").join("optional.jar");
        let persisted_profile = core_load_profiles()
            .map_err(|error| error.to_string())?
            .into_iter()
            .find(|profile| profile.id == plan.profile.id)
            .ok_or_else(|| "packaged FTB install smoke did not persist profile".to_owned())?;
        if fs::read_to_string(&config_path).map_err(|error| error.to_string())? != "ftbConfig=true"
        {
            return Err("packaged FTB install smoke did not stage planned client file".to_owned());
        }
        if skipped_server_path.exists() {
            return Err("packaged FTB install smoke staged server-only files".to_owned());
        }
        if skipped_optional_path.exists() {
            return Err("packaged FTB install smoke staged optional files".to_owned());
        }

        let planned_paths = plan
            .file_download_plan
            .items
            .iter()
            .map(|item| PathBuf::from(&item.destination))
            .collect::<Vec<_>>();
        let profile_data_path = profile_root.clone();
        let deleted = core_delete_profile(DeleteProfileRequest {
            id: plan.profile.id.clone(),
        })
        .map_err(|error| error.to_string())?;
        let profile_data_removed = !profile_data_path.exists();
        if !profile_data_removed {
            return Err("packaged FTB install smoke left profile files behind".to_owned());
        }
        if core_load_profiles()
            .map_err(|error| error.to_string())?
            .iter()
            .any(|profile| profile.id == plan.profile.id)
        {
            return Err("packaged FTB install smoke left profile metadata behind".to_owned());
        }
        let staged_files_removed = planned_paths.iter().all(|path| !path.exists());
        if !staged_files_removed {
            return Err("packaged FTB install smoke left planned files behind".to_owned());
        }
        let install_event_count = event_log
            .list(None)
            .map_err(|error| error.to_string())?
            .into_iter()
            .filter(|event| event.subject_id.as_deref() == Some(profile_id))
            .count();
        Ok::<serde_json::Value, String>(serde_json::json!({
            "profileId": plan.profile.id,
            "profileName": persisted_profile.name,
            "loader": format!("{:?}", persisted_profile.loader),
            "loaderVersion": plan.loader_version,
            "gameVersion": persisted_profile.game_version,
            "installedPackVersion": persisted_profile.installed_pack_version,
            "memoryMb": persisted_profile.memory_mb,
            "fileDownloadCount": plan.file_download_plan.items.len(),
            "configStaged": true,
            "serverOnlySkipped": true,
            "optionalSkipped": true,
            "persistedProfileFound": true,
            "installEventCount": install_event_count,
            "deletedProfileId": deleted.id,
            "profileDataRemoved": profile_data_removed,
            "stagedFilesRemoved": staged_files_removed,
        }))
    })();

    if result.is_err() {
        let _ = core_delete_profile(DeleteProfileRequest {
            id: profile_id.to_owned(),
        });
    }

    let payload = result?;
    let probe_path = Path::new(&directories.config_dir).join(PACKAGED_SMOKE_FTB_INSTALL_FILE);
    fs::write(
        &probe_path,
        serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?,
    )
    .map_err(|error| {
        format!(
            "failed to write packaged FTB install smoke probe {}: {error}",
            probe_path.display()
        )
    })
}

fn write_packaged_smoke_technic_archive_install_probe(
    event_log: &LauncherEventLog,
) -> Result<(), String> {
    if !packaged_smoke_technic_archive_install_enabled() {
        return Ok(());
    }

    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let archive_path = Path::new(&directories.cache_dir)
        .join("packaged-technic-archive-install")
        .join("PackagedSmokeTechnic.zip");
    let profile_id = "technic-packaged-smoke-technic";
    let _ = core_delete_profile(DeleteProfileRequest {
        id: profile_id.to_owned(),
    });
    write_packaged_smoke_technic_archive(&archive_path)?;

    let result = (|| {
        let download_plan = TechnicModpackDownloadPlan {
            slug: "packaged-smoke-technic".to_owned(),
            name: "Packaged Smoke Technic".to_owned(),
            minecraft_version: "1.12.2".to_owned(),
            pack_version: Some("1.3.0".to_owned()),
            archive_download_plan: DownloadPlan {
                version_id: "packaged-technic-archive".to_owned(),
                items: Vec::new(),
            },
            archive_path: archive_path.clone(),
            module_archive_paths: Vec::new(),
            source_kind: TechnicModpackDownloadKind::DirectZip,
        };
        let plan = core_build_technic_modpack_archive_install_plan(
            &archive_path,
            &download_plan,
            Some("Packaged Smoke Technic"),
            &directories,
        )
        .map_err(|error| error.to_string())?;
        if plan.profile.id != profile_id {
            return Err(format!(
                "packaged Technic archive smoke expected profile id {profile_id}, found {}",
                plan.profile.id
            ));
        }
        if plan.profile.loader != shared::ModLoader::Forge {
            return Err(format!(
                "packaged Technic archive smoke expected Forge loader, found {:?}",
                plan.profile.loader
            ));
        }
        if plan.loader_version.as_deref() != Some("14.23.5.2860") {
            return Err(format!(
                "packaged Technic archive smoke expected Forge 14.23.5.2860, found {:?}",
                plan.loader_version
            ));
        }
        if plan.profile.game_version != "1.12.2" {
            return Err(format!(
                "packaged Technic archive smoke expected Minecraft 1.12.2, found {}",
                plan.profile.game_version
            ));
        }
        let extraction = core_extract_technic_modpack_archive(&archive_path, &plan, &directories)
            .map_err(|error| error.to_string())?;
        event_log
            .record_plan(&extraction)
            .map_err(|error| error.to_string())?;
        core_persist_installed_pack_profile(plan.profile.clone())
            .map_err(|error| error.to_string())?;
        event_log
            .record_event(completed_native_operation_event(
                LauncherOperation::InstallModpackArchive,
                plan.profile.id.clone(),
                "Packaged Smoke Technic installed successfully.",
            ))
            .map_err(|error| error.to_string())?;

        let profile_root = Path::new(&directories.data_dir)
            .join("profiles")
            .join(&plan.profile.id);
        let version_json_path = profile_root.join("bin").join("version.json");
        let mod_path = profile_root.join("mods").join("example.jar");
        let config_path = profile_root.join("config").join("packaged.cfg");
        let persisted_profile = core_load_profiles()
            .map_err(|error| error.to_string())?
            .into_iter()
            .find(|profile| profile.id == plan.profile.id)
            .ok_or_else(|| "packaged Technic archive smoke did not persist profile".to_owned())?;
        if !version_json_path.is_file() {
            return Err("packaged Technic archive smoke did not copy bin/version.json".to_owned());
        }
        if fs::read(&mod_path).map_err(|error| error.to_string())? != b"mod".as_slice() {
            return Err("packaged Technic archive smoke did not extract mods".to_owned());
        }
        if fs::read_to_string(&config_path).map_err(|error| error.to_string())? != "enabled=true" {
            return Err("packaged Technic archive smoke did not extract config".to_owned());
        }

        let profile_data_path = profile_root.clone();
        let deleted = core_delete_profile(DeleteProfileRequest {
            id: plan.profile.id.clone(),
        })
        .map_err(|error| error.to_string())?;
        let profile_data_removed = !profile_data_path.exists();
        if !profile_data_removed {
            return Err("packaged Technic archive smoke left profile files behind".to_owned());
        }
        if core_load_profiles()
            .map_err(|error| error.to_string())?
            .iter()
            .any(|profile| profile.id == plan.profile.id)
        {
            return Err("packaged Technic archive smoke left profile metadata behind".to_owned());
        }
        if let Some(parent) = archive_path.parent() {
            let _ = fs::remove_dir_all(parent);
        }
        let archive_removed = !archive_path.exists();
        if !archive_removed {
            return Err("packaged Technic archive smoke left staged archive behind".to_owned());
        }
        let install_event_count = event_log
            .list(None)
            .map_err(|error| error.to_string())?
            .into_iter()
            .filter(|event| event.subject_id.as_deref() == Some(profile_id))
            .count();
        Ok::<serde_json::Value, String>(serde_json::json!({
            "profileId": plan.profile.id,
            "profileName": persisted_profile.name,
            "loader": format!("{:?}", persisted_profile.loader),
            "loaderVersion": plan.loader_version,
            "gameVersion": persisted_profile.game_version,
            "installedPackVersion": persisted_profile.installed_pack_version,
            "archiveDownloadCount": download_plan.archive_download_plan.items.len(),
            "extractionEventCount": extraction.events.len(),
            "versionJsonExtracted": true,
            "modExtracted": true,
            "configExtracted": true,
            "persistedProfileFound": true,
            "installEventCount": install_event_count,
            "deletedProfileId": deleted.id,
            "profileDataRemoved": profile_data_removed,
            "archiveRemoved": archive_removed,
        }))
    })();

    if result.is_err() {
        let _ = core_delete_profile(DeleteProfileRequest {
            id: profile_id.to_owned(),
        });
        if let Some(parent) = archive_path.parent() {
            let _ = fs::remove_dir_all(parent);
        }
    }

    let payload = result?;
    let probe_path =
        Path::new(&directories.config_dir).join(PACKAGED_SMOKE_TECHNIC_ARCHIVE_INSTALL_FILE);
    fs::write(
        &probe_path,
        serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?,
    )
    .map_err(|error| {
        format!(
            "failed to write packaged Technic archive install smoke probe {}: {error}",
            probe_path.display()
        )
    })
}

fn write_packaged_smoke_atlauncher_install_probe(
    event_log: &LauncherEventLog,
) -> Result<(), String> {
    if !packaged_smoke_atlauncher_install_enabled() {
        return Ok(());
    }

    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let profile_id = "atlauncher-packagedsmokeatlauncher";
    let _ = core_delete_profile(DeleteProfileRequest {
        id: profile_id.to_owned(),
    });

    let result = (|| {
        let plan = core_build_atlauncher_modpack_install_plan_from_config_json(
            "PackagedSmokeATLauncher",
            "1.0.0",
            Some("Packaged Smoke ATLauncher"),
            &directories,
            packaged_smoke_atlauncher_config_json(),
        )
        .map_err(|error| error.to_string())?;
        if plan.profile.id != profile_id {
            return Err(format!(
                "packaged ATLauncher install smoke expected profile id {profile_id}, found {}",
                plan.profile.id
            ));
        }
        if plan.profile.loader != shared::ModLoader::Forge {
            return Err(format!(
                "packaged ATLauncher install smoke expected Forge loader, found {:?}",
                plan.profile.loader
            ));
        }
        if plan.loader_version.as_deref() != Some("14.23.5.2860") {
            return Err(format!(
                "packaged ATLauncher install smoke expected Forge 14.23.5.2860, found {:?}",
                plan.loader_version
            ));
        }
        if plan.profile.game_version != "1.12.2" {
            return Err(format!(
                "packaged ATLauncher install smoke expected Minecraft 1.12.2, found {}",
                plan.profile.game_version
            ));
        }
        if plan.file_download_plan.items.len() != 3 {
            return Err(format!(
                "packaged ATLauncher install smoke expected 3 planned files, found {}",
                plan.file_download_plan.items.len()
            ));
        }
        if plan.extract_archives.len() != 2 {
            return Err(format!(
                "packaged ATLauncher install smoke expected 2 extract archives, found {}",
                plan.extract_archives.len()
            ));
        }

        write_packaged_smoke_atlauncher_planned_files(&plan.file_download_plan)?;
        let extraction =
            core_extract_atlauncher_archives(&plan.extract_archives, &plan.profile, &directories)
                .map_err(|error| error.to_string())?;
        event_log
            .record_plan(&extraction)
            .map_err(|error| error.to_string())?;
        core_persist_installed_pack_profile(plan.profile.clone())
            .map_err(|error| error.to_string())?;
        event_log
            .record_event(completed_native_operation_event(
                LauncherOperation::InstallModpackArchive,
                plan.profile.id.clone(),
                "Packaged Smoke ATLauncher installed successfully.",
            ))
            .map_err(|error| error.to_string())?;

        let profile_root = Path::new(&directories.data_dir)
            .join("profiles")
            .join(&plan.profile.id);
        let mod_path = profile_root.join("mods").join("example.jar");
        let config_path = profile_root.join("config").join("packaged.cfg");
        let script_path = profile_root.join("scripts").join("startup.zs");
        let skipped_path = profile_root.join("server-only").join("skip.txt");
        let persisted_profile = core_load_profiles()
            .map_err(|error| error.to_string())?
            .into_iter()
            .find(|profile| profile.id == plan.profile.id)
            .ok_or_else(|| {
                "packaged ATLauncher install smoke did not persist profile".to_owned()
            })?;
        if fs::read(&mod_path).map_err(|error| error.to_string())? != b"mod".as_slice() {
            return Err("packaged ATLauncher install smoke did not stage mod file".to_owned());
        }
        if fs::read_to_string(&config_path).map_err(|error| error.to_string())? != "enabled=true" {
            return Err("packaged ATLauncher install smoke did not extract config".to_owned());
        }
        if fs::read_to_string(&script_path).map_err(|error| error.to_string())?
            != "print('atlauncher')"
        {
            return Err("packaged ATLauncher install smoke did not extract scripts".to_owned());
        }
        if skipped_path.exists() {
            return Err("packaged ATLauncher install smoke extracted server-only files".to_owned());
        }

        let planned_paths = plan
            .file_download_plan
            .items
            .iter()
            .map(|item| PathBuf::from(&item.destination))
            .collect::<Vec<_>>();
        let profile_data_path = profile_root.clone();
        let deleted = core_delete_profile(DeleteProfileRequest {
            id: plan.profile.id.clone(),
        })
        .map_err(|error| error.to_string())?;
        let profile_data_removed = !profile_data_path.exists();
        if !profile_data_removed {
            return Err("packaged ATLauncher install smoke left profile files behind".to_owned());
        }
        if core_load_profiles()
            .map_err(|error| error.to_string())?
            .iter()
            .any(|profile| profile.id == plan.profile.id)
        {
            return Err(
                "packaged ATLauncher install smoke left profile metadata behind".to_owned(),
            );
        }
        let staged_files_removed = planned_paths.iter().all(|path| !path.exists());
        if !staged_files_removed {
            return Err("packaged ATLauncher install smoke left planned files behind".to_owned());
        }
        let install_event_count = event_log
            .list(None)
            .map_err(|error| error.to_string())?
            .into_iter()
            .filter(|event| event.subject_id.as_deref() == Some(profile_id))
            .count();
        Ok::<serde_json::Value, String>(serde_json::json!({
            "profileId": plan.profile.id,
            "profileName": persisted_profile.name,
            "loader": format!("{:?}", persisted_profile.loader),
            "loaderVersion": plan.loader_version,
            "gameVersion": persisted_profile.game_version,
            "installedPackVersion": persisted_profile.installed_pack_version,
            "fileDownloadCount": plan.file_download_plan.items.len(),
            "extractArchiveCount": plan.extract_archives.len(),
            "extractionEventCount": extraction.events.len(),
            "modStaged": true,
            "configExtracted": true,
            "scriptExtracted": true,
            "serverOnlySkipped": true,
            "persistedProfileFound": true,
            "installEventCount": install_event_count,
            "deletedProfileId": deleted.id,
            "profileDataRemoved": profile_data_removed,
            "stagedFilesRemoved": staged_files_removed,
        }))
    })();

    if result.is_err() {
        let _ = core_delete_profile(DeleteProfileRequest {
            id: profile_id.to_owned(),
        });
    }

    let payload = result?;
    let probe_path =
        Path::new(&directories.config_dir).join(PACKAGED_SMOKE_ATLAUNCHER_INSTALL_FILE);
    fs::write(
        &probe_path,
        serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?,
    )
    .map_err(|error| {
        format!(
            "failed to write packaged ATLauncher install smoke probe {}: {error}",
            probe_path.display()
        )
    })
}

fn write_packaged_smoke_atlauncher_planned_files(plan: &DownloadPlan) -> Result<(), String> {
    for item in &plan.items {
        let destination = PathBuf::from(&item.destination);
        if item.id.starts_with("atlauncher-configs-") {
            write_stored_zip_archive(
                &destination,
                &[("config/packaged.cfg", b"enabled=true".as_slice())],
            )?;
            continue;
        }
        if item.id.starts_with("atlauncher-extract-") {
            write_stored_zip_archive(
                &destination,
                &[
                    (
                        "overrides/scripts/startup.zs",
                        b"print('atlauncher')".as_slice(),
                    ),
                    ("server-only/skip.txt", b"skip".as_slice()),
                ],
            )?;
            continue;
        }
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        fs::write(&destination, b"mod").map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn packaged_smoke_atlauncher_config_json() -> &'static str {
    r#"{
      "version": "1.0.0",
      "minecraft": "1.12.2",
      "loader": {
        "type": "forge",
        "metadata": {
          "minecraft": "1.12.2",
          "version": "14.23.5.2860",
          "rawVersion": "1.12.2-14.23.5.2860"
        }
      },
      "mods": [
        {
          "name": "Client Scripts",
          "type": "extract",
          "extractTo": "root",
          "extractFolder": "overrides",
          "download": "server",
          "url": "packs/PackagedSmokeATLauncher/files/1.0.0/client-scripts.zip",
          "file": "client-scripts.zip",
          "client": true,
          "server": true,
          "optional": false
        },
        {
          "name": "Example Mod",
          "type": "mods",
          "download": "server",
          "url": "packs/PackagedSmokeATLauncher/files/1.0.0/example.jar",
          "file": "example.jar",
          "client": true,
          "server": true,
          "optional": false
        },
        {
          "name": "Server Only Mod",
          "type": "mods",
          "download": "server",
          "url": "packs/PackagedSmokeATLauncher/files/1.0.0/server-only.jar",
          "file": "server-only.jar",
          "client": false,
          "server": true,
          "optional": false
        },
        {
          "name": "Optional Client Mod",
          "type": "mods",
          "download": "server",
          "url": "packs/PackagedSmokeATLauncher/files/1.0.0/optional.jar",
          "file": "optional.jar",
          "client": true,
          "server": true,
          "optional": true
        }
      ],
      "configs": {
        "filesize": 18
      }
    }"#
}

fn write_packaged_smoke_ftb_planned_files(plan: &DownloadPlan) -> Result<(), String> {
    for item in &plan.items {
        let destination = PathBuf::from(&item.destination);
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        fs::write(&destination, b"ftbConfig=true").map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn packaged_smoke_ftb_version_json() -> &'static str {
    r#"{
      "status": "success",
      "targets": [
        { "version": "21.1.51", "id": 10353, "name": "neoforge", "type": "modloader" },
        { "version": "1.21.1", "id": 10271, "name": "minecraft", "type": "game" }
      ],
      "specs": { "minimum": 4096, "recommended": 6144 },
      "files": [
        {
          "id": 359393,
          "path": "./config/CoroUtil/",
          "url": "https://dist.modpacks.ch/modpacks/example/config/CoroUtil/sha",
          "sha1": "3bd7d98616d2c4ff4ee7c8e12257bf7e5891d955",
          "size": 121,
          "serveronly": false,
          "optional": false,
          "name": "General.toml"
        },
        {
          "id": 1,
          "path": "./mods/",
          "url": "https://dist.modpacks.ch/server-only.jar",
          "sha1": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "size": 1,
          "serveronly": true,
          "optional": false,
          "name": "server-only.jar"
        },
        {
          "id": 2,
          "path": "./mods/",
          "url": "https://dist.modpacks.ch/optional.jar",
          "sha1": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          "size": 1,
          "serveronly": false,
          "optional": true,
          "name": "optional.jar"
        }
      ]
    }"#
}

fn write_packaged_smoke_modrinth_archive(archive_path: &Path) -> Result<(), String> {
    let index = br#"{
      "formatVersion": 1,
      "game": "minecraft",
      "versionId": "packaged-modrinth-version",
      "name": "Packaged Smoke Modrinth",
      "summary": "Packaged smoke fixture",
      "files": [],
      "dependencies": {
        "minecraft": "1.21.8"
      }
    }"#;
    write_stored_zip_archive(
        archive_path,
        &[
            ("modrinth.index.json", index.as_slice()),
            ("overrides/config/packaged.toml", b"enabled=true".as_slice()),
            ("client-overrides/options.txt", b"autoJump:false".as_slice()),
            (
                "server-overrides/server.properties",
                b"motd=skip".as_slice(),
            ),
        ],
    )
}

fn write_packaged_smoke_curseforge_archive(archive_path: &Path) -> Result<(), String> {
    let manifest = br#"{
      "minecraft": {
        "version": "1.21.8",
        "modLoaders": []
      },
      "manifestType": "minecraftModpack",
      "manifestVersion": 1,
      "name": "Packaged Smoke CurseForge",
      "version": "packaged-curseforge-version",
      "author": "TheBoysLauncher",
      "files": [],
      "overrides": "overrides"
    }"#;
    write_stored_zip_archive(
        archive_path,
        &[
            ("manifest.json", manifest.as_slice()),
            ("overrides/config/packaged.cfg", b"enabled=true".as_slice()),
            (
                "overrides/scripts/startup.zs",
                b"print('packaged')".as_slice(),
            ),
        ],
    )
}

fn write_packaged_smoke_ftb_legacy_archive(archive_path: &Path) -> Result<(), String> {
    let pack_json = br#"{
      "libraries": [
        { "name": "net.minecraftforge:forge:1.12.2-14.23.5.2860" }
      ]
    }"#;
    write_stored_zip_archive(
        archive_path,
        &[
            ("minecraft/pack.json", pack_json.as_slice()),
            ("minecraft/config/packaged.cfg", b"enabled=true".as_slice()),
            (
                "minecraft/scripts/startup.zs",
                b"print('legacy')".as_slice(),
            ),
        ],
    )
}

fn write_packaged_smoke_technic_archive(archive_path: &Path) -> Result<(), String> {
    let version_json = br#"{
      "inheritsFrom": "1.12.2",
      "libraries": [
        { "name": "net.minecraftforge:forge:1.12.2-14.23.5.2860" }
      ]
    }"#;
    write_stored_zip_archive(
        archive_path,
        &[
            ("bin/version.json", version_json.as_slice()),
            ("mods/example.jar", b"mod".as_slice()),
            ("config/packaged.cfg", b"enabled=true".as_slice()),
        ],
    )
}

fn write_stored_zip_archive(archive_path: &Path, entries: &[(&str, &[u8])]) -> Result<(), String> {
    if let Some(parent) = archive_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let mut file = fs::File::create(archive_path).map_err(|error| error.to_string())?;
    let mut central_directory = Vec::new();
    let mut offset = 0_u32;
    for (name, body) in entries {
        let name_bytes = name.as_bytes();
        let crc = crc32(body);
        let body_len = u32::try_from(body.len()).map_err(|error| error.to_string())?;
        let name_len = u16::try_from(name_bytes.len()).map_err(|error| error.to_string())?;
        let local_offset = offset;
        write_le_u32(&mut file, 0x0403_4b50)?;
        write_le_u16(&mut file, 20)?;
        write_le_u16(&mut file, 0)?;
        write_le_u16(&mut file, 0)?;
        write_le_u16(&mut file, 0)?;
        write_le_u16(&mut file, 0)?;
        write_le_u32(&mut file, crc)?;
        write_le_u32(&mut file, body_len)?;
        write_le_u32(&mut file, body_len)?;
        write_le_u16(&mut file, name_len)?;
        write_le_u16(&mut file, 0)?;
        std::io::Write::write_all(&mut file, name_bytes).map_err(|error| error.to_string())?;
        std::io::Write::write_all(&mut file, body).map_err(|error| error.to_string())?;
        offset = offset
            .checked_add(30)
            .and_then(|value| value.checked_add(u32::from(name_len)))
            .and_then(|value| value.checked_add(body_len))
            .ok_or_else(|| "packaged smoke zip archive is too large".to_owned())?;

        write_le_u32(&mut central_directory, 0x0201_4b50)?;
        write_le_u16(&mut central_directory, 20)?;
        write_le_u16(&mut central_directory, 20)?;
        write_le_u16(&mut central_directory, 0)?;
        write_le_u16(&mut central_directory, 0)?;
        write_le_u16(&mut central_directory, 0)?;
        write_le_u16(&mut central_directory, 0)?;
        write_le_u32(&mut central_directory, crc)?;
        write_le_u32(&mut central_directory, body_len)?;
        write_le_u32(&mut central_directory, body_len)?;
        write_le_u16(&mut central_directory, name_len)?;
        write_le_u16(&mut central_directory, 0)?;
        write_le_u16(&mut central_directory, 0)?;
        write_le_u16(&mut central_directory, 0)?;
        write_le_u16(&mut central_directory, 0)?;
        write_le_u32(&mut central_directory, 0)?;
        write_le_u32(&mut central_directory, local_offset)?;
        central_directory.extend_from_slice(name_bytes);
    }
    let central_directory_offset = offset;
    std::io::Write::write_all(&mut file, &central_directory).map_err(|error| error.to_string())?;
    let central_directory_size =
        u32::try_from(central_directory.len()).map_err(|error| error.to_string())?;
    let entry_count = u16::try_from(entries.len()).map_err(|error| error.to_string())?;
    write_le_u32(&mut file, 0x0605_4b50)?;
    write_le_u16(&mut file, 0)?;
    write_le_u16(&mut file, 0)?;
    write_le_u16(&mut file, entry_count)?;
    write_le_u16(&mut file, entry_count)?;
    write_le_u32(&mut file, central_directory_size)?;
    write_le_u32(&mut file, central_directory_offset)?;
    write_le_u16(&mut file, 0)?;
    Ok(())
}

fn write_le_u16<W: std::io::Write>(writer: &mut W, value: u16) -> Result<(), String> {
    writer
        .write_all(&value.to_le_bytes())
        .map_err(|error| error.to_string())
}

fn write_le_u32<W: std::io::Write>(writer: &mut W, value: u32) -> Result<(), String> {
    writer
        .write_all(&value.to_le_bytes())
        .map_err(|error| error.to_string())
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xffff_ffff_u32;
    for byte in bytes {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            let mask = 0_u32.wrapping_sub(crc & 1);
            crc = (crc >> 1) ^ (0xedb8_8320 & mask);
        }
    }
    !crc
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

async fn write_packaged_smoke_activity_progress_probe(
    event_log: &LauncherEventLog,
) -> Result<(), String> {
    if !packaged_smoke_activity_progress_enabled() {
        return Ok(());
    }

    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let body = b"packaged activity progress".to_vec();
    let listener = TcpListener::bind("127.0.0.1:0").await.map_err(|error| {
        format!("failed to bind packaged activity progress smoke server: {error}")
    })?;
    let address = listener.local_addr().map_err(|error| {
        format!("failed to resolve packaged activity progress smoke server: {error}")
    })?;
    let server_body = body.clone();
    let server = tokio::spawn(async move {
        for _ in 0..3 {
            let (mut stream, _) = listener.accept().await.map_err(|error| {
                format!("activity progress smoke server accept failed: {error}")
            })?;
            let mut buffer = [0_u8; 1024];
            let _ = stream.read(&mut buffer).await;
            let headers = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                server_body.len()
            );
            stream
                .write_all(headers.as_bytes())
                .await
                .map_err(|error| {
                    format!("activity progress smoke server header write failed: {error}")
                })?;
            stream.write_all(&server_body).await.map_err(|error| {
                format!("activity progress smoke server body write failed: {error}")
            })?;
        }
        Ok::<(), String>(())
    });

    let progress_root = Path::new(&directories.cache_dir).join("packaged-activity-progress");
    let plan = DownloadPlan {
        version_id: "packaged-activity-progress".to_owned(),
        items: vec![
            DownloadItem {
                id: "client-activity-progress".to_owned(),
                kind: DownloadKind::ClientJar,
                url: format!("http://{address}/client.jar"),
                sha1: None,
                sha256: None,
                sha512: None,
                md5: None,
                murmur2: None,
                size: Some(body.len() as u64),
                destination: progress_root
                    .join("client.jar")
                    .to_string_lossy()
                    .to_string(),
            },
            DownloadItem {
                id: "asset-object-minecraft/sounds/random/click.ogg".to_owned(),
                kind: DownloadKind::AssetObject,
                url: format!("http://{address}/asset.ogg"),
                sha1: None,
                sha256: None,
                sha512: None,
                md5: None,
                murmur2: None,
                size: Some(body.len() as u64),
                destination: progress_root
                    .join("assets")
                    .join("click.ogg")
                    .to_string_lossy()
                    .to_string(),
            },
            DownloadItem {
                id: "forge-bootstrap".to_owned(),
                kind: DownloadKind::ModLoaderInstaller,
                url: format!("http://{address}/forge-bootstrap.jar"),
                sha1: None,
                sha256: None,
                sha512: None,
                md5: None,
                murmur2: None,
                size: Some(body.len() as u64),
                destination: progress_root
                    .join("modloaders")
                    .join("forge-bootstrap.jar")
                    .to_string_lossy()
                    .to_string(),
            },
        ],
    };
    let operation = execute_download_plan_recording_events(&plan, event_log).await?;
    server
        .await
        .map_err(|error| format!("activity progress smoke server task failed: {error}"))??;

    let events = event_log
        .list(Some(100))
        .map_err(|error| error.to_string())?;
    let progress_events = events
        .into_iter()
        .filter(|event| {
            event.operation == Some(LauncherOperation::DownloadArtifacts)
                && event.subject_id.as_deref() == Some("packaged-activity-progress")
        })
        .collect::<Vec<_>>();
    let messages = progress_events
        .iter()
        .map(|event| event.message.clone())
        .collect::<Vec<_>>();
    let required_messages = [
        "Downloading Minecraft client",
        "Minecraft client ready",
        "Downloading Minecraft assets",
        "Minecraft assets ready",
        "Downloading mod loader files",
        "mod loader files ready",
        "Files are ready.",
    ];
    for required in required_messages {
        if !messages.iter().any(|message| message == required) {
            return Err(format!(
                "packaged activity progress smoke did not record '{required}': {messages:?}"
            ));
        }
    }
    let raw_internal_terms_absent = messages.iter().all(|message| {
        !message.to_ascii_lowercase().contains("artifact")
            && !message.contains("(client jar")
            && !message.contains("(asset object")
            && !message.contains("(modloader installer")
    });
    if !raw_internal_terms_absent {
        return Err(format!(
            "packaged activity progress smoke leaked internal download wording: {messages:?}"
        ));
    }
    let downloaded_files = [
        progress_root.join("client.jar"),
        progress_root.join("assets").join("click.ogg"),
        progress_root.join("modloaders").join("forge-bootstrap.jar"),
    ];
    for file in &downloaded_files {
        if !file.is_file() {
            return Err(format!(
                "packaged activity progress smoke did not write {}",
                file.display()
            ));
        }
    }

    let probe_path = Path::new(&directories.config_dir).join(PACKAGED_SMOKE_ACTIVITY_PROGRESS_FILE);
    let payload = serde_json::json!({
        "operation": operation.operation,
        "subjectId": operation.subject_id,
        "eventCount": progress_events.len(),
        "messages": messages,
        "rawInternalTermsAbsent": raw_internal_terms_absent,
        "downloadedFileCount": downloaded_files.len(),
    });
    fs::write(
        &probe_path,
        serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?,
    )
    .map_err(|error| {
        format!(
            "failed to write packaged activity progress smoke probe {}: {error}",
            probe_path.display()
        )
    })
}

fn write_packaged_smoke_java_recovery_probe() -> Result<(), String> {
    if !packaged_smoke_java_recovery_enabled() {
        return Ok(());
    }

    let manifest = core_recommended_java_runtime_manifest();
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let samples = [
        ("b1.8.1", 8_u32, "temurin-8-windows-x64"),
        ("1.16.5", 8_u32, "temurin-8-windows-x64"),
        ("1.17.1", 16_u32, "temurin-17-windows-x64"),
        ("1.20.4", 17_u32, "temurin-17-windows-x64"),
        ("1.20.5", 21_u32, "temurin-21-windows-x64"),
        ("1.21.8", 21_u32, "temurin-21-windows-x64"),
        ("26.2", 25_u32, "temurin-25-windows-x64"),
    ];
    let selections = samples
        .iter()
        .map(|(version, expected_required_java, expected_runtime_id)| {
            let required_java = core_required_java_major_for_minecraft(version);
            if required_java != *expected_required_java {
                return Err(format!(
                    "packaged Java recovery smoke expected Minecraft {version} to require Java {expected_required_java}, found Java {required_java}"
                ));
            }
            let runtime = recommended_java_entry_for_requirement(&manifest, required_java)
                .ok_or_else(|| {
                    format!(
                        "packaged Java recovery smoke found no recommendation for Minecraft {version} Java {required_java}"
                    )
                })?;
            if runtime.runtime_id != *expected_runtime_id {
                return Err(format!(
                    "packaged Java recovery smoke expected {version} to select {expected_runtime_id}, found {}",
                    runtime.runtime_id
                ));
            }
            let request = core_java_runtime_request_from_manifest_entry(&runtime);
            let download_plan =
                core_build_managed_java_runtime_download_plan(request, &directories)
                    .map_err(|error| error.to_string())?;
            if download_plan.version_id != runtime.runtime_id
                || download_plan.items.len() != 1
                || download_plan.items[0].kind != DownloadKind::JavaRuntimeArchive
                || !download_plan.items[0]
                    .destination
                    .replace('\\', "/")
                    .contains(&format!("data/runtimes/{}/downloads/", runtime.runtime_id))
            {
                return Err(format!(
                    "packaged Java recovery smoke built an invalid managed-runtime download plan for {}: {:?}",
                    runtime.runtime_id, download_plan
                ));
            }
            Ok(serde_json::json!({
                "minecraftVersion": version,
                "requiredJava": required_java,
                "runtimeId": runtime.runtime_id,
                "runtimeMajor": runtime.major_version,
                "archiveKind": download_plan.items[0].kind,
                "downloadDestination": download_plan.items[0].destination.replace('\\', "/"),
            }))
        })
        .collect::<Result<Vec<_>, String>>()?;

    let recoverable_messages = [
        "Minecraft requires Java 21 or newer, but no Java runtimes were discovered. Install a managed Java runtime from Settings before launching.",
        "Java executable C:/launcher/runtimes/temurin-21-windows-x64/bin/java.exe is missing. Install a managed Java runtime from Settings before launching.",
    ];
    let non_recoverable_messages = [
        "configured profile Java override could not be inspected at C:/Java/bin/java.exe. Choose a valid java executable or use Automatic.",
        "Minecraft requires Java 21 or newer, but the configured global Java override is Java 17 at C:/Java/bin/java.exe. Choose Automatic or a compatible Java executable.",
    ];
    if !recoverable_messages
        .iter()
        .all(|message| launch_failure_recoverable_managed_java(message))
    {
        return Err(
            "packaged Java recovery smoke did not classify managed Java launch failures as recoverable"
                .to_owned(),
        );
    }
    if non_recoverable_messages
        .iter()
        .any(|message| launch_failure_recoverable_managed_java(message))
    {
        return Err(
            "packaged Java recovery smoke treated manual Java override failures as automatic recovery"
                .to_owned(),
        );
    }

    let probe_path = Path::new(&directories.config_dir).join(PACKAGED_SMOKE_JAVA_RECOVERY_FILE);
    let payload = serde_json::json!({
        "selectionCount": selections.len(),
        "selections": selections,
        "recoverableManagedJavaFailures": recoverable_messages.len(),
        "manualOverrideFailuresRecoverable": false,
        "downloadPlansTargetManagedRuntimes": true,
    });
    fs::write(
        &probe_path,
        serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?,
    )
    .map_err(|error| {
        format!(
            "failed to write packaged Java recovery smoke probe {}: {error}",
            probe_path.display()
        )
    })
}

async fn write_packaged_smoke_discover_routing_probe() -> Result<(), String> {
    if !packaged_smoke_discover_routing_enabled() {
        return Ok(());
    }

    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let cases = [
        (
            "curseforge_flame",
            "curseforge",
            "multimc://install?platform=flame&addonId=890405&fileId=5650506",
            "890405",
            Some("5650506"),
        ),
        (
            "modrinth_prism",
            "modrinth",
            "prismlauncher://install?platform=modrinth&projectId=fabulously-optimized&versionId=preview",
            "fabulously-optimized",
            Some("preview"),
        ),
        (
            "atlauncher_prism",
            "atlauncher",
            "prismlauncher://install?platform=atlauncher&pack=SevTechAges&version=3.2.3",
            "SevTechAges",
            Some("3.2.3"),
        ),
        (
            "ftb_prism",
            "ftb",
            "prismlauncher://install?platform=ftb&packId=126&versionId=12482",
            "126",
            Some("12482"),
        ),
        (
            "ftb_legacy_prism",
            "ftb_legacy",
            "prismlauncher://install?platform=ftb-legacy&pack=FTBAcademy&file=FTBAcademy.zip&version=1.1.0",
            "public:FTBAcademy:FTBAcademy.zip",
            Some("1.1.0"),
        ),
        (
            "ftb_private_prism",
            "ftb_private",
            "prismlauncher://install?platform=ftb-private&code=familycode",
            "familycode",
            None,
        ),
        (
            "technic_prism",
            "technic",
            "prismlauncher://install?platform=technic&slug=hexxit&build=1.0.10",
            "hexxit",
            Some("1.0.10"),
        ),
    ];
    let mut routed = Vec::new();
    for (label, provider, query, expected_project_id, expected_version_id) in cases {
        let mut results = core_search_discover_modpacks(provider, query, 3)
            .await
            .map_err(|error| error.to_string())?;
        if results.len() != 1 {
            return Err(format!(
                "packaged Discover routing smoke expected one {provider} result for {label}, found {}",
                results.len()
            ));
        }
        let result = results.remove(0);
        if result.provider != provider
            || result.project_id != expected_project_id
            || result.latest_version_id.as_deref() != expected_version_id
            || !result.install_available
        {
            return Err(format!(
                "packaged Discover routing smoke routed {label} incorrectly: {:?}",
                result
            ));
        }
        routed.push(serde_json::json!({
            "label": label,
            "provider": result.provider,
            "projectId": result.project_id,
            "slug": result.slug,
            "title": result.title,
            "versionId": result.latest_version_id,
            "installAvailable": result.install_available,
        }));
    }

    let all_sources_result = core_search_discover_modpacks(
        "all",
        "prismlauncher://install?platform=modrinth&projectId=fabulously-optimized&versionId=preview",
        3,
    )
    .await
    .map_err(|error| error.to_string())?;
    if all_sources_result.len() != 1
        || all_sources_result[0].provider != "modrinth"
        || all_sources_result[0].project_id != "fabulously-optimized"
    {
        return Err(format!(
            "packaged Discover routing smoke did not short-circuit All sources provider links: {:?}",
            all_sources_result
        ));
    }

    let probe_path = Path::new(&directories.config_dir).join(PACKAGED_SMOKE_DISCOVER_ROUTING_FILE);
    let payload = serde_json::json!({
        "providerCount": routed.len(),
        "providers": routed.iter().filter_map(|entry| entry.get("provider")).collect::<Vec<_>>(),
        "routed": routed,
        "allSourcesProvider": all_sources_result[0].provider,
        "allSourcesProjectId": all_sources_result[0].project_id,
        "allSourcesShortCircuited": true,
        "nativeInstallProviders": [
            "modrinth",
            "curseforge",
            "ftb",
            "atlauncher",
            "ftb_legacy",
            "ftb_private",
            "technic",
        ],
    });
    fs::write(
        &probe_path,
        serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?,
    )
    .map_err(|error| {
        format!(
            "failed to write packaged Discover routing smoke probe {}: {error}",
            probe_path.display()
        )
    })
}

fn write_packaged_smoke_profile_lifecycle_probe() -> Result<(), String> {
    if !packaged_smoke_profile_lifecycle_enabled() {
        return Ok(());
    }

    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let created = core_create_profile(CreateProfileRequest {
        name: "Packaged Smoke Profile".to_owned(),
        loader: shared::ModLoader::Vanilla,
        game_version: "1.21.8".to_owned(),
        memory_mb: 3072,
    })
    .map_err(|error| error.to_string())?;
    let profile_data_root = Path::new(&directories.data_dir).join("profiles");
    let created_profile_data_dir = profile_data_root.join(&created.id);
    fs::create_dir_all(created_profile_data_dir.join("mods")).map_err(|error| {
        format!(
            "failed to create packaged profile lifecycle data directory {}: {error}",
            created_profile_data_dir.display()
        )
    })?;
    fs::write(
        created_profile_data_dir
            .join("mods")
            .join("profile-owned.jar"),
        b"profile-owned packaged smoke file",
    )
    .map_err(|error| error.to_string())?;

    let shared_cache_files = [
        Path::new(&directories.cache_dir)
            .join("versions")
            .join("1.21.8")
            .join("1.21.8.json"),
        Path::new(&directories.cache_dir)
            .join("libraries")
            .join("com")
            .join("theboys")
            .join("packaged-smoke")
            .join("1.0.0")
            .join("packaged-smoke-1.0.0.jar"),
        Path::new(&directories.cache_dir)
            .join("assets")
            .join("indexes")
            .join("packaged-smoke-assets.json"),
    ];
    for path in &shared_cache_files {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format!(
                    "failed to create packaged profile lifecycle shared cache parent {}: {error}",
                    parent.display()
                )
            })?;
        }
        fs::write(path, b"shared cache packaged smoke file").map_err(|error| {
            format!(
                "failed to write packaged profile lifecycle shared cache sentinel {}: {error}",
                path.display()
            )
        })?;
    }

    let updated = core_update_profile(UpdateProfileRequest {
        id: created.id.clone(),
        name: Some("Packaged Smoke Profile Updated".to_owned()),
        loader: None,
        game_version: None,
        memory_mb: Some(4096),
        jvm_args: Some(vec!["-Dtheboys.packagedSmoke=true".to_owned()]),
        resolution: None,
        clear_resolution: true,
        default_server: Some(ServerLaunchTarget {
            name: Some("Smoke Server".to_owned()),
            address: "play.theboys.example".to_owned(),
            port: Some(25565),
        }),
        clear_default_server: false,
        java_runtime_override_path: None,
        clear_java_runtime_override: true,
    })
    .map_err(|error| error.to_string())?;
    let duplicated = core_duplicate_profile(DuplicateProfileRequest {
        id: updated.id.clone(),
        name: Some("Packaged Smoke Profile Copy".to_owned()),
    })
    .map_err(|error| error.to_string())?;
    let duplicated_profile_data_dir = profile_data_root.join(&duplicated.id);
    let duplicated_profile_data_copied = duplicated_profile_data_dir
        .join("mods")
        .join("profile-owned.jar")
        .is_file();
    let deleted_duplicate = core_delete_profile(DeleteProfileRequest {
        id: duplicated.id.clone(),
    })
    .map_err(|error| error.to_string())?;
    let deleted_original = core_delete_profile(DeleteProfileRequest {
        id: updated.id.clone(),
    })
    .map_err(|error| error.to_string())?;
    let created_profile_data_removed = !created_profile_data_dir.exists();
    let duplicated_profile_data_removed = !duplicated_profile_data_dir.exists();
    let shared_cache_retained = shared_cache_files.iter().all(|path| path.is_file());
    if !duplicated_profile_data_copied
        || !created_profile_data_removed
        || !duplicated_profile_data_removed
        || !shared_cache_retained
    {
        return Err(format!(
            "packaged profile lifecycle delete cleanup mismatch: copied={}, original_removed={}, duplicate_removed={}, shared_cache_retained={}",
            duplicated_profile_data_copied,
            created_profile_data_removed,
            duplicated_profile_data_removed,
            shared_cache_retained
        ));
    }
    let remaining_profiles = core_load_profiles().map_err(|error| error.to_string())?;
    if remaining_profiles
        .iter()
        .any(|profile| profile.id == created.id || profile.id == duplicated.id)
    {
        return Err(
            "packaged profile lifecycle smoke left managed smoke profiles behind".to_owned(),
        );
    }

    let probe_path = Path::new(&directories.config_dir).join(PACKAGED_SMOKE_PROFILE_LIFECYCLE_FILE);
    let payload = serde_json::json!({
        "createdProfileId": created.id,
        "updatedProfileId": updated.id,
        "updatedName": updated.name,
        "updatedMemoryMb": updated.memory_mb,
        "updatedJvmArgs": updated.jvm_args,
        "updatedDefaultServer": updated.default_server,
        "duplicatedProfileId": duplicated.id,
        "duplicatedName": duplicated.name,
        "duplicatedProfileDataCopied": duplicated_profile_data_copied,
        "deletedDuplicateId": deleted_duplicate.id,
        "deletedOriginalId": deleted_original.id,
        "createdProfileDataRemoved": created_profile_data_removed,
        "duplicatedProfileDataRemoved": duplicated_profile_data_removed,
        "sharedCacheRetained": shared_cache_retained,
        "sharedCacheFiles": shared_cache_files
            .iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect::<Vec<_>>(),
        "remainingProfileIds": remaining_profiles
            .iter()
            .map(|profile| profile.id.clone())
            .collect::<Vec<_>>(),
    });
    fs::write(
        &probe_path,
        serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?,
    )
    .map_err(|error| {
        format!(
            "failed to write packaged profile lifecycle smoke probe {}: {error}",
            probe_path.display()
        )
    })
}

fn write_packaged_smoke_import_lifecycle_probe() -> Result<(), String> {
    if !packaged_smoke_import_lifecycle_enabled() {
        return Ok(());
    }

    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let source_root = Path::new(&directories.cache_dir).join("packaged-import-smoke-source");
    let minecraft_root = source_root.join(".minecraft");
    fs::create_dir_all(minecraft_root.join("saves").join("Smoke World"))
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(minecraft_root.join("mods")).map_err(|error| error.to_string())?;
    fs::write(
        minecraft_root.join("options.txt"),
        b"renderDistance:8\nsimulationDistance:8\n",
    )
    .map_err(|error| error.to_string())?;
    fs::write(
        minecraft_root
            .join("saves")
            .join("Smoke World")
            .join("level.dat"),
        b"packaged smoke world",
    )
    .map_err(|error| error.to_string())?;
    fs::write(minecraft_root.join("mods").join("smoke-mod.jar"), b"jar")
        .map_err(|error| error.to_string())?;

    let plan = core_plan_profile_import(ImportPlanRequest {
        name: "Packaged Smoke Import".to_owned(),
        source_path: source_root.to_string_lossy().replace('\\', "/"),
    })
    .map_err(|error| error.to_string())?;
    let existing_item_count = plan.items.iter().filter(|item| item.exists).count();
    let operation =
        core_execute_import_plan_and_persist_profile(&plan).map_err(|error| error.to_string())?;

    let destination_root = PathBuf::from(&plan.destination_path);
    let copied_options = destination_root.join("options.txt");
    let copied_world = destination_root
        .join("saves")
        .join("Smoke World")
        .join("level.dat");
    let copied_mod = destination_root.join("mods").join("smoke-mod.jar");
    for copied in [&copied_options, &copied_world, &copied_mod] {
        if !copied.is_file() {
            return Err(format!(
                "packaged import lifecycle smoke did not copy expected file {}",
                copied.display()
            ));
        }
    }

    let deleted_profile = core_delete_profile(DeleteProfileRequest {
        id: plan.profile_id.clone(),
    })
    .map_err(|error| error.to_string())?;
    if destination_root.exists() {
        return Err(format!(
            "packaged import lifecycle smoke left imported profile files behind at {}",
            destination_root.display()
        ));
    }
    let remaining_profiles = core_load_profiles().map_err(|error| error.to_string())?;
    if remaining_profiles
        .iter()
        .any(|profile| profile.id == plan.profile_id)
    {
        return Err("packaged import lifecycle smoke left imported profile behind".to_owned());
    }
    let _ = fs::remove_dir_all(&source_root);

    let probe_path = Path::new(&directories.config_dir).join(PACKAGED_SMOKE_IMPORT_LIFECYCLE_FILE);
    let payload = serde_json::json!({
        "profileId": plan.profile_id,
        "profileName": plan.profile_name,
        "sourcePath": plan.source_path,
        "destinationPath": plan.destination_path,
        "existingItemCount": existing_item_count,
        "copiedOptions": copied_options.to_string_lossy().replace('\\', "/"),
        "copiedWorld": copied_world.to_string_lossy().replace('\\', "/"),
        "copiedMod": copied_mod.to_string_lossy().replace('\\', "/"),
        "operation": operation.operation,
        "eventCount": operation.events.len(),
        "deletedProfileId": deleted_profile.id,
        "destinationRemoved": !destination_root.exists(),
        "remainingProfileIds": remaining_profiles
            .iter()
            .map(|profile| profile.id.clone())
            .collect::<Vec<_>>(),
    });
    fs::write(
        &probe_path,
        serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?,
    )
    .map_err(|error| {
        format!(
            "failed to write packaged import lifecycle smoke probe {}: {error}",
            probe_path.display()
        )
    })
}

async fn write_packaged_smoke_packwiz_install_probe(
    event_log: &LauncherEventLog,
) -> Result<(), String> {
    if !packaged_smoke_packwiz_install_enabled() {
        return Ok(());
    }

    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let profile_id = "packaged-smoke-packwiz";
    let _ = core_delete_profile(DeleteProfileRequest {
        id: profile_id.to_owned(),
    });

    let config_body = b"enabled=true\n".to_vec();
    let mod_body = b"packwiz mod jar".to_vec();
    let skipped_body = b"server only".to_vec();
    let config_hash = sha256_hex(&config_body);
    let mod_hash = sha256_hex(&mod_body);
    let skipped_hash = sha256_hex(&skipped_body);
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|error| format!("failed to bind packaged packwiz smoke server: {error}"))?;
    let address = listener
        .local_addr()
        .map_err(|error| format!("failed to resolve packaged packwiz smoke server: {error}"))?;
    let base_url = format!("http://{address}");
    let mod_metafile = format!(
        r#"name = "Smoke Mod"
filename = "smoke-mod.jar"
side = "both"

[download]
url = "{base_url}/mods/smoke-mod.jar"
hash-format = "sha256"
hash = "{mod_hash}"
"#
    );
    let server_only_metafile = format!(
        r#"name = "Server Only"
filename = "server-only.jar"
side = "server"

[download]
url = "{base_url}/mods/server-only.jar"
hash-format = "sha256"
hash = "{skipped_hash}"
"#
    );
    let mod_metafile_hash = sha256_hex(mod_metafile.as_bytes());
    let server_only_metafile_hash = sha256_hex(server_only_metafile.as_bytes());
    let index_body = format!(
        r#"hash-format = "sha256"

[[files]]
file = "config/packaged.toml"
hash = "{config_hash}"

[[files]]
file = "mods/smoke-mod.pw.toml"
hash = "{mod_metafile_hash}"
alias = "mods/smoke-mod.jar"
metafile = true

[[files]]
file = "mods/server-only.pw.toml"
hash = "{server_only_metafile_hash}"
alias = "mods/server-only.jar"
metafile = true
"#
    );
    let index_hash = sha256_hex(index_body.as_bytes());
    let pack_body = format!(
        r#"name = "Packaged Smoke Packwiz"
author = "TheBoysLauncher"
version = "9.8.7"
pack-format = "packwiz:1.1.0"

[index]
file = "index.toml"
hash-format = "sha256"
hash = "{index_hash}"

[versions]
minecraft = "1.21.8"
"#
    );
    let routes = vec![
        ("/pack.toml".to_owned(), pack_body.into_bytes()),
        ("/index.toml".to_owned(), index_body.into_bytes()),
        ("/config/packaged.toml".to_owned(), config_body),
        (
            "/mods/smoke-mod.pw.toml".to_owned(),
            mod_metafile.into_bytes(),
        ),
        (
            "/mods/server-only.pw.toml".to_owned(),
            server_only_metafile.into_bytes(),
        ),
        ("/mods/smoke-mod.jar".to_owned(), mod_body),
        ("/mods/server-only.jar".to_owned(), skipped_body),
    ];
    let request_log = Arc::new(Mutex::new(Vec::<String>::new()));
    let server_request_log = Arc::clone(&request_log);
    let server = tokio::spawn(async move {
        let mut accepted = 0usize;
        loop {
            let idle_timeout = if accepted == 0 {
                Duration::from_secs(5)
            } else {
                Duration::from_millis(500)
            };
            let accept = tokio::time::timeout(idle_timeout, listener.accept()).await;
            let (mut stream, _) = match accept {
                Ok(Ok(connection)) => connection,
                Ok(Err(error)) => {
                    return Err(format!("packwiz smoke server accept failed: {error}"));
                }
                Err(_) => break,
            };
            accepted += 1;
            let mut buffer = [0_u8; 2048];
            let read = stream
                .read(&mut buffer)
                .await
                .map_err(|error| format!("packwiz smoke server read failed: {error}"))?;
            let request = String::from_utf8_lossy(&buffer[..read]);
            let request_path = request
                .lines()
                .next()
                .and_then(|line| line.split_whitespace().nth(1))
                .unwrap_or("/")
                .split('?')
                .next()
                .unwrap_or("/")
                .to_owned();
            server_request_log
                .lock()
                .map_err(|error| format!("packwiz smoke request log lock failed: {error}"))?
                .push(request_path.clone());
            let (status, body) = routes
                .iter()
                .find(|(route, _)| route == &request_path)
                .map(|(_, body)| ("200 OK", body.clone()))
                .unwrap_or_else(|| ("404 Not Found", b"missing".to_vec()));
            let headers = format!(
                "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            stream
                .write_all(headers.as_bytes())
                .await
                .map_err(|error| format!("packwiz smoke server header write failed: {error}"))?;
            stream
                .write_all(&body)
                .await
                .map_err(|error| format!("packwiz smoke server body write failed: {error}"))?;
        }
        Ok::<(), String>(())
    });

    let catalog_entry = ModpackCatalogEntry {
        id: profile_id.to_owned(),
        display_name: Some("Packaged Smoke Packwiz".to_owned()),
        pack_url: format!("{base_url}/pack.toml"),
        instance_name: "Packaged Smoke Packwiz".to_owned(),
        description: Some("Packaged packwiz smoke fixture".to_owned()),
        author: Some("TheBoysLauncher".to_owned()),
        tags: Vec::new(),
        last_updated: None,
        category: None,
        min_ram: None,
        recommended_ram: Some(4096),
        default_server: None,
        changelog: None,
        default: false,
    };

    let result = (|| async {
        let profile = core_fetch_pack_install_profile_from_catalog_entry(&catalog_entry)
            .await
            .map_err(|error| error.to_string())?;
        if profile.id != profile_id {
            return Err(format!(
                "packaged packwiz smoke expected profile id {profile_id}, found {}",
                profile.id
            ));
        }
        if profile.name != "Packaged Smoke Packwiz"
            || profile.loader != shared::ModLoader::Vanilla
            || profile.game_version != "1.21.8"
            || profile.installed_pack_version.as_deref() != Some("9.8.7")
        {
            return Err(format!(
                "packaged packwiz smoke built unexpected profile metadata: {profile:?}"
            ));
        }
        let auxiliary_plan = core_fetch_install_auxiliary_download_plan_for_catalog_entry_profile(
            &catalog_entry,
            &profile,
            &directories,
        )
        .await
        .map_err(|error| error.to_string())?;
        if auxiliary_plan.items.len() != 5 {
            return Err(format!(
                "packaged packwiz smoke expected 5 auxiliary items, found {}",
                auxiliary_plan.items.len()
            ));
        }
        execute_direct_pack_files_from_auxiliary_plan(&auxiliary_plan, event_log).await?;
        core_persist_installed_pack_profile(profile.clone()).map_err(|error| error.to_string())?;
        event_log
            .record_event(completed_native_operation_event(
                LauncherOperation::InstallPack,
                profile.id.clone(),
                "Packaged Smoke Packwiz installed successfully.",
            ))
            .map_err(|error| error.to_string())?;

        let profile_root = Path::new(&directories.data_dir)
            .join("profiles")
            .join(&profile.id);
        let pack_toml_path = profile_root.join("pack.toml");
        let index_path = profile_root.join("index.toml");
        let config_path = profile_root.join("config").join("packaged.toml");
        let mod_path = profile_root.join("mods").join("smoke-mod.jar");
        let skipped_server_path = profile_root.join("mods").join("server-only.jar");
        let persisted_profile = core_load_profiles()
            .map_err(|error| error.to_string())?
            .into_iter()
            .find(|candidate| candidate.id == profile.id)
            .ok_or_else(|| "packaged packwiz smoke did not persist profile".to_owned())?;
        for required in [&pack_toml_path, &index_path, &config_path, &mod_path] {
            if !required.is_file() {
                return Err(format!(
                    "packaged packwiz smoke did not write {}",
                    required.display()
                ));
            }
        }
        if fs::read_to_string(&config_path).map_err(|error| error.to_string())? != "enabled=true\n"
        {
            return Err("packaged packwiz smoke wrote unexpected config body".to_owned());
        }
        if fs::read(&mod_path).map_err(|error| error.to_string())? != b"packwiz mod jar".as_slice()
        {
            return Err("packaged packwiz smoke wrote unexpected mod body".to_owned());
        }
        if skipped_server_path.exists() {
            return Err(
                "packaged packwiz smoke downloaded server-only metafile content".to_owned(),
            );
        }
        let requests = request_log
            .lock()
            .map_err(|error| format!("packwiz smoke request log lock failed: {error}"))?
            .clone();
        for required_request in [
            "/pack.toml",
            "/index.toml",
            "/config/packaged.toml",
            "/mods/smoke-mod.pw.toml",
            "/mods/server-only.pw.toml",
            "/mods/smoke-mod.jar",
        ] {
            if !requests.iter().any(|request| request == required_request) {
                return Err(format!(
                    "packaged packwiz smoke did not request {required_request}; saw {requests:?}"
                ));
            }
        }
        if requests
            .iter()
            .any(|request| request == "/mods/server-only.jar")
        {
            return Err("packaged packwiz smoke requested server-only jar".to_owned());
        }
        let download_event_count = event_log
            .list(Some(200))
            .map_err(|error| error.to_string())?
            .into_iter()
            .filter(|event| {
                event.operation == Some(LauncherOperation::DownloadArtifacts)
                    && event
                        .subject_id
                        .as_deref()
                        .map(|subject| {
                            subject == profile_id || subject.ends_with("-metafile-downloads")
                        })
                        .unwrap_or(false)
            })
            .count();
        let install_event_count = event_log
            .list(None)
            .map_err(|error| error.to_string())?
            .into_iter()
            .filter(|event| event.subject_id.as_deref() == Some(profile_id))
            .count();

        let profile_data_path = profile_root.clone();
        let deleted = core_delete_profile(DeleteProfileRequest {
            id: profile.id.clone(),
        })
        .map_err(|error| error.to_string())?;
        let profile_data_removed = !profile_data_path.exists();
        if !profile_data_removed {
            return Err("packaged packwiz smoke left profile files behind".to_owned());
        }
        if core_load_profiles()
            .map_err(|error| error.to_string())?
            .iter()
            .any(|candidate| candidate.id == profile.id)
        {
            return Err("packaged packwiz smoke left profile metadata behind".to_owned());
        }

        Ok::<serde_json::Value, String>(serde_json::json!({
            "profileId": profile.id,
            "profileName": persisted_profile.name,
            "loader": format!("{:?}", persisted_profile.loader),
            "gameVersion": persisted_profile.game_version,
            "installedPackVersion": persisted_profile.installed_pack_version,
            "auxiliaryItemCount": auxiliary_plan.items.len(),
            "packTomlDownloaded": true,
            "indexDownloaded": true,
            "configDownloaded": true,
            "metafileResolved": true,
            "serverOnlySkipped": true,
            "persistedProfileFound": true,
            "downloadEventCount": download_event_count,
            "installEventCount": install_event_count,
            "requestCount": requests.len(),
            "requests": requests,
            "deletedProfileId": deleted.id,
            "profileDataRemoved": profile_data_removed,
        }))
    })()
    .await;

    server
        .await
        .map_err(|error| format!("packwiz smoke server task failed: {error}"))??;

    if result.is_err() {
        let _ = core_delete_profile(DeleteProfileRequest {
            id: profile_id.to_owned(),
        });
    }

    let payload = result?;
    let probe_path = Path::new(&directories.config_dir).join(PACKAGED_SMOKE_PACKWIZ_INSTALL_FILE);
    fs::write(
        &probe_path,
        serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?,
    )
    .map_err(|error| {
        format!(
            "failed to write packaged packwiz install smoke probe {}: {error}",
            probe_path.display()
        )
    })
}

fn write_packaged_smoke_update_handoff_probe() -> Result<(), String> {
    if !packaged_smoke_update_handoff_enabled() {
        return Ok(());
    }

    let accepted_urls = [
        "https://github.com/dilllxd/theboyslauncher/releases/download/v4.0.2/TheBoysLauncher_4.0.2_x64-setup.exe",
        "https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/TheBoysLauncher%20Dev_4.0.2-1_x64-setup.exe",
    ];
    let rejected_urls = [
        (
            "manifest_asset",
            "https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/latest-dev.json",
        ),
        (
            "msi_asset",
            "https://github.com/dilllxd/theboyslauncher/releases/download/v4.0.2/TheBoysLauncher_4.0.2_x64_en-US.msi",
        ),
        (
            "lookalike_owner",
            "https://github.com/dilllxd-example/theboyslauncher/releases/download/v4.0.2/TheBoysLauncher_4.0.2_x64-setup.exe",
        ),
        (
            "decorated_query",
            "https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/TheBoysLauncher%20Dev_4.0.2-1_x64-setup.exe?download=1",
        ),
        (
            "mismatched_stable_version",
            "https://github.com/dilllxd/theboyslauncher/releases/download/v4.0.2/TheBoysLauncher_4.0.3_x64-setup.exe",
        ),
    ];

    for url in accepted_urls {
        validate_external_download_url(url).map_err(|error| {
            format!("packaged update handoff rejected trusted URL {url}: {error}")
        })?;
    }

    let rejected_results = rejected_urls
        .iter()
        .map(|(label, url)| {
            let rejected = validate_external_download_url(url).is_err();
            if !rejected {
                return Err(format!(
                    "packaged update handoff accepted unsafe {label} URL {url}"
                ));
            }
            Ok(serde_json::json!({
                "label": label,
                "url": url,
                "rejected": rejected,
            }))
        })
        .collect::<Result<Vec<_>, String>>()?;

    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let probe_path = Path::new(&directories.config_dir).join(PACKAGED_SMOKE_UPDATE_HANDOFF_FILE);
    let payload = serde_json::json!({
        "acceptedUrls": accepted_urls,
        "acceptedCount": accepted_urls.len(),
        "rejectedUrls": rejected_results,
        "rejectedCount": rejected_results.len(),
    });
    fs::write(
        &probe_path,
        serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?,
    )
    .map_err(|error| {
        format!(
            "failed to write packaged update handoff smoke probe {}: {error}",
            probe_path.display()
        )
    })
}

fn write_packaged_smoke_launch_preflight_probe() -> Result<(), String> {
    if !packaged_smoke_launch_preflight_enabled() {
        return Ok(());
    }

    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let created = core_create_profile(CreateProfileRequest {
        name: "Packaged Smoke Launch".to_owned(),
        loader: shared::ModLoader::Vanilla,
        game_version: "1.21.8".to_owned(),
        memory_mb: 3072,
    })
    .map_err(|error| error.to_string())?;
    let probe_result = build_packaged_smoke_launch_preflight_payload(&directories, &created.id);
    let deleted_profile = core_delete_profile(DeleteProfileRequest {
        id: created.id.clone(),
    })
    .map_err(|error| error.to_string());
    let remaining_profiles = core_load_profiles().map_err(|error| error.to_string());
    let profile_data_path = Path::new(&directories.data_dir)
        .join("profiles")
        .join(&created.id);

    let mut payload = probe_result?;
    let deleted_profile = deleted_profile?;
    let remaining_profiles = remaining_profiles?;
    if profile_data_path.exists() {
        return Err(format!(
            "packaged launch preflight smoke left profile files behind at {}",
            profile_data_path.display()
        ));
    }
    if remaining_profiles
        .iter()
        .any(|profile| profile.id == created.id)
    {
        return Err("packaged launch preflight smoke left launch profile behind".to_owned());
    }
    if let Some(object) = payload.as_object_mut() {
        object.insert(
            "deletedProfileId".to_owned(),
            serde_json::json!(deleted_profile.id),
        );
        object.insert("profileDataRemoved".to_owned(), serde_json::json!(true));
        object.insert(
            "remainingProfileIds".to_owned(),
            serde_json::json!(remaining_profiles
                .iter()
                .map(|profile| profile.id.clone())
                .collect::<Vec<_>>()),
        );
    }

    let probe_path = Path::new(&directories.config_dir).join(PACKAGED_SMOKE_LAUNCH_PREFLIGHT_FILE);
    fs::write(
        &probe_path,
        serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?,
    )
    .map_err(|error| {
        format!(
            "failed to write packaged launch preflight smoke probe {}: {error}",
            probe_path.display()
        )
    })
}

fn build_packaged_smoke_launch_preflight_payload(
    directories: &LauncherDirectories,
    profile_id: &str,
) -> Result<serde_json::Value, String> {
    let cache_dir = Path::new(&directories.cache_dir);
    let data_dir = Path::new(&directories.data_dir);
    let version_dir = cache_dir.join("versions").join("1.21.8");
    let libraries_dir = cache_dir.join("libraries");
    let assets_index_dir = cache_dir.join("assets").join("indexes");
    let natives_dir = cache_dir.join("natives").join("1.21.8");
    let fake_java = packaged_smoke_fake_java_path(directories);
    fs::create_dir_all(&version_dir).map_err(|error| error.to_string())?;
    fs::create_dir_all(libraries_dir.join("com/example/core/1.0.0"))
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(libraries_dir.join("com/example/windows-only/1.0.0"))
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&assets_index_dir).map_err(|error| error.to_string())?;
    fs::create_dir_all(&natives_dir).map_err(|error| error.to_string())?;
    fs::create_dir_all(data_dir.join("profiles").join(profile_id))
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(
        fake_java
            .parent()
            .ok_or_else(|| "packaged launch preflight Java path had no parent".to_owned())?,
    )
    .map_err(|error| error.to_string())?;
    fs::write(version_dir.join("client.jar"), b"client jar").map_err(|error| error.to_string())?;
    fs::write(
        libraries_dir.join("com/example/core/1.0.0/core-1.0.0.jar"),
        b"core jar",
    )
    .map_err(|error| error.to_string())?;
    fs::write(
        libraries_dir.join("com/example/windows-only/1.0.0/windows-only-1.0.0.jar"),
        b"windows jar",
    )
    .map_err(|error| error.to_string())?;
    fs::write(assets_index_dir.join("17.json"), b"{\"objects\":{}}")
        .map_err(|error| error.to_string())?;
    if cfg!(target_os = "windows") {
        fs::write(
            &fake_java,
            b"@echo off\r\necho openjdk version \"21.0.2\" 2024-01-16 1>&2\r\n",
        )
        .map_err(|error| error.to_string())?;
    } else {
        fs::write(
            &fake_java,
            b"#!/usr/bin/env sh\necho 'openjdk version \"21.0.2\" 2024-01-16' >&2\n",
        )
        .map_err(|error| error.to_string())?;
    }
    fs::write(version_dir.join("1.21.8.json"), PACKAGED_SMOKE_VERSION_JSON)
        .map_err(|error| error.to_string())?;

    let updated = core_update_profile(UpdateProfileRequest {
        id: profile_id.to_owned(),
        name: None,
        loader: None,
        game_version: None,
        memory_mb: Some(3584),
        jvm_args: Some(vec!["-Dtheboys.launchPreflight=true".to_owned()]),
        resolution: Some(shared::ProfileResolution {
            width: 1280,
            height: 720,
        }),
        clear_resolution: false,
        default_server: Some(ServerLaunchTarget {
            name: Some("Smoke Server".to_owned()),
            address: "play.theboys.example".to_owned(),
            port: Some(25565),
        }),
        clear_default_server: false,
        java_runtime_override_path: Some(fake_java.to_string_lossy().replace('\\', "/")),
        clear_java_runtime_override: false,
    })
    .map_err(|error| error.to_string())?;
    let settings = core_load_settings().map_err(|error| error.to_string())?;
    let launch_plan = core_build_offline_launch_plan(&updated.id, &settings, directories)
        .map_err(|error| error.to_string())?;
    let command = core_build_process_command_spec(&launch_plan)
        .map(renderer_safe_process_command_spec)
        .map_err(|error| error.to_string())?;
    let classpath = command_arg_value(&command.args, "-cp").ok_or_else(|| {
        "packaged launch preflight command did not include a classpath".to_owned()
    })?;
    let normalized_classpath = classpath.replace('\\', "/");
    let access_token_redacted = command
        .args
        .windows(2)
        .any(|pair| pair[0] == "--accessToken" && pair[1] == REDACTED_RENDERER_TOKEN);
    if !access_token_redacted {
        return Err("packaged launch preflight command did not redact access token".to_owned());
    }
    if !command
        .args
        .iter()
        .any(|arg| arg == "com.example.minecraft.Main")
    {
        return Err(
            "packaged launch preflight command did not use cached version metadata".to_owned(),
        );
    }
    if !command
        .args
        .windows(2)
        .any(|pair| pair[0] == "--server" && pair[1] == "play.theboys.example")
    {
        return Err("packaged launch preflight command did not include default server".to_owned());
    }
    let authenticated_session_uuid = Uuid::parse_str("11111111-2222-3333-4444-555555555555")
        .map_err(|error| error.to_string())?;
    let authenticated_session = MinecraftSession {
        username: "SmokePlayer".to_owned(),
        uuid: authenticated_session_uuid,
        access_token: "smoke-access-token-do-not-write".to_owned(),
    };
    let authenticated_server = ServerLaunchTarget {
        name: Some("Authenticated Smoke Server".to_owned()),
        address: "auth.theboys.example".to_owned(),
        port: Some(25566),
    };
    let authenticated_launch_plan = core_build_authenticated_launch_plan(
        &updated.id,
        &settings,
        directories,
        &authenticated_session,
        Some(&authenticated_server),
    )
    .map_err(|error| error.to_string())?;
    let authenticated_command = core_build_process_command_spec(&authenticated_launch_plan)
        .map(renderer_safe_process_command_spec)
        .map_err(|error| error.to_string())?;
    let authenticated_access_token_redacted = authenticated_command
        .args
        .windows(2)
        .any(|pair| pair[0] == "--accessToken" && pair[1] == REDACTED_RENDERER_TOKEN);
    if !authenticated_access_token_redacted {
        return Err(
            "packaged authenticated launch preflight command did not redact access token"
                .to_owned(),
        );
    }
    if !authenticated_command
        .args
        .windows(2)
        .any(|pair| pair[0] == "--username" && pair[1] == authenticated_session.username)
    {
        return Err(
            "packaged authenticated launch preflight command did not use session username"
                .to_owned(),
        );
    }
    if !authenticated_command
        .args
        .windows(2)
        .any(|pair| pair[0] == "--server" && pair[1] == authenticated_server.address)
    {
        return Err(
            "packaged authenticated launch preflight command did not include explicit server"
                .to_owned(),
        );
    }

    Ok(serde_json::json!({
        "profileId": updated.id,
        "profileName": updated.name,
        "memoryMb": launch_plan.memory_mb,
        "executable": command.executable,
        "workingDir": command.working_dir,
        "argCount": command.args.len(),
        "mainClass": "com.example.minecraft.Main",
        "classpathHasClientJar": normalized_classpath.contains("versions/1.21.8/client.jar"),
        "classpathHasLibraryJar": normalized_classpath.contains("libraries/com/example/core/1.0.0/core-1.0.0.jar"),
        "assetIndex": command_arg_value(&command.args, "--assetIndex"),
        "assetsDir": command_arg_value(&command.args, "--assetsDir"),
        "nativesConfigured": command.args.iter().any(|arg| arg.contains("natives/1.21.8")),
        "serverAddress": command_arg_value(&command.args, "--server"),
        "accessTokenRedacted": access_token_redacted,
        "envProfileId": command.env.iter()
            .find(|env_var| env_var.key == "THEBOYSLAUNCHER_PROFILE_ID")
            .map(|env_var| env_var.value.clone()),
        "authenticatedArgCount": authenticated_command.args.len(),
        "authenticatedUsername": command_arg_value(&authenticated_command.args, "--username"),
        "authenticatedUuid": command_arg_value(&authenticated_command.args, "--uuid"),
        "authenticatedServerAddress": command_arg_value(&authenticated_command.args, "--server"),
        "authenticatedServerPort": command_arg_value(&authenticated_command.args, "--port"),
        "authenticatedAccessTokenRedacted": authenticated_access_token_redacted,
        "authStateFilesPresent": Path::new(&directories.config_dir)
            .join("minecraft-session.json")
            .exists()
            || Path::new(&directories.config_dir)
                .join("minecraft-accounts.json")
                .exists(),
    }))
}

fn write_packaged_smoke_process_lifecycle_probe(
    registry: &ProcessRegistry,
    event_log: &LauncherEventLog,
) -> Result<(), String> {
    if !packaged_smoke_process_lifecycle_enabled() {
        return Ok(());
    }

    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let created = core_create_profile(CreateProfileRequest {
        name: "Packaged Smoke Process".to_owned(),
        loader: shared::ModLoader::Vanilla,
        game_version: "1.21.8".to_owned(),
        memory_mb: 3072,
    })
    .map_err(|error| error.to_string())?;
    let result = write_packaged_smoke_process_lifecycle_probe_inner(
        registry,
        event_log,
        &directories,
        &created.id,
    );
    let _ = core_delete_profile(DeleteProfileRequest {
        id: created.id.clone(),
    });
    if result.is_err() {
        for process in registry.list().unwrap_or_default() {
            if managed_process_profile_id(&process).as_deref() == Some(&created.id) {
                let _ = registry.stop(process.id);
            }
        }
        let _ = registry.clear_exited();
    }
    result
}

fn write_packaged_smoke_process_lifecycle_probe_inner(
    registry: &ProcessRegistry,
    event_log: &LauncherEventLog,
    directories: &LauncherDirectories,
    profile_id: &str,
) -> Result<(), String> {
    let _ = build_packaged_smoke_launch_preflight_payload(directories, profile_id)?;
    let fake_java = packaged_smoke_process_lifecycle_java_path(directories);
    write_packaged_smoke_long_running_java(&fake_java)?;
    core_update_profile(UpdateProfileRequest {
        id: profile_id.to_owned(),
        name: None,
        loader: None,
        game_version: None,
        memory_mb: None,
        jvm_args: None,
        resolution: None,
        clear_resolution: false,
        default_server: None,
        clear_default_server: false,
        java_runtime_override_path: Some(fake_java.to_string_lossy().replace('\\', "/")),
        clear_java_runtime_override: false,
    })
    .map_err(|error| error.to_string())?;

    let settings = core_load_settings().map_err(|error| error.to_string())?;
    let launch_plan = core_build_offline_launch_plan(profile_id, &settings, directories)
        .map_err(|error| error.to_string())?;
    let first = start_managed_launch_plan(launch_plan, registry, event_log)?;
    if first.state != shared::ManagedProcessState::Running {
        return Err(format!(
            "packaged process lifecycle smoke expected first launch to be running, found {:?}",
            first.state
        ));
    }

    let reused = active_managed_process_summary(registry, profile_id)?
        .ok_or_else(|| "packaged process lifecycle smoke did not find active launch".to_owned())?;
    if reused.id != first.id || reused.process_id != first.process_id {
        return Err("packaged process lifecycle smoke did not reuse the active process".to_owned());
    }

    let stopped_first = registry.stop(first.id).map_err(|error| error.to_string())?;
    if stopped_first.state != shared::ManagedProcessState::Exited {
        return Err(format!(
            "packaged process lifecycle smoke expected first stop to exit, found {:?}",
            stopped_first.state
        ));
    }
    std::thread::sleep(Duration::from_secs(4));
    let after_first_clear = registry.clear_exited().map_err(|error| error.to_string())?;
    if after_first_clear
        .iter()
        .any(|process| process.id == stopped_first.id)
    {
        return Err(
            "packaged process lifecycle smoke did not clear the first exited process".to_owned(),
        );
    }

    let relaunch_plan = core_build_offline_launch_plan(profile_id, &settings, directories)
        .map_err(|error| error.to_string())?;
    let second = start_managed_launch_plan(relaunch_plan, registry, event_log)?;
    if second.state != shared::ManagedProcessState::Running || second.id == first.id {
        return Err(format!(
            "packaged process lifecycle smoke relaunch did not create a new running process: {:?}",
            second
        ));
    }
    let stopped_second = registry
        .stop(second.id)
        .map_err(|error| error.to_string())?;
    if stopped_second.state != shared::ManagedProcessState::Exited {
        return Err(format!(
            "packaged process lifecycle smoke expected relaunch stop to exit, found {:?}",
            stopped_second.state
        ));
    }
    std::thread::sleep(Duration::from_secs(4));
    let remaining_processes = registry.clear_exited().map_err(|error| error.to_string())?;
    if remaining_processes
        .iter()
        .any(|process| managed_process_profile_id(process).as_deref() == Some(profile_id))
    {
        return Err("packaged process lifecycle smoke left profile processes behind".to_owned());
    }
    let profiles = core_load_profiles().map_err(|error| error.to_string())?;
    let last_played_marked = profiles
        .iter()
        .find(|profile| profile.id == profile_id)
        .and_then(|profile| profile.last_played.as_deref())
        .is_some_and(|last_played| last_played.starts_with("unix:"));
    if !last_played_marked {
        return Err(
            "packaged process lifecycle smoke did not mark the profile launched".to_owned(),
        );
    }
    let profile_data_path = Path::new(&directories.data_dir)
        .join("profiles")
        .join(profile_id);
    let deleted_profile = core_delete_profile(DeleteProfileRequest {
        id: profile_id.to_owned(),
    })
    .map_err(|error| error.to_string())?;
    if profile_data_path.exists() {
        return Err(format!(
            "packaged process lifecycle smoke left profile files behind at {}",
            profile_data_path.display()
        ));
    }

    let launch_events = event_log
        .list(None)
        .map_err(|error| error.to_string())?
        .into_iter()
        .filter(|event| {
            event.operation == Some(LauncherOperation::LaunchProfile)
                && event.subject_id.as_deref() == Some(profile_id)
        })
        .count();
    let probe_path = Path::new(&directories.config_dir).join(PACKAGED_SMOKE_PROCESS_LIFECYCLE_FILE);
    let payload = serde_json::json!({
        "profileId": profile_id,
        "startedState": first.state,
        "reusedExistingProcess": reused.id == first.id,
        "stoppedState": stopped_first.state,
        "relaunchState": second.state,
        "relaunchCreatedNewProcess": second.id != first.id,
        "secondStoppedState": stopped_second.state,
        "lastPlayedMarked": last_played_marked,
        "deletedProfileId": deleted_profile.id,
        "profileDataRemoved": !profile_data_path.exists(),
        "remainingProfileProcesses": remaining_processes
            .iter()
            .filter(|process| managed_process_profile_id(process).as_deref() == Some(profile_id))
            .count(),
        "launchEventCount": launch_events,
        "fakeJava": fake_java.to_string_lossy().replace('\\', "/"),
    });
    fs::write(
        &probe_path,
        serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?,
    )
    .map_err(|error| {
        format!(
            "failed to write packaged process lifecycle smoke probe {}: {error}",
            probe_path.display()
        )
    })
}

fn write_packaged_smoke_long_running_java(fake_java: &Path) -> Result<(), String> {
    fs::create_dir_all(
        fake_java
            .parent()
            .ok_or_else(|| "packaged process lifecycle Java path had no parent".to_owned())?,
    )
    .map_err(|error| error.to_string())?;
    if cfg!(target_os = "windows") {
        fs::write(
            fake_java,
            b"@echo off\r\nif \"%~1\"==\"-version\" (\r\n  echo openjdk version \"21.0.2\" 2024-01-16 1>&2\r\n  exit /B 0\r\n)\r\necho packaged smoke process started\r\nping -n 5 127.0.0.1 >NUL\r\n",
        )
        .map_err(|error| error.to_string())?;
    } else {
        fs::write(
            fake_java,
            b"#!/usr/bin/env sh\nif [ \"$1\" = \"-version\" ]; then\n  echo 'openjdk version \"21.0.2\" 2024-01-16' >&2\n  exit 0\nfi\necho packaged smoke process started\nsleep 10\n",
        )
        .map_err(|error| error.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut permissions = fs::metadata(fake_java)
                .map_err(|error| error.to_string())?
                .permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(fake_java, permissions).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn packaged_smoke_fake_java_path(directories: &LauncherDirectories) -> PathBuf {
    Path::new(&directories.cache_dir)
        .join("packaged-launch-preflight-java")
        .join("bin")
        .join(if cfg!(target_os = "windows") {
            "java.cmd"
        } else {
            "java"
        })
}

fn packaged_smoke_process_lifecycle_java_path(directories: &LauncherDirectories) -> PathBuf {
    Path::new(&directories.cache_dir)
        .join("packaged-process-lifecycle-java")
        .join("bin")
        .join(if cfg!(target_os = "windows") {
            "java.cmd"
        } else {
            "java"
        })
}

fn command_arg_value(args: &[String], name: &str) -> Option<String> {
    args.windows(2)
        .find_map(|pair| (pair[0] == name).then(|| pair[1].clone()))
}

const PACKAGED_SMOKE_VERSION_JSON: &str = r#"{
  "id": "1.21.8",
  "arguments": {
    "game": [
      "--username",
      "${auth_player_name}",
      "--version",
      "${version_name}",
      "--gameDir",
      "${game_directory}",
      "--assetsDir",
      "${assets_root}",
      "--assetIndex",
      "${assets_index_name}",
      "--uuid",
      "${auth_uuid}",
      "--accessToken",
      "${auth_access_token}",
      {
        "rules": [
          {
            "action": "allow",
            "features": {
              "has_custom_resolution": true
            }
          }
        ],
        "value": [
          "--width",
          "${resolution_width}",
          "--height",
          "${resolution_height}"
        ]
      }
    ],
    "jvm": [
      {
        "rules": [
          {
            "action": "allow",
            "os": { "name": "windows" }
          }
        ],
        "value": "-Djava.library.path=${natives_directory}"
      },
      "-cp",
      "${classpath}"
    ]
  },
  "assetIndex": {
    "id": "17",
    "sha1": "asset-sha",
    "size": 123,
    "url": "https://example.invalid/assets.json"
  },
  "downloads": {
    "client": {
      "sha1": "client-sha",
      "size": 456,
      "url": "https://example.invalid/client.jar"
    }
  },
  "libraries": [
    {
      "name": "com.example:core:1.0.0",
      "downloads": {
        "artifact": {
          "path": "com/example/core/1.0.0/core-1.0.0.jar",
          "sha1": "core-sha",
          "size": 789,
          "url": "https://example.invalid/core.jar"
        }
      }
    },
    {
      "name": "com.example:windows-only:1.0.0",
      "rules": [
        {
          "action": "allow",
          "os": { "name": "windows" }
        }
      ],
      "downloads": {
        "artifact": {
          "path": "com/example/windows-only/1.0.0/windows-only-1.0.0.jar",
          "sha1": "windows-sha",
          "size": 111,
          "url": "https://example.invalid/windows.jar"
        }
      }
    }
  ],
  "mainClass": "com.example.minecraft.Main"
}"#;

#[tauri::command]
async fn open_microsoft_auth_url(auth_url: String) -> Result<(), String> {
    validate_microsoft_auth_url(&auth_url)?;
    open_url_in_system_browser(&auth_url)
}

#[tauri::command]
async fn plan_microsoft_token_exchange(
    callback: MicrosoftAuthCallback,
) -> Result<MicrosoftTokenExchangePlan, String> {
    core_plan_microsoft_token_exchange(callback).map_err(|error| error.to_string())
}

#[tauri::command]
async fn exchange_microsoft_authorization_code(
    plan: MicrosoftTokenExchangePlan,
) -> Result<MicrosoftOAuthTokens, String> {
    core_exchange_microsoft_authorization_code(plan)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn complete_microsoft_login_with_local_callback(
    flow: MicrosoftAuthStart,
) -> Result<StoredMinecraftSession, String> {
    let listeners = bind_microsoft_callback_listeners().await?;
    let (callback_url, mut stream) = receive_microsoft_callback_request(
        listeners,
        MICROSOFT_CALLBACK_ORIGIN,
        MICROSOFT_CALLBACK_TIMEOUT,
    )
    .await
    .map_err(|error| error.to_string())?;

    let result = async {
        let plan = core_plan_microsoft_token_exchange(MicrosoftAuthCallback {
            callback_url,
            expected_state: flow.state,
            code_verifier: flow.code_verifier,
            client_id: flow.client_id,
        })?;
        let tokens = core_exchange_microsoft_authorization_code(plan).await?;
        core_authenticate_and_save_minecraft_session(&tokens).await
    }
    .await;

    let response = match &result {
        Ok(session) => microsoft_callback_http_response(
            200,
            "TheBoysLauncher sign-in complete",
            format!(
                "Signed in as {}. You can close this tab and return to TheBoysLauncher.",
                session.session.username
            )
            .as_str(),
        ),
        Err(error) => microsoft_callback_http_response(
            400,
            "TheBoysLauncher sign-in failed",
            microsoft_callback_user_error_message(&error.to_string()).as_str(),
        ),
    };
    let _ = stream.write_all(response.as_bytes()).await;
    result
        .map(renderer_safe_minecraft_session)
        .map_err(|error| error.to_string())
}

async fn bind_microsoft_callback_listeners() -> Result<Vec<TcpListener>, String> {
    let mut listeners = Vec::new();
    let mut failures = Vec::new();
    for address in [
        MICROSOFT_CALLBACK_IPV4_BIND_ADDR,
        MICROSOFT_CALLBACK_IPV6_BIND_ADDR,
    ] {
        match TcpListener::bind(address).await {
            Ok(listener) => listeners.push(listener),
            Err(error) => failures.push(format!("{address}: {error}")),
        }
    }
    if listeners.is_empty() {
        return Err(format!(
            "could not listen for Microsoft sign-in callback on {MICROSOFT_CALLBACK_BIND_ADDR}: {}",
            failures.join("; ")
        ));
    }
    Ok(listeners)
}

async fn receive_microsoft_callback_request(
    listeners: Vec<TcpListener>,
    origin: &str,
    wait_for: Duration,
) -> anyhow::Result<(String, TcpStream)> {
    anyhow::ensure!(
        !listeners.is_empty(),
        "Microsoft sign-in callback listener is not available"
    );
    let (sender, mut receiver) = tokio::sync::mpsc::channel(listeners.len());
    let mut handles = Vec::with_capacity(listeners.len());
    for listener in listeners {
        let sender = sender.clone();
        let origin = origin.to_owned();
        handles.push(tokio::spawn(async move {
            let result = receive_microsoft_callback_request_from_listener(listener, &origin).await;
            let _ = sender.send(result).await;
        }));
    }
    drop(sender);

    let received = timeout(wait_for, receiver.recv())
        .await
        .map_err(|_| anyhow::anyhow!("timed out waiting for Microsoft sign-in callback"))?
        .ok_or_else(|| anyhow::anyhow!("Microsoft sign-in callback listener stopped"))?;
    for handle in handles {
        handle.abort();
    }
    received
}

async fn receive_microsoft_callback_request_from_listener(
    listener: TcpListener,
    origin: &str,
) -> anyhow::Result<(String, TcpStream)> {
    loop {
        let (mut stream, _) = listener.accept().await?;
        let request = read_http_request_head(&mut stream).await?;
        let request_line = request
            .lines()
            .next()
            .ok_or_else(|| anyhow::anyhow!("Microsoft OAuth callback request was empty"))?;
        match microsoft_callback_url_from_request_line(request_line, origin) {
            Ok(callback_url) => return Ok((callback_url, stream)),
            Err(error) if microsoft_callback_request_can_be_ignored(&error) => {
                let response = microsoft_callback_http_response(
                    404,
                    "TheBoysLauncher sign-in callback not found",
                    "This local sign-in listener is waiting for the Microsoft OAuth callback.",
                );
                let _ = stream.write_all(response.as_bytes()).await;
            }
            Err(error) => return Err(error),
        }
    }
}

async fn read_http_request_head(stream: &mut TcpStream) -> anyhow::Result<String> {
    let mut bytes = Vec::new();
    let mut chunk = [0_u8; 1024];
    loop {
        let read = stream.read(&mut chunk).await?;
        anyhow::ensure!(read != 0, "Microsoft OAuth callback request ended early");
        bytes.extend_from_slice(&chunk[..read]);
        anyhow::ensure!(
            bytes.len() <= MICROSOFT_CALLBACK_MAX_REQUEST_BYTES,
            "Microsoft OAuth callback request was too large"
        );
        if bytes.windows(4).any(|window| window == b"\r\n\r\n") {
            break;
        }
    }
    String::from_utf8(bytes)
        .map_err(|_| anyhow::anyhow!("Microsoft OAuth callback request was not valid UTF-8"))
}

fn microsoft_callback_url_from_request_line(
    request_line: &str,
    origin: &str,
) -> anyhow::Result<String> {
    let mut parts = request_line.split_whitespace();
    let method = parts
        .next()
        .ok_or_else(|| anyhow::anyhow!("Microsoft OAuth callback request is missing a method"))?;
    let target = parts
        .next()
        .ok_or_else(|| anyhow::anyhow!("Microsoft OAuth callback request is missing a target"))?;
    let version = parts
        .next()
        .ok_or_else(|| anyhow::anyhow!("Microsoft OAuth callback request is missing a version"))?;
    anyhow::ensure!(
        method == "GET",
        "Microsoft OAuth callback request must use GET"
    );
    anyhow::ensure!(
        version.starts_with("HTTP/"),
        "Microsoft OAuth callback request is not HTTP"
    );
    anyhow::ensure!(
        target.starts_with('/'),
        "Microsoft OAuth callback request target must be an absolute path"
    );
    anyhow::ensure!(
        !target.starts_with("//"),
        "Microsoft OAuth callback request target is not supported"
    );
    let path = target.split('?').next().unwrap_or(target);
    anyhow::ensure!(
        path == MICROSOFT_CALLBACK_PATH,
        "Microsoft OAuth callback request target path is not supported"
    );
    Ok(format!("{}{}", origin.trim_end_matches('/'), target))
}

fn microsoft_callback_request_can_be_ignored(error: &anyhow::Error) -> bool {
    error.to_string().contains("target path is not supported")
}

fn microsoft_callback_user_error_message(error: &str) -> String {
    let lower = error.to_ascii_lowercase();
    let guidance = if lower.contains("microsoft token exchange failed")
        || lower.contains("invalid_grant")
        || lower.contains("access_denied")
        || lower.contains("authorization code")
        || lower.contains("oauth callback")
    {
        "Microsoft sign-in could not be completed. Close this tab and sign in again from TheBoysLauncher."
    } else if lower.contains("theboys_microsoft_client_id") || lower.contains("client id") {
        "Microsoft sign-in is not configured for this launcher build. Close this tab and check the launcher setup."
    } else {
        "Microsoft sign-in failed. Close this tab and try again from TheBoysLauncher."
    };
    guidance.to_owned()
}

fn microsoft_callback_http_response(status: u16, title: &str, message: &str) -> String {
    let reason = match status {
        200 => "OK",
        404 => "Not Found",
        _ => "Bad Request",
    };
    let body = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>{}</title></head><body><h1>{}</h1><p>{}</p></body></html>",
        html_escape(title),
        html_escape(title),
        html_escape(message)
    );
    format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Security-Policy: default-src 'none'; style-src 'unsafe-inline'\r\nReferrer-Policy: no-referrer\r\nX-Content-Type-Options: nosniff\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
}

fn html_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

#[tauri::command]
async fn authenticate_with_xbox_live(
    tokens: MicrosoftOAuthTokens,
) -> Result<XboxLiveAuthToken, String> {
    core_authenticate_with_xbox_live(&tokens)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn authorize_xsts_for_minecraft(
    xbox_token: XboxLiveAuthToken,
) -> Result<XboxLiveAuthToken, String> {
    core_authorize_xsts_for_minecraft(&xbox_token)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn login_minecraft_with_xbox(
    xsts_token: XboxLiveAuthToken,
) -> Result<MinecraftServicesToken, String> {
    core_login_minecraft_with_xbox(&xsts_token)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn fetch_minecraft_entitlements(
    token: MinecraftServicesToken,
) -> Result<MinecraftEntitlements, String> {
    core_fetch_minecraft_entitlements(&token)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn fetch_minecraft_profile(
    token: MinecraftServicesToken,
) -> Result<MinecraftProfile, String> {
    core_fetch_minecraft_profile(&token)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn authenticate_minecraft_session(
    tokens: MicrosoftOAuthTokens,
) -> Result<StoredMinecraftSession, String> {
    core_authenticate_minecraft_session(&tokens)
        .await
        .map(renderer_safe_minecraft_session)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn authenticate_and_save_minecraft_session(
    tokens: MicrosoftOAuthTokens,
) -> Result<StoredMinecraftSession, String> {
    core_authenticate_and_save_minecraft_session(&tokens)
        .await
        .map(renderer_safe_minecraft_session)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn load_minecraft_session() -> Result<Option<StoredMinecraftSession>, String> {
    core_load_minecraft_session()
        .map(|session| session.map(renderer_safe_minecraft_session))
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn list_minecraft_accounts() -> Result<Vec<StoredMinecraftAccountSummary>, String> {
    core_list_minecraft_accounts().map_err(|error| error.to_string())
}

#[tauri::command]
async fn refresh_saved_minecraft_session() -> Result<StoredMinecraftSession, String> {
    core_refresh_saved_minecraft_session()
        .await
        .map(renderer_safe_minecraft_session)
        .map_err(|error| renderer_safe_minecraft_session_error(&error.to_string()))
}

async fn load_or_refresh_stored_minecraft_session() -> Result<StoredMinecraftSession, String> {
    let session = core_load_minecraft_session()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "no stored Minecraft session is available".to_owned())?;
    if stored_session_expires_soon(&session) {
        return core_refresh_saved_minecraft_session()
            .await
            .map_err(|error| error.to_string());
    }
    Ok(session)
}

async fn load_or_refresh_stored_minecraft_session_for_launch(
) -> Result<StoredMinecraftSession, String> {
    load_or_refresh_stored_minecraft_session()
        .await
        .map_err(|error| renderer_safe_minecraft_session_error(&error))
}

async fn load_or_refresh_stored_minecraft_session_for_friends(
) -> Result<StoredMinecraftSession, String> {
    load_or_refresh_stored_minecraft_session()
        .await
        .map_err(|error| renderer_safe_friends_session_error(&error))
}

fn renderer_safe_minecraft_session_error(error: &str) -> String {
    let lower = error.to_ascii_lowercase();
    if lower.contains("no stored minecraft session")
        || lower.contains("stored minecraft session does not include")
        || lower.contains("microsoft token exchange failed")
        || lower.contains("invalid_grant")
        || lower.contains("refresh token")
        || lower.contains("oauth")
    {
        "Minecraft sign-in needs to be refreshed. Sign in again to continue.".to_owned()
    } else {
        error.to_owned()
    }
}

fn renderer_safe_friends_session_error(error: &str) -> String {
    let lower = error.to_ascii_lowercase();
    if lower.contains("no stored minecraft session")
        || lower.contains("stored minecraft session does not include")
        || lower.contains("microsoft token exchange failed")
        || lower.contains("invalid_grant")
        || lower.contains("refresh token")
        || lower.contains("oauth")
    {
        "Sign in to use friends.".to_owned()
    } else if lower.contains("backend session exchange")
        || lower.contains("http status")
        || lower.contains("response was invalid")
        || lower.contains("error sending request")
        || lower.contains("connection")
    {
        "Friends service sign-in is unavailable right now. Minecraft still works.".to_owned()
    } else {
        error.to_owned()
    }
}

#[tauri::command(rename_all = "camelCase")]
async fn exchange_stored_minecraft_session_for_backend_session(
    backend: State<'_, SocialBackendService>,
    account_id: String,
    health_url: String,
) -> Result<BackendSessionResponse, String> {
    let session = load_or_refresh_stored_minecraft_session_for_friends().await?;
    if account_id != session.session.uuid.to_string() {
        return Err("Sign in to use friends.".to_owned());
    }
    let origin = backend
        .social_backend_origin_from_health_url(&health_url)
        .map_err(|error| renderer_safe_friends_session_error(&error))?;
    let response = reqwest::Client::new()
        .post(format!("{origin}/sessions/minecraft"))
        .json(&MinecraftSessionExchangeRequest {
            minecraft_uuid: session.session.uuid,
            minecraft_name: session.session.username,
            access_token: session.session.access_token,
            expires_at_unix_seconds: session.expires_at_unix_seconds,
        })
        .send()
        .await
        .map_err(|error| {
            renderer_safe_friends_session_error(&format!(
                "Minecraft backend session exchange failed: {error}"
            ))
        })?;
    if !response.status().is_success() {
        return Err(renderer_safe_friends_session_error(&format!(
            "Minecraft backend session exchange failed with HTTP status {}",
            response.status()
        )));
    }
    response
        .json::<BackendSessionResponse>()
        .await
        .map_err(|error| {
            renderer_safe_friends_session_error(&format!(
                "Minecraft backend session response was invalid: {error}"
            ))
        })
}

impl SocialBackendService {
    fn social_backend_origin_from_health_url(&self, health_url: &str) -> Result<String, String> {
        if health_url != self.health_url() {
            return Err(
                "friends service health URL must match the configured launcher service".to_owned(),
            );
        }
        social_backend_origin_from_health_url(health_url, &self.endpoint)
    }
}

fn social_backend_origin_from_health_url(
    health_url: &str,
    endpoint: &BackendEndpoint,
) -> Result<String, String> {
    let parsed = reqwest::Url::parse(health_url)
        .map_err(|error| format!("friends service health URL is invalid: {error}"))?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "friends service health URL is missing a host".to_owned())?;
    let normalized_host = normalized_url_host(host);
    match endpoint {
        BackendEndpoint::Local { .. } => {
            if parsed.scheme() != "http" {
                return Err("local friends service health URL must use http".to_owned());
            }
            if !is_loopback_social_backend_host(normalized_host) {
                return Err(
                    "local friends service health URL must target the packaged service".to_owned(),
                );
            }
        }
        BackendEndpoint::Hosted { origin, .. } => {
            match parsed.scheme() {
                "https" => {}
                "http" if is_loopback_social_backend_host(normalized_host) => {}
                _ => {
                    return Err(
                        "hosted friends service health URL must use https unless it targets loopback test infrastructure"
                            .to_owned(),
                    )
                }
            }
            if backend_url_origin(&parsed) != *origin {
                return Err(
                    "hosted friends service health URL must match the configured service origin"
                        .to_owned(),
                );
            }
        }
        BackendEndpoint::Disabled => {
            return Err("friends service is turned off".to_owned());
        }
    }
    Ok(backend_url_origin(&parsed))
}

fn is_loopback_social_backend_host(host: &str) -> bool {
    host.eq_ignore_ascii_case("localhost")
        || host.eq_ignore_ascii_case("::1")
        || host
            .parse::<std::net::IpAddr>()
            .map(|address| address.is_loopback())
            .unwrap_or(false)
}

fn stored_session_expires_soon(session: &StoredMinecraftSession) -> bool {
    let Some(expires_at) = session.expires_at_unix_seconds else {
        return false;
    };
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    expires_at <= now.saturating_add(60)
}

#[tauri::command]
async fn save_minecraft_session(
    session: StoredMinecraftSession,
) -> Result<StoredMinecraftSession, String> {
    ensure_renderer_session_can_be_saved(&session)?;
    core_save_minecraft_session(session)
        .map(renderer_safe_minecraft_session)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn select_minecraft_account(account_id: String) -> Result<StoredMinecraftSession, String> {
    core_select_minecraft_account(&account_id)
        .map(renderer_safe_minecraft_session)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn remove_minecraft_account(
    account_id: String,
) -> Result<Option<StoredMinecraftSession>, String> {
    core_remove_minecraft_account(&account_id)
        .map(|session| session.map(renderer_safe_minecraft_session))
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn clear_minecraft_session() -> Result<(), String> {
    core_clear_minecraft_session().map_err(|error| error.to_string())
}

#[tauri::command]
async fn social_backend_status(
    backend: State<'_, SocialBackendService>,
) -> Result<SocialBackendStatus, String> {
    Ok(backend.status().await)
}

fn validate_external_download_url(url: &str) -> Result<(), String> {
    const RELEASE_DOWNLOAD_PREFIX: &str =
        "https://github.com/dilllxd/theboyslauncher/releases/download/";
    const RELEASE_DOWNLOAD_ERROR: &str = "Only TheBoysLauncher release downloads can be opened.";
    const INSTALLER_DOWNLOAD_ERROR: &str =
        "Only TheBoysLauncher installer downloads can be opened.";
    if !url.starts_with(RELEASE_DOWNLOAD_PREFIX) {
        return Err(RELEASE_DOWNLOAD_ERROR.to_owned());
    }
    let parsed = reqwest::Url::parse(url).map_err(|_| RELEASE_DOWNLOAD_ERROR.to_owned())?;
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("github.com")
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err(RELEASE_DOWNLOAD_ERROR.to_owned());
    }

    let segments = parsed
        .path_segments()
        .map(|segments| segments.collect::<Vec<_>>())
        .unwrap_or_default();
    let [owner, repository, releases, download, tag, file_name] = segments.as_slice() else {
        return Err(RELEASE_DOWNLOAD_ERROR.to_owned());
    };
    if *owner != "dilllxd"
        || *repository != "theboyslauncher"
        || *releases != "releases"
        || *download != "download"
    {
        return Err(RELEASE_DOWNLOAD_ERROR.to_owned());
    }

    if tag == &"dev-latest" {
        let Some(version) = file_name
            .strip_prefix("TheBoysLauncher%20Dev_")
            .and_then(|name| name.strip_suffix("_x64-setup.exe"))
        else {
            return Err(INSTALLER_DOWNLOAD_ERROR.to_owned());
        };
        if !is_safe_installer_version_fragment(version) {
            return Err(INSTALLER_DOWNLOAD_ERROR.to_owned());
        }
        return Ok(());
    }

    let Some(stable_version) = stable_release_tag_version(tag) else {
        return Err(RELEASE_DOWNLOAD_ERROR.to_owned());
    };
    let Some(file_version) = file_name
        .strip_prefix("TheBoysLauncher_")
        .and_then(|name| name.strip_suffix("_x64-setup.exe"))
    else {
        return Err(INSTALLER_DOWNLOAD_ERROR.to_owned());
    };
    if file_version != stable_version || !is_safe_installer_version_fragment(file_version) {
        return Err(INSTALLER_DOWNLOAD_ERROR.to_owned());
    }
    Ok(())
}

fn stable_release_tag_version(tag: &str) -> Option<&str> {
    let version = tag.strip_prefix('v')?;
    let (core, suffix) = version.split_once('-').unwrap_or((version, ""));
    let core_parts = core.split('.').collect::<Vec<_>>();
    if core_parts.len() != 3
        || core_parts
            .iter()
            .any(|part| part.is_empty() || !part.chars().all(|ch| ch.is_ascii_digit()))
    {
        return None;
    }
    if !suffix.is_empty() && !is_safe_installer_version_fragment(suffix) {
        return None;
    }
    Some(version)
}

fn is_safe_installer_version_fragment(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-'))
}

#[tauri::command(rename_all = "camelCase")]
fn open_external_url(url: String) -> Result<(), String> {
    validate_external_download_url(&url)?;

    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        Command::new("powershell")
            .args([
                "-NoProfile",
                "-WindowStyle",
                "Hidden",
                "-Command",
                "Start-Process",
                &url,
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|error| format!("failed to open download: {error}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|error| format!("failed to open download: {error}"))?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|error| format!("failed to open download: {error}"))?;
    }

    Ok(())
}

#[tauri::command]
async fn start_social_backend(
    backend: State<'_, SocialBackendService>,
) -> Result<SocialBackendStatus, String> {
    backend.start().await
}

#[tauri::command]
async fn stop_social_backend(
    backend: State<'_, SocialBackendService>,
) -> Result<SocialBackendStatus, String> {
    backend.stop().await
}

#[tauri::command(rename_all = "camelCase")]
async fn launch_profile(profile_id: String) -> Result<ActionReceipt, String> {
    core_launch_profile(&profile_id).map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn build_launch_command(profile_id: String) -> Result<ProcessCommandSpec, String> {
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let settings = core_load_settings().map_err(|error| error.to_string())?;
    let launch_plan = core_build_offline_launch_plan(&profile_id, &settings, &directories)
        .map_err(|error| error.to_string())?;
    core_build_process_command_spec(&launch_plan)
        .map(renderer_safe_process_command_spec)
        .map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn build_launch_command_for_server(
    profile_id: String,
    server: ServerLaunchTarget,
) -> Result<ProcessCommandSpec, String> {
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let settings = core_load_settings().map_err(|error| error.to_string())?;
    let launch_plan = core_build_offline_launch_plan_with_server(
        &profile_id,
        &settings,
        &directories,
        Some(&server),
    )
    .map_err(|error| error.to_string())?;
    core_build_process_command_spec(&launch_plan)
        .map(renderer_safe_process_command_spec)
        .map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn build_authenticated_launch_command(
    profile_id: String,
    session: MinecraftSession,
    server: Option<ServerLaunchTarget>,
) -> Result<ProcessCommandSpec, String> {
    ensure_renderer_authenticated_launch_allowed(&session)?;
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let settings = core_load_settings().map_err(|error| error.to_string())?;
    let launch_plan = core_build_authenticated_launch_plan(
        &profile_id,
        &settings,
        &directories,
        &session,
        server.as_ref(),
    )
    .map_err(|error| error.to_string())?;
    core_build_process_command_spec(&launch_plan)
        .map(renderer_safe_process_command_spec)
        .map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn build_stored_authenticated_launch_command(
    profile_id: String,
    server: Option<ServerLaunchTarget>,
) -> Result<ProcessCommandSpec, String> {
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let settings = core_load_settings().map_err(|error| error.to_string())?;
    let session = load_or_refresh_stored_minecraft_session_for_launch().await?;
    let launch_plan = core_build_stored_authenticated_launch_plan(
        &profile_id,
        &settings,
        &directories,
        &session,
        server.as_ref(),
    )
    .map_err(|error| error.to_string())?;
    core_build_process_command_spec(&launch_plan)
        .map(renderer_safe_process_command_spec)
        .map_err(|error| error.to_string())
}

fn renderer_safe_process_command_spec(mut spec: ProcessCommandSpec) -> ProcessCommandSpec {
    spec.args = redact_renderer_command_args(&spec.args);
    spec.env = spec
        .env
        .into_iter()
        .map(|mut env_var| {
            if renderer_sensitive_env_key(&env_var.key) {
                env_var.value = "[redacted]".to_owned();
            }
            env_var
        })
        .collect();
    spec
}

fn completed_action_receipt(
    action: LauncherAction,
    subject_id: impl Into<String>,
    message: impl Into<String>,
) -> ActionReceipt {
    ActionReceipt {
        id: Uuid::new_v4(),
        action,
        subject_id: Some(subject_id.into()),
        status: ActionStatus::Completed,
        message: message.into(),
    }
}

fn completed_native_operation_event(
    operation: LauncherOperation,
    subject_id: impl Into<String>,
    message: impl Into<String>,
) -> LauncherEvent {
    planned_native_operation_event(
        Uuid::new_v4(),
        operation,
        subject_id,
        LauncherEventKind::Completed,
        message,
    )
}

fn completed_planned_native_operation_event(
    operation_id: Uuid,
    operation: LauncherOperation,
    subject_id: impl Into<String>,
    message: impl Into<String>,
) -> LauncherEvent {
    planned_native_operation_event(
        operation_id,
        operation,
        subject_id,
        LauncherEventKind::Completed,
        message,
    )
}

fn planned_native_operation_event(
    operation_id: Uuid,
    operation: LauncherOperation,
    subject_id: impl Into<String>,
    kind: LauncherEventKind,
    message: impl Into<String>,
) -> LauncherEvent {
    LauncherEvent {
        id: Uuid::new_v4(),
        operation_id,
        operation: Some(operation),
        subject_id: Some(subject_id.into()),
        kind,
        message: message.into(),
        progress_percent: Some(100),
        occurred_at_unix_seconds: 0,
    }
}

fn failed_native_operation_event(
    operation: LauncherOperation,
    subject_id: impl Into<String>,
    message: impl Into<String>,
) -> LauncherEvent {
    LauncherEvent {
        id: Uuid::new_v4(),
        operation_id: Uuid::new_v4(),
        operation: Some(operation),
        subject_id: Some(subject_id.into()),
        kind: LauncherEventKind::Failed,
        message: message.into(),
        progress_percent: Some(100),
        occurred_at_unix_seconds: 0,
    }
}

fn failed_planned_native_operation_event(
    operation_id: Uuid,
    operation: LauncherOperation,
    subject_id: impl Into<String>,
    message: impl Into<String>,
) -> LauncherEvent {
    planned_native_operation_event(
        operation_id,
        operation,
        subject_id,
        LauncherEventKind::Failed,
        message,
    )
}

#[derive(Debug)]
struct NativeOperationError {
    message: String,
    operation_id: Option<Uuid>,
}

impl NativeOperationError {
    fn unplanned(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            operation_id: None,
        }
    }

    fn planned(operation_id: Uuid, message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            operation_id: Some(operation_id),
        }
    }
}

impl From<String> for NativeOperationError {
    fn from(message: String) -> Self {
        Self::unplanned(message)
    }
}

fn native_operation_failure_message(prefix: &str, error: &str) -> String {
    format!("{prefix}: {error}")
}

fn delete_profile_success_message(profile: &ProfileSummary) -> String {
    format!(
        "{} deleted. Profile files were removed; shared Minecraft downloads were kept for faster future installs.",
        profile.name
    )
}

fn redact_renderer_command_args(args: &[String]) -> Vec<String> {
    let mut redacted = Vec::with_capacity(args.len());
    let mut redact_next = false;
    for arg in args {
        if redact_next {
            redacted.push("[redacted]".to_owned());
            redact_next = false;
            continue;
        }
        if renderer_sensitive_arg_flag(arg) {
            redacted.push(arg.clone());
            redact_next = true;
            continue;
        }
        if let Some((key, _)) = arg.split_once('=') {
            if renderer_sensitive_arg_flag(key) {
                redacted.push(format!("{key}=[redacted]"));
                continue;
            }
        }
        redacted.push(arg.clone());
    }
    redacted
}

fn renderer_sensitive_arg_flag(arg: &str) -> bool {
    matches!(arg, "--accessToken" | "--access_token" | "--token")
}

fn renderer_sensitive_env_key(key: &str) -> bool {
    let key = key.to_ascii_uppercase();
    key.contains("TOKEN") || key.contains("SECRET") || key.contains("PASSWORD")
}

fn start_managed_launch_plan(
    launch_plan: LaunchPlan,
    registry: &ProcessRegistry,
    event_log: &LauncherEventLog,
) -> Result<ManagedProcessSummary, String> {
    let start_result =
        core_build_process_command_spec(&launch_plan).and_then(|command| registry.spawn(command));

    match start_result {
        Ok(process) => {
            let operation = core_build_launch_operation_plan(&launch_plan, process.process_id);
            event_log
                .record_plan(&operation)
                .map_err(|error| error.to_string())?;
            let startup = registry
                .wait_for_startup(process.id, LAUNCH_STARTUP_GRACE_PERIOD)
                .map_err(|error| error.to_string())?;
            if startup.state == shared::ManagedProcessState::Exited {
                let error_message = match startup.exit_code {
                    Some(code) => {
                        format!("launch process exited during startup with exit code {code}")
                    }
                    None => "launch process exited during startup".to_owned(),
                };
                let operation =
                    core_build_launch_failed_operation_plan(&launch_plan, error_message.clone());
                event_log.record_plan(&operation).map_err(|record_error| {
                    format!(
                        "{error_message}; additionally failed to record launch failure event: {record_error}"
                    )
                })?;
                return Err(error_message);
            }
            let _ = core_mark_profile_launched(&launch_plan.profile_id);
            Ok(startup)
        }
        Err(error) => {
            let error_message = error.to_string();
            let operation =
                core_build_launch_failed_operation_plan(&launch_plan, error_message.clone());
            event_log.record_plan(&operation).map_err(|record_error| {
                format!(
                    "{error_message}; additionally failed to record launch failure event: {record_error}"
                )
            })?;
            Err(error_message)
        }
    }
}

fn active_managed_process_summary(
    registry: &ProcessRegistry,
    profile_id: &str,
) -> Result<Option<ManagedProcessSummary>, String> {
    let processes = registry.list().map_err(|error| error.to_string())?;
    Ok(active_managed_process_for_profile(&processes, profile_id).cloned())
}

fn record_launch_planning_failure(
    profile_id: &str,
    error_message: String,
    event_log: &LauncherEventLog,
) -> Result<String, String> {
    let profile_name = core_load_profiles().ok().and_then(|profiles| {
        profiles
            .into_iter()
            .find(|profile| profile.id == profile_id)
            .map(|profile| profile.name)
    });
    let operation = core_build_launch_planning_failed_operation_plan(
        profile_id,
        profile_name.as_deref(),
        error_message.clone(),
    );
    event_log.record_plan(&operation).map_err(|record_error| {
        format!(
            "{error_message}; additionally failed to record launch planning failure event: {record_error}"
        )
    })?;
    Ok(error_message)
}

fn launch_failure_missing_artifacts(message: &str) -> bool {
    message.contains("launch artifact is missing")
        || message.contains("launch artifacts are missing")
        || message.contains("launch asset index is missing")
        || message.contains("launch natives directory is missing")
        || message.contains("asset index is missing")
        || message.contains("natives directory is missing")
        || message.contains("asset launch argument")
}

fn launch_failure_recoverable_managed_java(message: &str) -> bool {
    message.contains("Install a managed Java runtime from Settings before launching.")
}

fn java_manifest_entry_matches_requirement(
    entry: &JavaRuntimeManifestEntry,
    required_major_version: u32,
) -> bool {
    if required_major_version <= 8 {
        entry.major_version == 8
    } else {
        entry.major_version >= required_major_version
    }
}

fn recommended_java_entry_for_requirement(
    manifest: &[JavaRuntimeManifestEntry],
    required_major_version: u32,
) -> Option<JavaRuntimeManifestEntry> {
    let mut candidates = manifest
        .iter()
        .filter(|entry| java_manifest_entry_matches_requirement(entry, required_major_version))
        .cloned()
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| {
        left.major_version
            .cmp(&right.major_version)
            .then_with(|| left.runtime_id.cmp(&right.runtime_id))
    });
    candidates.into_iter().next()
}

async fn install_managed_java_for_profile_launch(
    profile_id: &str,
    event_log: &LauncherEventLog,
) -> Result<(), String> {
    let profile = core_load_profiles()
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|profile| profile.id == profile_id)
        .ok_or_else(|| format!("Profile '{profile_id}' was not found"))?;
    let required_java = core_required_java_major_for_minecraft(&profile.game_version);
    if core_select_java_runtime(&core_discover_java_runtimes(), required_java).is_some() {
        return Ok(());
    }

    let manifest = core_fetch_recommended_java_runtime_manifest()
        .await
        .map_err(|error| error.to_string())?;
    let runtime =
        recommended_java_entry_for_requirement(&manifest, required_java).ok_or_else(|| {
            format!(
                "No managed Java runtime recommendation is available for Minecraft {}.",
                profile.game_version
            )
        })?;
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let request = core_java_runtime_request_from_manifest_entry(&runtime);
    let download_plan = core_build_managed_java_runtime_download_plan(request, &directories)
        .map_err(|error| error.to_string())?;
    execute_download_plan_recording_events(&download_plan, event_log).await?;
    let install_operation = core_execute_managed_java_runtime_install(&download_plan)
        .map_err(|error| error.to_string())?;
    event_log
        .record_plan(&install_operation)
        .map_err(|error| error.to_string())?;

    if core_select_java_runtime(&core_discover_java_runtimes(), required_java).is_none() {
        return Err(format!(
            "Managed Java was installed, but no compatible Java runtime was discovered for Minecraft {}.",
            profile.game_version
        ));
    }

    Ok(())
}

async fn build_launch_plan_with_managed_java_recovery<F>(
    profile_id: &str,
    event_log: &LauncherEventLog,
    mut build: F,
) -> Result<LaunchPlan, String>
where
    F: FnMut() -> anyhow::Result<LaunchPlan>,
{
    match build() {
        Ok(launch_plan) => Ok(launch_plan),
        Err(error) => {
            let error_message = error.to_string();
            if !launch_failure_recoverable_managed_java(&error_message) {
                return Err(record_launch_planning_failure(
                    profile_id,
                    error_message,
                    event_log,
                )?);
            }

            install_managed_java_for_profile_launch(profile_id, event_log)
                .await
                .map_err(|install_error| {
                    native_operation_failure_message(
                        "Automatic Java setup before launch failed",
                        &install_error,
                    )
                })?;
            build().map_err(|retry_error| {
                record_launch_planning_failure(profile_id, retry_error.to_string(), event_log)
                    .unwrap_or_else(|record_error| record_error)
            })
        }
    }
}

async fn repair_launch_artifacts_if_missing(
    profile_id: &str,
    launch_plan: &LaunchPlan,
    event_log: &LauncherEventLog,
) -> Result<bool, String> {
    match core_build_process_command_spec(launch_plan) {
        Ok(_) => Ok(false),
        Err(error) => {
            let message = error.to_string();
            if !launch_failure_missing_artifacts(&message) {
                return Ok(false);
            }
            repair_profile_inner(profile_id.to_owned(), event_log, "Profile setup completed.")
                .await
                .map_err(|repair_error| {
                    native_operation_failure_message(
                        "Automatic profile setup before launch failed",
                        &repair_error.message,
                    )
                })?;
            Ok(true)
        }
    }
}

#[tauri::command(rename_all = "camelCase")]
async fn start_launch_process(
    profile_id: String,
    registry: State<'_, ProcessRegistry>,
    event_log: State<'_, LauncherEventLog>,
    _lifecycle_gate: State<'_, LifecycleOperationGate>,
) -> Result<ManagedProcessSummary, String> {
    if let Some(process) = active_managed_process_summary(&registry, &profile_id)? {
        return Ok(process);
    }
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let settings = core_load_settings().map_err(|error| error.to_string())?;
    let mut launch_plan =
        build_launch_plan_with_managed_java_recovery(&profile_id, &event_log, || {
            core_build_offline_launch_plan(&profile_id, &settings, &directories)
        })
        .await?;
    if repair_launch_artifacts_if_missing(&profile_id, &launch_plan, &event_log).await? {
        launch_plan = core_build_offline_launch_plan(&profile_id, &settings, &directories)
            .map_err(|error| {
                record_launch_planning_failure(&profile_id, error.to_string(), &event_log)
                    .unwrap_or_else(|record_error| record_error)
            })?;
    }
    start_managed_launch_plan(launch_plan, &registry, &event_log)
}

#[tauri::command(rename_all = "camelCase")]
async fn start_authenticated_launch_process(
    profile_id: String,
    session: MinecraftSession,
    server: Option<ServerLaunchTarget>,
    registry: State<'_, ProcessRegistry>,
    event_log: State<'_, LauncherEventLog>,
    _lifecycle_gate: State<'_, LifecycleOperationGate>,
) -> Result<ManagedProcessSummary, String> {
    ensure_renderer_authenticated_launch_allowed(&session)?;
    if let Some(process) = active_managed_process_summary(&registry, &profile_id)? {
        return Ok(process);
    }
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let settings = core_load_settings().map_err(|error| error.to_string())?;
    let mut launch_plan =
        build_launch_plan_with_managed_java_recovery(&profile_id, &event_log, || {
            core_build_authenticated_launch_plan(
                &profile_id,
                &settings,
                &directories,
                &session,
                server.as_ref(),
            )
        })
        .await?;
    if repair_launch_artifacts_if_missing(&profile_id, &launch_plan, &event_log).await? {
        launch_plan = core_build_authenticated_launch_plan(
            &profile_id,
            &settings,
            &directories,
            &session,
            server.as_ref(),
        )
        .map_err(|error| {
            record_launch_planning_failure(&profile_id, error.to_string(), &event_log)
                .unwrap_or_else(|record_error| record_error)
        })?;
    }
    start_managed_launch_plan(launch_plan, &registry, &event_log)
}

#[tauri::command(rename_all = "camelCase")]
async fn start_stored_authenticated_launch_process(
    profile_id: String,
    server: Option<ServerLaunchTarget>,
    registry: State<'_, ProcessRegistry>,
    event_log: State<'_, LauncherEventLog>,
    _lifecycle_gate: State<'_, LifecycleOperationGate>,
) -> Result<ManagedProcessSummary, String> {
    if let Some(process) = active_managed_process_summary(&registry, &profile_id)? {
        return Ok(process);
    }
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let settings = core_load_settings().map_err(|error| error.to_string())?;
    let session = match load_or_refresh_stored_minecraft_session_for_launch().await {
        Ok(session) => session,
        Err(error) => {
            return Err(
                record_launch_planning_failure(&profile_id, error, &event_log)
                    .unwrap_or_else(|record_error| record_error),
            );
        }
    };
    let mut launch_plan =
        build_launch_plan_with_managed_java_recovery(&profile_id, &event_log, || {
            core_build_stored_authenticated_launch_plan(
                &profile_id,
                &settings,
                &directories,
                &session,
                server.as_ref(),
            )
        })
        .await?;
    if repair_launch_artifacts_if_missing(&profile_id, &launch_plan, &event_log).await? {
        launch_plan = core_build_stored_authenticated_launch_plan(
            &profile_id,
            &settings,
            &directories,
            &session,
            server.as_ref(),
        )
        .map_err(|error| {
            record_launch_planning_failure(&profile_id, error.to_string(), &event_log)
                .unwrap_or_else(|record_error| record_error)
        })?;
    }
    start_managed_launch_plan(launch_plan, &registry, &event_log)
}

#[tauri::command(rename_all = "camelCase")]
async fn start_launch_process_for_server(
    profile_id: String,
    server: ServerLaunchTarget,
    registry: State<'_, ProcessRegistry>,
    event_log: State<'_, LauncherEventLog>,
    _lifecycle_gate: State<'_, LifecycleOperationGate>,
) -> Result<ManagedProcessSummary, String> {
    if let Some(process) = active_managed_process_summary(&registry, &profile_id)? {
        return Ok(process);
    }
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let settings = core_load_settings().map_err(|error| error.to_string())?;
    let mut launch_plan =
        build_launch_plan_with_managed_java_recovery(&profile_id, &event_log, || {
            core_build_offline_launch_plan_with_server(
                &profile_id,
                &settings,
                &directories,
                Some(&server),
            )
        })
        .await?;
    if repair_launch_artifacts_if_missing(&profile_id, &launch_plan, &event_log).await? {
        launch_plan = core_build_offline_launch_plan_with_server(
            &profile_id,
            &settings,
            &directories,
            Some(&server),
        )
        .map_err(|error| {
            record_launch_planning_failure(&profile_id, error.to_string(), &event_log)
                .unwrap_or_else(|record_error| record_error)
        })?;
    }
    start_managed_launch_plan(launch_plan, &registry, &event_log)
}

#[tauri::command]
async fn list_managed_processes(
    registry: State<'_, ProcessRegistry>,
) -> Result<Vec<ManagedProcessSummary>, String> {
    registry.list().map_err(|error| error.to_string())
}

#[tauri::command]
async fn clear_exited_managed_processes(
    registry: State<'_, ProcessRegistry>,
) -> Result<Vec<ManagedProcessSummary>, String> {
    registry.clear_exited().map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn stop_managed_process(
    managed_process_id: Uuid,
    registry: State<'_, ProcessRegistry>,
) -> Result<ManagedProcessSummary, String> {
    registry
        .stop(managed_process_id)
        .map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn export_managed_process_log(
    managed_process_id: Uuid,
    registry: State<'_, ProcessRegistry>,
) -> Result<ProcessLogExport, String> {
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    registry
        .export_log(managed_process_id, &directories)
        .map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn reveal_exported_process_log(path: String) -> Result<(), String> {
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    reveal_exported_process_log_path(Path::new(&path), Path::new(&directories.log_dir))
}

#[tauri::command(rename_all = "camelCase")]
async fn open_profile_folder(profile_id: String) -> Result<(), String> {
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let profile_folder = resolve_profile_folder_path(&profile_id, &directories)?;
    reveal_path_in_file_manager(&profile_folder)
}

#[tauri::command(rename_all = "camelCase")]
async fn open_launcher_directory(directory_kind: String) -> Result<(), String> {
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let directory = match directory_kind.as_str() {
        "data" => PathBuf::from(&directories.data_dir),
        "cache" => PathBuf::from(&directories.cache_dir),
        "logs" => PathBuf::from(&directories.log_dir),
        _ => return Err("launcher directory kind is not supported".to_owned()),
    };
    fs::create_dir_all(&directory).map_err(|error| {
        format!(
            "failed to create launcher directory {}: {error}",
            directory.display()
        )
    })?;
    reveal_path_in_file_manager(&directory)
}

fn resolve_profile_folder_path(
    profile_id: &str,
    directories: &LauncherDirectories,
) -> Result<PathBuf, String> {
    validate_profile_folder_id(profile_id)?;
    let profiles = core_load_profiles().map_err(|error| error.to_string())?;
    if !profiles.iter().any(|profile| profile.id == profile_id) {
        return Err(format!("profile '{profile_id}' was not found"));
    }

    let profile_root = Path::new(&directories.data_dir).join("profiles");
    fs::create_dir_all(&profile_root).map_err(|error| {
        format!(
            "failed to create launcher profiles directory {}: {error}",
            profile_root.display()
        )
    })?;
    let profile_folder = profile_root.join(profile_id);
    fs::create_dir_all(&profile_folder).map_err(|error| {
        format!(
            "failed to create profile folder {}: {error}",
            profile_folder.display()
        )
    })?;

    let canonical_root = profile_root.canonicalize().map_err(|error| {
        format!(
            "failed to resolve launcher profiles directory {}: {error}",
            profile_root.display()
        )
    })?;
    let canonical_profile_folder = profile_folder.canonicalize().map_err(|error| {
        format!(
            "failed to resolve profile folder {}: {error}",
            profile_folder.display()
        )
    })?;
    if canonical_profile_folder == canonical_root
        || !canonical_profile_folder.starts_with(&canonical_root)
    {
        return Err("profile folder is outside the managed profiles directory".to_owned());
    }
    Ok(canonical_profile_folder)
}

fn validate_profile_folder_id(profile_id: &str) -> Result<(), String> {
    let trimmed = profile_id.trim();
    if trimmed.is_empty() {
        return Err("profile id is required".to_owned());
    }
    if trimmed == "." || trimmed == ".." || trimmed.contains('/') || trimmed.contains('\\') {
        return Err("profile id is not safe to open".to_owned());
    }
    Ok(())
}

fn reveal_exported_process_log_path(path: &Path, log_dir: &Path) -> Result<(), String> {
    let canonical_path = validate_exported_process_log_path(path, log_dir)?;
    reveal_path_in_file_manager(&canonical_path)
}

fn validate_exported_process_log_path(path: &Path, log_dir: &Path) -> Result<PathBuf, String> {
    let canonical_log_dir = log_dir.canonicalize().map_err(|error| {
        format!(
            "failed to resolve launcher log directory {}: {error}",
            log_dir.display()
        )
    })?;
    let canonical_path = path.canonicalize().map_err(|error| {
        format!(
            "failed to resolve exported process log {}: {error}",
            path.display()
        )
    })?;
    if !canonical_path.starts_with(&canonical_log_dir) {
        return Err(format!(
            "exported process log {} is outside launcher log directory {}",
            canonical_path.display(),
            canonical_log_dir.display()
        ));
    }
    Ok(canonical_path)
}

fn validate_microsoft_auth_url(auth_url: &str) -> Result<(), String> {
    let url = Url::parse(auth_url)
        .map_err(|error| format!("Microsoft auth URL is not valid: {error}"))?;
    if url.scheme() != "https" {
        return Err("Microsoft auth URL must use https".to_owned());
    }
    if url.host_str() != Some("login.live.com") {
        return Err("Microsoft auth URL host is not supported".to_owned());
    }
    if url.path() != "/oauth20_authorize.srf" {
        return Err("Microsoft auth URL path is not supported".to_owned());
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn open_url_in_system_browser(url: &str) -> Result<(), String> {
    Command::new("rundll32.exe")
        .arg("url.dll,FileProtocolHandler")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("failed to open Microsoft login in browser: {error}"))
}

#[cfg(target_os = "macos")]
fn open_url_in_system_browser(url: &str) -> Result<(), String> {
    Command::new("open")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("failed to open Microsoft login in browser: {error}"))
}

#[cfg(all(unix, not(target_os = "macos")))]
fn open_url_in_system_browser(url: &str) -> Result<(), String> {
    Command::new("xdg-open")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("failed to open Microsoft login in browser: {error}"))
}

#[cfg(target_os = "windows")]
fn reveal_path_in_file_manager(path: &Path) -> Result<(), String> {
    Command::new("explorer.exe")
        .arg(format!("/select,{}", path.display()))
        .spawn()
        .map(|_| ())
        .map_err(|error| {
            format!(
                "failed to open item in file manager {}: {error}",
                path.display()
            )
        })
}

#[cfg(target_os = "macos")]
fn reveal_path_in_file_manager(path: &Path) -> Result<(), String> {
    Command::new("open")
        .arg("-R")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|error| {
            format!(
                "failed to open item in file manager {}: {error}",
                path.display()
            )
        })
}

#[cfg(all(unix, not(target_os = "macos")))]
fn reveal_path_in_file_manager(path: &Path) -> Result<(), String> {
    let parent = path.parent().unwrap_or(path);
    Command::new("xdg-open")
        .arg(parent)
        .spawn()
        .map(|_| ())
        .map_err(|error| {
            format!(
                "failed to open folder in file manager {}: {error}",
                parent.display()
            )
        })
}

fn managed_process_profile_id(process: &ManagedProcessSummary) -> Option<&str> {
    process
        .command
        .env
        .iter()
        .find(|env| env.key == "THEBOYSLAUNCHER_PROFILE_ID")
        .map(|env| env.value.as_str())
}

fn active_managed_process_for_profile<'a>(
    processes: &'a [ManagedProcessSummary],
    profile_id: &str,
) -> Option<&'a ManagedProcessSummary> {
    processes.iter().find(|process| {
        matches!(
            process.state,
            shared::ManagedProcessState::Running | shared::ManagedProcessState::StopRequested
        ) && managed_process_profile_id(process) == Some(profile_id)
    })
}

fn profile_delete_active_process_error(
    profile_id: &str,
    process: &ManagedProcessSummary,
) -> String {
    format!(
        "profile '{profile_id}' has a running managed process (PID {}). Stop it before deleting.",
        process.process_id
    )
}

fn profile_update_active_process_error(
    profile_id: &str,
    process: &ManagedProcessSummary,
) -> String {
    format!(
        "profile '{profile_id}' has a running managed process (PID {}). Stop it before saving changes.",
        process.process_id
    )
}

fn profile_archive_active_process_error(
    profile_id: &str,
    process: &ManagedProcessSummary,
) -> String {
    format!(
        "profile '{profile_id}' has a running managed process (PID {}). Stop it before archiving.",
        process.process_id
    )
}

fn profile_duplicate_active_process_error(
    profile_id: &str,
    process: &ManagedProcessSummary,
) -> String {
    format!(
        "profile '{profile_id}' has a running managed process (PID {}). Stop it before duplicating.",
        process.process_id
    )
}

fn profile_install_active_process_error(
    profile_id: &str,
    process: &ManagedProcessSummary,
) -> String {
    format!(
        "profile '{profile_id}' has a running managed process (PID {}). Stop it before installing or updating.",
        process.process_id
    )
}

fn profile_repair_active_process_error(
    profile_id: &str,
    process: &ManagedProcessSummary,
) -> String {
    format!(
        "profile '{profile_id}' has a running managed process (PID {}). Stop it before setting up files.",
        process.process_id
    )
}

fn install_pack_completion_message(plan: &OperationPlan) -> &'static str {
    let queued_message = plan
        .events
        .first()
        .map(|event| event.message.to_ascii_lowercase())
        .unwrap_or_default();
    if queued_message.contains("update queued") {
        "Pack updated successfully."
    } else if queued_message.contains("prepare queued") {
        "Pack is ready."
    } else {
        "Pack installed successfully."
    }
}

fn modpack_archive_file_name_from_url(url: &str) -> Result<String, String> {
    let parsed =
        Url::parse(url.trim()).map_err(|error| format!("modpack URL is invalid: {error}"))?;
    let file_name = parsed
        .path_segments()
        .and_then(|mut segments| segments.next_back())
        .filter(|segment| !segment.trim().is_empty())
        .unwrap_or("modpack.zip");
    if file_name.to_ascii_lowercase().ends_with(".zip")
        || file_name.to_ascii_lowercase().ends_with(".mrpack")
    {
        Ok(file_name
            .chars()
            .map(|ch| {
                if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_') {
                    ch
                } else {
                    '-'
                }
            })
            .collect())
    } else {
        Ok("modpack.zip".to_owned())
    }
}

fn build_modpack_archive_download_plan(
    request: &InstallModpackArchiveRequest,
    directories: &LauncherDirectories,
) -> Result<(DownloadPlan, PathBuf), String> {
    let url = request.url.trim();
    if url.is_empty() {
        return Err("modpack URL is required".to_owned());
    }
    Url::parse(url).map_err(|error| format!("modpack URL is invalid: {error}"))?;
    let file_name = modpack_archive_file_name_from_url(url)?;
    let archive_id = uuid::Uuid::new_v4().to_string();
    let archive_path = PathBuf::from(&directories.cache_dir)
        .join("modpack-archives")
        .join(&archive_id)
        .join(file_name);
    Ok((
        DownloadPlan {
            version_id: format!("modpack-archive-{archive_id}"),
            items: vec![DownloadItem {
                id: "modpack-archive".to_owned(),
                kind: DownloadKind::PackFile,
                url: url.to_owned(),
                sha1: None,
                sha256: None,
                sha512: None,
                md5: None,
                murmur2: None,
                size: None,
                destination: archive_path.to_string_lossy().replace('\\', "/"),
            }],
        },
        archive_path,
    ))
}

fn staged_modpack_archive_dir(
    archive_path: &Path,
    directories: &LauncherDirectories,
) -> Option<PathBuf> {
    let archive_root = PathBuf::from(&directories.cache_dir).join("modpack-archives");
    let archive_dir = archive_path.parent()?;
    if archive_dir.parent() == Some(archive_root.as_path()) && archive_dir != archive_root {
        return Some(archive_dir.to_path_buf());
    }
    None
}

fn cleanup_staged_modpack_archive(
    archive_path: &Path,
    directories: &LauncherDirectories,
) -> Result<(), String> {
    let Some(archive_dir) = staged_modpack_archive_dir(archive_path, directories) else {
        return Ok(());
    };
    if archive_dir.exists() {
        fs::remove_dir_all(&archive_dir).map_err(|error| {
            format!(
                "failed to clean staged modpack archive {}: {error}",
                archive_dir.display()
            )
        })?;
    }
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
async fn install_modpack_archive(
    request: InstallModpackArchiveRequest,
    event_log: State<'_, LauncherEventLog>,
    lifecycle_gate: State<'_, LifecycleOperationGate>,
) -> Result<ActionReceipt, String> {
    let label = request
        .name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or("modpack archive")
        .to_owned();
    let _lifecycle_guard = lifecycle_gate.acquire(format!("installing {label}"))?;
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let (archive_download_plan, archive_path) =
        build_modpack_archive_download_plan(&request, &directories)?;
    execute_download_plan_recording_events(&archive_download_plan, &event_log).await?;

    let archive_file_name = archive_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let is_modrinth_archive = archive_file_name.ends_with(".mrpack")
        || core_modpack_archive_contains_modrinth_index(&archive_path).unwrap_or(false);
    let (profile, loader_version, mut auxiliary_plan, extraction) = if is_modrinth_archive {
        let install_plan = core_build_modrinth_modpack_archive_install_plan(
            &archive_path,
            request.name.as_deref(),
            &directories,
        )
        .map_err(|error| {
            native_operation_failure_message("Modpack install failed", &error.to_string())
        })?;
        let profile = install_plan.profile.clone();
        let extraction =
            core_extract_modrinth_modpack_archive(&archive_path, &install_plan, &directories)
                .map_err(|error| {
                    native_operation_failure_message("Modpack install failed", &error.to_string())
                })?;
        (
            profile,
            install_plan.loader_version.clone(),
            install_plan.file_download_plan.clone(),
            extraction,
        )
    } else {
        let install_plan = core_build_curseforge_modpack_archive_install_plan(
            &archive_path,
            request.name.as_deref(),
            &directories,
        )
        .map_err(|error| {
            native_operation_failure_message("Modpack install failed", &error.to_string())
        })?;
        let profile = install_plan.profile.clone();
        let extraction =
            core_extract_curseforge_modpack_archive(&archive_path, &install_plan, &directories)
                .map_err(|error| {
                    native_operation_failure_message("Modpack install failed", &error.to_string())
                })?;
        (
            profile,
            install_plan.loader_version.clone(),
            install_plan.mod_download_plan.clone(),
            extraction,
        )
    };
    event_log
        .record_plan(&extraction)
        .map_err(|error| error.to_string())?;
    let _ = cleanup_staged_modpack_archive(&archive_path, &directories);

    let vanilla_plan =
        core_build_vanilla_download_plan(Some(profile.game_version.as_str()), &directories)
            .await
            .map_err(|error| {
                native_operation_failure_message("Modpack install failed", &error.to_string())
            })?;
    execute_download_plan_recording_events(&vanilla_plan, &event_log).await?;
    core_extract_native_libraries_from_download_plan(&vanilla_plan).map_err(|error| {
        native_operation_failure_message("Modpack install failed", &error.to_string())
    })?;

    if profile.loader != shared::ModLoader::Vanilla {
        let modloader_plan = core_build_modloader_download_plan_for_profile_with_loader_version(
            &profile,
            loader_version.as_deref(),
            &directories,
        )
        .map_err(|error| {
            native_operation_failure_message("Modpack install failed", &error.to_string())
        })?;
        auxiliary_plan.items.extend(modloader_plan.items);
    }

    execute_direct_pack_files_from_auxiliary_plan(&auxiliary_plan, &event_log).await?;
    execute_modloader_metadata_and_dependencies_for_profile(
        &profile,
        &auxiliary_plan,
        &directories,
        &event_log,
    )
    .await
    .map_err(|error| native_operation_failure_message("Modpack install failed", &error))?;

    core_persist_installed_pack_profile(profile.clone()).map_err(|error| {
        native_operation_failure_message("Modpack install failed", &error.to_string())
    })?;
    let message = format!("{} installed successfully.", profile.name);
    event_log
        .record_event(completed_planned_native_operation_event(
            extraction.operation_id,
            LauncherOperation::InstallModpackArchive,
            profile.id.clone(),
            &message,
        ))
        .map_err(|error| error.to_string())?;
    Ok(completed_action_receipt(
        LauncherAction::InstallModpackArchive,
        profile.id,
        &message,
    ))
}

#[tauri::command(rename_all = "camelCase")]
async fn install_discover_modpack(
    request: InstallDiscoveredModpackRequest,
    event_log: State<'_, LauncherEventLog>,
    lifecycle_gate: State<'_, LifecycleOperationGate>,
) -> Result<ActionReceipt, String> {
    let label = request
        .name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or("discovered modpack")
        .to_owned();
    let _lifecycle_guard = lifecycle_gate.acquire(format!("installing {label}"))?;
    let provider = request.provider.trim().to_ascii_lowercase();
    if !matches!(
        provider.as_str(),
        "modrinth" | "curseforge" | "ftb" | "atlauncher" | "ftb_legacy" | "ftb_private" | "technic"
    ) {
        return Err(format!(
            "{} packs cannot be installed automatically",
            request.provider.trim()
        ));
    }
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let (profile, loader_version, file_download_plan, atlauncher_extract_archives) = if provider
        == "modrinth"
    {
        let resolution = if let Some(version_id) = request
            .version_id
            .as_deref()
            .map(str::trim)
            .filter(|version_id| !version_id.is_empty())
        {
            core_resolve_modrinth_modpack_archive_version(request.project_id.trim(), version_id)
                .await
                .map_err(|error| {
                    native_operation_failure_message("Modpack install failed", &error.to_string())
                })?
        } else {
            core_resolve_modrinth_modpack_archive(request.project_id.trim())
                .await
                .map_err(|error| {
                    native_operation_failure_message("Modpack install failed", &error.to_string())
                })?
        };
        let archive_id = uuid::Uuid::new_v4().to_string();
        let archive_path = PathBuf::from(&directories.cache_dir)
            .join("modpack-archives")
            .join(&archive_id)
            .join(&resolution.file_name);
        let archive_download_plan = DownloadPlan {
            version_id: format!("modrinth-archive-{archive_id}"),
            items: vec![DownloadItem {
                id: "modrinth-archive".to_owned(),
                kind: DownloadKind::PackFile,
                url: resolution.url,
                sha1: None,
                sha256: None,
                sha512: None,
                md5: None,
                murmur2: None,
                size: resolution.size,
                destination: archive_path.to_string_lossy().replace('\\', "/"),
            }],
        };
        execute_download_plan_recording_events(&archive_download_plan, &event_log).await?;
        let install_plan = core_build_modrinth_modpack_archive_install_plan(
            &archive_path,
            request.name.as_deref(),
            &directories,
        )
        .map_err(|error| {
            native_operation_failure_message("Modpack install failed", &error.to_string())
        })?;
        let extraction =
            core_extract_modrinth_modpack_archive(&archive_path, &install_plan, &directories)
                .map_err(|error| {
                    native_operation_failure_message("Modpack install failed", &error.to_string())
                })?;
        event_log
            .record_plan(&extraction)
            .map_err(|error| error.to_string())?;
        let _ = cleanup_staged_modpack_archive(&archive_path, &directories);
        (
            install_plan.profile,
            install_plan.loader_version,
            install_plan.file_download_plan,
            Vec::new(),
        )
    } else if provider == "curseforge" {
        let download_plan = core_fetch_curseforge_modpack_download_plan(&request, &directories)
            .await
            .map_err(|error| {
                native_operation_failure_message("Modpack install failed", &error.to_string())
            })?;
        execute_download_plan_recording_events(&download_plan.archive_download_plan, &event_log)
            .await?;
        let install_plan = core_build_curseforge_modpack_archive_install_plan(
            &download_plan.archive_path,
            request
                .name
                .as_deref()
                .or(Some(download_plan.name.as_str())),
            &directories,
        )
        .map_err(|error| {
            native_operation_failure_message("Modpack install failed", &error.to_string())
        })?;
        let extraction = core_extract_curseforge_modpack_archive(
            &download_plan.archive_path,
            &install_plan,
            &directories,
        )
        .map_err(|error| {
            native_operation_failure_message("Modpack install failed", &error.to_string())
        })?;
        event_log
            .record_plan(&extraction)
            .map_err(|error| error.to_string())?;
        let _ = cleanup_staged_modpack_archive(&download_plan.archive_path, &directories);
        (
            install_plan.profile,
            install_plan.loader_version,
            install_plan.mod_download_plan,
            Vec::new(),
        )
    } else if provider == "ftb_legacy" || provider == "ftb_private" {
        let download_plan = core_fetch_ftb_legacy_modpack_download_plan(&request, &directories)
            .await
            .map_err(|error| {
                native_operation_failure_message("Modpack install failed", &error.to_string())
            })?;
        execute_download_plan_recording_events(&download_plan.archive_download_plan, &event_log)
            .await?;
        let install_plan = core_build_ftb_legacy_modpack_archive_install_plan(
            &download_plan.archive_path,
            &download_plan,
            request.name.as_deref(),
            &directories,
        )
        .map_err(|error| {
            native_operation_failure_message("Modpack install failed", &error.to_string())
        })?;
        let extraction = core_extract_ftb_legacy_modpack_archive(
            &download_plan.archive_path,
            &install_plan,
            &directories,
        )
        .map_err(|error| {
            native_operation_failure_message("Modpack install failed", &error.to_string())
        })?;
        event_log
            .record_plan(&extraction)
            .map_err(|error| error.to_string())?;
        let _ = cleanup_staged_modpack_archive(&download_plan.archive_path, &directories);
        (
            install_plan.profile,
            install_plan.loader_version,
            DownloadPlan {
                version_id: format!("{}-ftb-legacy-files", request.project_id),
                items: Vec::new(),
            },
            Vec::new(),
        )
    } else if provider == "technic" {
        let download_plan = core_fetch_technic_modpack_download_plan(&request, &directories)
            .await
            .map_err(|error| {
                native_operation_failure_message("Modpack install failed", &error.to_string())
            })?;
        execute_download_plan_recording_events(&download_plan.archive_download_plan, &event_log)
            .await?;
        let install_plan = core_build_technic_modpack_archive_install_plan(
            &download_plan.archive_path,
            &download_plan,
            request.name.as_deref(),
            &directories,
        )
        .map_err(|error| {
            native_operation_failure_message("Modpack install failed", &error.to_string())
        })?;
        let extraction = core_extract_technic_modpack_archive(
            &download_plan.archive_path,
            &install_plan,
            &directories,
        )
        .map_err(|error| {
            native_operation_failure_message("Modpack install failed", &error.to_string())
        })?;
        event_log
            .record_plan(&extraction)
            .map_err(|error| error.to_string())?;
        let _ = cleanup_staged_modpack_archive(&download_plan.archive_path, &directories);
        (
            install_plan.profile,
            install_plan.loader_version,
            DownloadPlan {
                version_id: format!("{}-technic-files", request.project_id),
                items: Vec::new(),
            },
            Vec::new(),
        )
    } else if provider == "ftb" {
        let install_plan = core_fetch_ftb_modpack_install_plan(&request, &directories)
            .await
            .map_err(|error| {
                native_operation_failure_message("Modpack install failed", &error.to_string())
            })?;
        (
            install_plan.profile,
            install_plan.loader_version,
            install_plan.file_download_plan,
            Vec::new(),
        )
    } else {
        let install_plan = core_fetch_atlauncher_modpack_install_plan(&request, &directories)
            .await
            .map_err(|error| {
                native_operation_failure_message("Modpack install failed", &error.to_string())
            })?;
        (
            install_plan.profile,
            install_plan.loader_version,
            install_plan.file_download_plan,
            install_plan.extract_archives,
        )
    };

    let vanilla_plan =
        core_build_vanilla_download_plan(Some(profile.game_version.as_str()), &directories)
            .await
            .map_err(|error| {
                native_operation_failure_message("Modpack install failed", &error.to_string())
            })?;
    execute_download_plan_recording_events(&vanilla_plan, &event_log).await?;
    core_extract_native_libraries_from_download_plan(&vanilla_plan).map_err(|error| {
        native_operation_failure_message("Modpack install failed", &error.to_string())
    })?;

    let mut auxiliary_plan = file_download_plan.clone();
    if profile.loader != shared::ModLoader::Vanilla {
        let modloader_plan = core_build_modloader_download_plan_for_profile_with_loader_version(
            &profile,
            loader_version.as_deref(),
            &directories,
        )
        .map_err(|error| {
            native_operation_failure_message("Modpack install failed", &error.to_string())
        })?;
        auxiliary_plan.items.extend(modloader_plan.items);
    }

    execute_direct_pack_files_from_auxiliary_plan(&auxiliary_plan, &event_log).await?;
    if !atlauncher_extract_archives.is_empty() {
        let extraction =
            core_extract_atlauncher_archives(&atlauncher_extract_archives, &profile, &directories)
                .map_err(|error| {
                    native_operation_failure_message("Modpack install failed", &error.to_string())
                })?;
        event_log
            .record_plan(&extraction)
            .map_err(|error| error.to_string())?;
    }
    execute_modloader_metadata_and_dependencies_for_profile(
        &profile,
        &auxiliary_plan,
        &directories,
        &event_log,
    )
    .await
    .map_err(|error| native_operation_failure_message("Modpack install failed", &error))?;

    core_persist_installed_pack_profile(profile.clone()).map_err(|error| {
        native_operation_failure_message("Modpack install failed", &error.to_string())
    })?;
    let message = format!("{} installed successfully.", profile.name);
    event_log
        .record_event(completed_planned_native_operation_event(
            uuid::Uuid::new_v4(),
            LauncherOperation::InstallModpackArchive,
            profile.id.clone(),
            &message,
        ))
        .map_err(|error| error.to_string())?;
    Ok(completed_action_receipt(
        LauncherAction::InstallModpackArchive,
        profile.id,
        &message,
    ))
}

#[tauri::command(rename_all = "camelCase")]
async fn search_modrinth_modpacks(
    query: String,
    limit: Option<usize>,
) -> Result<Vec<ModrinthModpackSearchResult>, String> {
    core_search_modrinth_modpacks(query, limit.unwrap_or(12))
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn search_discover_modpacks(
    provider: String,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<DiscoverModpackSearchResult>, String> {
    core_search_discover_modpacks(provider, query, limit.unwrap_or(12))
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn resolve_modrinth_modpack_archive(
    project_id: String,
    version_id: Option<String>,
) -> Result<ModrinthModpackArchiveResolution, String> {
    if let Some(version_id) = version_id
        .as_deref()
        .map(str::trim)
        .filter(|version_id| !version_id.is_empty())
    {
        core_resolve_modrinth_modpack_archive_version(project_id, version_id)
            .await
            .map_err(|error| error.to_string())
    } else {
        core_resolve_modrinth_modpack_archive(project_id)
            .await
            .map_err(|error| error.to_string())
    }
}

#[tauri::command(rename_all = "camelCase")]
async fn install_pack(
    pack_id: String,
    registry: State<'_, ProcessRegistry>,
    event_log: State<'_, LauncherEventLog>,
    lifecycle_gate: State<'_, LifecycleOperationGate>,
) -> Result<ActionReceipt, String> {
    let _lifecycle_guard = lifecycle_gate.acquire(format!("installing pack '{pack_id}'"))?;
    if let Some(process) = active_managed_process_summary(&registry, &pack_id)? {
        return Err(profile_install_active_process_error(&pack_id, &process));
    }
    match install_pack_inner(pack_id.clone(), &event_log).await {
        Ok(receipt) => Ok(receipt),
        Err(error) => {
            let message = native_operation_failure_message("Pack install failed", &error.message);
            let event = match error.operation_id {
                Some(operation_id) => failed_planned_native_operation_event(
                    operation_id,
                    LauncherOperation::InstallPack,
                    pack_id,
                    message.clone(),
                ),
                None => failed_native_operation_event(
                    LauncherOperation::InstallPack,
                    pack_id,
                    message.clone(),
                ),
            };
            event_log.record_event(event).map_err(|record_error| {
                format!(
                    "{}; additionally failed to record install failure event: {record_error}",
                    error.message
                )
            })?;
            Err(message)
        }
    }
}

async fn install_pack_inner(
    pack_id: String,
    event_log: &LauncherEventLog,
) -> Result<ActionReceipt, NativeOperationError> {
    let plan = core_plan_install_pack_with_remote_catalog(&pack_id)
        .await
        .map_err(|error| NativeOperationError::unplanned(error.to_string()))?;
    event_log
        .record_plan(&plan)
        .map_err(|error| NativeOperationError::planned(plan.operation_id, error.to_string()))?;
    let install_profile = install_execution_profile(&pack_id)
        .await
        .map_err(|error| NativeOperationError::planned(plan.operation_id, error))?;
    let version_id = install_profile.game_version.clone();
    let directories = core_prepare_launcher_directories()
        .map_err(|error| NativeOperationError::planned(plan.operation_id, error.to_string()))?;
    let download_plan = core_build_vanilla_download_plan(Some(version_id.as_str()), &directories)
        .await
        .map_err(|error| NativeOperationError::planned(plan.operation_id, error.to_string()))?;
    execute_download_plan_recording_events(&download_plan, &event_log)
        .await
        .map_err(|error| NativeOperationError::planned(plan.operation_id, error))?;
    core_extract_native_libraries_from_download_plan(&download_plan)
        .map_err(|error| NativeOperationError::planned(plan.operation_id, error.to_string()))?;
    let auxiliary_plan =
        core_fetch_install_auxiliary_download_plan_for_pack_profile_with_remote_catalog(
            &install_profile,
            &directories,
        )
        .await
        .map_err(|error| NativeOperationError::planned(plan.operation_id, error.to_string()))?;
    let auxiliary_operation = core_plan_download_artifacts(&auxiliary_plan);
    event_log
        .record_plan(&auxiliary_operation)
        .map_err(|error| NativeOperationError::planned(plan.operation_id, error.to_string()))?;
    execute_direct_pack_files_from_auxiliary_plan(&auxiliary_plan, &event_log)
        .await
        .map_err(|error| NativeOperationError::planned(plan.operation_id, error))?;
    execute_modloader_metadata_and_dependencies_for_profile(
        &install_profile,
        &auxiliary_plan,
        &directories,
        &event_log,
    )
    .await
    .map_err(|error| NativeOperationError::planned(plan.operation_id, error))?;
    core_persist_installed_pack_profile(install_profile)
        .map_err(|error| NativeOperationError::planned(plan.operation_id, error.to_string()))?;
    let completion_message = install_pack_completion_message(&plan);
    event_log
        .record_event(completed_planned_native_operation_event(
            plan.operation_id,
            LauncherOperation::InstallPack,
            pack_id.clone(),
            completion_message,
        ))
        .map_err(|error| NativeOperationError::planned(plan.operation_id, error.to_string()))?;
    Ok(completed_action_receipt(
        LauncherAction::InstallPack,
        pack_id,
        completion_message,
    ))
}

#[tauri::command(rename_all = "camelCase")]
async fn plan_install_pack(pack_id: String) -> Result<OperationPlan, String> {
    core_plan_install_pack_with_remote_catalog(&pack_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn repair_profile(
    profile_id: String,
    registry: State<'_, ProcessRegistry>,
    event_log: State<'_, LauncherEventLog>,
    lifecycle_gate: State<'_, LifecycleOperationGate>,
) -> Result<ActionReceipt, String> {
    let _lifecycle_guard =
        lifecycle_gate.acquire(format!("setting up profile files for '{profile_id}'"))?;
    if let Some(process) = active_managed_process_summary(&registry, &profile_id)? {
        return Err(profile_repair_active_process_error(&profile_id, &process));
    }
    match repair_profile_inner(profile_id.clone(), &event_log, "Profile setup completed.").await {
        Ok(receipt) => Ok(receipt),
        Err(error) => {
            let message = native_operation_failure_message("Profile setup failed", &error.message);
            let event = match error.operation_id {
                Some(operation_id) => failed_planned_native_operation_event(
                    operation_id,
                    LauncherOperation::RepairProfile,
                    profile_id,
                    message.clone(),
                ),
                None => failed_native_operation_event(
                    LauncherOperation::RepairProfile,
                    profile_id,
                    message.clone(),
                ),
            };
            event_log.record_event(event).map_err(|record_error| {
                format!(
                    "{}; additionally failed to record setup failure event: {record_error}",
                    error.message
                )
            })?;
            Err(message)
        }
    }
}

#[tauri::command(rename_all = "camelCase")]
async fn prepare_profile(
    profile_id: String,
    registry: State<'_, ProcessRegistry>,
    event_log: State<'_, LauncherEventLog>,
    lifecycle_gate: State<'_, LifecycleOperationGate>,
) -> Result<ActionReceipt, String> {
    let _lifecycle_guard = lifecycle_gate.acquire(format!("preparing profile '{profile_id}'"))?;
    if let Some(process) = active_managed_process_summary(&registry, &profile_id)? {
        return Err(profile_repair_active_process_error(&profile_id, &process));
    }
    repair_profile_inner(profile_id.clone(), &event_log, "Profile setup completed.")
        .await
        .map(|_| {
            completed_action_receipt(
                LauncherAction::RepairProfile,
                profile_id,
                "Profile setup completed.",
            )
        })
        .map_err(|error| native_operation_failure_message("Profile setup failed", &error.message))
}

async fn repair_profile_inner(
    profile_id: String,
    event_log: &LauncherEventLog,
    completion_message: &'static str,
) -> Result<ActionReceipt, NativeOperationError> {
    let plan = core_plan_repair_profile(&profile_id)
        .map_err(|error| NativeOperationError::unplanned(error.to_string()))?;
    event_log
        .record_plan(&plan)
        .map_err(|error| NativeOperationError::planned(plan.operation_id, error.to_string()))?;
    let saved_profile = core_load_profiles()
        .map_err(|error| NativeOperationError::planned(plan.operation_id, error.to_string()))?
        .into_iter()
        .find(|profile| profile.id == profile_id)
        .ok_or_else(|| {
            NativeOperationError::planned(
                plan.operation_id,
                format!("profile '{profile_id}' was not found"),
            )
        })?;
    let repair_profile = repair_execution_profile(saved_profile)
        .await
        .map_err(|error| NativeOperationError::planned(plan.operation_id, error))?;
    let version_id = repair_profile.game_version.clone();
    let directories = core_prepare_launcher_directories()
        .map_err(|error| NativeOperationError::planned(plan.operation_id, error.to_string()))?;
    let download_plan = core_build_vanilla_download_plan(Some(version_id.as_str()), &directories)
        .await
        .map_err(|error| NativeOperationError::planned(plan.operation_id, error.to_string()))?;
    execute_download_plan_recording_events(&download_plan, &event_log)
        .await
        .map_err(|error| NativeOperationError::planned(plan.operation_id, error))?;
    core_extract_native_libraries_from_download_plan(&download_plan)
        .map_err(|error| NativeOperationError::planned(plan.operation_id, error.to_string()))?;
    let auxiliary_plan = core_fetch_repair_auxiliary_download_plan_for_profile_with_remote_catalog(
        &repair_profile,
        &directories,
    )
    .await
    .map_err(|error| NativeOperationError::planned(plan.operation_id, error.to_string()))?;
    let auxiliary_operation = core_plan_download_artifacts(&auxiliary_plan);
    event_log
        .record_plan(&auxiliary_operation)
        .map_err(|error| NativeOperationError::planned(plan.operation_id, error.to_string()))?;
    execute_direct_pack_files_from_auxiliary_plan(&auxiliary_plan, &event_log)
        .await
        .map_err(|error| NativeOperationError::planned(plan.operation_id, error))?;
    execute_modloader_metadata_and_dependencies_for_profile(
        &repair_profile,
        &auxiliary_plan,
        &directories,
        &event_log,
    )
    .await
    .map_err(|error| NativeOperationError::planned(plan.operation_id, error))?;
    core_persist_installed_pack_profile(repair_profile)
        .map_err(|error| NativeOperationError::planned(plan.operation_id, error.to_string()))?;
    event_log
        .record_event(completed_planned_native_operation_event(
            plan.operation_id,
            LauncherOperation::RepairProfile,
            profile_id.clone(),
            completion_message,
        ))
        .map_err(|error| NativeOperationError::planned(plan.operation_id, error.to_string()))?;
    Ok(completed_action_receipt(
        LauncherAction::RepairProfile,
        profile_id,
        completion_message,
    ))
}

async fn repair_execution_profile(profile: ProfileSummary) -> Result<ProfileSummary, String> {
    if profile.installed_pack_version.is_none() {
        return Ok(profile);
    }
    let live_profile = core_fetch_pack_install_profile_with_remote_catalog(&profile.id)
        .await
        .map_err(|error| error.to_string())?;
    Ok(merge_pack_profile_with_launch_customizations(
        live_profile,
        profile,
    ))
}

async fn install_execution_profile(pack_id: &str) -> Result<ProfileSummary, String> {
    let live_profile = core_fetch_pack_install_profile_with_remote_catalog(pack_id)
        .await
        .map_err(|error| error.to_string())?;
    let saved_profile = core_load_profiles()
        .ok()
        .and_then(|profiles| profiles.into_iter().find(|profile| profile.id == pack_id));
    Ok(match saved_profile {
        Some(saved_profile) => {
            merge_pack_profile_with_launch_customizations(live_profile, saved_profile)
        }
        None => live_profile,
    })
}

fn merge_pack_profile_with_launch_customizations(
    mut live_profile: ProfileSummary,
    saved_profile: ProfileSummary,
) -> ProfileSummary {
    live_profile.memory_mb = saved_profile.memory_mb;
    live_profile.jvm_args = saved_profile.jvm_args;
    live_profile.resolution = saved_profile.resolution;
    live_profile.default_server = saved_profile.default_server;
    live_profile.java_runtime_override_path = saved_profile.java_runtime_override_path;
    live_profile.last_played = saved_profile.last_played;
    live_profile
}

#[tauri::command(rename_all = "camelCase")]
async fn plan_repair_profile(profile_id: String) -> Result<OperationPlan, String> {
    core_plan_repair_profile(&profile_id).map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn list_launcher_events(
    limit: Option<usize>,
    event_log: State<'_, LauncherEventLog>,
) -> Result<Vec<LauncherEvent>, String> {
    event_log.list(limit).map_err(|error| error.to_string())
}

#[tauri::command]
async fn create_profile(request: CreateProfileRequest) -> Result<ProfileSummary, String> {
    core_create_profile(request).map_err(|error| error.to_string())
}

#[tauri::command]
async fn update_profile(
    request: UpdateProfileRequest,
    registry: State<'_, ProcessRegistry>,
) -> Result<ProfileSummary, String> {
    let requested_id = request.id.clone();
    let processes = registry.list().map_err(|error| error.to_string())?;
    if let Some(process) = active_managed_process_for_profile(&processes, &requested_id) {
        return Err(profile_update_active_process_error(&requested_id, process));
    }
    core_update_profile(request).map_err(|error| error.to_string())
}

#[tauri::command]
async fn archive_profile(
    request: ArchiveProfileRequest,
    registry: State<'_, ProcessRegistry>,
) -> Result<ProfileSummary, String> {
    let requested_id = request.id.clone();
    let processes = registry.list().map_err(|error| error.to_string())?;
    if let Some(process) = active_managed_process_for_profile(&processes, &requested_id) {
        return Err(profile_archive_active_process_error(&requested_id, process));
    }
    core_archive_profile(request).map_err(|error| error.to_string())
}

#[tauri::command]
async fn duplicate_profile(
    request: DuplicateProfileRequest,
    registry: State<'_, ProcessRegistry>,
    lifecycle_gate: State<'_, LifecycleOperationGate>,
) -> Result<ProfileSummary, String> {
    let requested_id = request.id.clone();
    let _lifecycle_guard =
        lifecycle_gate.acquire(format!("duplicating profile '{requested_id}'"))?;
    let processes = registry.list().map_err(|error| error.to_string())?;
    if let Some(process) = active_managed_process_for_profile(&processes, &requested_id) {
        return Err(profile_duplicate_active_process_error(
            &requested_id,
            process,
        ));
    }
    core_duplicate_profile(request).map_err(|error| error.to_string())
}

#[tauri::command]
async fn delete_profile(
    request: DeleteProfileRequest,
    registry: State<'_, ProcessRegistry>,
    event_log: State<'_, LauncherEventLog>,
    lifecycle_gate: State<'_, LifecycleOperationGate>,
) -> Result<ActionReceipt, String> {
    let requested_id = request.id.clone();
    let _lifecycle_guard = lifecycle_gate.acquire(format!("deleting profile '{requested_id}'"))?;
    let processes = registry.list().map_err(|error| error.to_string())?;
    if let Some(process) = active_managed_process_for_profile(&processes, &requested_id) {
        let message = profile_delete_active_process_error(&requested_id, process);
        event_log
            .record_event(failed_native_operation_event(
                LauncherOperation::DeleteProfile,
                requested_id,
                message.clone(),
            ))
            .map_err(|error| error.to_string())?;
        return Err(message);
    }

    match core_delete_profile(request) {
        Ok(profile) => {
            let message = delete_profile_success_message(&profile);
            event_log
                .record_event(completed_native_operation_event(
                    LauncherOperation::DeleteProfile,
                    profile.id.clone(),
                    message.clone(),
                ))
                .map_err(|error| error.to_string())?;
            Ok(completed_action_receipt(
                LauncherAction::DeleteProfile,
                profile.id,
                message,
            ))
        }
        Err(error) => {
            let message =
                native_operation_failure_message("Profile delete failed", &error.to_string());
            event_log
                .record_event(failed_native_operation_event(
                    LauncherOperation::DeleteProfile,
                    requested_id,
                    message.clone(),
                ))
                .map_err(|record_error| {
                    format!(
                        "{error}; additionally failed to record delete failure event: {record_error}"
                    )
                })?;
            Err(message)
        }
    }
}

#[tauri::command]
async fn discover_java_runtimes() -> Result<Vec<JavaRuntimeSummary>, String> {
    Ok(core_discover_java_runtimes())
}

#[tauri::command]
async fn recommended_java_runtime_manifest() -> Result<Vec<JavaRuntimeManifestEntry>, String> {
    core_fetch_recommended_java_runtime_manifest()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn scan_imports() -> Result<Vec<ImportCandidate>, String> {
    core_scan_imports().map_err(|error| error.to_string())
}

#[tauri::command]
async fn plan_profile_import(request: ImportPlanRequest) -> Result<ImportPlan, String> {
    core_plan_profile_import(request).map_err(|error| error.to_string())
}

#[tauri::command]
async fn execute_profile_import(
    plan: ImportPlan,
    event_log: State<'_, LauncherEventLog>,
    lifecycle_gate: State<'_, LifecycleOperationGate>,
) -> Result<OperationPlan, String> {
    let _lifecycle_guard = lifecycle_gate.acquire("importing profile")?;
    let operation =
        core_execute_import_plan_and_persist_profile(&plan).map_err(|error| error.to_string())?;
    event_log
        .record_plan(&operation)
        .map_err(|error| error.to_string())?;
    Ok(operation)
}

#[tauri::command]
async fn save_settings(settings: LauncherSettings) -> Result<LauncherSettings, String> {
    core_save_settings(&settings).map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn resolve_minecraft_version(
    version_id: Option<String>,
) -> Result<MinecraftVersionSummary, String> {
    let manifest = fetch_minecraft_version_manifest()
        .await
        .map_err(|error| error.to_string())?;
    core_resolve_minecraft_version(&manifest, version_id.as_deref())
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn list_minecraft_versions() -> Result<Vec<MinecraftVersionSummary>, String> {
    let manifest = fetch_minecraft_version_manifest()
        .await
        .map_err(|error| error.to_string())?;
    Ok(core_minecraft_version_summaries(&manifest))
}

#[tauri::command(rename_all = "camelCase")]
async fn build_vanilla_download_plan(version_id: Option<String>) -> Result<DownloadPlan, String> {
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    core_build_vanilla_download_plan(version_id.as_deref(), &directories)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn build_curated_pack_file_download_plan(pack_id: String) -> Result<DownloadPlan, String> {
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    core_build_curated_pack_file_download_plan(&pack_id, &directories)
        .map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn build_modloader_download_plan(profile_id: String) -> Result<DownloadPlan, String> {
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    core_build_modloader_download_plan(&profile_id, &directories).map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn build_install_auxiliary_download_plan(pack_id: String) -> Result<DownloadPlan, String> {
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    core_build_install_auxiliary_download_plan(&pack_id, &directories)
        .map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn build_repair_auxiliary_download_plan(profile_id: String) -> Result<DownloadPlan, String> {
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    core_build_repair_auxiliary_download_plan(&profile_id, &directories)
        .map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn build_managed_java_runtime_download_plan(
    request: JavaRuntimeDownloadRequest,
) -> Result<DownloadPlan, String> {
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    core_build_managed_java_runtime_download_plan(request, &directories)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn execute_download_plan(
    plan: DownloadPlan,
    event_log: State<'_, LauncherEventLog>,
    lifecycle_gate: State<'_, LifecycleOperationGate>,
) -> Result<OperationPlan, String> {
    let _lifecycle_guard = lifecycle_gate.acquire("executing download plan")?;
    execute_download_plan_recording_events(&plan, &event_log).await
}

#[tauri::command]
async fn plan_managed_java_runtime_install(
    plan: DownloadPlan,
    event_log: State<'_, LauncherEventLog>,
) -> Result<OperationPlan, String> {
    let operation =
        core_plan_managed_java_runtime_install(&plan).map_err(|error| error.to_string())?;
    event_log
        .record_plan(&operation)
        .map_err(|error| error.to_string())?;
    Ok(operation)
}

#[tauri::command]
async fn execute_managed_java_runtime_install(
    plan: DownloadPlan,
    event_log: State<'_, LauncherEventLog>,
    lifecycle_gate: State<'_, LifecycleOperationGate>,
) -> Result<OperationPlan, String> {
    let _lifecycle_guard = lifecycle_gate.acquire("installing managed Java runtime")?;
    let operation =
        core_execute_managed_java_runtime_install(&plan).map_err(|error| error.to_string())?;
    event_log
        .record_plan(&operation)
        .map_err(|error| error.to_string())?;
    Ok(operation)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter("theboyslauncher=debug,launcher_core=debug")
        .with_target(false)
        .try_init()
        .ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            write_packaged_smoke_auth_flow_probe()
                .map_err(|error| tauri::Error::Anyhow(anyhow::anyhow!(error)))?;
            write_packaged_smoke_account_lifecycle_probe()
                .map_err(|error| tauri::Error::Anyhow(anyhow::anyhow!(error)))?;
            write_packaged_smoke_profile_lifecycle_probe()
                .map_err(|error| tauri::Error::Anyhow(anyhow::anyhow!(error)))?;
            write_packaged_smoke_import_lifecycle_probe()
                .map_err(|error| tauri::Error::Anyhow(anyhow::anyhow!(error)))?;
            write_packaged_smoke_update_handoff_probe()
                .map_err(|error| tauri::Error::Anyhow(anyhow::anyhow!(error)))?;
            write_packaged_smoke_launch_preflight_probe()
                .map_err(|error| tauri::Error::Anyhow(anyhow::anyhow!(error)))?;
            app.manage(ProcessRegistry::new());
            app.manage(LauncherEventLog::new());
            app.manage(LifecycleOperationGate::default());
            {
                let event_log = app.state::<LauncherEventLog>();
                tauri::async_runtime::block_on(write_packaged_smoke_packwiz_install_probe(
                    &event_log,
                ))
                .map_err(|error| tauri::Error::Anyhow(anyhow::anyhow!(error)))?;
            }
            write_packaged_smoke_java_recovery_probe()
                .map_err(|error| tauri::Error::Anyhow(anyhow::anyhow!(error)))?;
            tauri::async_runtime::block_on(write_packaged_smoke_discover_routing_probe())
                .map_err(|error| tauri::Error::Anyhow(anyhow::anyhow!(error)))?;
            {
                let registry = app.state::<ProcessRegistry>();
                tauri::async_runtime::block_on(write_packaged_smoke_auth_recovery_probe(
                    &registry,
                ))
                .map_err(|error| tauri::Error::Anyhow(anyhow::anyhow!(error)))?;
            }
            {
                let registry = app.state::<ProcessRegistry>();
                let event_log = app.state::<LauncherEventLog>();
                tauri::async_runtime::block_on(write_packaged_smoke_stored_auth_launch_probe(
                    &registry, &event_log,
                ))
                .map_err(|error| tauri::Error::Anyhow(anyhow::anyhow!(error)))?;
            }
            {
                let event_log = app.state::<LauncherEventLog>();
                write_packaged_smoke_modrinth_archive_install_probe(&event_log)
                    .map_err(|error| tauri::Error::Anyhow(anyhow::anyhow!(error)))?;
            }
            {
                let event_log = app.state::<LauncherEventLog>();
                write_packaged_smoke_curseforge_archive_install_probe(&event_log)
                    .map_err(|error| tauri::Error::Anyhow(anyhow::anyhow!(error)))?;
            }
            {
                let event_log = app.state::<LauncherEventLog>();
                write_packaged_smoke_ftb_legacy_archive_install_probe(&event_log)
                    .map_err(|error| tauri::Error::Anyhow(anyhow::anyhow!(error)))?;
            }
            {
                let event_log = app.state::<LauncherEventLog>();
                write_packaged_smoke_ftb_install_probe(&event_log)
                    .map_err(|error| tauri::Error::Anyhow(anyhow::anyhow!(error)))?;
            }
            {
                let event_log = app.state::<LauncherEventLog>();
                write_packaged_smoke_technic_archive_install_probe(&event_log)
                    .map_err(|error| tauri::Error::Anyhow(anyhow::anyhow!(error)))?;
            }
            {
                let event_log = app.state::<LauncherEventLog>();
                write_packaged_smoke_atlauncher_install_probe(&event_log)
                    .map_err(|error| tauri::Error::Anyhow(anyhow::anyhow!(error)))?;
            }
            {
                let registry = app.state::<ProcessRegistry>();
                let event_log = app.state::<LauncherEventLog>();
                write_packaged_smoke_process_lifecycle_probe(&registry, &event_log)
                    .map_err(|error| tauri::Error::Anyhow(anyhow::anyhow!(error)))?;
            }
            {
                let event_log = app.state::<LauncherEventLog>();
                tauri::async_runtime::block_on(write_packaged_smoke_activity_progress_probe(
                    &event_log,
                ))
                .map_err(|error| tauri::Error::Anyhow(anyhow::anyhow!(error)))?;
            }
            let resource_dir = app.path().resource_dir().ok();
            let app_data_dir = app.path().app_data_dir().ok();
            let social_backend = SocialBackendService::from_env(resource_dir, app_data_dir)
                .map_err(|error| tauri::Error::Anyhow(anyhow::anyhow!(error)))?;
            app.manage(social_backend);

            let event_log = app.state::<LauncherEventLog>();
            let event_rx = event_log
                .subscribe()
                .map_err(|error| tauri::Error::Anyhow(error.into()))?;
            let process_registry = app.state::<ProcessRegistry>();
            let process_rx = process_registry
                .subscribe()
                .map_err(|error| tauri::Error::Anyhow(error.into()))?;
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                while let Ok(event) = event_rx.recv() {
                    let _ = app_handle.emit("launcher-event", event);
                }
            });
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                while let Ok(process) = process_rx.recv() {
                    if let Some(event) = core_managed_process_lifecycle_event(&process) {
                        let event_log = app_handle.state::<LauncherEventLog>();
                        let _ = event_log.record_event(event);
                    }
                    let _ = app_handle.emit("managed-process", process);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap_snapshot,
            start_microsoft_login,
            start_microsoft_auth_flow,
            open_microsoft_auth_url,
            plan_microsoft_token_exchange,
            exchange_microsoft_authorization_code,
            complete_microsoft_login_with_local_callback,
            authenticate_with_xbox_live,
            authorize_xsts_for_minecraft,
            login_minecraft_with_xbox,
            fetch_minecraft_entitlements,
            fetch_minecraft_profile,
            authenticate_minecraft_session,
            authenticate_and_save_minecraft_session,
            load_minecraft_session,
            list_minecraft_accounts,
            refresh_saved_minecraft_session,
            exchange_stored_minecraft_session_for_backend_session,
            save_minecraft_session,
            select_minecraft_account,
            remove_minecraft_account,
            clear_minecraft_session,
            social_backend_status,
            open_external_url,
            start_social_backend,
            stop_social_backend,
            launch_profile,
            build_launch_command,
            build_launch_command_for_server,
            build_authenticated_launch_command,
            build_stored_authenticated_launch_command,
            start_launch_process,
            start_authenticated_launch_process,
            start_stored_authenticated_launch_process,
            start_launch_process_for_server,
            list_managed_processes,
            clear_exited_managed_processes,
            stop_managed_process,
            export_managed_process_log,
            reveal_exported_process_log,
            open_profile_folder,
            open_launcher_directory,
            install_modpack_archive,
            install_discover_modpack,
            search_modrinth_modpacks,
            search_discover_modpacks,
            resolve_modrinth_modpack_archive,
            install_pack,
            plan_install_pack,
            repair_profile,
            prepare_profile,
            plan_repair_profile,
            list_launcher_events,
            create_profile,
            update_profile,
            archive_profile,
            duplicate_profile,
            delete_profile,
            discover_java_runtimes,
            recommended_java_runtime_manifest,
            scan_imports,
            plan_profile_import,
            execute_profile_import,
            save_settings,
            resolve_minecraft_version,
            list_minecraft_versions,
            build_vanilla_download_plan,
            build_curated_pack_file_download_plan,
            build_modloader_download_plan,
            build_install_auxiliary_download_plan,
            build_repair_auxiliary_download_plan,
            build_managed_java_runtime_download_plan,
            execute_download_plan,
            plan_managed_java_runtime_install,
            execute_managed_java_runtime_install
        ])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                let backend = window.state::<SocialBackendService>();
                if let Err(error) = backend.stop_managed_child() {
                    tracing::warn!(%error, "failed to stop managed social backend during window shutdown");
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run TheBoysLauncher");
}

#[cfg(test)]
mod tests {
    use super::*;

    struct LauncherDirEnvGuard {
        previous: Vec<(&'static str, Option<OsString>)>,
    }

    impl LauncherDirEnvGuard {
        fn isolated() -> Self {
            let keys = [
                "THEBOYS_LAUNCHER_ROOT_DIR",
                "THEBOYS_LAUNCHER_DATA_DIR",
                "THEBOYS_LAUNCHER_CONFIG_DIR",
                "THEBOYS_LAUNCHER_CACHE_DIR",
                "THEBOYS_LAUNCHER_LOG_DIR",
            ];
            let previous = keys
                .iter()
                .map(|key| (*key, std::env::var_os(key)))
                .collect::<Vec<_>>();
            for key in keys {
                std::env::remove_var(key);
            }
            Self { previous }
        }
    }

    impl Drop for LauncherDirEnvGuard {
        fn drop(&mut self) {
            for (key, value) in self.previous.iter() {
                match value {
                    Some(value) => std::env::set_var(key, value),
                    None => std::env::remove_var(key),
                }
            }
        }
    }

    static MICROSOFT_CLIENT_ID_ENV_LOCK: Mutex<()> = Mutex::new(());

    struct MicrosoftClientIdEnvGuard {
        _lock: std::sync::MutexGuard<'static, ()>,
        previous: Option<OsString>,
    }

    impl MicrosoftClientIdEnvGuard {
        fn unset() -> Self {
            let lock = MICROSOFT_CLIENT_ID_ENV_LOCK
                .lock()
                .expect("Microsoft client id env lock should be available");
            let previous = std::env::var_os(MICROSOFT_CLIENT_ID_ENV);
            std::env::remove_var(MICROSOFT_CLIENT_ID_ENV);
            Self {
                _lock: lock,
                previous,
            }
        }

        fn set(value: &str) -> Self {
            let lock = MICROSOFT_CLIENT_ID_ENV_LOCK
                .lock()
                .expect("Microsoft client id env lock should be available");
            let previous = std::env::var_os(MICROSOFT_CLIENT_ID_ENV);
            std::env::set_var(MICROSOFT_CLIENT_ID_ENV, value);
            Self {
                _lock: lock,
                previous,
            }
        }
    }

    impl Drop for MicrosoftClientIdEnvGuard {
        fn drop(&mut self) {
            match self.previous.as_ref() {
                Some(value) => std::env::set_var(MICROSOFT_CLIENT_ID_ENV, value),
                None => std::env::remove_var(MICROSOFT_CLIENT_ID_ENV),
            }
        }
    }

    static BACKEND_ENV_LOCK: Mutex<()> = Mutex::new(());

    struct BackendEnvGuard {
        _lock: std::sync::MutexGuard<'static, ()>,
        previous: Vec<(&'static str, Option<OsString>)>,
    }

    impl BackendEnvGuard {
        fn isolated() -> Self {
            let lock = BACKEND_ENV_LOCK
                .lock()
                .expect("backend env lock should be available");
            let keys = [
                SOCIAL_BACKEND_URL_ENV,
                "THEBOYS_BACKEND_BIND",
                "THEBOYS_BACKEND_STATE_PATH",
                "THEBOYS_BACKEND_SESSION_SECRET",
                "THEBOYS_BACKEND_EXE",
            ];
            let previous = keys
                .iter()
                .map(|key| (*key, std::env::var_os(key)))
                .collect::<Vec<_>>();
            for key in keys {
                std::env::remove_var(key);
            }
            Self {
                _lock: lock,
                previous,
            }
        }

        fn set(&self, key: &str, value: impl AsRef<std::ffi::OsStr>) {
            std::env::set_var(key, value);
        }
    }

    impl Drop for BackendEnvGuard {
        fn drop(&mut self) {
            for (key, value) in self.previous.iter() {
                match value {
                    Some(value) => std::env::set_var(key, value),
                    None => std::env::remove_var(key),
                }
            }
        }
    }

    fn stored_session_with_expiry(expires_at_unix_seconds: Option<u64>) -> StoredMinecraftSession {
        StoredMinecraftSession {
            session: MinecraftSession {
                username: "Player".to_owned(),
                uuid: Uuid::new_v4(),
                access_token: "minecraft-access-token".to_owned(),
            },
            account_id: None,
            expires_at_unix_seconds,
            microsoft_refresh_token: Some("refresh-token".to_owned()),
            microsoft_client_id: Some("client-id".to_owned()),
            microsoft_user_id: Some("microsoft-user".to_owned()),
            microsoft_scopes: Some("XboxLive.signin offline_access".to_owned()),
            stored_at_unix_seconds: 1,
        }
    }

    #[test]
    fn microsoft_client_id_defaults_to_packaged_public_app_id() {
        let _guard = MicrosoftClientIdEnvGuard::unset();

        assert_eq!(microsoft_client_id(), DEFAULT_MICROSOFT_CLIENT_ID);
    }

    #[test]
    fn microsoft_client_id_can_be_overridden_for_development() {
        let _guard = MicrosoftClientIdEnvGuard::set("local-client-id");

        assert_eq!(microsoft_client_id(), "local-client-id");
    }

    #[test]
    fn lifecycle_operation_gate_rejects_concurrent_operations() {
        let gate = LifecycleOperationGate::default();
        let _guard = gate
            .acquire("installing pack 'winterpack'")
            .expect("first lifecycle operation should acquire gate");

        let error = match gate.acquire("setting up profile files for 'winterpack'") {
            Ok(_) => panic!("second lifecycle operation should be rejected"),
            Err(error) => error,
        };

        assert!(error.contains("another launcher lifecycle operation is already running"));
        assert!(error.contains("installing pack 'winterpack'"));
        assert_eq!(
            gate.active_description().unwrap().as_deref(),
            Some("installing pack 'winterpack'")
        );
    }

    #[test]
    fn lifecycle_operation_gate_releases_after_guard_drops() {
        let gate = LifecycleOperationGate::default();
        {
            let _guard = gate
                .acquire("installing pack 'winterpack'")
                .expect("first lifecycle operation should acquire gate");
        }

        let _next_guard = gate
            .acquire("setting up profile files for 'winterpack'")
            .expect("dropped lifecycle guard should release gate");

        assert_eq!(
            gate.active_description().unwrap().as_deref(),
            Some("setting up profile files for 'winterpack'")
        );
    }

    #[test]
    fn repair_profile_merge_keeps_user_launch_customizations() {
        let live_profile = ProfileSummary {
            id: "winterpack".to_owned(),
            name: "WinterPack".to_owned(),
            loader: shared::ModLoader::Forge,
            game_version: "1.20.1".to_owned(),
            installed_pack_version: Some("2.3.7".to_owned()),
            last_played: None,
            memory_mb: 6144,
            jvm_args: Vec::new(),
            resolution: None,
            default_server: None,
            java_runtime_override_path: None,
        };
        let saved_profile = ProfileSummary {
            id: "winterpack".to_owned(),
            name: "WinterPack".to_owned(),
            loader: shared::ModLoader::Fabric,
            game_version: "1.21.1".to_owned(),
            installed_pack_version: Some("10/30/2025".to_owned()),
            last_played: Some("Yesterday".to_owned()),
            memory_mb: 8192,
            jvm_args: vec!["-Dtheboys.custom=true".to_owned()],
            resolution: Some(shared::ProfileResolution {
                width: 1600,
                height: 900,
            }),
            default_server: Some(ServerLaunchTarget {
                name: Some("Cabin".to_owned()),
                address: "play.example.test".to_owned(),
                port: Some(25565),
            }),
            java_runtime_override_path: Some("C:/Java/21/bin/java.exe".to_owned()),
        };

        let merged = merge_pack_profile_with_launch_customizations(live_profile, saved_profile);

        assert_eq!(merged.loader, shared::ModLoader::Forge);
        assert_eq!(merged.game_version, "1.20.1");
        assert_eq!(merged.installed_pack_version.as_deref(), Some("2.3.7"));
        assert_eq!(merged.memory_mb, 8192);
        assert_eq!(merged.jvm_args, vec!["-Dtheboys.custom=true"]);
        assert_eq!(merged.last_played.as_deref(), Some("Yesterday"));
        assert_eq!(
            merged.resolution.as_ref().map(|value| value.width),
            Some(1600)
        );
        assert_eq!(
            merged
                .default_server
                .as_ref()
                .map(|value| value.address.as_str()),
            Some("play.example.test")
        );
        assert_eq!(
            merged.java_runtime_override_path.as_deref(),
            Some("C:/Java/21/bin/java.exe")
        );
    }

    #[test]
    fn renderer_safe_session_removes_microsoft_refresh_metadata() {
        let session = stored_session_with_expiry(Some(2_000));

        let redacted = renderer_safe_minecraft_session(session.clone());

        assert_eq!(redacted.session.username, session.session.username);
        assert_eq!(redacted.session.uuid, session.session.uuid);
        assert_eq!(redacted.session.access_token, REDACTED_RENDERER_TOKEN);
        assert_eq!(redacted.account_id, session.account_id);
        assert_eq!(
            redacted.expires_at_unix_seconds,
            session.expires_at_unix_seconds
        );
        assert_eq!(
            redacted.stored_at_unix_seconds,
            session.stored_at_unix_seconds
        );
        assert!(redacted.microsoft_refresh_token.is_none());
        assert_eq!(
            redacted.microsoft_client_id.as_deref(),
            session.microsoft_client_id.as_deref()
        );
        assert!(redacted.microsoft_user_id.is_none());
        assert!(redacted.microsoft_scopes.is_none());
    }

    #[test]
    fn renderer_safe_minecraft_session_error_hides_refresh_details() {
        for raw in [
            "stored Minecraft session does not include a Microsoft refresh token",
            "Microsoft token exchange failed: invalid_grant: Refresh token expired",
            "stored Minecraft session does not include a Microsoft OAuth client id",
            "no stored Minecraft session is available",
        ] {
            let message = renderer_safe_minecraft_session_error(raw);

            assert_eq!(
                message,
                "Minecraft sign-in needs to be refreshed. Sign in again to continue."
            );
            assert!(!message.to_ascii_lowercase().contains("refresh token"));
            assert!(!message.contains("invalid_grant"));
            assert!(!message.contains("OAuth"));
        }
    }

    #[test]
    fn renderer_safe_friends_session_error_hides_backend_details() {
        for raw in [
            "stored Minecraft session does not include a Microsoft refresh token",
            "Minecraft backend session exchange failed with HTTP status 500 Internal Server Error",
            "Minecraft backend session response was invalid: expected value",
            "Minecraft backend session exchange failed: error sending request",
        ] {
            let message = renderer_safe_friends_session_error(raw);

            assert!(!message.to_ascii_lowercase().contains("refresh token"));
            assert!(!message.to_ascii_lowercase().contains("backend"));
            assert!(!message.contains("HTTP status"));
            assert!(!message.contains("error sending request"));
        }
        assert_eq!(
            renderer_safe_friends_session_error(
                "stored Minecraft session does not include a Microsoft refresh token"
            ),
            "Sign in to use friends."
        );
        assert_eq!(
            renderer_safe_friends_session_error(
                "Minecraft backend session exchange failed with HTTP status 500 Internal Server Error"
            ),
            "Friends service sign-in is unavailable right now. Minecraft still works."
        );
    }

    #[tokio::test]
    async fn stored_session_launch_refresh_failure_records_safe_activity_message() {
        let _guard = LauncherDirEnvGuard::isolated();
        let root = tempfile::tempdir().expect("tempdir should be available");
        std::env::set_var("THEBOYS_LAUNCHER_ROOT_DIR", root.path());
        let mut expired = stored_session_with_expiry(Some(2));
        expired.microsoft_refresh_token = None;
        expired.microsoft_client_id = None;
        expired.microsoft_user_id = None;
        expired.microsoft_scopes = None;
        core_save_minecraft_session(expired).expect("expired session fixture should save");

        let message = load_or_refresh_stored_minecraft_session_for_launch()
            .await
            .expect_err("expired stored session without refresh token should require sign-in");
        let event_log = LauncherEventLog::new();
        record_launch_planning_failure("latest-release", message.clone(), &event_log)
            .expect("safe launch failure should be recorded");

        assert_eq!(
            message,
            "Minecraft sign-in needs to be refreshed. Sign in again to continue."
        );
        let events = event_log.list(None).expect("event log should list events");
        assert!(!events.is_empty());
        for event in &events {
            assert!(!event.message.to_ascii_lowercase().contains("refresh token"));
            assert!(!event.message.contains("stored Minecraft session"));
        }
        let event = events
            .iter()
            .find(|event| event.kind == LauncherEventKind::Failed)
            .expect("launch failure event should be recorded");
        assert_eq!(event.operation, Some(LauncherOperation::LaunchProfile));
        assert_eq!(event.subject_id.as_deref(), Some("latest-release"));
        assert!(event.message.contains(&message));
    }

    #[test]
    fn renderer_redacted_session_cannot_be_saved_back_to_native_store() {
        let mut session = stored_session_with_expiry(Some(2_000));
        session.session.access_token = REDACTED_RENDERER_TOKEN.to_owned();

        let error = ensure_renderer_session_can_be_saved(&session)
            .expect_err("redacted renderer token should be rejected");

        assert!(error.contains("renderer-redacted Minecraft sessions cannot be saved"));
    }

    #[test]
    fn packaged_smoke_modrinth_archive_fixture_is_readable() {
        let root = tempfile::tempdir().expect("tempdir should be available");
        let archive_path = root.path().join("PackagedSmokeModrinth.mrpack");
        write_packaged_smoke_modrinth_archive(&archive_path)
            .expect("packaged Modrinth smoke archive should write");
        let directories = LauncherDirectories {
            data_dir: root.path().join("data").to_string_lossy().to_string(),
            config_dir: root.path().join("config").to_string_lossy().to_string(),
            cache_dir: root.path().join("cache").to_string_lossy().to_string(),
            log_dir: root.path().join("logs").to_string_lossy().to_string(),
        };

        assert!(core_modpack_archive_contains_modrinth_index(&archive_path)
            .expect("archive should be readable"));
        let plan = core_build_modrinth_modpack_archive_install_plan(
            &archive_path,
            Some("Packaged Smoke Modrinth"),
            &directories,
        )
        .expect("Modrinth smoke archive should plan");

        assert_eq!(plan.profile.id, "packaged-smoke-modrinth");
        assert_eq!(plan.profile.loader, shared::ModLoader::Vanilla);
        assert_eq!(plan.profile.game_version, "1.21.8");
        assert_eq!(
            plan.profile.installed_pack_version.as_deref(),
            Some("packaged-modrinth-version")
        );
        assert!(plan.file_download_plan.items.is_empty());
    }

    #[test]
    fn packaged_smoke_curseforge_archive_fixture_is_readable() {
        let root = tempfile::tempdir().expect("tempdir should be available");
        let archive_path = root.path().join("PackagedSmokeCurseForge.zip");
        write_packaged_smoke_curseforge_archive(&archive_path)
            .expect("packaged CurseForge smoke archive should write");
        let directories = LauncherDirectories {
            data_dir: root.path().join("data").to_string_lossy().to_string(),
            config_dir: root.path().join("config").to_string_lossy().to_string(),
            cache_dir: root.path().join("cache").to_string_lossy().to_string(),
            log_dir: root.path().join("logs").to_string_lossy().to_string(),
        };

        let plan = core_build_curseforge_modpack_archive_install_plan(
            &archive_path,
            Some("Packaged Smoke CurseForge"),
            &directories,
        )
        .expect("CurseForge smoke archive should plan");

        assert_eq!(plan.profile.id, "packaged-smoke-curseforge");
        assert_eq!(plan.profile.loader, shared::ModLoader::Vanilla);
        assert_eq!(plan.profile.game_version, "1.21.8");
        assert_eq!(
            plan.profile.installed_pack_version.as_deref(),
            Some("packaged-curseforge-version")
        );
        assert!(plan.mod_download_plan.items.is_empty());

        core_extract_curseforge_modpack_archive(&archive_path, &plan, &directories)
            .expect("CurseForge smoke archive should extract");
        assert!(root
            .path()
            .join("data/profiles/packaged-smoke-curseforge/config/packaged.cfg")
            .is_file());
        assert!(root
            .path()
            .join("data/profiles/packaged-smoke-curseforge/.theboys/curseforge/manifest.json")
            .is_file());
    }

    #[test]
    fn packaged_smoke_ftb_legacy_archive_fixture_is_readable() {
        let root = tempfile::tempdir().expect("tempdir should be available");
        let archive_path = root.path().join("PackagedSmokeFTBLegacy.zip");
        write_packaged_smoke_ftb_legacy_archive(&archive_path)
            .expect("packaged FTB Legacy smoke archive should write");
        let directories = LauncherDirectories {
            data_dir: root.path().join("data").to_string_lossy().to_string(),
            config_dir: root.path().join("config").to_string_lossy().to_string(),
            cache_dir: root.path().join("cache").to_string_lossy().to_string(),
            log_dir: root.path().join("logs").to_string_lossy().to_string(),
        };
        let download_plan = FtbLegacyModpackDownloadPlan {
            name: "Packaged Smoke FTB Legacy".to_owned(),
            feed_kind: "public".to_owned(),
            directory: "PackagedSmokeFTBLegacy".to_owned(),
            file_name: "PackagedSmokeFTBLegacy.zip".to_owned(),
            minecraft_version: "1.12.2".to_owned(),
            pack_version: "1.1.0".to_owned(),
            archive_download_plan: DownloadPlan {
                version_id: "packaged-ftb-legacy-archive".to_owned(),
                items: Vec::new(),
            },
            archive_path: archive_path.clone(),
        };

        let plan = core_build_ftb_legacy_modpack_archive_install_plan(
            &archive_path,
            &download_plan,
            Some("Packaged Smoke FTB Legacy"),
            &directories,
        )
        .expect("FTB Legacy smoke archive should plan");

        assert_eq!(plan.profile.id, "ftb-legacy-packaged-smoke-ftb-legacy");
        assert_eq!(plan.profile.loader, shared::ModLoader::Forge);
        assert_eq!(plan.profile.game_version, "1.12.2");
        assert_eq!(
            plan.profile.installed_pack_version.as_deref(),
            Some("1.1.0")
        );
        assert_eq!(plan.loader_version.as_deref(), Some("14.23.5.2860"));

        core_extract_ftb_legacy_modpack_archive(&archive_path, &plan, &directories)
            .expect("FTB Legacy smoke archive should extract");
        assert!(root
            .path()
            .join("data/profiles/ftb-legacy-packaged-smoke-ftb-legacy/pack.json")
            .is_file());
        assert!(root
            .path()
            .join("data/profiles/ftb-legacy-packaged-smoke-ftb-legacy/config/packaged.cfg")
            .is_file());
    }

    #[test]
    fn packaged_smoke_ftb_manifest_fixture_is_readable() {
        let root = tempfile::tempdir().expect("tempdir should be available");
        let directories = LauncherDirectories {
            data_dir: root.path().join("data").to_string_lossy().to_string(),
            config_dir: root.path().join("config").to_string_lossy().to_string(),
            cache_dir: root.path().join("cache").to_string_lossy().to_string(),
            log_dir: root.path().join("logs").to_string_lossy().to_string(),
        };

        let plan = core_build_ftb_modpack_install_plan_from_version_json(
            "424242",
            "12482",
            Some("Packaged Smoke FTB"),
            &directories,
            packaged_smoke_ftb_version_json(),
        )
        .expect("FTB smoke version manifest should plan");

        assert_eq!(plan.profile.id, "ftb-424242");
        assert_eq!(plan.profile.loader, shared::ModLoader::Neoforge);
        assert_eq!(plan.profile.game_version, "1.21.1");
        assert_eq!(
            plan.profile.installed_pack_version.as_deref(),
            Some("12482")
        );
        assert_eq!(plan.profile.memory_mb, 6144);
        assert_eq!(plan.loader_version.as_deref(), Some("21.1.51"));
        assert_eq!(plan.file_download_plan.items.len(), 1);

        write_packaged_smoke_ftb_planned_files(&plan.file_download_plan)
            .expect("FTB smoke planned files should stage");
        assert!(root
            .path()
            .join("data/profiles/ftb-424242/config/CoroUtil/General.toml")
            .is_file());
        assert!(!root
            .path()
            .join("data/profiles/ftb-424242/mods/server-only.jar")
            .exists());
        assert!(!root
            .path()
            .join("data/profiles/ftb-424242/mods/optional.jar")
            .exists());
    }

    #[test]
    fn packaged_smoke_technic_archive_fixture_is_readable() {
        let root = tempfile::tempdir().expect("tempdir should be available");
        let archive_path = root.path().join("PackagedSmokeTechnic.zip");
        write_packaged_smoke_technic_archive(&archive_path)
            .expect("packaged Technic smoke archive should write");
        let directories = LauncherDirectories {
            data_dir: root.path().join("data").to_string_lossy().to_string(),
            config_dir: root.path().join("config").to_string_lossy().to_string(),
            cache_dir: root.path().join("cache").to_string_lossy().to_string(),
            log_dir: root.path().join("logs").to_string_lossy().to_string(),
        };
        let download_plan = TechnicModpackDownloadPlan {
            slug: "packaged-smoke-technic".to_owned(),
            name: "Packaged Smoke Technic".to_owned(),
            minecraft_version: "1.12.2".to_owned(),
            pack_version: Some("1.3.0".to_owned()),
            archive_download_plan: DownloadPlan {
                version_id: "packaged-technic-archive".to_owned(),
                items: Vec::new(),
            },
            archive_path: archive_path.clone(),
            module_archive_paths: Vec::new(),
            source_kind: TechnicModpackDownloadKind::DirectZip,
        };

        let plan = core_build_technic_modpack_archive_install_plan(
            &archive_path,
            &download_plan,
            Some("Packaged Smoke Technic"),
            &directories,
        )
        .expect("Technic smoke archive should plan");

        assert_eq!(plan.profile.id, "technic-packaged-smoke-technic");
        assert_eq!(plan.profile.loader, shared::ModLoader::Forge);
        assert_eq!(plan.profile.game_version, "1.12.2");
        assert_eq!(
            plan.profile.installed_pack_version.as_deref(),
            Some("1.3.0")
        );
        assert_eq!(plan.loader_version.as_deref(), Some("14.23.5.2860"));

        core_extract_technic_modpack_archive(&archive_path, &plan, &directories)
            .expect("Technic smoke archive should extract");
        assert!(root
            .path()
            .join("data/profiles/technic-packaged-smoke-technic/bin/version.json")
            .is_file());
        assert!(root
            .path()
            .join("data/profiles/technic-packaged-smoke-technic/mods/example.jar")
            .is_file());
    }

    #[test]
    fn packaged_smoke_atlauncher_manifest_fixture_is_readable() {
        let root = tempfile::tempdir().expect("tempdir should be available");
        let directories = LauncherDirectories {
            data_dir: root.path().join("data").to_string_lossy().to_string(),
            config_dir: root.path().join("config").to_string_lossy().to_string(),
            cache_dir: root.path().join("cache").to_string_lossy().to_string(),
            log_dir: root.path().join("logs").to_string_lossy().to_string(),
        };

        let plan = core_build_atlauncher_modpack_install_plan_from_config_json(
            "PackagedSmokeATLauncher",
            "1.0.0",
            Some("Packaged Smoke ATLauncher"),
            &directories,
            packaged_smoke_atlauncher_config_json(),
        )
        .expect("ATLauncher smoke manifest should plan");

        assert_eq!(plan.profile.id, "atlauncher-packagedsmokeatlauncher");
        assert_eq!(plan.profile.loader, shared::ModLoader::Forge);
        assert_eq!(plan.profile.game_version, "1.12.2");
        assert_eq!(
            plan.profile.installed_pack_version.as_deref(),
            Some("1.0.0")
        );
        assert_eq!(plan.loader_version.as_deref(), Some("14.23.5.2860"));
        assert_eq!(plan.file_download_plan.items.len(), 3);
        assert_eq!(plan.extract_archives.len(), 2);

        write_packaged_smoke_atlauncher_planned_files(&plan.file_download_plan)
            .expect("ATLauncher smoke planned files should stage");
        core_extract_atlauncher_archives(&plan.extract_archives, &plan.profile, &directories)
            .expect("ATLauncher smoke archives should extract");
        assert!(root
            .path()
            .join("data/profiles/atlauncher-packagedsmokeatlauncher/mods/example.jar")
            .is_file());
        assert!(root
            .path()
            .join("data/profiles/atlauncher-packagedsmokeatlauncher/config/packaged.cfg")
            .is_file());
        assert!(root
            .path()
            .join("data/profiles/atlauncher-packagedsmokeatlauncher/scripts/startup.zs")
            .is_file());
        assert!(!root
            .path()
            .join("data/profiles/atlauncher-packagedsmokeatlauncher/server-only/skip.txt")
            .exists());
    }

    #[test]
    fn renderer_created_session_save_requires_development_opt_in() {
        assert!(!renderer_session_save_allowed_from_env(None));
        assert!(!renderer_session_save_allowed_from_env(Some(
            OsString::from("false")
        )));
    }

    #[test]
    fn renderer_created_session_save_allows_explicit_development_opt_in() {
        assert!(renderer_session_save_allowed_from_env(Some(
            OsString::from("true")
        )));
        assert!(renderer_session_save_allowed_from_env(Some(
            OsString::from("1")
        )));
    }

    #[test]
    fn external_download_url_allows_release_installers_only() {
        assert!(validate_external_download_url(
            "https://github.com/dilllxd/theboyslauncher/releases/download/v4.0.2/TheBoysLauncher_4.0.2_x64-setup.exe"
        )
        .is_ok());
        assert!(validate_external_download_url(
            "https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/TheBoysLauncher%20Dev_4.0.2-1_x64-setup.exe"
        )
        .is_ok());
    }

    #[test]
    fn external_download_url_rejects_non_installers_and_other_origins() {
        assert!(validate_external_download_url(
            "https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/latest-dev.json"
        )
        .is_err());
        assert!(validate_external_download_url(
            "https://github.com/dilllxd/theboyslauncher/releases/download/v4.0.2/TheBoysLauncher_4.0.2_x64_en-US.msi"
        )
        .is_err());
        assert!(validate_external_download_url(
            "https://github.com/dilllxd/theboyslauncher/releases/download/v4.0.2/TheBoysLauncher.exe"
        )
        .is_err());
        assert!(validate_external_download_url(
            "https://github.com/dilllxd/theboyslauncher/releases/latest/download/latest.json"
        )
        .is_err());
        assert!(validate_external_download_url(
            "https://example.com/dilllxd/theboyslauncher/releases/download/v4.0.2/TheBoysLauncher.exe"
        )
        .is_err());
        assert!(validate_external_download_url(
            "https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/TheBoysLauncher_4.0.2-1_x64-setup.exe?download=1"
        )
        .is_err());
        assert!(validate_external_download_url(
            "https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/TheBoysLauncher_4.0.2-1_x64-setup.exe#setup"
        )
        .is_err());
        assert!(validate_external_download_url(
            "https://github.com/dilllxd/theboyslauncher/releases/download/dev-latest/TheBoysLauncherDev_4.0.2-1_x64-setup.exe"
        )
        .is_err());
        assert!(validate_external_download_url(
            "https://github.com/dilllxd/theboyslauncher/releases/download/v4.0.2/TheBoysLauncher_4.0.3_x64-setup.exe"
        )
        .is_err());
        assert!(validate_external_download_url(
            "https://github.com/dilllxd/theboyslauncher/releases/download/not-a-channel/TheBoysLauncher_4.0.2_x64-setup.exe"
        )
        .is_err());
    }

    #[test]
    fn social_backend_origin_is_derived_from_health_url() {
        let local_endpoint = BackendEndpoint::Local {
            bind_addr: "127.0.0.1:4074".to_owned(),
        };
        let hosted_endpoint = BackendEndpoint::Hosted {
            origin: "https://social.example.test".to_owned(),
            health_url: "https://social.example.test/health".to_owned(),
        };
        assert_eq!(
            social_backend_origin_from_health_url("http://127.0.0.1:4074/health", &local_endpoint)
                .unwrap(),
            "http://127.0.0.1:4074"
        );
        assert_eq!(
            social_backend_origin_from_health_url(
                "http://localhost:4074/backend/health",
                &local_endpoint
            )
            .unwrap(),
            "http://localhost:4074"
        );
        assert_eq!(
            social_backend_origin_from_health_url("http://[::1]:4074/health", &local_endpoint)
                .unwrap(),
            "http://[::1]:4074"
        );
        assert_eq!(
            social_backend_origin_from_health_url(
                "https://social.example.test/health",
                &hosted_endpoint
            )
            .unwrap(),
            "https://social.example.test"
        );
        assert!(
            social_backend_origin_from_health_url("file:///tmp/health", &local_endpoint).is_err()
        );
        assert!(social_backend_origin_from_health_url(
            "https://127.0.0.1:4074/health",
            &local_endpoint
        )
        .is_err());
        assert!(social_backend_origin_from_health_url(
            "http://launcher.example.test/backend/health",
            &local_endpoint
        )
        .is_err());
        assert!(social_backend_origin_from_health_url(
            "https://other.example.test/health",
            &hosted_endpoint
        )
        .is_err());
    }

    #[test]
    fn renderer_safe_process_command_redacts_tokens() {
        let spec = ProcessCommandSpec {
            executable: "java".to_owned(),
            args: vec![
                "-Xmx4096M".to_owned(),
                "--accessToken".to_owned(),
                "minecraft-token".to_owned(),
                "--access_token=backend-token".to_owned(),
                "--token=inline-token".to_owned(),
                "--username".to_owned(),
                "Player".to_owned(),
                "--server".to_owned(),
                "play.theboys.example".to_owned(),
                "--port".to_owned(),
                "25565".to_owned(),
            ],
            working_dir: "C:/launcher/profiles/winterpack".to_owned(),
            env: vec![
                shared::ProcessEnvVar {
                    key: "MINECRAFT_ACCESS_TOKEN".to_owned(),
                    value: "env-token".to_owned(),
                },
                shared::ProcessEnvVar {
                    key: "PATH".to_owned(),
                    value: "C:/Java/bin".to_owned(),
                },
            ],
        };

        let redacted = renderer_safe_process_command_spec(spec);

        assert_eq!(redacted.executable, "java");
        assert_eq!(redacted.working_dir, "C:/launcher/profiles/winterpack");
        assert_eq!(
            redacted.args,
            vec![
                "-Xmx4096M",
                "--accessToken",
                "[redacted]",
                "--access_token=[redacted]",
                "--token=[redacted]",
                "--username",
                "Player",
                "--server",
                "play.theboys.example",
                "--port",
                "25565",
            ]
        );
        assert_eq!(redacted.env[0].value, "[redacted]");
        assert_eq!(redacted.env[1].value, "C:/Java/bin");
    }

    #[test]
    fn completed_action_receipt_reports_completed_native_work() {
        let receipt = completed_action_receipt(
            LauncherAction::InstallPack,
            "winterpack",
            "Pack installed successfully.",
        );

        assert_eq!(receipt.action, LauncherAction::InstallPack);
        assert_eq!(receipt.subject_id.as_deref(), Some("winterpack"));
        assert_eq!(receipt.status, ActionStatus::Completed);
        assert_eq!(receipt.message, "Pack installed successfully.");
    }

    #[test]
    fn missing_launch_artifact_errors_trigger_automatic_repair() {
        assert!(launch_failure_missing_artifacts(
            "launch artifact is missing: cache/assets/indexes/1.21.8.json. Set up the profile files before launching."
        ));
        assert!(launch_failure_missing_artifacts(
            "launch artifacts are missing: library.jar; natives directory. Set up the profile files before launching."
        ));
        assert!(launch_failure_missing_artifacts(
            "launch asset index is missing: C:/cache/assets/indexes/1.20.1.json."
        ));
        assert!(launch_failure_missing_artifacts(
            "launch natives directory is missing: C:/cache/natives/1.20.1."
        ));
        assert!(launch_failure_missing_artifacts(
            "asset index is missing: C:/cache/assets/indexes/1.20.1.json."
        ));
        assert!(launch_failure_missing_artifacts(
            "natives directory is missing: C:/cache/natives/1.20.1."
        ));
        assert!(launch_failure_missing_artifacts(
            "asset launch argument --assetIndex requires --assetsDir"
        ));
        assert!(launch_failure_missing_artifacts(
            "launch artifact is missing: asset launch argument --assetIndex requires --assetsDir"
        ));
        assert!(!launch_failure_missing_artifacts(
            "Java executable C:/Java/bin/java.exe is missing. Install a managed Java runtime from Settings before launching."
        ));
    }

    #[test]
    fn managed_java_launch_errors_trigger_automatic_java_install() {
        assert!(launch_failure_recoverable_managed_java(
            "Minecraft requires Java 21 or newer, but no Java runtimes were discovered. Install a managed Java runtime from Settings before launching."
        ));
        assert!(launch_failure_recoverable_managed_java(
            "Java executable C:/launcher/runtimes/temurin-21-windows-x64/bin/java.exe is missing. Install a managed Java runtime from Settings before launching."
        ));
        assert!(!launch_failure_recoverable_managed_java(
            "configured profile Java override could not be inspected at C:/Java/bin/java.exe. Choose a valid java executable or use Automatic."
        ));
        assert!(!launch_failure_recoverable_managed_java(
            "Minecraft requires Java 21 or newer, but the configured global Java override is Java 17 at C:/Java/bin/java.exe. Choose Automatic or a compatible Java executable."
        ));
    }

    #[test]
    fn automatic_java_install_selects_lowest_compatible_recommendation() {
        let manifest = vec![
            JavaRuntimeManifestEntry {
                runtime_id: "temurin-21-windows-x64".to_owned(),
                label: "Temurin 21".to_owned(),
                vendor: "Eclipse Adoptium".to_owned(),
                major_version: 21,
                platform: "windows-x64".to_owned(),
                url: "https://example.test/temurin-21.zip".to_owned(),
                sha1: None,
                size: None,
                archive_file_name: Some("temurin-21.zip".to_owned()),
                notes: "Recommended for modern Minecraft.".to_owned(),
            },
            JavaRuntimeManifestEntry {
                runtime_id: "temurin-17-windows-x64".to_owned(),
                label: "Temurin 17".to_owned(),
                vendor: "Eclipse Adoptium".to_owned(),
                major_version: 17,
                platform: "windows-x64".to_owned(),
                url: "https://example.test/temurin-17.zip".to_owned(),
                sha1: None,
                size: None,
                archive_file_name: Some("temurin-17.zip".to_owned()),
                notes: "Recommended for Minecraft 1.18 through 1.20.4.".to_owned(),
            },
            JavaRuntimeManifestEntry {
                runtime_id: "temurin-8-windows-x64".to_owned(),
                label: "Temurin 8".to_owned(),
                vendor: "Eclipse Adoptium".to_owned(),
                major_version: 8,
                platform: "windows-x64".to_owned(),
                url: "https://example.test/temurin-8.zip".to_owned(),
                sha1: None,
                size: None,
                archive_file_name: Some("temurin-8.zip".to_owned()),
                notes: "Recommended for legacy Minecraft.".to_owned(),
            },
        ];

        let java_17 = recommended_java_entry_for_requirement(&manifest, 16)
            .expect("Java 17 should satisfy Java 16");
        assert_eq!(java_17.runtime_id, "temurin-17-windows-x64");
        let java_21 = recommended_java_entry_for_requirement(&manifest, 21)
            .expect("Java 21 should satisfy Java 21");
        assert_eq!(java_21.runtime_id, "temurin-21-windows-x64");
        let java_8 = recommended_java_entry_for_requirement(&manifest, 8)
            .expect("Java 8 should be selected exactly for legacy profiles");
        assert_eq!(java_8.runtime_id, "temurin-8-windows-x64");
        assert!(recommended_java_entry_for_requirement(&manifest[0..2], 8).is_none());
    }

    #[test]
    fn modrinth_archive_urls_build_download_plan() {
        let directories = LauncherDirectories {
            data_dir: "C:/launcher/data".to_owned(),
            config_dir: "C:/launcher/config".to_owned(),
            cache_dir: "C:/launcher/cache".to_owned(),
            log_dir: "C:/launcher/logs".to_owned(),
        };
        let request = InstallModpackArchiveRequest {
            url: "https://example.com/packs/awesome.mrpack".to_owned(),
            name: Some("Awesome Pack".to_owned()),
        };

        let (plan, archive_path) = build_modpack_archive_download_plan(&request, &directories)
            .expect(".mrpack should download before provider detection");

        assert_eq!(plan.items.len(), 1);
        assert_eq!(
            plan.items[0].url,
            "https://example.com/packs/awesome.mrpack"
        );
        assert!(archive_path.ends_with("awesome.mrpack"));
    }

    #[test]
    fn staged_modpack_archive_cleanup_removes_only_archive_directory() {
        let root = tempfile::tempdir().expect("tempdir should be available");
        let archive_dir = root.path().join("cache/modpack-archives/archive-id");
        let archive_path = archive_dir.join("example.zip");
        fs::create_dir_all(&archive_dir).expect("archive dir should create");
        fs::write(&archive_path, b"zip").expect("archive fixture should write");
        let unrelated = root.path().join("cache/modpack-archives/keep/example.zip");
        fs::create_dir_all(unrelated.parent().expect("unrelated parent should exist"))
            .expect("unrelated dir should create");
        fs::write(&unrelated, b"keep").expect("unrelated archive should write");
        let directories = LauncherDirectories {
            data_dir: root
                .path()
                .join("data")
                .to_string_lossy()
                .replace('\\', "/"),
            config_dir: root
                .path()
                .join("config")
                .to_string_lossy()
                .replace('\\', "/"),
            cache_dir: root
                .path()
                .join("cache")
                .to_string_lossy()
                .replace('\\', "/"),
            log_dir: root
                .path()
                .join("logs")
                .to_string_lossy()
                .replace('\\', "/"),
        };

        cleanup_staged_modpack_archive(&archive_path, &directories)
            .expect("staged archive cleanup should succeed");

        assert!(!archive_dir.exists());
        assert!(unrelated.is_file());
    }

    #[test]
    fn staged_modpack_archive_cleanup_ignores_unexpected_paths() {
        let root = tempfile::tempdir().expect("tempdir should be available");
        let archive_dir = root.path().join("downloads");
        let archive_path = archive_dir.join("example.zip");
        fs::create_dir_all(&archive_dir).expect("archive dir should create");
        fs::write(&archive_path, b"zip").expect("archive fixture should write");
        let directories = LauncherDirectories {
            data_dir: root
                .path()
                .join("data")
                .to_string_lossy()
                .replace('\\', "/"),
            config_dir: root
                .path()
                .join("config")
                .to_string_lossy()
                .replace('\\', "/"),
            cache_dir: root
                .path()
                .join("cache")
                .to_string_lossy()
                .replace('\\', "/"),
            log_dir: root
                .path()
                .join("logs")
                .to_string_lossy()
                .replace('\\', "/"),
        };

        cleanup_staged_modpack_archive(&archive_path, &directories)
            .expect("unexpected path cleanup should be a no-op");

        assert!(archive_path.is_file());
    }

    #[test]
    fn automatic_launch_setup_failure_uses_setup_wording() {
        assert_eq!(
            native_operation_failure_message(
                "Automatic profile setup before launch failed",
                "asset index is missing",
            ),
            "Automatic profile setup before launch failed: asset index is missing"
        );
    }

    fn install_plan_fixture(queued_message: &str) -> OperationPlan {
        let operation_id = Uuid::nil();
        OperationPlan {
            operation_id,
            operation: LauncherOperation::InstallPack,
            subject_id: "winterpack".to_owned(),
            events: vec![LauncherEvent {
                id: Uuid::nil(),
                operation_id,
                operation: Some(LauncherOperation::InstallPack),
                subject_id: Some("winterpack".to_owned()),
                kind: LauncherEventKind::Queued,
                message: queued_message.to_owned(),
                progress_percent: Some(0),
                occurred_at_unix_seconds: 0,
            }],
        }
    }

    #[test]
    fn install_pack_completion_message_matches_install_plan_intent() {
        assert_eq!(
            install_pack_completion_message(&install_plan_fixture("Install queued for WinterPack")),
            "Pack installed successfully."
        );
        assert_eq!(
            install_pack_completion_message(&install_plan_fixture("Update queued for WinterPack")),
            "Pack updated successfully."
        );
        assert_eq!(
            install_pack_completion_message(&install_plan_fixture("Prepare queued for WinterPack")),
            "Pack is ready."
        );
    }

    #[test]
    fn completed_native_operation_event_marks_successful_native_work() {
        let event = completed_native_operation_event(
            LauncherOperation::RepairProfile,
            "winterpack",
            "Profile setup completed.",
        );

        assert_eq!(event.operation, Some(LauncherOperation::RepairProfile));
        assert_eq!(event.subject_id.as_deref(), Some("winterpack"));
        assert_eq!(event.kind, LauncherEventKind::Completed);
        assert_eq!(event.progress_percent, Some(100));
        assert_eq!(event.message, "Profile setup completed.");
        assert_eq!(event.occurred_at_unix_seconds, 0);
    }

    #[test]
    fn completed_planned_native_operation_event_keeps_plan_grouping() {
        let operation_id = Uuid::new_v4();
        let event = completed_planned_native_operation_event(
            operation_id,
            LauncherOperation::InstallPack,
            "winterpack",
            "Pack installed successfully.",
        );

        assert_eq!(event.operation_id, operation_id);
        assert_eq!(event.operation, Some(LauncherOperation::InstallPack));
        assert_eq!(event.subject_id.as_deref(), Some("winterpack"));
        assert_eq!(event.kind, LauncherEventKind::Completed);
        assert_eq!(event.progress_percent, Some(100));
        assert_eq!(event.message, "Pack installed successfully.");
    }

    #[test]
    fn completed_modpack_archive_event_uses_archive_operation() {
        let operation_id = Uuid::new_v4();
        let event = completed_planned_native_operation_event(
            operation_id,
            LauncherOperation::InstallModpackArchive,
            "fabulously-optimized",
            "Fabulously Optimized installed successfully.",
        );

        assert_eq!(event.operation_id, operation_id);
        assert_eq!(
            event.operation,
            Some(LauncherOperation::InstallModpackArchive)
        );
        assert_eq!(event.subject_id.as_deref(), Some("fabulously-optimized"));
        assert_eq!(event.kind, LauncherEventKind::Completed);
        assert_eq!(event.progress_percent, Some(100));
        assert_eq!(
            event.message,
            "Fabulously Optimized installed successfully."
        );
    }

    #[test]
    fn failed_planned_native_operation_event_keeps_plan_grouping() {
        let operation_id = Uuid::new_v4();
        let event = failed_planned_native_operation_event(
            operation_id,
            LauncherOperation::RepairProfile,
            "winterpack",
            "Profile setup failed: asset index is missing",
        );

        assert_eq!(event.operation_id, operation_id);
        assert_eq!(event.operation, Some(LauncherOperation::RepairProfile));
        assert_eq!(event.subject_id.as_deref(), Some("winterpack"));
        assert_eq!(event.kind, LauncherEventKind::Failed);
        assert_eq!(event.progress_percent, Some(100));
        assert_eq!(
            event.message,
            "Profile setup failed: asset index is missing"
        );
    }

    #[test]
    fn failed_native_operation_event_marks_failed_native_work() {
        let event = failed_native_operation_event(
            LauncherOperation::InstallPack,
            "winterpack",
            "Pack install failed: checksum mismatch",
        );

        assert_eq!(event.operation, Some(LauncherOperation::InstallPack));
        assert_eq!(event.subject_id.as_deref(), Some("winterpack"));
        assert_eq!(event.kind, LauncherEventKind::Failed);
        assert_eq!(event.progress_percent, Some(100));
        assert_eq!(event.message, "Pack install failed: checksum mismatch");
        assert_eq!(event.occurred_at_unix_seconds, 0);
    }

    #[test]
    fn native_operation_failure_message_keeps_return_and_event_text_aligned() {
        assert_eq!(
            native_operation_failure_message("Pack install failed", "checksum mismatch"),
            "Pack install failed: checksum mismatch"
        );
        assert_eq!(
            native_operation_failure_message("Profile setup failed", "asset index is missing"),
            "Profile setup failed: asset index is missing"
        );
        assert_eq!(
            native_operation_failure_message("Profile delete failed", "profile is missing"),
            "Profile delete failed: profile is missing"
        );
    }

    #[test]
    fn delete_profile_success_message_explains_shared_cache_retention() {
        let profile = ProfileSummary {
            id: "winterpack".to_owned(),
            name: "WinterPack".to_owned(),
            loader: shared::ModLoader::Fabric,
            game_version: "1.20.1".to_owned(),
            installed_pack_version: Some("2.3.7".to_owned()),
            last_played: None,
            memory_mb: 6144,
            jvm_args: Vec::new(),
            resolution: None,
            default_server: None,
            java_runtime_override_path: None,
        };

        assert_eq!(
            delete_profile_success_message(&profile),
            "WinterPack deleted. Profile files were removed; shared Minecraft downloads were kept for faster future installs."
        );
    }

    #[test]
    fn open_profile_folder_resolves_existing_managed_profile_dir() {
        let root = tempfile::tempdir().expect("tempdir should be available");
        std::env::set_var("THEBOYS_LAUNCHER_ROOT_DIR", root.path());
        core_create_profile(CreateProfileRequest {
            name: "Folder Smoke".to_owned(),
            loader: shared::ModLoader::Vanilla,
            game_version: "1.21.8".to_owned(),
            memory_mb: 4096,
        })
        .expect("profile should create");
        let directories = core_prepare_launcher_directories().expect("directories should resolve");

        let folder = resolve_profile_folder_path("folder-smoke", &directories)
            .expect("profile folder should resolve");

        assert!(folder.is_dir());
        assert!(folder.ends_with(Path::new("profiles").join("folder-smoke")));
        std::env::remove_var("THEBOYS_LAUNCHER_ROOT_DIR");
    }

    #[test]
    fn open_profile_folder_rejects_unsafe_or_missing_profiles() {
        let root = tempfile::tempdir().expect("tempdir should be available");
        std::env::set_var("THEBOYS_LAUNCHER_ROOT_DIR", root.path());
        let directories = core_prepare_launcher_directories().expect("directories should resolve");

        assert!(resolve_profile_folder_path("../winterpack", &directories).is_err());
        let missing = resolve_profile_folder_path("missing-profile", &directories)
            .expect_err("missing profile should not open");
        assert!(missing.contains("was not found"));
        std::env::remove_var("THEBOYS_LAUNCHER_ROOT_DIR");
    }

    #[tokio::test]
    async fn execute_download_plan_recording_events_records_artifact_progress() {
        let root = tempfile::tempdir().expect("tempdir should be available");
        let body = b"desktop event bridge".to_vec();
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("test server should bind");
        let address = listener
            .local_addr()
            .expect("test server should have local address");
        let server_body = body.clone();
        let server = tokio::spawn(async move {
            let (mut stream, _) = listener
                .accept()
                .await
                .expect("test server should accept request");
            let mut buffer = [0_u8; 1024];
            let _ = stream.read(&mut buffer).await;
            let headers = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                server_body.len()
            );
            stream
                .write_all(headers.as_bytes())
                .await
                .expect("test headers should write");
            stream
                .write_all(&server_body)
                .await
                .expect("test body should write");
        });
        let destination = root.path().join("client.jar");
        let plan = DownloadPlan {
            version_id: "bridge-pack".to_owned(),
            items: vec![shared::DownloadItem {
                id: "bridge-client".to_owned(),
                kind: DownloadKind::ClientJar,
                url: format!("http://{address}/client.jar"),
                sha1: None,
                sha256: None,
                sha512: None,
                md5: None,
                murmur2: None,
                size: Some(body.len() as u64),
                destination: destination.to_string_lossy().to_string(),
            }],
        };
        let event_log = LauncherEventLog::new();

        let operation = execute_download_plan_recording_events(&plan, &event_log)
            .await
            .expect("download should execute and record events");
        server.await.expect("test server should finish");
        let events = event_log.list(Some(10)).expect("events should list");

        assert_eq!(operation.operation, LauncherOperation::DownloadArtifacts);
        assert_eq!(operation.subject_id, "bridge-pack");
        assert_eq!(
            std::fs::read(&destination).expect("download should write destination"),
            body
        );
        assert!(events
            .iter()
            .any(|event| event.message == "Downloading Minecraft client"));
        assert!(events
            .iter()
            .any(|event| event.message == "Minecraft client ready"));
        assert_eq!(
            events.last().map(|event| &event.kind),
            Some(&LauncherEventKind::Completed)
        );
        assert!(events.iter().all(|event| {
            event.operation == Some(LauncherOperation::DownloadArtifacts)
                && event.subject_id.as_deref() == Some("bridge-pack")
        }));
        let start_index = events
            .iter()
            .position(|event| event.message == "Downloading Minecraft client")
            .expect("start event should be recorded");
        let done_index = events
            .iter()
            .position(|event| event.message == "Minecraft client ready")
            .expect("done event should be recorded");
        assert!(start_index < done_index);
    }

    #[test]
    fn streamed_processor_operation_plan_is_not_recorded_twice() {
        let event_log = LauncherEventLog::new();
        let operation = OperationPlan {
            operation_id: Uuid::new_v4(),
            operation: LauncherOperation::DownloadArtifacts,
            subject_id: "winterpack".to_owned(),
            events: vec![LauncherEvent {
                id: Uuid::new_v4(),
                operation_id: Uuid::new_v4(),
                operation: Some(LauncherOperation::DownloadArtifacts),
                subject_id: Some("winterpack".to_owned()),
                kind: LauncherEventKind::Completed,
                message: "Modloader installer processors completed.".to_owned(),
                progress_percent: Some(100),
                occurred_at_unix_seconds: 0,
            }],
        };
        for event in operation.events.clone() {
            event_log
                .record_event(event)
                .expect("streamed event should record");
        }

        record_unstreamed_operation_plan(Some(&operation), true, &event_log)
            .expect("streamed plan should be skipped");
        let events = event_log.list(None).expect("events should list");

        assert_eq!(events.len(), 1);
        assert_eq!(
            events[0].message,
            "Modloader installer processors completed."
        );
    }

    #[test]
    fn unstreamed_processor_operation_plan_is_recorded_as_fallback() {
        let event_log = LauncherEventLog::new();
        let operation = OperationPlan {
            operation_id: Uuid::new_v4(),
            operation: LauncherOperation::DownloadArtifacts,
            subject_id: "winterpack".to_owned(),
            events: vec![LauncherEvent {
                id: Uuid::new_v4(),
                operation_id: Uuid::new_v4(),
                operation: None,
                subject_id: None,
                kind: LauncherEventKind::Completed,
                message: "Modloader installer processors completed.".to_owned(),
                progress_percent: Some(100),
                occurred_at_unix_seconds: 0,
            }],
        };

        record_unstreamed_operation_plan(Some(&operation), false, &event_log)
            .expect("unstreamed plan should record");
        let events = event_log.list(None).expect("events should list");

        assert_eq!(events.len(), 1);
        assert_eq!(
            events[0].operation,
            Some(LauncherOperation::DownloadArtifacts)
        );
        assert_eq!(events[0].subject_id.as_deref(), Some("winterpack"));
        assert_eq!(
            events[0].message,
            "Modloader installer processors completed."
        );
    }

    fn managed_process_fixture(
        profile_id: Option<&str>,
        state: shared::ManagedProcessState,
    ) -> ManagedProcessSummary {
        let stop_requested = matches!(state, shared::ManagedProcessState::StopRequested);
        ManagedProcessSummary {
            id: Uuid::new_v4(),
            process_id: 4242,
            command: ProcessCommandSpec {
                executable: "java".to_owned(),
                args: Vec::new(),
                working_dir: "C:/data/profiles/winterpack".to_owned(),
                env: profile_id
                    .map(|profile_id| {
                        vec![shared::ProcessEnvVar {
                            key: "THEBOYSLAUNCHER_PROFILE_ID".to_owned(),
                            value: profile_id.to_owned(),
                        }]
                    })
                    .unwrap_or_default(),
            },
            state,
            exit_code: None,
            stop_requested,
            started_at_unix_seconds: 10,
            exited_at_unix_seconds: None,
            runtime_seconds: 5,
            total_output_line_count: 0,
            dropped_output_line_count: 0,
            output: Vec::new(),
        }
    }

    #[test]
    fn active_managed_process_for_profile_matches_running_and_stop_requested_processes() {
        let running =
            managed_process_fixture(Some("winterpack"), shared::ManagedProcessState::Running);
        let stop_requested = managed_process_fixture(
            Some("winterpack"),
            shared::ManagedProcessState::StopRequested,
        );
        let other_profile =
            managed_process_fixture(Some("latest-release"), shared::ManagedProcessState::Running);

        assert_eq!(
            active_managed_process_for_profile(
                &[other_profile.clone(), running.clone()],
                "winterpack"
            )
            .map(|process| process.id),
            Some(running.id)
        );
        assert_eq!(
            active_managed_process_for_profile(&[stop_requested.clone()], "winterpack")
                .map(|process| process.id),
            Some(stop_requested.id)
        );
        assert!(profile_delete_active_process_error("winterpack", &running)
            .contains("Stop it before deleting"));
        assert!(profile_update_active_process_error("winterpack", &running)
            .contains("Stop it before saving changes"));
        assert!(profile_archive_active_process_error("winterpack", &running)
            .contains("Stop it before archiving"));
        assert!(profile_install_active_process_error("winterpack", &running)
            .contains("Stop it before installing or updating"));
        assert!(profile_repair_active_process_error("winterpack", &running)
            .contains("Stop it before setting up files"));
    }

    #[test]
    fn active_managed_process_for_profile_can_be_reused_as_launch_result() {
        let running =
            managed_process_fixture(Some("winterpack"), shared::ManagedProcessState::Running);
        let active =
            active_managed_process_for_profile(std::slice::from_ref(&running), "winterpack")
                .cloned()
                .expect("running process should be reusable");

        assert_eq!(active.id, running.id);
        assert_eq!(active.process_id, running.process_id);
        assert_eq!(managed_process_profile_id(&active), Some("winterpack"));
    }

    #[test]
    fn install_profile_merge_preserves_existing_launch_customizations() {
        let live_profile = ProfileSummary {
            id: "winterpack".to_owned(),
            name: "WinterPack".to_owned(),
            loader: shared::ModLoader::Forge,
            game_version: "1.20.1".to_owned(),
            installed_pack_version: Some("2.3.8".to_owned()),
            last_played: None,
            memory_mb: 6144,
            jvm_args: Vec::new(),
            resolution: None,
            default_server: Some(ServerLaunchTarget {
                name: Some("Catalog Cabin".to_owned()),
                address: "play.catalog.local".to_owned(),
                port: Some(25565),
            }),
            java_runtime_override_path: None,
        };
        let saved_profile = ProfileSummary {
            id: "winterpack".to_owned(),
            name: "WinterPack".to_owned(),
            loader: shared::ModLoader::Forge,
            game_version: "1.20.1".to_owned(),
            installed_pack_version: Some("2.3.7".to_owned()),
            last_played: Some("unix:1710000000".to_owned()),
            memory_mb: 8192,
            jvm_args: vec!["-Dtheboys.custom=true".to_owned()],
            resolution: Some(shared::ProfileResolution {
                width: 1600,
                height: 900,
            }),
            default_server: Some(ServerLaunchTarget {
                name: Some("The Custom Cabin".to_owned()),
                address: "play.custom.local".to_owned(),
                port: Some(25566),
            }),
            java_runtime_override_path: Some("C:/Java/21/bin/java.exe".to_owned()),
        };

        let merged = merge_pack_profile_with_launch_customizations(live_profile, saved_profile);

        assert_eq!(merged.installed_pack_version.as_deref(), Some("2.3.8"));
        assert_eq!(merged.memory_mb, 8192);
        assert_eq!(merged.jvm_args, vec!["-Dtheboys.custom=true"]);
        assert_eq!(
            merged.resolution,
            Some(shared::ProfileResolution {
                width: 1600,
                height: 900,
            })
        );
        assert_eq!(
            merged.default_server,
            Some(ServerLaunchTarget {
                name: Some("The Custom Cabin".to_owned()),
                address: "play.custom.local".to_owned(),
                port: Some(25566),
            })
        );
        assert_eq!(merged.last_played.as_deref(), Some("unix:1710000000"));
        assert_eq!(
            merged.java_runtime_override_path.as_deref(),
            Some("C:/Java/21/bin/java.exe")
        );
    }

    #[cfg(windows)]
    #[test]
    fn active_managed_process_summary_returns_existing_registry_process() {
        let root = tempfile::tempdir().expect("tempdir should be available");
        let registry = ProcessRegistry::new();
        let spawned = registry
            .spawn(ProcessCommandSpec {
                executable: "cmd.exe".to_owned(),
                args: vec!["/C".to_owned(), "ping -n 6 127.0.0.1 >NUL".to_owned()],
                working_dir: root.path().to_string_lossy().to_string(),
                env: vec![shared::ProcessEnvVar {
                    key: "THEBOYSLAUNCHER_PROFILE_ID".to_owned(),
                    value: "winterpack".to_owned(),
                }],
            })
            .expect("process should spawn");

        let active = active_managed_process_summary(&registry, "winterpack")
            .expect("active lookup should succeed")
            .expect("running process should be found");

        assert_eq!(active.id, spawned.id);
        assert_eq!(active.process_id, spawned.process_id);

        let _ = registry.stop(spawned.id);
    }

    #[test]
    fn active_managed_process_for_profile_ignores_exited_missing_or_other_profile_processes() {
        let exited =
            managed_process_fixture(Some("winterpack"), shared::ManagedProcessState::Exited);
        let missing_profile = managed_process_fixture(None, shared::ManagedProcessState::Running);
        let other_profile =
            managed_process_fixture(Some("latest-release"), shared::ManagedProcessState::Running);

        assert!(active_managed_process_for_profile(
            &[exited, missing_profile, other_profile],
            "winterpack"
        )
        .is_none());
    }

    #[test]
    fn exported_process_log_path_validation_accepts_logs_under_launcher_log_dir() {
        let root = tempfile::tempdir().expect("tempdir should be available");
        let log_dir = root.path().join("logs");
        let process_log_dir = log_dir.join("processes");
        fs::create_dir_all(&process_log_dir).expect("process log dir should be created");
        let log_path = process_log_dir.join("winterpack.log");
        fs::write(&log_path, "minecraft output").expect("log should be written");

        let resolved = validate_exported_process_log_path(&log_path, &log_dir)
            .expect("launcher log path should validate");

        assert_eq!(
            resolved,
            log_path.canonicalize().expect("log should canonicalize")
        );
    }

    #[test]
    fn exported_process_log_path_validation_rejects_paths_outside_launcher_log_dir() {
        let root = tempfile::tempdir().expect("tempdir should be available");
        let log_dir = root.path().join("logs");
        let outside_dir = root.path().join("other");
        fs::create_dir_all(&log_dir).expect("log dir should be created");
        fs::create_dir_all(&outside_dir).expect("outside dir should be created");
        let outside_log = outside_dir.join("winterpack.log");
        fs::write(&outside_log, "not launcher output").expect("outside log should be written");

        let error = validate_exported_process_log_path(&outside_log, &log_dir)
            .expect_err("outside path should be rejected");

        assert!(error.contains("outside launcher log directory"));
    }

    #[test]
    fn launch_planning_failure_records_event_log_entry() {
        let _env = LauncherDirEnvGuard::isolated();
        let root = tempfile::tempdir().expect("tempdir should be available");
        std::env::set_var("THEBOYS_LAUNCHER_ROOT_DIR", root.path());
        core_prepare_launcher_directories().expect("launcher directories should prepare");
        let event_log = LauncherEventLog::new();

        let error = record_launch_planning_failure(
            "winterpack",
            "Minecraft requires Java 21 or newer".to_owned(),
            &event_log,
        )
        .expect("failure event should record");
        let events = event_log.list(Some(10)).expect("events should list");

        assert_eq!(error, "Minecraft requires Java 21 or newer");
        assert!(events.iter().any(|event| {
            event.operation == Some(LauncherOperation::LaunchProfile)
                && event.subject_id.as_deref() == Some("winterpack")
                && event.kind == LauncherEventKind::Failed
                && event
                    .message
                    .contains("Minecraft requires Java 21 or newer")
        }));
    }

    #[cfg(windows)]
    #[test]
    fn managed_launch_reports_fast_startup_exit_as_failure() {
        let root = tempfile::tempdir().expect("tempdir should be available");
        let registry = ProcessRegistry::new();
        let event_log = LauncherEventLog::new();
        let launch_plan = LaunchPlan {
            profile_id: "winterpack".to_owned(),
            profile_name: "WinterPack".to_owned(),
            java_executable: "cmd.exe".to_owned(),
            working_dir: root.path().to_string_lossy().to_string(),
            arguments: vec!["/C".to_owned(), "exit 7".to_owned()],
            memory_mb: 4096,
            offline_username: "Builder".to_owned(),
        };

        let error = start_managed_launch_plan(launch_plan, &registry, &event_log)
            .expect_err("fast startup exit should fail launch command");
        let events = event_log.list(Some(10)).expect("events should list");

        assert!(error.contains("exit code 7"));
        assert!(events
            .iter()
            .any(|event| event.kind == LauncherEventKind::Queued));
        assert!(events.iter().any(|event| {
            event.kind == LauncherEventKind::Failed
                && event.message.contains("exited during startup")
        }));
    }

    #[cfg(windows)]
    #[test]
    fn managed_launch_fast_startup_exit_does_not_mark_profile_played() {
        let _env = LauncherDirEnvGuard::isolated();
        let root = tempfile::tempdir().expect("tempdir should be available");
        std::env::set_var("THEBOYS_LAUNCHER_ROOT_DIR", root.path());
        core_prepare_launcher_directories().expect("launcher directories should prepare");
        let before_profiles = core_load_profiles().expect("profiles should seed");
        let before_last_played = before_profiles
            .iter()
            .find(|profile| profile.id == "winterpack")
            .and_then(|profile| profile.last_played.clone());
        let registry = ProcessRegistry::new();
        let event_log = LauncherEventLog::new();
        let launch_plan = LaunchPlan {
            profile_id: "winterpack".to_owned(),
            profile_name: "WinterPack".to_owned(),
            java_executable: "cmd.exe".to_owned(),
            working_dir: root.path().to_string_lossy().to_string(),
            arguments: vec!["/C".to_owned(), "exit 7".to_owned()],
            memory_mb: 4096,
            offline_username: "Builder".to_owned(),
        };

        let error = start_managed_launch_plan(launch_plan, &registry, &event_log)
            .expect_err("fast startup exit should fail launch command");
        let after_profiles = core_load_profiles().expect("profiles should reload");
        let after_last_played = after_profiles
            .iter()
            .find(|profile| profile.id == "winterpack")
            .and_then(|profile| profile.last_played.clone());

        assert!(error.contains("exit code 7"));
        assert_eq!(after_last_played, before_last_played);
    }

    #[test]
    fn backend_health_url_targets_health_endpoint() {
        assert_eq!(
            backend_health_url("127.0.0.1:4074"),
            "http://127.0.0.1:4074/health"
        );
    }

    #[test]
    fn backend_health_url_preserves_configured_bind_addr() {
        assert_eq!(
            backend_health_url("localhost:5000"),
            "http://localhost:5000/health"
        );
    }

    #[test]
    fn backend_endpoint_resolver_uses_configured_hosted_origin() {
        let endpoint = resolve_backend_endpoint(
            Some(OsString::from(" https://social.example.test ")),
            None,
            None,
            "127.0.0.1:4074".to_owned(),
        )
        .expect("hosted endpoint should resolve");

        assert_eq!(
            endpoint,
            BackendEndpoint::Hosted {
                origin: "https://social.example.test".to_owned(),
                health_url: "https://social.example.test/health".to_owned(),
            }
        );
    }

    #[test]
    fn backend_endpoint_resolver_rejects_hosted_url_with_path() {
        let error = resolve_backend_endpoint(
            Some(OsString::from("https://social.example.test/api")),
            None,
            None,
            "127.0.0.1:4074".to_owned(),
        )
        .expect_err("path-bearing hosted URLs should be rejected");

        assert!(error.contains("without a path"));
    }

    #[test]
    fn backend_endpoint_resolver_can_disable_hosted_mode_for_local_fallback() {
        let endpoint = resolve_backend_endpoint(
            Some(OsString::from("local")),
            Some("https://social.example.test"),
            Some("https://release.example.test"),
            "127.0.0.1:4074".to_owned(),
        )
        .expect("local fallback should resolve");

        assert_eq!(
            endpoint,
            BackendEndpoint::Local {
                bind_addr: "127.0.0.1:4074".to_owned(),
            }
        );
    }

    #[test]
    fn backend_endpoint_resolver_can_turn_friends_service_off() {
        let endpoint = resolve_backend_endpoint(
            Some(OsString::from("off")),
            Some("https://social.example.test"),
            Some("https://release.example.test"),
            "127.0.0.1:4074".to_owned(),
        )
        .expect("off endpoint should resolve");

        assert_eq!(endpoint, BackendEndpoint::Disabled);

        let endpoint = resolve_backend_endpoint(
            Some(OsString::from("disabled")),
            Some("https://social.example.test"),
            Some("https://release.example.test"),
            "127.0.0.1:4074".to_owned(),
        )
        .expect("disabled endpoint should resolve");

        assert_eq!(endpoint, BackendEndpoint::Disabled);
    }

    #[test]
    fn backend_endpoint_resolver_uses_release_default_when_unconfigured() {
        let endpoint = resolve_backend_endpoint(
            None,
            None,
            Some("https://release.example.test"),
            "127.0.0.1:4074".to_owned(),
        )
        .expect("release default hosted endpoint should resolve");

        assert_eq!(
            endpoint,
            BackendEndpoint::Hosted {
                origin: "https://release.example.test".to_owned(),
                health_url: "https://release.example.test/health".to_owned(),
            }
        );
    }

    #[test]
    fn social_backend_from_env_hosted_mode_does_not_prepare_local_service_state() {
        let env = BackendEnvGuard::isolated();
        let root = tempfile::tempdir().expect("tempdir should be available");
        let app_data_dir = root.path().join("app-data");
        let resource_dir = root.path().join("resources");
        std::fs::create_dir_all(&resource_dir).expect("resource dir should create");
        std::fs::write(resource_dir.join(backend_executable_name()), "")
            .expect("packaged backend fixture should write");
        env.set(SOCIAL_BACKEND_URL_ENV, "https://social.example.test");
        env.set("THEBOYS_BACKEND_SESSION_SECRET", "configured-local-secret");
        let configured_backend = root.path().join("custom-social-backend.exe");
        env.set("THEBOYS_BACKEND_EXE", configured_backend.as_os_str());

        let service =
            SocialBackendService::from_env(Some(resource_dir), Some(app_data_dir.clone()))
                .expect("hosted service should initialize");

        assert_eq!(
            service.endpoint,
            BackendEndpoint::Hosted {
                origin: "https://social.example.test".to_owned(),
                health_url: "https://social.example.test/health".to_owned(),
            }
        );
        assert_eq!(service.state_path, None);
        assert_eq!(service.session_secret, None);
        assert!(service.executable.is_none());
        assert!(!app_data_dir.join("social-backend-session-secret").exists());
        assert!(!app_data_dir.join("social-backend-state.json").exists());
    }

    #[test]
    fn social_backend_from_env_disabled_mode_does_not_prepare_local_service_state() {
        let env = BackendEnvGuard::isolated();
        let root = tempfile::tempdir().expect("tempdir should be available");
        let app_data_dir = root.path().join("app-data");
        let resource_dir = root.path().join("resources");
        std::fs::create_dir_all(&resource_dir).expect("resource dir should create");
        std::fs::write(resource_dir.join(backend_executable_name()), "")
            .expect("packaged backend fixture should write");
        env.set(SOCIAL_BACKEND_URL_ENV, "off");
        env.set("THEBOYS_BACKEND_SESSION_SECRET", "configured-local-secret");
        let configured_backend = root.path().join("custom-social-backend.exe");
        env.set("THEBOYS_BACKEND_EXE", configured_backend.as_os_str());

        let service =
            SocialBackendService::from_env(Some(resource_dir), Some(app_data_dir.clone()))
                .expect("disabled service should initialize");

        assert_eq!(service.endpoint, BackendEndpoint::Disabled);
        assert_eq!(service.state_path, None);
        assert_eq!(service.session_secret, None);
        assert!(service.executable.is_none());
        assert!(!app_data_dir.join("social-backend-session-secret").exists());
        assert!(!app_data_dir.join("social-backend-state.json").exists());
    }

    #[test]
    fn social_backend_from_env_local_mode_prepares_local_service_state() {
        let env = BackendEnvGuard::isolated();
        let root = tempfile::tempdir().expect("tempdir should be available");
        let app_data_dir = root.path().join("app-data");
        let backend_exe = root.path().join("custom-social-backend.exe");
        env.set(SOCIAL_BACKEND_URL_ENV, "local");
        env.set("THEBOYS_BACKEND_EXE", backend_exe.as_os_str());

        let service = SocialBackendService::from_env(None, Some(app_data_dir.clone()))
            .expect("local service should initialize");
        let expected_state_path = app_data_dir.join("social-backend-state.json");

        assert_eq!(
            service.endpoint,
            BackendEndpoint::Local {
                bind_addr: DEFAULT_BACKEND_BIND_ADDR.to_owned(),
            }
        );
        assert_eq!(
            service.state_path.as_deref(),
            Some(expected_state_path.as_path())
        );
        assert!(service
            .session_secret
            .as_deref()
            .is_some_and(|secret| secret.starts_with("tbl-v4-")));
        assert_eq!(
            service
                .executable
                .as_ref()
                .map(|executable| &executable.path),
            Some(&backend_exe)
        );
        assert!(app_data_dir.join("social-backend-session-secret").exists());
    }

    #[test]
    fn backend_executable_resolver_prefers_env_override() {
        let root = tempfile::tempdir().expect("tempdir should be available");
        let current_exe = root.path().join("TheBoysLauncher.exe");
        let packaged = root.path().join(backend_executable_name());
        std::fs::write(&packaged, "").expect("packaged backend fixture should write");
        let override_path = root.path().join("custom-backend.exe");

        let executable = resolve_backend_executable(
            Some(override_path.clone().into_os_string()),
            Some(current_exe),
            None,
        )
        .expect("override should resolve");

        assert_eq!(executable.path, override_path);
        assert_eq!(executable.source, BackendExecutableSource::Env);
    }

    #[test]
    fn backend_executable_resolver_finds_adjacent_packaged_binary() {
        let root = tempfile::tempdir().expect("tempdir should be available");
        let current_exe = root.path().join("TheBoysLauncher.exe");
        let packaged = root
            .path()
            .join("resources")
            .join(backend_executable_name());
        std::fs::create_dir_all(packaged.parent().expect("packaged parent should exist"))
            .expect("packaged parent should create");
        std::fs::write(&packaged, "").expect("packaged backend fixture should write");

        let executable = resolve_backend_executable(None, Some(current_exe), None)
            .expect("packaged backend should resolve");

        assert_eq!(executable.path, packaged);
        assert_eq!(executable.source, BackendExecutableSource::Adjacent);
    }

    #[test]
    fn backend_executable_resolver_finds_tauri_resource_directory() {
        let root = tempfile::tempdir().expect("tempdir should be available");
        let current_exe = root.path().join("app").join("TheBoysLauncher.exe");
        let resource_dir = root.path().join("tauri-resources");
        let packaged = resource_dir.join(backend_executable_name());
        std::fs::create_dir_all(&resource_dir).expect("resource dir should create");
        std::fs::write(&packaged, "").expect("packaged backend fixture should write");

        let executable = resolve_backend_executable(None, Some(current_exe), Some(resource_dir))
            .expect("resource backend should resolve");

        assert_eq!(executable.path, packaged);
        assert_eq!(executable.source, BackendExecutableSource::Adjacent);
    }

    #[test]
    fn backend_state_path_prefers_env_override() {
        let root = tempfile::tempdir().expect("tempdir should be available");
        let override_path = root.path().join("custom-social-state.json");
        let app_data_dir = root.path().join("app-data");

        let state_path = resolve_backend_state_path(
            Some(override_path.clone().into_os_string()),
            Some(app_data_dir),
        )
        .expect("state path should resolve");

        assert_eq!(state_path, override_path);
    }

    #[test]
    fn backend_state_path_defaults_to_app_data_file() {
        let root = tempfile::tempdir().expect("tempdir should be available");
        let app_data_dir = root.path().join("app-data");

        let state_path = resolve_backend_state_path(None, Some(app_data_dir.clone()))
            .expect("state path should resolve from app data");

        assert_eq!(state_path, app_data_dir.join("social-backend-state.json"));
    }

    #[test]
    fn backend_state_path_ignores_empty_env_without_app_data() {
        let state_path = resolve_backend_state_path(Some(OsString::new()), None);

        assert_eq!(state_path, None);
    }

    #[test]
    fn backend_session_secret_prefers_env_override() {
        let root = tempfile::tempdir().expect("tempdir should be available");
        let app_data_dir = root.path().join("app-data");

        let secret = resolve_backend_session_secret(
            Some(OsString::from(" configured-secret ")),
            Some(app_data_dir.clone()),
        )
        .expect("secret should resolve");

        assert_eq!(secret.as_deref(), Some("configured-secret"));
        assert!(!app_data_dir.join("social-backend-session-secret").exists());
    }

    #[test]
    fn backend_session_secret_persists_generated_secret() {
        let root = tempfile::tempdir().expect("tempdir should be available");
        let app_data_dir = root.path().join("app-data");
        let secret_path = app_data_dir.join("social-backend-session-secret");

        let first = resolve_backend_session_secret(None, Some(app_data_dir.clone()))
            .expect("generated secret should resolve")
            .expect("generated secret should be available");
        let second = resolve_backend_session_secret(None, Some(app_data_dir))
            .expect("persisted secret should resolve")
            .expect("persisted secret should be available");

        assert_eq!(first, second);
        assert!(first.starts_with("tbl-v4-"));
        assert_eq!(
            std::fs::read_to_string(&secret_path)
                .expect("secret file should exist")
                .trim(),
            first
        );
        let leftovers = std::fs::read_dir(secret_path.parent().expect("secret should have parent"))
            .expect("secret dir should read")
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with(".social-backend-session-secret.")
            })
            .count();
        assert_eq!(leftovers, 0);
    }

    #[test]
    fn backend_session_secret_replaces_blank_file() {
        let root = tempfile::tempdir().expect("tempdir should be available");
        let app_data_dir = root.path().join("app-data");
        let secret_path = app_data_dir.join("social-backend-session-secret");
        std::fs::create_dir_all(&app_data_dir).expect("app data should create");
        std::fs::write(&secret_path, "   \n").expect("blank secret fixture should write");

        let secret = resolve_backend_session_secret(None, Some(app_data_dir))
            .expect("replacement secret should resolve")
            .expect("replacement secret should be available");

        assert!(secret.starts_with("tbl-v4-"));
        assert_eq!(
            std::fs::read_to_string(secret_path)
                .expect("secret file should exist")
                .trim(),
            secret
        );
    }

    #[test]
    fn backend_start_command_passes_state_and_session_secret_env() {
        let root = tempfile::tempdir().expect("tempdir should be available");
        let executable = root.path().join(backend_executable_name());
        let state_path = root.path().join("social-state.json");
        let command = backend_start_command(
            &executable,
            "127.0.0.1:4074",
            Some(&state_path),
            Some("local-session-secret"),
        );
        let envs = command
            .get_envs()
            .map(|(key, value)| {
                (
                    key.to_string_lossy().to_string(),
                    value.map(|value| value.to_string_lossy().to_string()),
                )
            })
            .collect::<std::collections::HashMap<_, _>>();

        assert_eq!(
            envs.get("THEBOYS_BACKEND_BIND")
                .and_then(|value| value.as_deref()),
            Some("127.0.0.1:4074")
        );
        assert_eq!(
            envs.get("THEBOYS_BACKEND_STATE_PATH")
                .and_then(|value| value.as_deref()),
            Some(state_path.to_string_lossy().as_ref())
        );
        assert_eq!(
            envs.get("THEBOYS_BACKEND_SESSION_SECRET")
                .and_then(|value| value.as_deref()),
            Some("local-session-secret")
        );
    }

    #[cfg(unix)]
    #[test]
    fn backend_session_secret_file_is_private_on_unix() {
        use std::os::unix::fs::PermissionsExt;

        let root = tempfile::tempdir().expect("tempdir should be available");
        let app_data_dir = root.path().join("app-data");
        let secret_path = app_data_dir.join("social-backend-session-secret");

        resolve_backend_session_secret(None, Some(app_data_dir))
            .expect("secret should resolve")
            .expect("secret should exist");

        let mode = std::fs::metadata(secret_path)
            .expect("secret metadata should read")
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o600);
    }

    #[test]
    fn microsoft_callback_request_line_builds_loopback_url() {
        let callback_url = microsoft_callback_url_from_request_line(
            "GET /?code=abc%20123&state=state-abc HTTP/1.1",
            "http://127.0.0.1:53682",
        )
        .expect("callback request should parse");

        assert_eq!(
            callback_url,
            "http://127.0.0.1:53682/?code=abc%20123&state=state-abc"
        );
    }

    #[test]
    fn microsoft_callback_request_line_rejects_unsupported_requests() {
        assert!(microsoft_callback_url_from_request_line(
            "POST /auth/microsoft/callback?code=abc&state=state HTTP/1.1",
            "http://127.0.0.1:53682",
        )
        .expect_err("non-GET callbacks should be rejected")
        .to_string()
        .contains("GET"));
        assert!(microsoft_callback_url_from_request_line(
            "GET https://evil.example/auth/microsoft/callback?code=abc&state=state HTTP/1.1",
            "http://127.0.0.1:53682",
        )
        .expect_err("absolute callback targets should be rejected")
        .to_string()
        .contains("absolute path"));
        assert!(microsoft_callback_url_from_request_line(
            "GET //evil.example/auth/microsoft/callback?code=abc&state=state HTTP/1.1",
            "http://127.0.0.1:53682",
        )
        .expect_err("scheme-relative callback targets should be rejected")
        .to_string()
        .contains("not supported"));
        assert!(microsoft_callback_url_from_request_line(
            "GET /favicon.ico HTTP/1.1",
            "http://127.0.0.1:53682",
        )
        .expect_err("unsupported callback paths should be rejected")
        .to_string()
        .contains("target path"));
    }

    #[test]
    fn microsoft_callback_http_response_escapes_browser_content() {
        let response =
            microsoft_callback_http_response(400, "Failed <bad>", "Try again & close \"this\" tab");

        assert!(response.starts_with("HTTP/1.1 400 Bad Request"));
        assert!(response.contains("Content-Security-Policy: default-src 'none'"));
        assert!(response.contains("Referrer-Policy: no-referrer"));
        assert!(response.contains("X-Content-Type-Options: nosniff"));
        assert!(response.contains("Cache-Control: no-store"));
        assert!(response.contains("Failed &lt;bad&gt;"));
        assert!(response.contains("Try again &amp; close &quot;this&quot; tab"));
        assert!(!response.contains("<bad>"));
    }

    #[test]
    fn microsoft_callback_user_error_message_hides_oauth_details() {
        let message = microsoft_callback_user_error_message(
            "Microsoft token exchange failed: invalid_grant: Refresh token expired",
        );

        assert_eq!(
            message,
            "Microsoft sign-in could not be completed. Close this tab and sign in again from TheBoysLauncher."
        );
        assert!(!message.contains("invalid_grant"));
        assert!(!message.contains("token exchange"));

        let setup_message =
            microsoft_callback_user_error_message("THEBOYS_MICROSOFT_CLIENT_ID is required");
        assert_eq!(
            setup_message,
            "Microsoft sign-in is not configured for this launcher build. Close this tab and check the launcher setup."
        );
    }

    #[test]
    fn microsoft_auth_url_validation_accepts_login_live_authorize_url() {
        validate_microsoft_auth_url(
            "https://login.live.com/oauth20_authorize.srf?client_id=client&state=state",
        )
        .expect("Microsoft authorize URL should be accepted");
    }

    #[test]
    fn microsoft_auth_url_validation_rejects_unsupported_urls() {
        for url in [
            "http://login.live.com/oauth20_authorize.srf",
            "https://example.com/oauth20_authorize.srf",
            "https://login.live.com/oauth20_token.srf",
            "not a url",
        ] {
            assert!(
                validate_microsoft_auth_url(url).is_err(),
                "expected {url} to be rejected"
            );
        }
    }

    #[test]
    fn renderer_supplied_authenticated_launch_is_blocked_for_packaged_mode() {
        let session = MinecraftSession {
            username: "Preview".to_owned(),
            uuid: Uuid::parse_str("00000000-0000-4000-8000-000000000001")
                .expect("test uuid should parse"),
            access_token: "preview-access-token".to_owned(),
        };

        let message = ensure_renderer_authenticated_launch_allowed_for_mode(&session, false)
            .expect_err("packaged mode should reject renderer-supplied launch sessions");

        assert_eq!(
            message,
            "Desktop authenticated launch uses the selected saved Microsoft account. Sign in with Microsoft first."
        );
        assert!(!message.contains("THEBOYS"));
        assert!(ensure_renderer_authenticated_launch_allowed_for_mode(&session, true).is_ok());
    }

    #[test]
    fn redacted_renderer_session_cannot_be_used_for_authenticated_launch() {
        let session = MinecraftSession {
            username: "Builder".to_owned(),
            uuid: Uuid::parse_str("00000000-0000-4000-8000-000000000001")
                .expect("test uuid should parse"),
            access_token: REDACTED_RENDERER_TOKEN.to_owned(),
        };

        let message = ensure_renderer_authenticated_launch_allowed_for_mode(&session, true)
            .expect_err("redacted renderer sessions should never launch");

        assert_eq!(
            message,
            "Desktop authenticated launch uses the selected saved Microsoft account. Sign in again if needed."
        );
        assert!(!message.to_ascii_lowercase().contains("token"));
    }

    #[tokio::test]
    async fn microsoft_callback_listener_reads_single_loopback_request() {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("test listener should bind");
        let addr = listener
            .local_addr()
            .expect("test listener should have addr");
        let origin = format!("http://{addr}");
        let client = tokio::spawn(async move {
            let mut stream = TcpStream::connect(addr)
                .await
                .expect("test client should connect");
            stream
                .write_all(b"GET /?code=abc&state=state-abc HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
                .await
                .expect("test request should write");
        });

        let (callback_url, _) =
            receive_microsoft_callback_request(vec![listener], &origin, Duration::from_secs(2))
                .await
                .expect("listener should receive callback");
        client.await.expect("test client should finish");

        assert_eq!(callback_url, format!("{origin}/?code=abc&state=state-abc"));
    }

    #[tokio::test]
    async fn microsoft_callback_listener_ignores_non_callback_paths() {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("test listener should bind");
        let addr = listener
            .local_addr()
            .expect("test listener should have addr");
        let origin = format!("http://{addr}");
        let noise_client = tokio::spawn(async move {
            let mut stream = TcpStream::connect(addr)
                .await
                .expect("noise client should connect");
            stream
                .write_all(b"GET /favicon.ico HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
                .await
                .expect("noise request should write");
        });
        let callback_client = tokio::spawn(async move {
            noise_client.await.expect("noise client should finish");
            let mut stream = TcpStream::connect(addr)
                .await
                .expect("callback client should connect");
            stream
                .write_all(b"GET /?code=abc&state=state-abc HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
                .await
                .expect("callback request should write");
        });

        let (callback_url, _) =
            receive_microsoft_callback_request(vec![listener], &origin, Duration::from_secs(2))
                .await
                .expect("listener should ignore noise and receive callback");
        callback_client
            .await
            .expect("callback client should finish");

        assert_eq!(callback_url, format!("{origin}/?code=abc&state=state-abc"));
    }

    #[test]
    fn stored_session_expiry_threshold_triggers_refresh_only_near_expiration() {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .expect("system time should be after Unix epoch");

        assert!(!stored_session_expires_soon(&stored_session_with_expiry(
            None
        )));
        assert!(!stored_session_expires_soon(&stored_session_with_expiry(
            Some(now + 120)
        )));
        assert!(stored_session_expires_soon(&stored_session_with_expiry(
            Some(now + 30)
        )));
    }

    #[tokio::test]
    async fn unmanaged_backend_stop_reports_offline_status() {
        let service = SocialBackendService {
            endpoint: BackendEndpoint::Local {
                bind_addr: "127.0.0.1:9".to_owned(),
            },
            state_path: None,
            session_secret: None,
            executable: None,
            child: Mutex::new(None),
        };

        let status = service.stop().await.expect("stop should be idempotent");

        assert!(!status.running);
        assert!(!status.managed);
        assert!(!status.can_start);
        assert_eq!(status.process_id, None);
        assert!(status.message.contains("no packaged service was found"));
    }

    #[tokio::test]
    async fn backend_status_reports_when_packaged_backend_can_start() {
        let service = SocialBackendService {
            endpoint: BackendEndpoint::Local {
                bind_addr: "127.0.0.1:9".to_owned(),
            },
            state_path: None,
            session_secret: None,
            executable: Some(BackendExecutable {
                path: PathBuf::from("social-backend.exe"),
                source: BackendExecutableSource::Adjacent,
            }),
            child: Mutex::new(None),
        };

        let status = service.status().await;

        assert!(!status.running);
        assert!(!status.managed);
        assert!(status.can_start);
        assert_eq!(status.process_id, None);
        assert!(status.message.contains("packaged service can be started"));
    }

    #[tokio::test]
    async fn hosted_backend_status_never_offers_local_start() {
        let service = SocialBackendService {
            endpoint: BackendEndpoint::Hosted {
                origin: "https://social.example.test".to_owned(),
                health_url: "https://social.example.test/health".to_owned(),
            },
            state_path: None,
            session_secret: None,
            executable: Some(BackendExecutable {
                path: PathBuf::from("social-backend.exe"),
                source: BackendExecutableSource::Adjacent,
            }),
            child: Mutex::new(None),
        };

        let status = service.status().await;

        assert_eq!(status.endpoint_kind, "hosted");
        assert_eq!(status.endpoint_url, "https://social.example.test");
        assert!(!status.can_start);
        assert!(status
            .message
            .contains("Hosted friends service is configured"));
        assert!(service
            .start()
            .await
            .expect_err("hosted start should fail")
            .contains("packaged clients do not start a local service"));
    }

    #[tokio::test]
    async fn disabled_backend_status_never_offers_local_start() {
        let service = SocialBackendService {
            endpoint: BackendEndpoint::Disabled,
            state_path: None,
            session_secret: None,
            executable: Some(BackendExecutable {
                path: PathBuf::from("social-backend.exe"),
                source: BackendExecutableSource::Adjacent,
            }),
            child: Mutex::new(None),
        };

        let status = service.status().await;

        assert_eq!(status.endpoint_kind, "disabled");
        assert_eq!(status.endpoint_url, "off");
        assert_eq!(status.health_url, "");
        assert!(!status.running);
        assert!(!status.managed);
        assert!(!status.can_start);
        assert!(status.message.contains("Friends service is turned off"));
        assert!(service
            .start()
            .await
            .expect_err("disabled start should fail")
            .contains("Friends service is turned off"));
    }

    #[test]
    fn backend_stop_managed_child_clears_running_child() {
        let mut command = if cfg!(windows) {
            let mut command = Command::new("cmd.exe");
            command.args(["/C", "ping", "-n", "30", "127.0.0.1", ">NUL"]);
            command
        } else {
            let mut command = Command::new("sleep");
            command.arg("30");
            command
        };
        let child = command
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("test child should spawn");
        let service = SocialBackendService {
            endpoint: BackendEndpoint::Local {
                bind_addr: "127.0.0.1:9".to_owned(),
            },
            state_path: None,
            session_secret: None,
            executable: None,
            child: Mutex::new(Some(child)),
        };

        service
            .stop_managed_child()
            .expect("managed child should stop");

        assert_eq!(service.managed_process_id(), None);
    }
}
