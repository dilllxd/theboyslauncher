use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LauncherSettings {
    pub max_memory_mb: u32,
    pub min_memory_mb: u32,
    pub offline_username: String,
    pub telemetry_enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub java_runtime_override_path: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LauncherDirectories {
    pub data_dir: String,
    pub config_dir: String,
    pub cache_dir: String,
    pub log_dir: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SocialBackendStatus {
    #[serde(default)]
    pub endpoint_kind: String,
    #[serde(default)]
    pub endpoint_url: String,
    pub bind_addr: String,
    pub health_url: String,
    pub running: bool,
    pub managed: bool,
    #[serde(default)]
    pub can_start: bool,
    pub process_id: Option<u32>,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FriendPresence {
    pub id: String,
    pub name: String,
    pub avatar_color: String,
    pub state: PresenceState,
    pub pack_name: Option<String>,
    pub server_name: Option<String>,
    pub joinable: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PresenceState {
    Online,
    Idle,
    Playing,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PackSummary {
    pub id: String,
    pub name: String,
    pub tagline: String,
    pub version: String,
    pub status: PackStatus,
    pub accent: String,
    pub installed_players: u32,
    pub default_server: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModpackCatalogEntry {
    pub id: String,
    pub display_name: Option<String>,
    pub pack_url: String,
    pub instance_name: String,
    pub description: Option<String>,
    pub author: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub last_updated: Option<String>,
    pub category: Option<String>,
    pub min_ram: Option<u32>,
    pub recommended_ram: Option<u32>,
    pub default_server: Option<String>,
    pub changelog: Option<String>,
    #[serde(default)]
    pub default: bool,
}

pub const BUNDLED_MODPACK_CATALOG_JSON: &str = include_str!("../../../config/modpacks.json");

pub fn bundled_modpack_catalog() -> Vec<ModpackCatalogEntry> {
    parse_modpack_catalog_json(BUNDLED_MODPACK_CATALOG_JSON).unwrap_or_default()
}

pub fn bundled_pack_summaries() -> Vec<PackSummary> {
    bundled_modpack_catalog()
        .into_iter()
        .map(pack_summary_from_catalog_entry)
        .collect()
}

pub fn parse_modpack_catalog_json(
    json: &str,
) -> Result<Vec<ModpackCatalogEntry>, serde_json::Error> {
    let document = serde_json::from_str::<ModpackCatalogDocument>(json)?;
    let entries = match document {
        ModpackCatalogDocument::Entries(entries) => entries,
        ModpackCatalogDocument::Wrapped { modpacks, packs } => {
            modpacks.or(packs).unwrap_or_default()
        }
    };
    Ok(normalize_modpack_catalog(entries))
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum ModpackCatalogDocument {
    Entries(Vec<ModpackCatalogEntry>),
    Wrapped {
        modpacks: Option<Vec<ModpackCatalogEntry>>,
        packs: Option<Vec<ModpackCatalogEntry>>,
    },
}

pub fn normalize_modpack_catalog(entries: Vec<ModpackCatalogEntry>) -> Vec<ModpackCatalogEntry> {
    let mut normalized = Vec::with_capacity(entries.len());
    let mut index = HashMap::with_capacity(entries.len());

    for raw in entries {
        let id = raw.id.trim().to_owned();
        let pack_url = raw.pack_url.trim().to_owned();
        let instance_name = raw.instance_name.trim().to_owned();
        if id.is_empty() || pack_url.is_empty() || instance_name.is_empty() {
            continue;
        }

        let display_name = raw
            .display_name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
            .or_else(|| Some(id.clone()));
        let entry = ModpackCatalogEntry {
            id: id.clone(),
            display_name,
            pack_url,
            instance_name,
            description: trimmed_optional(raw.description),
            author: trimmed_optional(raw.author).or_else(|| Some("Unknown".to_owned())),
            tags: raw
                .tags
                .into_iter()
                .map(|tag| tag.trim().to_owned())
                .filter(|tag| !tag.is_empty())
                .collect(),
            last_updated: trimmed_optional(raw.last_updated),
            category: trimmed_optional(raw.category).or_else(|| Some("general".to_owned())),
            min_ram: Some(raw.min_ram.unwrap_or(2048).max(512)),
            recommended_ram: Some(raw.recommended_ram.unwrap_or(4096).max(512)),
            default_server: trimmed_optional(raw.default_server),
            changelog: trimmed_optional(raw.changelog)
                .or_else(|| Some("No changelog available".to_owned())),
            default: raw.default,
        };

        let key = id.to_ascii_lowercase();
        if let Some(existing_index) = index.get(&key).copied() {
            normalized[existing_index] = entry;
        } else {
            index.insert(key, normalized.len());
            normalized.push(entry);
        }
    }

    normalized.sort_by_key(|entry| !entry.default);
    normalized
}

pub fn pack_summary_from_catalog_entry(entry: ModpackCatalogEntry) -> PackSummary {
    let version = modpack_catalog_entry_version(&entry);
    let default_server = entry
        .default_server
        .clone()
        .or_else(|| first_party_default_server(&entry.id));
    let name = entry.display_name.unwrap_or_else(|| entry.id.clone());
    let tagline = entry
        .description
        .or(entry.changelog)
        .unwrap_or_else(|| "Curated modpack".to_owned());
    PackSummary {
        id: entry.id,
        name,
        tagline,
        version,
        status: PackStatus::NotInstalled,
        accent: "#67e8b9".to_owned(),
        installed_players: 0,
        default_server,
    }
}

fn first_party_default_server(pack_id: &str) -> Option<String> {
    match pack_id.trim().to_ascii_lowercase().as_str() {
        "winterpack" => Some("The Cabin".to_owned()),
        _ => None,
    }
}

pub fn modpack_catalog_entry_version(entry: &ModpackCatalogEntry) -> String {
    entry
        .last_updated
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("remote-catalog")
        .to_owned()
}

fn trimmed_optional(value: Option<String>) -> Option<String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PackStatus {
    NotInstalled,
    Installed,
    UpdateAvailable,
    RepairNeeded,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProfileResolution {
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServerLaunchTarget {
    pub name: Option<String>,
    pub address: String,
    pub port: Option<u16>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSummary {
    pub id: String,
    pub name: String,
    pub loader: ModLoader,
    pub game_version: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub installed_pack_version: Option<String>,
    pub last_played: Option<String>,
    pub memory_mb: u32,
    #[serde(default)]
    pub jvm_args: Vec<String>,
    #[serde(default)]
    pub resolution: Option<ProfileResolution>,
    #[serde(default)]
    pub default_server: Option<ServerLaunchTarget>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub java_runtime_override_path: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CreateProfileRequest {
    pub name: String,
    pub loader: ModLoader,
    pub game_version: String,
    pub memory_mb: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProfileRequest {
    pub id: String,
    pub name: Option<String>,
    pub loader: Option<ModLoader>,
    pub game_version: Option<String>,
    pub memory_mb: Option<u32>,
    pub jvm_args: Option<Vec<String>>,
    pub resolution: Option<ProfileResolution>,
    #[serde(default)]
    pub clear_resolution: bool,
    pub default_server: Option<ServerLaunchTarget>,
    #[serde(default)]
    pub clear_default_server: bool,
    pub java_runtime_override_path: Option<String>,
    #[serde(default)]
    pub clear_java_runtime_override: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveProfileRequest {
    pub id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeleteProfileRequest {
    pub id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftSession {
    pub username: String,
    pub uuid: Uuid,
    pub access_token: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StoredMinecraftSession {
    pub session: MinecraftSession,
    #[serde(default)]
    pub account_id: Option<String>,
    #[serde(default)]
    pub expires_at_unix_seconds: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub microsoft_refresh_token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub microsoft_client_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub microsoft_user_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub microsoft_scopes: Option<String>,
    pub stored_at_unix_seconds: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StoredMinecraftAccountSummary {
    pub account_id: String,
    pub username: String,
    pub uuid: Uuid,
    pub expires_at_unix_seconds: Option<u64>,
    pub active: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MicrosoftAuthStart {
    pub auth_url: String,
    pub state: String,
    pub code_verifier: String,
    pub code_challenge: String,
    pub client_id: String,
    pub redirect_uri: String,
    pub scopes: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MicrosoftAuthCallback {
    pub callback_url: String,
    pub expected_state: String,
    pub code_verifier: String,
    pub client_id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MicrosoftTokenExchangePlan {
    pub token_url: String,
    pub method: String,
    pub client_id: String,
    pub redirect_uri: String,
    pub code: String,
    pub code_verifier: String,
    pub scopes: Vec<String>,
    pub form_fields: Vec<MicrosoftTokenFormField>,
    pub next_step: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MicrosoftTokenFormField {
    pub key: String,
    pub value: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MicrosoftOAuthTokens {
    pub token_type: String,
    pub expires_in: u64,
    pub scope: Option<String>,
    pub access_token: String,
    pub refresh_token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_id: Option<String>,
    pub user_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct XboxLiveAuthToken {
    pub token: String,
    pub user_hash: String,
    pub expires_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftServicesToken {
    pub token_type: String,
    pub expires_in: u64,
    pub access_token: String,
    pub username: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftEntitlements {
    pub owns_minecraft: bool,
    pub items: Vec<MinecraftEntitlementItem>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftEntitlementItem {
    pub name: String,
    pub signature: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftProfile {
    pub id: Uuid,
    pub name: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LaunchPlan {
    pub profile_id: String,
    pub profile_name: String,
    pub java_executable: String,
    pub working_dir: String,
    pub arguments: Vec<String>,
    pub memory_mb: u32,
    pub offline_username: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProcessCommandSpec {
    pub executable: String,
    pub args: Vec<String>,
    pub working_dir: String,
    pub env: Vec<ProcessEnvVar>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProcessEnvVar {
    pub key: String,
    pub value: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProcessStartResult {
    pub process_id: u32,
    pub command: ProcessCommandSpec,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ManagedProcessSummary {
    pub id: Uuid,
    pub process_id: u32,
    pub command: ProcessCommandSpec,
    pub state: ManagedProcessState,
    #[serde(default)]
    pub stop_requested: bool,
    pub exit_code: Option<i32>,
    pub started_at_unix_seconds: u64,
    #[serde(default)]
    pub exited_at_unix_seconds: Option<u64>,
    #[serde(default)]
    pub runtime_seconds: u64,
    #[serde(default)]
    pub total_output_line_count: u64,
    #[serde(default)]
    pub dropped_output_line_count: u64,
    pub output: Vec<ProcessOutputLine>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProcessLogExport {
    pub managed_process_id: Uuid,
    pub process_id: u32,
    pub path: String,
    pub line_count: usize,
    pub total_output_line_count: u64,
    pub dropped_output_line_count: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ManagedProcessState {
    Running,
    Exited,
    StopRequested,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProcessOutputLine {
    pub stream: ProcessOutputStream,
    pub line: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProcessOutputStream {
    Stdout,
    Stderr,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JavaRuntimeSummary {
    pub id: String,
    pub path: String,
    pub version: String,
    pub major_version: u32,
    pub source: JavaRuntimeSource,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JavaRuntimeDownloadRequest {
    pub runtime_id: String,
    pub url: String,
    #[serde(default)]
    pub sha1: Option<String>,
    #[serde(default)]
    pub size: Option<u64>,
    #[serde(default)]
    pub archive_file_name: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JavaRuntimeManifestEntry {
    pub runtime_id: String,
    pub label: String,
    pub vendor: String,
    pub major_version: u32,
    pub platform: String,
    pub url: String,
    #[serde(default)]
    pub sha1: Option<String>,
    #[serde(default)]
    pub size: Option<u64>,
    #[serde(default)]
    pub archive_file_name: Option<String>,
    pub notes: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum JavaRuntimeSource {
    JavaHome,
    Path,
    Bundled,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftVersionSummary {
    pub id: String,
    pub version_type: MinecraftVersionType,
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha1: Option<String>,
    pub release_time: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MinecraftVersionType {
    Release,
    Snapshot,
    OldBeta,
    OldAlpha,
    Unknown,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DownloadPlan {
    pub version_id: String,
    pub items: Vec<DownloadItem>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DownloadItem {
    pub id: String,
    pub kind: DownloadKind,
    pub url: String,
    pub sha1: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha512: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub md5: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub murmur2: Option<String>,
    pub size: Option<u64>,
    pub destination: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OperationPlan {
    pub operation_id: Uuid,
    pub operation: LauncherOperation,
    pub subject_id: String,
    pub events: Vec<LauncherEvent>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LauncherEvent {
    pub id: Uuid,
    pub operation_id: Uuid,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub operation: Option<LauncherOperation>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subject_id: Option<String>,
    pub kind: LauncherEventKind,
    pub message: String,
    pub progress_percent: Option<u8>,
    #[serde(default)]
    pub occurred_at_unix_seconds: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LauncherOperation {
    LaunchProfile,
    InstallPack,
    RepairProfile,
    ImportProfile,
    DeleteProfile,
    DownloadArtifacts,
    InstallJavaRuntime,
    ManagedProcess,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LauncherEventKind {
    Queued,
    Planning,
    Downloading,
    Verifying,
    Completed,
    Failed,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DownloadKind {
    VersionJson,
    ClientJar,
    AssetIndex,
    AssetObject,
    Library,
    NativeLibrary,
    PackFile,
    PreservedPackFile,
    ModLoaderMetadata,
    ModLoaderInstaller,
    JavaRuntimeArchive,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ModLoader {
    Vanilla,
    Fabric,
    Quilt,
    Forge,
    Neoforge,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportCandidate {
    pub id: String,
    pub source: String,
    pub name: String,
    pub path: String,
    pub kind: ImportKind,
    pub detected_loader: Option<ModLoader>,
    pub detected_game_version: Option<String>,
    #[serde(default)]
    pub detected_name: Option<String>,
    #[serde(default)]
    pub detected_summary: Option<String>,
    #[serde(default)]
    pub detected_icon_path: Option<String>,
    #[serde(default)]
    pub importable_file_count: Option<u64>,
    #[serde(default)]
    pub importable_total_bytes: Option<u64>,
    #[serde(default)]
    pub last_modified_unix_seconds: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportPlanRequest {
    pub name: String,
    pub source_path: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstallModpackArchiveRequest {
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportPlan {
    pub profile_id: String,
    pub profile_name: String,
    pub source_path: String,
    pub destination_path: String,
    pub detected_loader: Option<ModLoader>,
    pub detected_game_version: Option<String>,
    pub items: Vec<ImportPlanItem>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportPlanItem {
    pub kind: ImportPlanItemKind,
    pub source: String,
    pub destination: String,
    pub exists: bool,
    pub destination_exists: bool,
    pub resolution: Option<ImportConflictResolution>,
    #[serde(default)]
    pub file_count: Option<u64>,
    #[serde(default)]
    pub total_bytes: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ImportPlanItemKind {
    Saves,
    Options,
    ResourcePacks,
    ShaderPacks,
    Screenshots,
    Config,
    Mods,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ImportConflictResolution {
    Abort,
    Skip,
    Overwrite,
    Rename,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ImportKind {
    Prism,
    Multimc,
    Minecraft,
    Gdlauncher,
    Atlauncher,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapshot {
    pub settings: LauncherSettings,
    pub directories: LauncherDirectories,
    #[serde(default)]
    pub minecraft_session: Option<StoredMinecraftSession>,
    pub friends: Vec<FriendPresence>,
    pub packs: Vec<PackSummary>,
    pub profiles: Vec<ProfileSummary>,
    pub imports: Vec<ImportCandidate>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActionReceipt {
    pub id: Uuid,
    pub action: LauncherAction,
    pub subject_id: Option<String>,
    pub status: ActionStatus,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LauncherAction {
    MicrosoftLogin,
    LaunchProfile,
    InstallPack,
    InstallModpackArchive,
    RepairProfile,
    DeleteProfile,
    ScanImports,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ActionStatus {
    Queued,
    Mocked,
    Completed,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_modpack_catalog_parses_legacy_seed() {
        let catalog = bundled_modpack_catalog();

        assert_eq!(catalog.len(), 1);
        assert_eq!(catalog[0].id, "winterpack");
        assert_eq!(catalog[0].display_name.as_deref(), Some("WinterPack"));
        assert_eq!(
            catalog[0].pack_url,
            "https://modpacks.dylan.lol/winterpack-modpack/pack.toml"
        );
        assert_eq!(catalog[0].recommended_ram, Some(6144));
    }

    #[test]
    fn pack_summary_maps_custom_catalog_to_preview_surface() {
        let summary = pack_summary_from_catalog_entry(ModpackCatalogEntry {
            id: "winterpack".to_owned(),
            display_name: Some("WinterPack".to_owned()),
            pack_url: "https://modpacks.dylan.lol/winterpack-modpack/pack.toml".to_owned(),
            instance_name: "WinterPack".to_owned(),
            description: Some("Official WinterPack release".to_owned()),
            author: Some("Dylan".to_owned()),
            tags: vec!["featured".to_owned()],
            last_updated: Some("10/30/2025".to_owned()),
            category: Some("themed".to_owned()),
            min_ram: Some(4096),
            recommended_ram: Some(6144),
            default_server: None,
            changelog: Some("Version 2.0.2".to_owned()),
            default: true,
        });

        assert_eq!(summary.id, "winterpack");
        assert_eq!(summary.name, "WinterPack");
        assert_eq!(summary.version, "10/30/2025");
        assert_eq!(summary.status, PackStatus::NotInstalled);
        assert_eq!(summary.default_server.as_deref(), Some("The Cabin"));
    }

    #[test]
    fn pack_summary_prefers_catalog_default_server() {
        let summary = pack_summary_from_catalog_entry(ModpackCatalogEntry {
            id: "winterpack".to_owned(),
            display_name: Some("WinterPack".to_owned()),
            pack_url: "https://modpacks.dylan.lol/winterpack-modpack/pack.toml".to_owned(),
            instance_name: "WinterPack".to_owned(),
            description: Some("Official WinterPack release".to_owned()),
            author: Some("Dylan".to_owned()),
            tags: vec!["featured".to_owned()],
            last_updated: Some("10/30/2025".to_owned()),
            category: Some("themed".to_owned()),
            min_ram: Some(4096),
            recommended_ram: Some(6144),
            default_server: Some("Custom Cabin".to_owned()),
            changelog: Some("Version 2.0.2".to_owned()),
            default: true,
        });

        assert_eq!(summary.default_server.as_deref(), Some("Custom Cabin"));
    }

    #[test]
    fn modpack_catalog_orders_default_pack_first() {
        let catalog = parse_modpack_catalog_json(
            r#"[
              {
                "id": "examplepack",
                "packUrl": "https://example.com/example/pack.toml",
                "instanceName": "ExamplePack"
              },
              {
                "id": "winterpack",
                "displayName": "WinterPack",
                "packUrl": "https://modpacks.dylan.lol/winterpack-modpack/pack.toml",
                "instanceName": "WinterPack",
                "default": true
              }
            ]"#,
        )
        .expect("catalog should parse");

        assert_eq!(catalog[0].id, "winterpack");
        assert!(catalog[0].default);
        assert_eq!(catalog[1].id, "examplepack");
    }

    #[test]
    fn modpack_catalog_accepts_modpacks_wrapper() {
        let catalog = parse_modpack_catalog_json(
            r#"{
              "schemaVersion": 1,
              "modpacks": [
                {
                  "id": "winterpack",
                  "displayName": "WinterPack",
                  "packUrl": "https://modpacks.dylan.lol/winterpack-modpack/pack.toml",
                  "instanceName": "WinterPack",
                  "recommendedRam": 6144
                }
              ]
            }"#,
        )
        .expect("wrapped modpack catalog should parse");

        assert_eq!(catalog.len(), 1);
        assert_eq!(catalog[0].id, "winterpack");
        assert_eq!(catalog[0].display_name.as_deref(), Some("WinterPack"));
        assert_eq!(catalog[0].recommended_ram, Some(6144));
    }

    #[test]
    fn modpack_catalog_accepts_packs_wrapper() {
        let catalog = parse_modpack_catalog_json(
            r#"{
              "packs": [
                {
                  "id": "examplepack",
                  "packUrl": "https://example.com/example/pack.toml",
                  "instanceName": "ExamplePack"
                }
              ]
            }"#,
        )
        .expect("wrapped pack catalog should parse");

        assert_eq!(catalog.len(), 1);
        assert_eq!(catalog[0].id, "examplepack");
        assert_eq!(catalog[0].category.as_deref(), Some("general"));
    }
}
