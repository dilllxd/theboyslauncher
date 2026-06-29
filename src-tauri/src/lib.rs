#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::{
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use launcher_core::{
    archive_profile as core_archive_profile,
    authenticate_and_save_minecraft_session as core_authenticate_and_save_minecraft_session,
    authenticate_minecraft_session as core_authenticate_minecraft_session,
    authenticate_with_xbox_live as core_authenticate_with_xbox_live,
    authorize_xsts_for_minecraft as core_authorize_xsts_for_minecraft,
    bootstrap_snapshot as core_bootstrap_snapshot,
    bootstrap_snapshot_with_remote_catalog as core_bootstrap_snapshot_with_remote_catalog,
    build_authenticated_launch_plan as core_build_authenticated_launch_plan,
    build_curated_pack_file_download_plan as core_build_curated_pack_file_download_plan,
    build_curseforge_modpack_archive_install_plan as core_build_curseforge_modpack_archive_install_plan,
    build_install_auxiliary_download_plan as core_build_install_auxiliary_download_plan,
    build_launch_failed_operation_plan as core_build_launch_failed_operation_plan,
    build_launch_operation_plan as core_build_launch_operation_plan,
    build_launch_planning_failed_operation_plan as core_build_launch_planning_failed_operation_plan,
    build_managed_java_runtime_download_plan as core_build_managed_java_runtime_download_plan,
    build_modloader_dependency_download_plan_for_profile as core_build_modloader_dependency_download_plan_for_profile,
    build_modloader_download_plan as core_build_modloader_download_plan,
    build_modloader_download_plan_for_profile_with_loader_version as core_build_modloader_download_plan_for_profile_with_loader_version,
    build_offline_launch_plan as core_build_offline_launch_plan,
    build_offline_launch_plan_with_server as core_build_offline_launch_plan_with_server,
    build_process_command_spec as core_build_process_command_spec,
    build_repair_auxiliary_download_plan as core_build_repair_auxiliary_download_plan,
    build_stored_authenticated_launch_plan as core_build_stored_authenticated_launch_plan,
    build_vanilla_download_plan as core_build_vanilla_download_plan,
    clear_minecraft_session as core_clear_minecraft_session, create_profile as core_create_profile,
    delete_profile as core_delete_profile,
    direct_pack_file_download_plan as core_direct_pack_file_download_plan,
    discover_java_runtimes as core_discover_java_runtimes,
    exchange_microsoft_authorization_code as core_exchange_microsoft_authorization_code,
    execute_download_plan_with_event_callback as core_execute_download_plan_with_event_callback,
    execute_import_plan_and_persist_profile as core_execute_import_plan_and_persist_profile,
    execute_managed_java_runtime_install as core_execute_managed_java_runtime_install,
    execute_modloader_installer_processors_for_profile_with_event_callback as core_execute_modloader_installer_processors_for_profile_with_event_callback,
    extract_curseforge_modpack_archive as core_extract_curseforge_modpack_archive,
    extract_modloader_installer_metadata_for_profile as core_extract_modloader_installer_metadata_for_profile,
    extract_native_libraries_from_download_plan as core_extract_native_libraries_from_download_plan,
    fetch_install_auxiliary_download_plan_for_pack_profile_with_remote_catalog as core_fetch_install_auxiliary_download_plan_for_pack_profile_with_remote_catalog,
    fetch_minecraft_entitlements as core_fetch_minecraft_entitlements,
    fetch_minecraft_profile as core_fetch_minecraft_profile, fetch_minecraft_version_manifest,
    fetch_pack_install_profile_with_remote_catalog as core_fetch_pack_install_profile_with_remote_catalog,
    fetch_packwiz_metafile_download_plan as core_fetch_packwiz_metafile_download_plan,
    fetch_recommended_java_runtime_manifest as core_fetch_recommended_java_runtime_manifest,
    fetch_repair_auxiliary_download_plan_for_profile_with_remote_catalog as core_fetch_repair_auxiliary_download_plan_for_profile_with_remote_catalog,
    launch_profile as core_launch_profile, list_minecraft_accounts as core_list_minecraft_accounts,
    load_minecraft_session as core_load_minecraft_session, load_profiles as core_load_profiles,
    load_settings as core_load_settings,
    login_minecraft_with_xbox as core_login_minecraft_with_xbox,
    managed_process_lifecycle_event as core_managed_process_lifecycle_event,
    mark_profile_launched as core_mark_profile_launched,
    minecraft_version_summaries as core_minecraft_version_summaries,
    persist_installed_pack_profile as core_persist_installed_pack_profile,
    plan_download_artifacts as core_plan_download_artifacts,
    plan_install_pack_with_remote_catalog as core_plan_install_pack_with_remote_catalog,
    plan_managed_java_runtime_install as core_plan_managed_java_runtime_install,
    plan_microsoft_token_exchange as core_plan_microsoft_token_exchange,
    plan_profile_import as core_plan_profile_import,
    plan_repair_profile as core_plan_repair_profile,
    prepare_launcher_directories as core_prepare_launcher_directories,
    refresh_saved_minecraft_session as core_refresh_saved_minecraft_session,
    remove_minecraft_account as core_remove_minecraft_account,
    resolve_minecraft_version as core_resolve_minecraft_version,
    save_minecraft_session as core_save_minecraft_session, save_settings as core_save_settings,
    scan_imports as core_scan_imports, select_minecraft_account as core_select_minecraft_account,
    start_microsoft_auth_flow as core_start_microsoft_auth_flow,
    start_microsoft_login as core_start_microsoft_login, update_profile as core_update_profile,
    LauncherEventLog, ProcessRegistry,
};
use reqwest::Url;
use shared::{
    ActionReceipt, ActionStatus, AppSnapshot, ArchiveProfileRequest, CreateProfileRequest,
    DeleteProfileRequest, DownloadItem, DownloadKind, DownloadPlan, ImportCandidate, ImportPlan,
    ImportPlanRequest, InstallModpackArchiveRequest, JavaRuntimeDownloadRequest,
    JavaRuntimeManifestEntry, JavaRuntimeSummary, LaunchPlan, LauncherAction, LauncherDirectories,
    LauncherEvent, LauncherEventKind, LauncherOperation, LauncherSettings, ManagedProcessSummary,
    MicrosoftAuthCallback, MicrosoftAuthStart, MicrosoftOAuthTokens, MicrosoftTokenExchangePlan,
    MinecraftEntitlements, MinecraftProfile, MinecraftServicesToken, MinecraftSession,
    MinecraftVersionSummary, OperationPlan, ProcessCommandSpec, ProcessLogExport, ProfileSummary,
    ServerLaunchTarget, SocialBackendStatus, StoredMinecraftAccountSummary, StoredMinecraftSession,
    UpdateProfileRequest, XboxLiveAuthToken,
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
const MICROSOFT_CALLBACK_BIND_ADDR: &str = "127.0.0.1:53682";
const MICROSOFT_CALLBACK_ORIGIN: &str = "http://localhost:53682";
const MICROSOFT_CALLBACK_PATH: &str = "/";
const MICROSOFT_CALLBACK_TIMEOUT: Duration = Duration::from_secs(180);
const MICROSOFT_CLIENT_ID_ENV: &str = "THEBOYS_MICROSOFT_CLIENT_ID";
const DEFAULT_MICROSOFT_CLIENT_ID: &str = "d10dfc60-1a42-44a8-b3af-edf4f5ee2c1f";
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

    fn ensure_idle(&self, attempted_operation: &str) -> Result<(), String> {
        let active = self
            .active
            .lock()
            .map_err(|_| "launcher lifecycle operation lock poisoned".to_owned())?;
        if let Some(active) = active.as_ref() {
            return Err(format!(
                "cannot {attempted_operation} while another launcher lifecycle operation is already running: {active}"
            ));
        }
        Ok(())
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
}

impl BackendEndpoint {
    fn kind(&self) -> &'static str {
        match self {
            BackendEndpoint::Hosted { .. } => "hosted",
            BackendEndpoint::Local { .. } => "local",
        }
    }

    fn display_address(&self) -> String {
        match self {
            BackendEndpoint::Hosted { origin, .. } => origin.clone(),
            BackendEndpoint::Local { bind_addr } => bind_addr.clone(),
        }
    }

    fn health_url(&self) -> String {
        match self {
            BackendEndpoint::Hosted { health_url, .. } => health_url.clone(),
            BackendEndpoint::Local { bind_addr } => backend_health_url(bind_addr),
        }
    }

    fn is_hosted(&self) -> bool {
        matches!(self, BackendEndpoint::Hosted { .. })
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
        let executable =
            resolve_backend_executable(std::env::var_os("THEBOYS_BACKEND_EXE"), None, resource_dir);
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
        let running = backend_health_check(&health_url).await;
        let process_id = self.managed_process_id();
        let managed = process_id.is_some();
        let can_start = !self.endpoint.is_hosted() && !running && self.executable.is_some();
        let message = match &self.endpoint {
            BackendEndpoint::Hosted { origin, .. } => {
                if running {
                    format!("Hosted social backend is reachable at {origin}")
                } else {
                    format!("Hosted social backend is configured at {origin} but is not reachable; local launcher features remain available")
                }
            }
            BackendEndpoint::Local { .. } => {
                if running {
                    "Local social backend is reachable".to_owned()
                } else if let Some(executable) = self.executable.as_ref() {
                    match executable.source {
                        BackendExecutableSource::Env => {
                            "Local social backend is not reachable; configured binary can be started".to_owned()
                        }
                        BackendExecutableSource::Adjacent => {
                            "Local social backend is not reachable; packaged binary can be started".to_owned()
                        }
                    }
                } else {
                    "Local social backend is not reachable and no packaged or THEBOYS_BACKEND_EXE binary was found"
                        .to_owned()
                }
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
                "hosted social backend is configured at {origin}; packaged clients do not start a local backend unless {SOCIAL_BACKEND_URL_ENV}=local is set"
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
                    "a packaged social-backend binary or THEBOYS_BACKEND_EXE is required before it can be started"
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
                    .map_err(|error| format!("failed to start social backend: {error}"))?;
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
        if hosted_backend_url_disables_hosted_mode(&value) {
            return Ok(BackendEndpoint::Local {
                bind_addr: local_bind_addr,
            });
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

fn hosted_backend_url_disables_hosted_mode(value: &str) -> bool {
    value.eq_ignore_ascii_case("local")
        || value.eq_ignore_ascii_case("loopback")
        || value.eq_ignore_ascii_case("disabled")
        || value.eq_ignore_ascii_case("off")
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
    let listener = TcpListener::bind(MICROSOFT_CALLBACK_BIND_ADDR)
        .await
        .map_err(|error| {
            format!(
                "could not listen for Microsoft sign-in callback on {MICROSOFT_CALLBACK_BIND_ADDR}: {error}"
            )
        })?;
    let (callback_url, mut stream) = receive_microsoft_callback_request(
        listener,
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
            format!("Sign-in failed: {error}. You can close this tab and try again.").as_str(),
        ),
    };
    let _ = stream.write_all(response.as_bytes()).await;
    result
        .map(renderer_safe_minecraft_session)
        .map_err(|error| error.to_string())
}

async fn receive_microsoft_callback_request(
    listener: TcpListener,
    origin: &str,
    wait_for: Duration,
) -> anyhow::Result<(String, TcpStream)> {
    let deadline = Instant::now() + wait_for;
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        anyhow::ensure!(
            !remaining.is_zero(),
            "timed out waiting for Microsoft sign-in callback"
        );
        let (mut stream, _) = timeout(remaining, listener.accept())
            .await
            .map_err(|_| anyhow::anyhow!("timed out waiting for Microsoft sign-in callback"))??;
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
        "HTTP/1.1 {status} {reason}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
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
        .map_err(|error| error.to_string())
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

#[tauri::command(rename_all = "camelCase")]
async fn exchange_stored_minecraft_session_for_backend_session(
    backend: State<'_, SocialBackendService>,
    account_id: String,
    health_url: String,
) -> Result<BackendSessionResponse, String> {
    let session = load_or_refresh_stored_minecraft_session().await?;
    if account_id != session.session.uuid.to_string() {
        return Err(
            "stored Minecraft session account id must match the verified Minecraft UUID".to_owned(),
        );
    }
    let origin = backend.social_backend_origin_from_health_url(&health_url)?;
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
        .map_err(|error| format!("Minecraft backend session exchange failed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Minecraft backend session exchange failed with HTTP status {}",
            response.status()
        ));
    }
    response
        .json::<BackendSessionResponse>()
        .await
        .map_err(|error| format!("Minecraft backend session response was invalid: {error}"))
}

impl SocialBackendService {
    fn social_backend_origin_from_health_url(&self, health_url: &str) -> Result<String, String> {
        if health_url != self.health_url() {
            return Err(
                "social backend health URL must match the configured launcher backend".to_owned(),
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
        .map_err(|error| format!("social backend health URL is invalid: {error}"))?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "social backend health URL is missing a host".to_owned())?;
    let normalized_host = normalized_url_host(host);
    match endpoint {
        BackendEndpoint::Local { .. } => {
            if parsed.scheme() != "http" {
                return Err("local social backend health URL must use http".to_owned());
            }
            if !is_loopback_social_backend_host(normalized_host) {
                return Err(
                    "local social backend health URL must target the packaged backend".to_owned(),
                );
            }
        }
        BackendEndpoint::Hosted { origin, .. } => {
            match parsed.scheme() {
                "https" => {}
                "http" if is_loopback_social_backend_host(normalized_host) => {}
                _ => {
                    return Err(
                        "hosted social backend health URL must use https unless it targets loopback test infrastructure"
                            .to_owned(),
                    )
                }
            }
            if backend_url_origin(&parsed) != *origin {
                return Err(
                    "hosted social backend health URL must match the configured backend origin"
                        .to_owned(),
                );
            }
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

#[tauri::command(rename_all = "camelCase")]
fn open_external_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://github.com/dilllxd/theboyslauncher/releases/download/") {
        return Err("Only TheBoysLauncher release downloads can be opened.".to_owned());
    }

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
    let session = load_or_refresh_stored_minecraft_session().await?;
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
        "{} deleted. Profile files were removed; shared Minecraft downloads were kept for faster reinstalls.",
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
            repair_profile_inner(
                profile_id.to_owned(),
                event_log,
                "Profile repair completed.",
            )
            .await
            .map_err(|repair_error| {
                native_operation_failure_message(
                    "Automatic profile repair before launch failed",
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
    lifecycle_gate: State<'_, LifecycleOperationGate>,
) -> Result<ManagedProcessSummary, String> {
    lifecycle_gate.ensure_idle("launch a profile")?;
    if let Some(process) = active_managed_process_summary(&registry, &profile_id)? {
        return Ok(process);
    }
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let settings = core_load_settings().map_err(|error| error.to_string())?;
    let mut launch_plan = match core_build_offline_launch_plan(&profile_id, &settings, &directories)
    {
        Ok(launch_plan) => launch_plan,
        Err(error) => {
            return Err(record_launch_planning_failure(
                &profile_id,
                error.to_string(),
                &event_log,
            )?);
        }
    };
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
    lifecycle_gate: State<'_, LifecycleOperationGate>,
) -> Result<ManagedProcessSummary, String> {
    lifecycle_gate.ensure_idle("launch a profile")?;
    if let Some(process) = active_managed_process_summary(&registry, &profile_id)? {
        return Ok(process);
    }
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let settings = core_load_settings().map_err(|error| error.to_string())?;
    let mut launch_plan = match core_build_authenticated_launch_plan(
        &profile_id,
        &settings,
        &directories,
        &session,
        server.as_ref(),
    ) {
        Ok(launch_plan) => launch_plan,
        Err(error) => {
            return Err(record_launch_planning_failure(
                &profile_id,
                error.to_string(),
                &event_log,
            )?);
        }
    };
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
    lifecycle_gate: State<'_, LifecycleOperationGate>,
) -> Result<ManagedProcessSummary, String> {
    lifecycle_gate.ensure_idle("launch a profile")?;
    if let Some(process) = active_managed_process_summary(&registry, &profile_id)? {
        return Ok(process);
    }
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let settings = core_load_settings().map_err(|error| error.to_string())?;
    let session = load_or_refresh_stored_minecraft_session().await?;
    let mut launch_plan = match core_build_stored_authenticated_launch_plan(
        &profile_id,
        &settings,
        &directories,
        &session,
        server.as_ref(),
    ) {
        Ok(launch_plan) => launch_plan,
        Err(error) => {
            return Err(record_launch_planning_failure(
                &profile_id,
                error.to_string(),
                &event_log,
            )?);
        }
    };
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
    lifecycle_gate: State<'_, LifecycleOperationGate>,
) -> Result<ManagedProcessSummary, String> {
    lifecycle_gate.ensure_idle("launch a profile")?;
    if let Some(process) = active_managed_process_summary(&registry, &profile_id)? {
        return Ok(process);
    }
    let directories = core_prepare_launcher_directories().map_err(|error| error.to_string())?;
    let settings = core_load_settings().map_err(|error| error.to_string())?;
    let mut launch_plan = match core_build_offline_launch_plan_with_server(
        &profile_id,
        &settings,
        &directories,
        Some(&server),
    ) {
        Ok(launch_plan) => launch_plan,
        Err(error) => {
            return Err(record_launch_planning_failure(
                &profile_id,
                error.to_string(),
                &event_log,
            )?);
        }
    };
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
                "failed to reveal exported process log {}: {error}",
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
                "failed to reveal exported process log {}: {error}",
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
                "failed to open exported process log folder {}: {error}",
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
        "profile '{profile_id}' has a running managed process (PID {}). Stop it before repairing.",
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
    } else if queued_message.contains("reinstall queued") {
        "Pack reinstalled successfully."
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
    event_log
        .record_plan(&extraction)
        .map_err(|error| error.to_string())?;

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

    let mut auxiliary_plan = install_plan.mod_download_plan.clone();
    if profile.loader != shared::ModLoader::Vanilla {
        let modloader_plan = core_build_modloader_download_plan_for_profile_with_loader_version(
            &profile,
            install_plan.loader_version.as_deref(),
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
            LauncherOperation::InstallPack,
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
    let _lifecycle_guard = lifecycle_gate.acquire(format!("repairing profile '{profile_id}'"))?;
    if let Some(process) = active_managed_process_summary(&registry, &profile_id)? {
        return Err(profile_repair_active_process_error(&profile_id, &process));
    }
    match repair_profile_inner(profile_id.clone(), &event_log, "Profile repair completed.").await {
        Ok(receipt) => Ok(receipt),
        Err(error) => {
            let message = native_operation_failure_message("Profile repair failed", &error.message);
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
                    "{}; additionally failed to record repair failure event: {record_error}",
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
            app.manage(ProcessRegistry::new());
            app.manage(LauncherEventLog::new());
            app.manage(LifecycleOperationGate::default());
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
            install_modpack_archive,
            install_pack,
            plan_install_pack,
            repair_profile,
            prepare_profile,
            plan_repair_profile,
            list_launcher_events,
            create_profile,
            update_profile,
            archive_profile,
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

        let error = match gate.acquire("repairing profile 'winterpack'") {
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
            .acquire("repairing profile 'winterpack'")
            .expect("dropped lifecycle guard should release gate");

        assert_eq!(
            gate.active_description().unwrap().as_deref(),
            Some("repairing profile 'winterpack'")
        );
    }

    #[test]
    fn lifecycle_operation_gate_blocks_launch_while_busy() {
        let gate = LifecycleOperationGate::default();
        let _guard = gate
            .acquire("installing pack 'winterpack'")
            .expect("first lifecycle operation should acquire gate");

        let error = gate
            .ensure_idle("launch a profile")
            .expect_err("launch should be rejected while install is running");

        assert!(error.contains("cannot launch a profile"));
        assert!(error.contains("installing pack 'winterpack'"));
    }

    #[test]
    fn lifecycle_operation_gate_allows_launch_when_idle() {
        let gate = LifecycleOperationGate::default();

        gate.ensure_idle("launch a profile")
            .expect("idle gate should allow launch checks");
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
    fn renderer_redacted_session_cannot_be_saved_back_to_native_store() {
        let mut session = stored_session_with_expiry(Some(2_000));
        session.session.access_token = REDACTED_RENDERER_TOKEN.to_owned();

        let error = ensure_renderer_session_can_be_saved(&session)
            .expect_err("redacted renderer token should be rejected");

        assert!(error.contains("renderer-redacted Minecraft sessions cannot be saved"));
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
            "launch artifact is missing: cache/assets/indexes/1.21.8.json. Install or repair the profile before launching."
        ));
        assert!(launch_failure_missing_artifacts(
            "launch artifacts are missing: library.jar; natives directory. Install or repair the profile before launching."
        ));
        assert!(!launch_failure_missing_artifacts(
            "Java executable C:/Java/bin/java.exe is missing. Install a managed Java runtime from Settings before launching."
        ));
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
            install_pack_completion_message(&install_plan_fixture(
                "Reinstall queued for WinterPack"
            )),
            "Pack reinstalled successfully."
        );
    }

    #[test]
    fn completed_native_operation_event_marks_successful_native_work() {
        let event = completed_native_operation_event(
            LauncherOperation::RepairProfile,
            "winterpack",
            "Profile repair completed.",
        );

        assert_eq!(event.operation, Some(LauncherOperation::RepairProfile));
        assert_eq!(event.subject_id.as_deref(), Some("winterpack"));
        assert_eq!(event.kind, LauncherEventKind::Completed);
        assert_eq!(event.progress_percent, Some(100));
        assert_eq!(event.message, "Profile repair completed.");
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
    fn failed_planned_native_operation_event_keeps_plan_grouping() {
        let operation_id = Uuid::new_v4();
        let event = failed_planned_native_operation_event(
            operation_id,
            LauncherOperation::RepairProfile,
            "winterpack",
            "Profile repair failed: asset index is missing",
        );

        assert_eq!(event.operation_id, operation_id);
        assert_eq!(event.operation, Some(LauncherOperation::RepairProfile));
        assert_eq!(event.subject_id.as_deref(), Some("winterpack"));
        assert_eq!(event.kind, LauncherEventKind::Failed);
        assert_eq!(event.progress_percent, Some(100));
        assert_eq!(
            event.message,
            "Profile repair failed: asset index is missing"
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
            native_operation_failure_message("Profile repair failed", "asset index is missing"),
            "Profile repair failed: asset index is missing"
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
            "WinterPack deleted. Profile files were removed; shared Minecraft downloads were kept for faster reinstalls."
        );
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
        assert!(
            events
                .iter()
                .any(|event| event.message
                    == "Downloading artifact: bridge-client (client jar, 20 B)")
        );
        assert!(events
            .iter()
            .any(|event| event.message == "Downloaded artifact: bridge-client (client jar, 20 B)"));
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
            .position(|event| {
                event
                    .message
                    .starts_with("Downloading artifact: bridge-client")
            })
            .expect("start event should be recorded");
        let done_index = events
            .iter()
            .position(|event| {
                event
                    .message
                    .starts_with("Downloaded artifact: bridge-client")
            })
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
            .contains("Stop it before repairing"));
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
        assert!(response.contains("Failed &lt;bad&gt;"));
        assert!(response.contains("Try again &amp; close &quot;this&quot; tab"));
        assert!(!response.contains("<bad>"));
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
            receive_microsoft_callback_request(listener, &origin, Duration::from_secs(2))
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
            receive_microsoft_callback_request(listener, &origin, Duration::from_secs(2))
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
        assert!(status
            .message
            .contains("no packaged or THEBOYS_BACKEND_EXE"));
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
        assert!(status.message.contains("packaged binary can be started"));
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
            .contains("Hosted social backend is configured"));
        assert!(service
            .start()
            .await
            .expect_err("hosted start should fail")
            .contains("packaged clients do not start a local backend"));
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
