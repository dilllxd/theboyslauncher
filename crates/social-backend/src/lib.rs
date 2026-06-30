use std::{
    collections::{HashMap, HashSet},
    net::IpAddr,
    path::{Path as FsPath, PathBuf},
    sync::Arc,
    time::Duration,
};

use anyhow::{anyhow, ensure};
use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::{Path, Query, State},
    http::{header, HeaderMap, HeaderValue, Method, StatusCode, Uri},
    response::Response,
    routing::{delete, get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use shared::{bundled_pack_summaries, PackSummary, PresenceState};
use sqlx::{Executor, PgPool, Row};
use tokio::sync::{broadcast, RwLock};
use tower_http::cors::CorsLayer;
use uuid::Uuid;

const PRESENCE_BROADCAST_CAPACITY: usize = 128;
const DEV_SESSION_TTL_SECONDS: i64 = 60 * 60;
const DEFAULT_DEV_SESSION_SECRET: &str = "theboyslauncher-local-dev-session-secret";
const MIN_CONFIGURED_SESSION_SECRET_LEN: usize = 32;
const DEFAULT_MINECRAFT_PROFILE_URL: &str = "https://api.minecraftservices.com/minecraft/profile";
const MINECRAFT_PROFILE_VERIFY_TIMEOUT: Duration = Duration::from_secs(30);
const DEFAULT_CORS_ORIGINS: &[&str] = &[
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
];
pub const POSTGRES_INITIAL_SCHEMA_SQL: &str =
    include_str!("../migrations/0001_initial_social_state.sql");

type HmacSha256 = Hmac<Sha256>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PostgresMigration {
    pub name: &'static str,
    pub sql: &'static str,
}

pub const POSTGRES_MIGRATIONS: &[PostgresMigration] = &[PostgresMigration {
    name: "0001_initial_social_state.sql",
    sql: POSTGRES_INITIAL_SCHEMA_SQL,
}];

const POSTGRES_MIGRATION_LEDGER_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS theboyslauncher_schema_migrations (
    name text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
)
"#;

pub fn validate_postgres_migrations(migrations: &[PostgresMigration]) -> anyhow::Result<()> {
    anyhow::ensure!(
        !migrations.is_empty(),
        "at least one Postgres migration is required"
    );
    let mut previous = "";
    for migration in migrations {
        anyhow::ensure!(
            !migration.name.trim().is_empty(),
            "Postgres migration name is required"
        );
        anyhow::ensure!(
            migration.name > previous,
            "Postgres migrations must be sorted by name"
        );
        anyhow::ensure!(
            !migration.sql.trim().is_empty(),
            "Postgres migration '{}' SQL is empty",
            migration.name
        );
        previous = migration.name;
    }
    Ok(())
}

pub async fn apply_postgres_migrations(database_url: &str) -> anyhow::Result<()> {
    validate_postgres_migrations(POSTGRES_MIGRATIONS)?;
    let pool = PgPool::connect(database_url).await?;
    pool.execute(POSTGRES_MIGRATION_LEDGER_SQL).await?;
    for migration in POSTGRES_MIGRATIONS {
        let checksum = postgres_migration_checksum(migration.sql);
        let existing_checksum = sqlx::query_scalar::<_, String>(
            "SELECT checksum FROM theboyslauncher_schema_migrations WHERE name = $1",
        )
        .bind(migration.name)
        .fetch_optional(&pool)
        .await?;
        if let Some(existing_checksum) = existing_checksum {
            ensure!(
                existing_checksum == checksum,
                "Postgres migration '{}' checksum mismatch; refusing to run with edited applied migration",
                migration.name
            );
            tracing::info!(
                migration = migration.name,
                "skipped applied Postgres migration"
            );
            continue;
        }
        let mut transaction = pool.begin().await?;
        transaction.execute(migration.sql).await?;
        sqlx::query(
            "INSERT INTO theboyslauncher_schema_migrations (name, checksum) VALUES ($1, $2)",
        )
        .bind(migration.name)
        .bind(checksum)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        tracing::info!(migration = migration.name, "applied Postgres migration");
    }
    pool.close().await;
    Ok(())
}

fn postgres_migration_checksum(sql: &str) -> String {
    let digest = Sha256::digest(sql.as_bytes());
    let mut checksum = String::with_capacity(digest.len() * 2);
    for byte in digest {
        use std::fmt::Write as _;
        write!(&mut checksum, "{byte:02x}").expect("writing to String cannot fail");
    }
    checksum
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BackendConfig {
    pub bind_addr: String,
    pub database_url: Option<String>,
    pub state_path: Option<PathBuf>,
    pub session_secret: String,
    pub minecraft_profile_url: String,
    pub allow_dev_sessions: bool,
    pub cors_origins: Vec<String>,
}

impl BackendConfig {
    pub fn from_env() -> anyhow::Result<Self> {
        Self::from_values(
            std::env::var("THEBOYS_BACKEND_BIND").ok(),
            std::env::var("DATABASE_URL").ok(),
            std::env::var("THEBOYS_BACKEND_STATE_PATH").ok(),
            std::env::var("THEBOYS_BACKEND_SESSION_SECRET").ok(),
            std::env::var("THEBOYS_BACKEND_MINECRAFT_PROFILE_URL").ok(),
            std::env::var("THEBOYS_BACKEND_ALLOW_DEV_SESSIONS").ok(),
            std::env::var("THEBOYS_BACKEND_CORS_ORIGINS").ok(),
        )
    }

    fn from_values(
        bind_addr: Option<String>,
        database_url: Option<String>,
        state_path: Option<String>,
        session_secret: Option<String>,
        minecraft_profile_url: Option<String>,
        allow_dev_sessions: Option<String>,
        cors_origins: Option<String>,
    ) -> anyhow::Result<Self> {
        let bind_addr = trimmed_optional(bind_addr).unwrap_or_else(|| "127.0.0.1:4074".to_owned());
        let database_url = trimmed_optional(database_url);
        let state_path = trimmed_optional(state_path).map(PathBuf::from);
        let allow_dev_sessions =
            parse_optional_bool(allow_dev_sessions, "THEBOYS_BACKEND_ALLOW_DEV_SESSIONS")?
                .unwrap_or(database_url.is_none());
        let configured_session_secret = trimmed_optional(session_secret);
        let session_secret = configured_session_secret
            .clone()
            .unwrap_or_else(|| DEFAULT_DEV_SESSION_SECRET.to_owned());
        if database_url.is_some() {
            let configured_session_secret = configured_session_secret.ok_or_else(|| {
                anyhow!(
                    "THEBOYS_BACKEND_SESSION_SECRET is required when DATABASE_URL is configured"
                )
            })?;
            ensure!(
                configured_session_secret != DEFAULT_DEV_SESSION_SECRET,
                "THEBOYS_BACKEND_SESSION_SECRET must not use the development fallback secret when DATABASE_URL is configured"
            );
            ensure!(
                configured_session_secret.len() >= MIN_CONFIGURED_SESSION_SECRET_LEN,
                "THEBOYS_BACKEND_SESSION_SECRET must be at least {MIN_CONFIGURED_SESSION_SECRET_LEN} characters when DATABASE_URL is configured"
            );
        }
        let minecraft_profile_url = trimmed_optional(minecraft_profile_url)
            .unwrap_or_else(|| DEFAULT_MINECRAFT_PROFILE_URL.to_owned());
        validate_minecraft_profile_url(&minecraft_profile_url, database_url.is_some())?;
        Ok(Self {
            bind_addr,
            database_url,
            state_path,
            session_secret,
            minecraft_profile_url,
            allow_dev_sessions,
            cors_origins: parse_cors_origins(cors_origins)?,
        })
    }
}

fn trimmed_optional(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn parse_optional_bool(value: Option<String>, name: &str) -> anyhow::Result<Option<bool>> {
    let Some(value) = trimmed_optional(value) else {
        return Ok(None);
    };
    match value.to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" | "on" => Ok(Some(true)),
        "0" | "false" | "no" | "off" => Ok(Some(false)),
        _ => Err(anyhow!("{name} must be true or false")),
    }
}

fn parse_cors_origins(value: Option<String>) -> anyhow::Result<Vec<String>> {
    let Some(value) = trimmed_optional(value) else {
        return Ok(default_cors_origins());
    };
    let origins = value
        .split(',')
        .map(str::trim)
        .filter(|origin| !origin.is_empty())
        .map(validate_cors_origin)
        .collect::<anyhow::Result<Vec<_>>>()?;
    ensure!(
        !origins.is_empty(),
        "THEBOYS_BACKEND_CORS_ORIGINS must include at least one origin"
    );
    Ok(origins)
}

fn validate_minecraft_profile_url(url: &str, hosted_mode: bool) -> anyhow::Result<()> {
    let uri = url
        .parse::<Uri>()
        .map_err(|_| anyhow!("THEBOYS_BACKEND_MINECRAFT_PROFILE_URL is invalid"))?;
    let scheme = uri
        .scheme_str()
        .ok_or_else(|| anyhow!("THEBOYS_BACKEND_MINECRAFT_PROFILE_URL requires a scheme"))?;
    ensure!(
        scheme.eq_ignore_ascii_case("http") || scheme.eq_ignore_ascii_case("https"),
        "THEBOYS_BACKEND_MINECRAFT_PROFILE_URL must use http or https"
    );
    let host = uri
        .host()
        .ok_or_else(|| anyhow!("THEBOYS_BACKEND_MINECRAFT_PROFILE_URL requires a host"))?;
    if hosted_mode && scheme.eq_ignore_ascii_case("http") && !host_is_loopback(host) {
        anyhow::bail!(
            "THEBOYS_BACKEND_MINECRAFT_PROFILE_URL must use https in hosted mode unless it targets loopback test infrastructure"
        );
    }
    Ok(())
}

fn host_is_loopback(host: &str) -> bool {
    host.eq_ignore_ascii_case("localhost")
        || host
            .parse::<IpAddr>()
            .map(|address| address.is_loopback())
            .unwrap_or(false)
}

fn default_cors_origins() -> Vec<String> {
    DEFAULT_CORS_ORIGINS
        .iter()
        .map(|origin| (*origin).to_owned())
        .collect()
}

fn validate_cors_origin(origin: &str) -> anyhow::Result<String> {
    ensure!(
        !origin.contains('*'),
        "THEBOYS_BACKEND_CORS_ORIGINS entries must be explicit origins"
    );
    let uri = origin
        .parse::<Uri>()
        .map_err(|_| anyhow!("THEBOYS_BACKEND_CORS_ORIGINS contains an invalid origin"))?;
    let scheme = uri
        .scheme_str()
        .ok_or_else(|| anyhow!("THEBOYS_BACKEND_CORS_ORIGINS origins require a scheme"))?;
    ensure!(
        scheme.eq_ignore_ascii_case("http")
            || scheme.eq_ignore_ascii_case("https")
            || scheme.eq_ignore_ascii_case("tauri"),
        "THEBOYS_BACKEND_CORS_ORIGINS origins must use http, https, or tauri"
    );
    ensure!(
        uri.host().is_some(),
        "THEBOYS_BACKEND_CORS_ORIGINS origins require a host"
    );
    let path_and_query = uri
        .path_and_query()
        .map(|path_and_query| path_and_query.as_str())
        .unwrap_or("");
    ensure!(
        path_and_query.is_empty() || path_and_query == "/",
        "THEBOYS_BACKEND_CORS_ORIGINS entries must not include paths or query strings"
    );
    HeaderValue::from_str(origin)
        .map_err(|_| anyhow!("THEBOYS_BACKEND_CORS_ORIGINS contains an invalid header value"))?;
    Ok(origin.to_owned())
}

#[derive(Clone, Debug)]
pub struct BackendState {
    presence: Arc<RwLock<HashMap<Uuid, PresenceUpdate>>>,
    account_links: Arc<RwLock<HashMap<Uuid, MinecraftAccountLink>>>,
    friend_requests: Arc<RwLock<HashSet<(Uuid, Uuid)>>>,
    friendships: Arc<RwLock<HashSet<(Uuid, Uuid)>>>,
    blocked_accounts: Arc<RwLock<HashSet<(Uuid, Uuid)>>>,
    muted_accounts: Arc<RwLock<HashSet<(Uuid, Uuid)>>>,
    presence_tx: broadcast::Sender<PresenceUpdate>,
    state_path: Option<Arc<PathBuf>>,
    postgres_pool: Option<Arc<PgPool>>,
    session_secret: Arc<String>,
    minecraft_profile_url: Arc<String>,
    minecraft_profile_client: reqwest::Client,
    allow_dev_sessions: bool,
    allow_legacy_minecraft_sessions: bool,
}

impl Default for BackendState {
    fn default() -> Self {
        let (presence_tx, _) = broadcast::channel(PRESENCE_BROADCAST_CAPACITY);
        Self {
            presence: Arc::new(RwLock::new(HashMap::new())),
            account_links: Arc::new(RwLock::new(HashMap::new())),
            friend_requests: Arc::new(RwLock::new(HashSet::new())),
            friendships: Arc::new(RwLock::new(HashSet::new())),
            blocked_accounts: Arc::new(RwLock::new(HashSet::new())),
            muted_accounts: Arc::new(RwLock::new(HashSet::new())),
            presence_tx,
            state_path: None,
            postgres_pool: None,
            session_secret: Arc::new(DEFAULT_DEV_SESSION_SECRET.to_owned()),
            minecraft_profile_url: Arc::new(DEFAULT_MINECRAFT_PROFILE_URL.to_owned()),
            minecraft_profile_client: minecraft_profile_client_with_timeout(
                MINECRAFT_PROFILE_VERIFY_TIMEOUT,
            )
            .expect("Minecraft profile client configuration should be valid"),
            allow_dev_sessions: true,
            allow_legacy_minecraft_sessions: true,
        }
    }
}

impl BackendState {
    pub async fn with_json_store(path: impl AsRef<FsPath>) -> anyhow::Result<Self> {
        let mut state = Self::default();
        state.state_path = Some(Arc::new(path.as_ref().to_path_buf()));
        state.load_snapshot_from_store().await?;
        Ok(state)
    }

    pub async fn with_postgres(database_url: &str) -> anyhow::Result<Self> {
        let mut state = Self::default();
        state.postgres_pool = Some(Arc::new(PgPool::connect(database_url).await?));
        state.load_account_links_from_postgres().await?;
        state.load_friend_graph_from_postgres().await?;
        state.load_relationship_filters_from_postgres().await?;
        state.load_presence_from_postgres().await?;
        Ok(state)
    }

    pub fn with_session_secret(mut self, session_secret: impl Into<String>) -> Self {
        let session_secret = session_secret.into();
        if !session_secret.trim().is_empty() {
            self.session_secret = Arc::new(session_secret);
        }
        self
    }

    pub fn with_minecraft_profile_url(mut self, minecraft_profile_url: impl Into<String>) -> Self {
        let minecraft_profile_url = minecraft_profile_url.into();
        if !minecraft_profile_url.trim().is_empty() {
            self.minecraft_profile_url = Arc::new(minecraft_profile_url);
        }
        self
    }

    pub fn with_minecraft_profile_timeout(mut self, timeout: Duration) -> Self {
        self.minecraft_profile_client = minecraft_profile_client_with_timeout(timeout)
            .expect("Minecraft profile client configuration should be valid");
        self
    }

    pub fn with_dev_sessions_allowed(mut self, allow_dev_sessions: bool) -> Self {
        self.allow_dev_sessions = allow_dev_sessions;
        self
    }

    pub fn with_legacy_minecraft_sessions_allowed(
        mut self,
        allow_legacy_minecraft_sessions: bool,
    ) -> Self {
        self.allow_legacy_minecraft_sessions = allow_legacy_minecraft_sessions;
        self
    }

    pub fn subscribe_presence(&self) -> broadcast::Receiver<PresenceUpdate> {
        self.presence_tx.subscribe()
    }

    async fn presence_snapshot(&self) -> anyhow::Result<Vec<PresenceUpdate>> {
        if self.postgres_pool.is_some() {
            self.load_presence_from_postgres().await?;
        }
        let mut snapshot = self
            .presence
            .read()
            .await
            .values()
            .cloned()
            .collect::<Vec<_>>();
        snapshot.sort_by_key(|update| update.account_id);
        Ok(snapshot)
    }

    async fn load_presence_from_postgres(&self) -> anyhow::Result<()> {
        let Some(pool) = self.postgres_pool.as_deref() else {
            return Ok(());
        };
        let rows = sqlx::query(
            "SELECT account_id, state, pack_id, server_id, updated_at \
             FROM presence_updates \
             ORDER BY account_id",
        )
        .fetch_all(pool)
        .await?;
        let mut presence = HashMap::with_capacity(rows.len());
        for row in rows {
            let state_text: String = row.try_get("state")?;
            let update = PresenceUpdate {
                account_id: row.try_get("account_id")?,
                state: presence_state_from_db(&state_text)?,
                pack_id: row.try_get("pack_id")?,
                server_id: row.try_get("server_id")?,
                updated_at: row.try_get("updated_at")?,
            };
            presence.insert(update.account_id, update);
        }
        *self.presence.write().await = presence;
        Ok(())
    }

    async fn load_account_links_from_postgres(&self) -> anyhow::Result<()> {
        let Some(pool) = self.postgres_pool.as_deref() else {
            return Ok(());
        };
        let rows = sqlx::query(
            "SELECT account_id, minecraft_uuid, minecraft_name, linked_at \
             FROM minecraft_account_links \
             ORDER BY account_id",
        )
        .fetch_all(pool)
        .await?;
        let mut account_links = HashMap::with_capacity(rows.len());
        for row in rows {
            let link = MinecraftAccountLink {
                account_id: row.try_get("account_id")?,
                minecraft_uuid: row.try_get("minecraft_uuid")?,
                minecraft_name: row.try_get("minecraft_name")?,
                linked_at: row.try_get("linked_at")?,
            };
            account_links.insert(link.account_id, link);
        }
        *self.account_links.write().await = account_links;
        Ok(())
    }

    async fn account_link_snapshot(&self) -> anyhow::Result<Vec<MinecraftAccountLink>> {
        if self.postgres_pool.is_some() {
            self.load_account_links_from_postgres().await?;
        }
        let mut account_links = self
            .account_links
            .read()
            .await
            .values()
            .cloned()
            .collect::<Vec<_>>();
        account_links.sort_by_key(|link| link.account_id);
        Ok(account_links)
    }

    async fn get_account_link(
        &self,
        account_id: Uuid,
    ) -> anyhow::Result<Option<MinecraftAccountLink>> {
        if self.postgres_pool.is_some() {
            self.load_account_links_from_postgres().await?;
        }
        Ok(self.account_links.read().await.get(&account_id).cloned())
    }

    async fn persist_account_link_to_postgres(
        &self,
        link: &MinecraftAccountLink,
    ) -> anyhow::Result<()> {
        let Some(pool) = self.postgres_pool.as_deref() else {
            return Ok(());
        };
        let mut transaction = pool.begin().await?;
        sqlx::query(
            "INSERT INTO accounts (id) VALUES ($1) \
             ON CONFLICT (id) DO UPDATE SET updated_at = now()",
        )
        .bind(link.account_id)
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "INSERT INTO minecraft_account_links \
                (account_id, minecraft_uuid, minecraft_name, linked_at) \
             VALUES ($1, $2, $3, $4) \
             ON CONFLICT (account_id) DO UPDATE SET \
                minecraft_uuid = EXCLUDED.minecraft_uuid, \
                minecraft_name = EXCLUDED.minecraft_name, \
                linked_at = EXCLUDED.linked_at",
        )
        .bind(link.account_id)
        .bind(link.minecraft_uuid)
        .bind(&link.minecraft_name)
        .bind(link.linked_at)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(())
    }

    async fn load_friend_graph_from_postgres(&self) -> anyhow::Result<()> {
        let Some(pool) = self.postgres_pool.as_deref() else {
            return Ok(());
        };
        let request_rows = sqlx::query(
            "SELECT requester_account_id, target_account_id \
             FROM friend_requests \
             ORDER BY requester_account_id, target_account_id",
        )
        .fetch_all(pool)
        .await?;
        let friendship_rows = sqlx::query(
            "SELECT left_account_id, right_account_id \
             FROM friendships \
             ORDER BY left_account_id, right_account_id",
        )
        .fetch_all(pool)
        .await?;
        *self.friend_requests.write().await = request_rows
            .into_iter()
            .map(|row| {
                Ok((
                    row.try_get("requester_account_id")?,
                    row.try_get("target_account_id")?,
                ))
            })
            .collect::<anyhow::Result<HashSet<(Uuid, Uuid)>>>()?;
        *self.friendships.write().await = friendship_rows
            .into_iter()
            .map(|row| {
                Ok((
                    row.try_get("left_account_id")?,
                    row.try_get("right_account_id")?,
                ))
            })
            .collect::<anyhow::Result<HashSet<(Uuid, Uuid)>>>()?;
        Ok(())
    }

    async fn persist_friend_request_to_postgres(
        &self,
        requester_account_id: Uuid,
        target_account_id: Uuid,
    ) -> anyhow::Result<()> {
        let Some(pool) = self.postgres_pool.as_deref() else {
            return Ok(());
        };
        let mut transaction = pool.begin().await?;
        for account_id in [requester_account_id, target_account_id] {
            sqlx::query(
                "INSERT INTO accounts (id) VALUES ($1) \
                 ON CONFLICT (id) DO UPDATE SET updated_at = now()",
            )
            .bind(account_id)
            .execute(&mut *transaction)
            .await?;
        }
        sqlx::query(
            "INSERT INTO friend_requests (requester_account_id, target_account_id) \
             VALUES ($1, $2) \
             ON CONFLICT (requester_account_id, target_account_id) DO NOTHING",
        )
        .bind(requester_account_id)
        .bind(target_account_id)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(())
    }

    async fn accept_friendship_in_postgres(
        &self,
        requester_account_id: Uuid,
        target_account_id: Uuid,
    ) -> anyhow::Result<()> {
        let Some(pool) = self.postgres_pool.as_deref() else {
            return Ok(());
        };
        let (left_account_id, right_account_id) =
            friendship_pair(requester_account_id, target_account_id);
        let mut transaction = pool.begin().await?;
        for account_id in [requester_account_id, target_account_id] {
            sqlx::query(
                "INSERT INTO accounts (id) VALUES ($1) \
                 ON CONFLICT (id) DO UPDATE SET updated_at = now()",
            )
            .bind(account_id)
            .execute(&mut *transaction)
            .await?;
        }
        sqlx::query(
            "DELETE FROM friend_requests \
             WHERE (requester_account_id = $1 AND target_account_id = $2) \
                OR (requester_account_id = $2 AND target_account_id = $1)",
        )
        .bind(requester_account_id)
        .bind(target_account_id)
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "INSERT INTO friendships (left_account_id, right_account_id) \
             VALUES ($1, $2) \
             ON CONFLICT (left_account_id, right_account_id) DO NOTHING",
        )
        .bind(left_account_id)
        .bind(right_account_id)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(())
    }

    async fn load_relationship_filters_from_postgres(&self) -> anyhow::Result<()> {
        let Some(pool) = self.postgres_pool.as_deref() else {
            return Ok(());
        };
        let block_rows = sqlx::query(
            "SELECT blocker_account_id, blocked_account_id \
             FROM account_blocks \
             ORDER BY blocker_account_id, blocked_account_id",
        )
        .fetch_all(pool)
        .await?;
        let mute_rows = sqlx::query(
            "SELECT muter_account_id, muted_account_id \
             FROM account_mutes \
             ORDER BY muter_account_id, muted_account_id",
        )
        .fetch_all(pool)
        .await?;
        *self.blocked_accounts.write().await = block_rows
            .into_iter()
            .map(|row| {
                Ok((
                    row.try_get("blocker_account_id")?,
                    row.try_get("blocked_account_id")?,
                ))
            })
            .collect::<anyhow::Result<HashSet<(Uuid, Uuid)>>>()?;
        *self.muted_accounts.write().await = mute_rows
            .into_iter()
            .map(|row| {
                Ok((
                    row.try_get("muter_account_id")?,
                    row.try_get("muted_account_id")?,
                ))
            })
            .collect::<anyhow::Result<HashSet<(Uuid, Uuid)>>>()?;
        Ok(())
    }

    async fn persist_block_to_postgres(
        &self,
        blocker_account_id: Uuid,
        blocked_account_id: Uuid,
    ) -> anyhow::Result<()> {
        let Some(pool) = self.postgres_pool.as_deref() else {
            return Ok(());
        };
        let friendship = friendship_pair(blocker_account_id, blocked_account_id);
        let mut transaction = pool.begin().await?;
        for account_id in [blocker_account_id, blocked_account_id] {
            sqlx::query(
                "INSERT INTO accounts (id) VALUES ($1) \
                 ON CONFLICT (id) DO UPDATE SET updated_at = now()",
            )
            .bind(account_id)
            .execute(&mut *transaction)
            .await?;
        }
        sqlx::query(
            "INSERT INTO account_blocks (blocker_account_id, blocked_account_id) \
             VALUES ($1, $2) \
             ON CONFLICT (blocker_account_id, blocked_account_id) DO NOTHING",
        )
        .bind(blocker_account_id)
        .bind(blocked_account_id)
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "DELETE FROM friendships \
             WHERE left_account_id = $1 AND right_account_id = $2",
        )
        .bind(friendship.0)
        .bind(friendship.1)
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "DELETE FROM friend_requests \
             WHERE (requester_account_id = $1 AND target_account_id = $2) \
                OR (requester_account_id = $2 AND target_account_id = $1)",
        )
        .bind(blocker_account_id)
        .bind(blocked_account_id)
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "DELETE FROM account_mutes \
             WHERE (muter_account_id = $1 AND muted_account_id = $2) \
                OR (muter_account_id = $2 AND muted_account_id = $1)",
        )
        .bind(blocker_account_id)
        .bind(blocked_account_id)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(())
    }

    async fn remove_block_from_postgres(
        &self,
        blocker_account_id: Uuid,
        blocked_account_id: Uuid,
    ) -> anyhow::Result<()> {
        let Some(pool) = self.postgres_pool.as_deref() else {
            return Ok(());
        };
        sqlx::query(
            "DELETE FROM account_blocks \
             WHERE blocker_account_id = $1 AND blocked_account_id = $2",
        )
        .bind(blocker_account_id)
        .bind(blocked_account_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    async fn persist_mute_to_postgres(
        &self,
        muter_account_id: Uuid,
        muted_account_id: Uuid,
    ) -> anyhow::Result<()> {
        let Some(pool) = self.postgres_pool.as_deref() else {
            return Ok(());
        };
        let mut transaction = pool.begin().await?;
        for account_id in [muter_account_id, muted_account_id] {
            sqlx::query(
                "INSERT INTO accounts (id) VALUES ($1) \
                 ON CONFLICT (id) DO UPDATE SET updated_at = now()",
            )
            .bind(account_id)
            .execute(&mut *transaction)
            .await?;
        }
        sqlx::query(
            "INSERT INTO account_mutes (muter_account_id, muted_account_id) \
             VALUES ($1, $2) \
             ON CONFLICT (muter_account_id, muted_account_id) DO NOTHING",
        )
        .bind(muter_account_id)
        .bind(muted_account_id)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(())
    }

    async fn remove_mute_from_postgres(
        &self,
        muter_account_id: Uuid,
        muted_account_id: Uuid,
    ) -> anyhow::Result<()> {
        let Some(pool) = self.postgres_pool.as_deref() else {
            return Ok(());
        };
        sqlx::query(
            "DELETE FROM account_mutes \
             WHERE muter_account_id = $1 AND muted_account_id = $2",
        )
        .bind(muter_account_id)
        .bind(muted_account_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    async fn persist_presence_to_postgres(&self, update: &PresenceUpdate) -> anyhow::Result<()> {
        let Some(pool) = self.postgres_pool.as_deref() else {
            return Ok(());
        };
        let mut transaction = pool.begin().await?;
        sqlx::query(
            "INSERT INTO accounts (id) VALUES ($1) \
             ON CONFLICT (id) DO UPDATE SET updated_at = now()",
        )
        .bind(update.account_id)
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "INSERT INTO presence_updates (account_id, state, pack_id, server_id, updated_at) \
             VALUES ($1, $2, $3, $4, $5) \
             ON CONFLICT (account_id) DO UPDATE SET \
                state = EXCLUDED.state, \
                pack_id = EXCLUDED.pack_id, \
                server_id = EXCLUDED.server_id, \
                updated_at = EXCLUDED.updated_at",
        )
        .bind(update.account_id)
        .bind(presence_state_as_db(&update.state))
        .bind(&update.pack_id)
        .bind(&update.server_id)
        .bind(update.updated_at)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(())
    }

    async fn load_snapshot_from_store(&self) -> anyhow::Result<()> {
        let Some(path) = self.state_path.as_deref() else {
            return Ok(());
        };
        if !path.is_file() {
            return Ok(());
        }
        let bytes = tokio::fs::read(path).await?;
        let snapshot = serde_json::from_slice::<BackendSnapshot>(&bytes)?;
        self.apply_snapshot(snapshot).await;
        Ok(())
    }

    async fn persist_snapshot_to_store(&self) -> anyhow::Result<()> {
        let Some(path) = self.state_path.as_deref() else {
            return Ok(());
        };
        let snapshot = self.snapshot().await;
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        let bytes = serde_json::to_vec_pretty(&snapshot)?;
        let temp_path = path.with_extension("tmp");
        tokio::fs::write(&temp_path, bytes).await?;
        if path.exists() {
            tokio::fs::remove_file(path).await?;
        }
        tokio::fs::rename(temp_path, path).await?;
        Ok(())
    }

    async fn snapshot(&self) -> BackendSnapshot {
        let mut presence = self
            .presence
            .read()
            .await
            .values()
            .cloned()
            .collect::<Vec<_>>();
        presence.sort_by_key(|update| update.account_id);

        let mut account_links = self
            .account_links
            .read()
            .await
            .values()
            .cloned()
            .collect::<Vec<_>>();
        account_links.sort_by_key(|link| link.account_id);

        BackendSnapshot {
            version: 1,
            presence,
            account_links,
            friend_requests: {
                let edges = self.friend_requests.read().await;
                sorted_edges(&edges)
            },
            friendships: {
                let edges = self.friendships.read().await;
                sorted_edges(&edges)
            },
            blocked_accounts: {
                let edges = self.blocked_accounts.read().await;
                sorted_edges(&edges)
            },
            muted_accounts: {
                let edges = self.muted_accounts.read().await;
                sorted_edges(&edges)
            },
        }
    }

    async fn apply_snapshot(&self, snapshot: BackendSnapshot) {
        *self.presence.write().await = snapshot
            .presence
            .into_iter()
            .map(|update| (update.account_id, update))
            .collect();
        *self.account_links.write().await = snapshot
            .account_links
            .into_iter()
            .map(|link| (link.account_id, link))
            .collect();
        *self.friend_requests.write().await = edges_to_set(snapshot.friend_requests);
        *self.friendships.write().await = edges_to_set(snapshot.friendships);
        *self.blocked_accounts.write().await = edges_to_set(snapshot.blocked_accounts);
        *self.muted_accounts.write().await = edges_to_set(snapshot.muted_accounts);
    }
}

fn minecraft_profile_client_with_timeout(timeout: Duration) -> anyhow::Result<reqwest::Client> {
    Ok(reqwest::Client::builder().timeout(timeout).build()?)
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct BackendSnapshot {
    version: u32,
    #[serde(default)]
    presence: Vec<PresenceUpdate>,
    #[serde(default)]
    account_links: Vec<MinecraftAccountLink>,
    #[serde(default)]
    friend_requests: Vec<AccountEdge>,
    #[serde(default)]
    friendships: Vec<AccountEdge>,
    #[serde(default)]
    blocked_accounts: Vec<AccountEdge>,
    #[serde(default)]
    muted_accounts: Vec<AccountEdge>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct AccountEdge {
    left: Uuid,
    right: Uuid,
}

fn sorted_edges(edges: &HashSet<(Uuid, Uuid)>) -> Vec<AccountEdge> {
    let mut edges = edges
        .iter()
        .map(|&(left, right)| AccountEdge { left, right })
        .collect::<Vec<_>>();
    edges.sort_by_key(|edge| (edge.left, edge.right));
    edges
}

fn edges_to_set(edges: Vec<AccountEdge>) -> HashSet<(Uuid, Uuid)> {
    edges
        .into_iter()
        .map(|edge| (edge.left, edge.right))
        .collect()
}

async fn persist_state(state: &BackendState) -> Result<(), StatusCode> {
    state.persist_snapshot_to_store().await.map_err(|error| {
        tracing::error!(%error, "failed to persist backend state");
        StatusCode::INTERNAL_SERVER_ERROR
    })
}

pub fn app(state: BackendState) -> Router {
    app_with_cors_origins(state, default_cors_origins())
}

pub fn app_with_cors_origins(state: BackendState, cors_origins: Vec<String>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/dev/sessions", post(create_dev_session))
        .route("/sessions/minecraft", post(create_minecraft_session))
        .route("/sessions/current", get(current_session))
        .route("/packs", get(list_packs))
        .route("/packs/{pack_id}", get(get_pack))
        .route("/accounts/search", get(search_accounts))
        .route(
            "/accounts/{account_id}/minecraft",
            get(get_minecraft_account_link).put(link_minecraft_account),
        )
        .route("/friends/{account_id}", get(list_friends))
        .route(
            "/blocks/{account_id}",
            get(list_blocked_accounts).post(block_account),
        )
        .route(
            "/blocks/{account_id}/{blocked_account_id}",
            delete(unblock_account),
        )
        .route(
            "/mutes/{account_id}",
            get(list_muted_accounts).post(mute_account),
        )
        .route(
            "/mutes/{account_id}/{muted_account_id}",
            delete(unmute_account),
        )
        .route(
            "/friends/{account_id}/requests",
            post(create_friend_request),
        )
        .route(
            "/friends/{account_id}/requests/{requester_account_id}/accept",
            post(accept_friend_request),
        )
        .route("/presence", get(list_presence))
        .route("/presence/{account_id}", post(update_presence))
        .route("/presence/ws", get(presence_websocket))
        .with_state(state)
        .layer(cors_layer(cors_origins))
}

fn cors_layer(cors_origins: Vec<String>) -> CorsLayer {
    let origins = cors_origins
        .into_iter()
        .map(|origin| {
            HeaderValue::from_str(&origin)
                .expect("configured CORS origins should be valid header values")
        })
        .collect::<Vec<_>>();
    CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        ok: true,
        service: "social-backend".to_owned(),
    })
}

async fn create_dev_session(
    State(state): State<BackendState>,
    Json(payload): Json<DevSessionRequest>,
) -> Result<Json<DevSessionResponse>, StatusCode> {
    if !state.allow_dev_sessions {
        return Err(StatusCode::FORBIDDEN);
    }
    if payload.account_id == Uuid::nil() {
        return Err(StatusCode::BAD_REQUEST);
    }
    Ok(Json(DevSessionResponse::new_dev(
        payload.account_id,
        state.session_secret.as_bytes(),
    )))
}

async fn create_minecraft_session(
    State(state): State<BackendState>,
    Json(payload): Json<MinecraftSessionExchangeRequest>,
) -> Result<Json<DevSessionResponse>, StatusCode> {
    validate_minecraft_session_exchange(&payload)?;
    let account_id = account_id_for_verified_minecraft_session(&payload)?;
    verify_minecraft_session_profile(&state, &payload).await?;
    let link = minecraft_account_link_from_payload(
        account_id,
        MinecraftAccountLinkPayload {
            minecraft_uuid: payload.minecraft_uuid,
            minecraft_name: payload.minecraft_name.clone(),
        },
    )?;
    state.load_account_links_from_postgres().await.map_err(|error| {
        tracing::error!(%error, "failed to refresh account links before Minecraft session exchange");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    let account_links = state.account_links.write().await;
    ensure_minecraft_identity_is_unclaimed(&account_links, &link)?;
    drop(account_links);
    state
        .persist_account_link_to_postgres(&link)
        .await
        .map_err(|error| {
            if is_postgres_unique_violation(&error) {
                StatusCode::CONFLICT
            } else {
                tracing::error!(%error, "failed to persist Minecraft session account link");
                StatusCode::INTERNAL_SERVER_ERROR
            }
        })?;
    state.account_links.write().await.insert(account_id, link);
    persist_state(&state).await?;

    Ok(Json(DevSessionResponse::new_minecraft(
        account_id,
        payload.minecraft_uuid,
        payload.minecraft_name,
        payload.expires_at_unix_seconds,
        state.session_secret.as_bytes(),
    )))
}

async fn current_session(
    State(state): State<BackendState>,
    headers: HeaderMap,
) -> Result<Json<CurrentSessionResponse>, StatusCode> {
    let session =
        authorize_session_token(&state, authorization_token_from_headers(&headers)?).await?;
    let now = current_unix_seconds();
    Ok(Json(CurrentSessionResponse {
        account_id: session.account_id,
        token_type: "Bearer".to_owned(),
        session_kind: session.kind,
        minecraft_uuid: session.minecraft_uuid,
        minecraft_name: session.minecraft_name,
        expires_at_unix_seconds: session.expires_at_unix_seconds,
        seconds_remaining: session.expires_at_unix_seconds.saturating_sub(now),
    }))
}

async fn list_presence(
    State(state): State<BackendState>,
    headers: HeaderMap,
) -> Result<Json<Vec<PresenceUpdate>>, StatusCode> {
    authorize_session_token(&state, authorization_token_from_headers(&headers)?).await?;
    let snapshot = state.presence_snapshot().await.map_err(|error| {
        tracing::error!(%error, "failed to refresh presence snapshot");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(Json(snapshot))
}

async fn list_packs() -> Json<Vec<PackSummary>> {
    Json(curated_pack_metadata())
}

async fn get_pack(Path(pack_id): Path<String>) -> Result<Json<PackSummary>, StatusCode> {
    curated_pack_metadata()
        .into_iter()
        .find(|pack| pack.id == pack_id)
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}

async fn search_accounts(
    State(state): State<BackendState>,
    headers: HeaderMap,
    Query(query): Query<AccountSearchQuery>,
) -> Result<Json<Vec<AccountSearchResult>>, StatusCode> {
    authorize_session_token(&state, authorization_token_from_headers(&headers)?).await?;
    let needle = query.minecraft_name.trim().to_ascii_lowercase();
    if needle.len() < 2 || needle.len() > 16 {
        return Err(StatusCode::BAD_REQUEST);
    }

    let account_links = state.account_link_snapshot().await.map_err(|error| {
        tracing::error!(%error, "failed to refresh account links");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    let mut results = account_links
        .iter()
        .filter(|link| link.minecraft_name.to_ascii_lowercase().contains(&needle))
        .map(|link| AccountSearchResult {
            account_id: link.account_id,
            minecraft_uuid: link.minecraft_uuid,
            minecraft_name: link.minecraft_name.clone(),
        })
        .collect::<Vec<_>>();
    results.sort_by(|left, right| {
        left.minecraft_name
            .to_ascii_lowercase()
            .cmp(&right.minecraft_name.to_ascii_lowercase())
            .then_with(|| left.account_id.cmp(&right.account_id))
    });
    results.truncate(20);
    Ok(Json(results))
}

fn curated_pack_metadata() -> Vec<PackSummary> {
    bundled_pack_summaries()
}

async fn get_minecraft_account_link(
    State(state): State<BackendState>,
    Path(account_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<MinecraftAccountLink>, StatusCode> {
    authorize_account(&state, &headers, account_id).await?;
    state
        .get_account_link(account_id)
        .await
        .map_err(|error| {
            tracing::error!(%error, "failed to refresh account link");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}

async fn link_minecraft_account(
    State(state): State<BackendState>,
    headers: HeaderMap,
    Path(account_id): Path<Uuid>,
    Json(payload): Json<MinecraftAccountLinkPayload>,
) -> Result<Json<MinecraftAccountLink>, StatusCode> {
    let session = authorize_account(&state, &headers, account_id).await?;
    let link = minecraft_account_link_from_payload(account_id, payload)?;
    ensure_link_matches_minecraft_session(&session, &link)?;
    state.load_account_links_from_postgres().await.map_err(|error| {
        tracing::error!(%error, "failed to refresh account links before linking Minecraft account");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    let account_links = state.account_links.write().await;
    ensure_minecraft_identity_is_unclaimed(&account_links, &link)?;
    drop(account_links);
    state
        .persist_account_link_to_postgres(&link)
        .await
        .map_err(|error| {
            if is_postgres_unique_violation(&error) {
                StatusCode::CONFLICT
            } else {
                tracing::error!(%error, "failed to persist Postgres Minecraft account link");
                StatusCode::INTERNAL_SERVER_ERROR
            }
        })?;
    state
        .account_links
        .write()
        .await
        .insert(account_id, link.clone());
    persist_state(&state).await?;
    Ok(Json(link))
}

async fn list_friends(
    State(state): State<BackendState>,
    headers: HeaderMap,
    Path(account_id): Path<Uuid>,
) -> Result<Json<Vec<FriendSummary>>, StatusCode> {
    authorize_account(&state, &headers, account_id).await?;
    Ok(Json(
        friend_summaries_for_account(&state, account_id).await?,
    ))
}

async fn create_friend_request(
    State(state): State<BackendState>,
    headers: HeaderMap,
    Path(account_id): Path<Uuid>,
    Json(payload): Json<FriendRequestPayload>,
) -> Result<Json<FriendSummary>, StatusCode> {
    authorize_account(&state, &headers, account_id).await?;
    state
        .load_friend_graph_from_postgres()
        .await
        .map_err(|error| {
            tracing::error!(%error, "failed to refresh friend graph before request");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    if account_id == payload.target_account_id {
        return Err(StatusCode::BAD_REQUEST);
    }
    if accounts_are_blocked(&state, account_id, payload.target_account_id).await? {
        return Err(StatusCode::FORBIDDEN);
    }
    let friendship = friendship_pair(account_id, payload.target_account_id);
    if state.friendships.read().await.contains(&friendship) {
        return Err(StatusCode::CONFLICT);
    }

    let reverse_request = (payload.target_account_id, account_id);
    if state
        .friend_requests
        .read()
        .await
        .contains(&reverse_request)
    {
        state
            .accept_friendship_in_postgres(payload.target_account_id, account_id)
            .await
            .map_err(|error| {
                tracing::error!(%error, "failed to persist reverse friend request acceptance");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
        state.friend_requests.write().await.remove(&reverse_request);
        state.friendships.write().await.insert(friendship);
        persist_state(&state).await?;
        return Ok(Json(FriendSummary {
            account_id: payload.target_account_id,
            status: FriendStatus::Friends,
            muted: false,
        }));
    }

    state
        .persist_friend_request_to_postgres(account_id, payload.target_account_id)
        .await
        .map_err(|error| {
            tracing::error!(%error, "failed to persist friend request");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    state
        .friend_requests
        .write()
        .await
        .insert((account_id, payload.target_account_id));
    persist_state(&state).await?;
    Ok(Json(FriendSummary {
        account_id: payload.target_account_id,
        status: FriendStatus::PendingOutbound,
        muted: false,
    }))
}

async fn accept_friend_request(
    State(state): State<BackendState>,
    headers: HeaderMap,
    Path((account_id, requester_account_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<FriendSummary>, StatusCode> {
    authorize_account(&state, &headers, account_id).await?;
    state
        .load_friend_graph_from_postgres()
        .await
        .map_err(|error| {
            tracing::error!(%error, "failed to refresh friend graph before acceptance");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    if account_id == requester_account_id {
        return Err(StatusCode::BAD_REQUEST);
    }
    if accounts_are_blocked(&state, account_id, requester_account_id).await? {
        return Err(StatusCode::FORBIDDEN);
    }
    let pending = (requester_account_id, account_id);
    if !state.friend_requests.read().await.contains(&pending) {
        return Err(StatusCode::NOT_FOUND);
    }

    state
        .accept_friendship_in_postgres(requester_account_id, account_id)
        .await
        .map_err(|error| {
            tracing::error!(%error, "failed to persist friend request acceptance");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    state.friend_requests.write().await.remove(&pending);
    state
        .friendships
        .write()
        .await
        .insert(friendship_pair(account_id, requester_account_id));
    persist_state(&state).await?;
    Ok(Json(FriendSummary {
        account_id: requester_account_id,
        status: FriendStatus::Friends,
        muted: false,
    }))
}

async fn list_blocked_accounts(
    State(state): State<BackendState>,
    headers: HeaderMap,
    Path(account_id): Path<Uuid>,
) -> Result<Json<Vec<BlockedAccountSummary>>, StatusCode> {
    authorize_account(&state, &headers, account_id).await?;
    refresh_relationship_filters_for_route(&state, "blocked accounts").await?;
    let blocked_accounts = state.blocked_accounts.read().await;
    let mut summaries = blocked_accounts
        .iter()
        .filter_map(|&(blocker, blocked)| {
            (blocker == account_id).then_some(BlockedAccountSummary {
                account_id: blocked,
            })
        })
        .collect::<Vec<_>>();
    summaries.sort_by_key(|summary| summary.account_id);
    Ok(Json(summaries))
}

async fn block_account(
    State(state): State<BackendState>,
    headers: HeaderMap,
    Path(account_id): Path<Uuid>,
    Json(payload): Json<BlockAccountPayload>,
) -> Result<Json<BlockedAccountSummary>, StatusCode> {
    authorize_account(&state, &headers, account_id).await?;
    if account_id == payload.target_account_id {
        return Err(StatusCode::BAD_REQUEST);
    }

    state
        .persist_block_to_postgres(account_id, payload.target_account_id)
        .await
        .map_err(|error| {
            tracing::error!(%error, "failed to persist blocked account");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    state
        .blocked_accounts
        .write()
        .await
        .insert((account_id, payload.target_account_id));
    state
        .friendships
        .write()
        .await
        .remove(&friendship_pair(account_id, payload.target_account_id));
    let mut requests = state.friend_requests.write().await;
    requests.remove(&(account_id, payload.target_account_id));
    requests.remove(&(payload.target_account_id, account_id));
    let mut mutes = state.muted_accounts.write().await;
    mutes.remove(&(account_id, payload.target_account_id));
    mutes.remove(&(payload.target_account_id, account_id));
    drop(mutes);
    drop(requests);
    persist_state(&state).await?;

    Ok(Json(BlockedAccountSummary {
        account_id: payload.target_account_id,
    }))
}

async fn unblock_account(
    State(state): State<BackendState>,
    headers: HeaderMap,
    Path((account_id, blocked_account_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, StatusCode> {
    authorize_account(&state, &headers, account_id).await?;
    state
        .remove_block_from_postgres(account_id, blocked_account_id)
        .await
        .map_err(|error| {
            tracing::error!(%error, "failed to remove blocked account");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    state
        .blocked_accounts
        .write()
        .await
        .remove(&(account_id, blocked_account_id));
    persist_state(&state).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn list_muted_accounts(
    State(state): State<BackendState>,
    headers: HeaderMap,
    Path(account_id): Path<Uuid>,
) -> Result<Json<Vec<MutedAccountSummary>>, StatusCode> {
    authorize_account(&state, &headers, account_id).await?;
    refresh_relationship_filters_for_route(&state, "muted accounts").await?;
    let muted_accounts = state.muted_accounts.read().await;
    let mut summaries = muted_accounts
        .iter()
        .filter_map(|&(muter, muted)| {
            (muter == account_id).then_some(MutedAccountSummary { account_id: muted })
        })
        .collect::<Vec<_>>();
    summaries.sort_by_key(|summary| summary.account_id);
    Ok(Json(summaries))
}

async fn mute_account(
    State(state): State<BackendState>,
    headers: HeaderMap,
    Path(account_id): Path<Uuid>,
    Json(payload): Json<MuteAccountPayload>,
) -> Result<Json<MutedAccountSummary>, StatusCode> {
    authorize_account(&state, &headers, account_id).await?;
    if account_id == payload.target_account_id {
        return Err(StatusCode::BAD_REQUEST);
    }

    state
        .persist_mute_to_postgres(account_id, payload.target_account_id)
        .await
        .map_err(|error| {
            tracing::error!(%error, "failed to persist muted account");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    state
        .muted_accounts
        .write()
        .await
        .insert((account_id, payload.target_account_id));
    persist_state(&state).await?;

    Ok(Json(MutedAccountSummary {
        account_id: payload.target_account_id,
    }))
}

async fn unmute_account(
    State(state): State<BackendState>,
    headers: HeaderMap,
    Path((account_id, muted_account_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, StatusCode> {
    authorize_account(&state, &headers, account_id).await?;
    state
        .remove_mute_from_postgres(account_id, muted_account_id)
        .await
        .map_err(|error| {
            tracing::error!(%error, "failed to remove muted account");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    state
        .muted_accounts
        .write()
        .await
        .remove(&(account_id, muted_account_id));
    persist_state(&state).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn update_presence(
    State(state): State<BackendState>,
    headers: HeaderMap,
    Path(account_id): Path<Uuid>,
    Json(payload): Json<PresencePayload>,
) -> Result<Json<PresenceUpdate>, StatusCode> {
    authorize_account(&state, &headers, account_id).await?;
    let update = presence_update_from_payload(account_id, payload)?;
    state
        .persist_presence_to_postgres(&update)
        .await
        .map_err(|error| {
            tracing::error!(%error, "failed to persist Postgres presence update");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    state
        .presence
        .write()
        .await
        .insert(account_id, update.clone());
    persist_state(&state).await?;
    let _ = state.presence_tx.send(update.clone());
    Ok(Json(update))
}

fn presence_update_from_payload(
    account_id: Uuid,
    payload: PresencePayload,
) -> Result<PresenceUpdate, StatusCode> {
    if payload.server_id.is_some() && payload.pack_id.is_none() {
        return Err(StatusCode::BAD_REQUEST);
    }
    if matches!(payload.state, PresenceState::Playing) && payload.pack_id.is_none() {
        return Err(StatusCode::BAD_REQUEST);
    }
    if !matches!(payload.state, PresenceState::Playing)
        && (payload.pack_id.is_some() || payload.server_id.is_some())
    {
        return Err(StatusCode::BAD_REQUEST);
    }

    Ok(PresenceUpdate {
        account_id,
        state: payload.state,
        pack_id: payload.pack_id,
        server_id: payload.server_id,
        updated_at: Utc::now(),
    })
}

fn presence_state_as_db(state: &PresenceState) -> &'static str {
    match state {
        PresenceState::Online => "online",
        PresenceState::Idle => "idle",
        PresenceState::Playing => "playing",
    }
}

fn presence_state_from_db(value: &str) -> anyhow::Result<PresenceState> {
    match value {
        "online" => Ok(PresenceState::Online),
        "idle" => Ok(PresenceState::Idle),
        "playing" => Ok(PresenceState::Playing),
        other => anyhow::bail!("unknown presence state from Postgres: {other}"),
    }
}

fn is_postgres_unique_violation(error: &anyhow::Error) -> bool {
    matches!(
        error.downcast_ref::<sqlx::Error>(),
        Some(sqlx::Error::Database(database_error))
            if database_error.code().as_deref() == Some("23505")
    )
}

async fn friend_summaries_for_account(
    state: &BackendState,
    account_id: Uuid,
) -> Result<Vec<FriendSummary>, StatusCode> {
    if state.postgres_pool.is_some() {
        state
            .load_friend_graph_from_postgres()
            .await
            .map_err(|error| {
                tracing::error!(%error, "failed to refresh friend graph for summary");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
        state
            .load_relationship_filters_from_postgres()
            .await
            .map_err(|error| {
                tracing::error!(%error, "failed to refresh relationship filters for summary");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
    }
    let friendships = state.friendships.read().await;
    let requests = state.friend_requests.read().await;
    let blocked_accounts = state.blocked_accounts.read().await;
    let muted_accounts = state.muted_accounts.read().await;
    let mut summaries = Vec::new();

    for &(left, right) in friendships.iter() {
        if blocked_accounts.contains(&(left, right)) || blocked_accounts.contains(&(right, left)) {
            continue;
        }
        if left == account_id {
            summaries.push(FriendSummary {
                account_id: right,
                status: FriendStatus::Friends,
                muted: muted_accounts.contains(&(account_id, right)),
            });
        } else if right == account_id {
            summaries.push(FriendSummary {
                account_id: left,
                status: FriendStatus::Friends,
                muted: muted_accounts.contains(&(account_id, left)),
            });
        }
    }

    for &(from, to) in requests.iter() {
        if blocked_accounts.contains(&(from, to)) || blocked_accounts.contains(&(to, from)) {
            continue;
        }
        if from == account_id {
            summaries.push(FriendSummary {
                account_id: to,
                status: FriendStatus::PendingOutbound,
                muted: muted_accounts.contains(&(account_id, to)),
            });
        } else if to == account_id {
            summaries.push(FriendSummary {
                account_id: from,
                status: FriendStatus::PendingInbound,
                muted: muted_accounts.contains(&(account_id, from)),
            });
        }
    }

    summaries.sort_by_key(|summary| summary.account_id);
    Ok(summaries)
}

async fn accounts_are_blocked(
    state: &BackendState,
    left: Uuid,
    right: Uuid,
) -> Result<bool, StatusCode> {
    if state.postgres_pool.is_some() {
        state
            .load_relationship_filters_from_postgres()
            .await
            .map_err(|error| {
                tracing::error!(%error, "failed to refresh blocked account state");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
    }
    let blocked_accounts = state.blocked_accounts.read().await;
    Ok(blocked_accounts.contains(&(left, right)) || blocked_accounts.contains(&(right, left)))
}

async fn refresh_relationship_filters_for_route(
    state: &BackendState,
    route_context: &str,
) -> Result<(), StatusCode> {
    if state.postgres_pool.is_none() {
        return Ok(());
    }
    state
        .load_relationship_filters_from_postgres()
        .await
        .map_err(|error| {
            tracing::error!(%error, route_context, "failed to refresh relationship filters");
            StatusCode::INTERNAL_SERVER_ERROR
        })
}

fn friendship_pair(left: Uuid, right: Uuid) -> (Uuid, Uuid) {
    if left.as_u128() <= right.as_u128() {
        (left, right)
    } else {
        (right, left)
    }
}

fn minecraft_account_link_from_payload(
    account_id: Uuid,
    payload: MinecraftAccountLinkPayload,
) -> Result<MinecraftAccountLink, StatusCode> {
    let minecraft_name = payload.minecraft_name.trim();
    validate_minecraft_identity(account_id, payload.minecraft_uuid, minecraft_name)?;

    Ok(MinecraftAccountLink {
        account_id,
        minecraft_uuid: payload.minecraft_uuid,
        minecraft_name: minecraft_name.to_owned(),
        linked_at: Utc::now(),
    })
}

fn validate_minecraft_session_exchange(
    payload: &MinecraftSessionExchangeRequest,
) -> Result<(), StatusCode> {
    validate_minecraft_identity(
        payload.minecraft_uuid,
        payload.minecraft_uuid,
        payload.minecraft_name.trim(),
    )?;
    let access_token = payload.access_token.trim();
    if access_token.is_empty()
        || access_token.chars().any(char::is_whitespace)
        || access_token.chars().any(char::is_control)
    {
        return Err(StatusCode::BAD_REQUEST);
    }
    if let Some(expires_at) = payload.expires_at_unix_seconds {
        if expires_at <= current_unix_seconds() + 30 {
            return Err(StatusCode::UNAUTHORIZED);
        }
    }
    Ok(())
}

fn account_id_for_verified_minecraft_session(
    payload: &MinecraftSessionExchangeRequest,
) -> Result<Uuid, StatusCode> {
    if let Some(requested_account_id) = payload.account_id {
        if requested_account_id != payload.minecraft_uuid {
            return Err(StatusCode::BAD_REQUEST);
        }
    }
    Ok(payload.minecraft_uuid)
}

fn validate_minecraft_identity(
    account_id: Uuid,
    minecraft_uuid: Uuid,
    minecraft_name: &str,
) -> Result<(), StatusCode> {
    if account_id == Uuid::nil() || minecraft_uuid == Uuid::nil() {
        return Err(StatusCode::BAD_REQUEST);
    }
    validate_minecraft_name(minecraft_name)
}

fn validate_minecraft_name(minecraft_name: &str) -> Result<(), StatusCode> {
    if minecraft_name.is_empty()
        || minecraft_name.len() > 16
        || !minecraft_name
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '_')
    {
        return Err(StatusCode::BAD_REQUEST);
    }
    Ok(())
}

async fn verify_minecraft_session_profile(
    state: &BackendState,
    payload: &MinecraftSessionExchangeRequest,
) -> Result<(), StatusCode> {
    let response = state
        .minecraft_profile_client
        .get(state.minecraft_profile_url.as_str())
        .bearer_auth(payload.access_token.trim())
        .send()
        .await
        .map_err(|error| {
            tracing::error!(%error, "failed to verify Minecraft session profile");
            StatusCode::BAD_GATEWAY
        })?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED
        || response.status() == reqwest::StatusCode::FORBIDDEN
    {
        return Err(StatusCode::UNAUTHORIZED);
    }
    if !response.status().is_success() {
        tracing::warn!(status = %response.status(), "Minecraft profile verification failed");
        return Err(StatusCode::BAD_GATEWAY);
    }
    let profile = response
        .json::<MinecraftProfileVerificationResponse>()
        .await
        .map_err(|error| {
            tracing::error!(%error, "failed to parse Minecraft profile verification response");
            StatusCode::BAD_GATEWAY
        })?;
    let verified_uuid = Uuid::parse_str(profile.id.trim()).map_err(|_| StatusCode::BAD_GATEWAY)?;
    if verified_uuid != payload.minecraft_uuid || profile.name != payload.minecraft_name {
        return Err(StatusCode::FORBIDDEN);
    }
    Ok(())
}

fn ensure_minecraft_identity_is_unclaimed(
    account_links: &HashMap<Uuid, MinecraftAccountLink>,
    link: &MinecraftAccountLink,
) -> Result<(), StatusCode> {
    let requested_name = link.minecraft_name.to_ascii_lowercase();
    let claimed = account_links.values().any(|existing| {
        existing.account_id != link.account_id
            && (existing.minecraft_uuid == link.minecraft_uuid
                || existing.minecraft_name.to_ascii_lowercase() == requested_name)
    });
    if claimed {
        Err(StatusCode::CONFLICT)
    } else {
        Ok(())
    }
}

fn authorization_token_from_headers(headers: &HeaderMap) -> Result<&str, StatusCode> {
    let Some(value) = headers.get(header::AUTHORIZATION) else {
        return Err(StatusCode::UNAUTHORIZED);
    };
    let Ok(value) = value.to_str() else {
        return Err(StatusCode::UNAUTHORIZED);
    };
    let mut parts = value.split_whitespace();
    let Some(scheme) = parts.next() else {
        return Err(StatusCode::UNAUTHORIZED);
    };
    if !scheme.eq_ignore_ascii_case("Bearer") {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let Some(token) = parts.next() else {
        return Err(StatusCode::UNAUTHORIZED);
    };
    if parts.next().is_some() || token.trim().is_empty() || token.chars().any(char::is_control) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    Ok(token)
}

async fn authorize_session_token(
    state: &BackendState,
    token: &str,
) -> Result<ParsedDevSessionToken, StatusCode> {
    let session = parse_authorization_token_with_legacy_minecraft_sessions(
        token,
        state.session_secret.as_bytes(),
        state.allow_legacy_minecraft_sessions,
    )?;
    if session.expires_at_unix_seconds <= current_unix_seconds() {
        return Err(StatusCode::UNAUTHORIZED);
    }
    if session.account_id == Uuid::nil() {
        return Err(StatusCode::UNAUTHORIZED);
    }
    if session.kind == SessionKind::Dev && !state.allow_dev_sessions {
        return Err(StatusCode::UNAUTHORIZED);
    }
    validate_session_against_durable_identity(state, &session).await?;
    Ok(session)
}

async fn authorize_account(
    state: &BackendState,
    headers: &HeaderMap,
    account_id: Uuid,
) -> Result<ParsedDevSessionToken, StatusCode> {
    let session =
        authorize_session_token(state, authorization_token_from_headers(headers)?).await?;
    if session.account_id == account_id {
        Ok(session)
    } else {
        Err(StatusCode::FORBIDDEN)
    }
}

fn ensure_link_matches_minecraft_session(
    session: &ParsedDevSessionToken,
    link: &MinecraftAccountLink,
) -> Result<(), StatusCode> {
    if session.kind != SessionKind::Minecraft {
        return Ok(());
    }
    let (Some(minecraft_uuid), Some(minecraft_name)) =
        (session.minecraft_uuid, session.minecraft_name.as_deref())
    else {
        return Err(StatusCode::FORBIDDEN);
    };
    if link.minecraft_uuid == minecraft_uuid
        && link.minecraft_name.to_ascii_lowercase() == minecraft_name.to_ascii_lowercase()
    {
        Ok(())
    } else {
        Err(StatusCode::FORBIDDEN)
    }
}

async fn validate_session_against_durable_identity(
    state: &BackendState,
    session: &ParsedDevSessionToken,
) -> Result<(), StatusCode> {
    if state.postgres_pool.is_none() || session.kind != SessionKind::Minecraft {
        return Ok(());
    }
    let (Some(minecraft_uuid), Some(minecraft_name)) =
        (session.minecraft_uuid, session.minecraft_name.as_deref())
    else {
        return Err(StatusCode::UNAUTHORIZED);
    };
    let link = state.get_account_link(session.account_id).await.map_err(|error| {
        tracing::error!(%error, "failed to refresh Minecraft account link during session authorization");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    let Some(link) = link else {
        return Err(StatusCode::UNAUTHORIZED);
    };
    if link.minecraft_uuid != minecraft_uuid
        || link.minecraft_name.to_ascii_lowercase() != minecraft_name.to_ascii_lowercase()
    {
        return Err(StatusCode::UNAUTHORIZED);
    }
    Ok(())
}

const DEV_SESSION_TOKEN_PREFIX: &str = "dev-session:v2:";
const MINECRAFT_SESSION_TOKEN_PREFIX_V1: &str = "minecraft-session:v1:";
const MINECRAFT_SESSION_TOKEN_PREFIX: &str = "minecraft-session:v2:";

fn dev_session_token_with_expiry(
    account_id: Uuid,
    expires_at_unix_seconds: i64,
    secret: &[u8],
) -> String {
    let payload = format!("{account_id}:{expires_at_unix_seconds}");
    let signature = dev_session_signature(&payload, secret);
    format!("{DEV_SESSION_TOKEN_PREFIX}{payload}:{signature}")
}

fn minecraft_session_token_with_expiry(
    account_id: Uuid,
    minecraft_uuid: Uuid,
    minecraft_name: &str,
    expires_at_unix_seconds: i64,
    secret: &[u8],
) -> String {
    let payload = format!(
        "{account_id}:{expires_at_unix_seconds}:{minecraft_uuid}:{}",
        minecraft_name.trim()
    );
    let signature = dev_session_signature(&payload, secret);
    format!("{MINECRAFT_SESSION_TOKEN_PREFIX}{payload}:{signature}")
}

#[cfg(test)]
fn parse_authorization_token(
    token: &str,
    secret: &[u8],
) -> Result<ParsedDevSessionToken, StatusCode> {
    parse_authorization_token_with_legacy_minecraft_sessions(token, secret, true)
}

fn parse_authorization_token_with_legacy_minecraft_sessions(
    token: &str,
    secret: &[u8],
    allow_legacy_minecraft_sessions: bool,
) -> Result<ParsedDevSessionToken, StatusCode> {
    parse_signed_session_token(token, DEV_SESSION_TOKEN_PREFIX, SessionKind::Dev, secret).or_else(
        |_| {
            parse_signed_session_token(
                token,
                MINECRAFT_SESSION_TOKEN_PREFIX,
                SessionKind::Minecraft,
                secret,
            )
            .or_else(|_| {
                if !allow_legacy_minecraft_sessions {
                    return Err(StatusCode::UNAUTHORIZED);
                }
                parse_signed_session_token(
                    token,
                    MINECRAFT_SESSION_TOKEN_PREFIX_V1,
                    SessionKind::Minecraft,
                    secret,
                )
            })
        },
    )
}

fn parse_signed_session_token(
    token: &str,
    prefix: &str,
    kind: SessionKind,
    secret: &[u8],
) -> Result<ParsedDevSessionToken, StatusCode> {
    let Some(payload) = token.strip_prefix(prefix) else {
        return Err(StatusCode::UNAUTHORIZED);
    };
    let Some((signed_payload, signature)) = payload.rsplit_once(':') else {
        return Err(StatusCode::UNAUTHORIZED);
    };
    verify_dev_session_signature(signed_payload, signature, secret)?;
    let parts = signed_payload.split(':').collect::<Vec<_>>();
    if !(parts.len() == 2 || (kind == SessionKind::Minecraft && parts.len() == 4)) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let account_id = parts[0];
    let expires_at_unix_seconds = parts[1];
    let account_id = Uuid::parse_str(account_id).map_err(|_| StatusCode::UNAUTHORIZED)?;
    let expires_at_unix_seconds = expires_at_unix_seconds
        .parse::<i64>()
        .map_err(|_| StatusCode::UNAUTHORIZED)?;
    let (minecraft_uuid, minecraft_name) = if kind == SessionKind::Minecraft && parts.len() == 4 {
        let minecraft_uuid = Uuid::parse_str(parts[2]).map_err(|_| StatusCode::UNAUTHORIZED)?;
        let minecraft_name = parts[3].trim();
        validate_minecraft_identity(account_id, minecraft_uuid, minecraft_name)
            .map_err(|_| StatusCode::UNAUTHORIZED)?;
        (Some(minecraft_uuid), Some(minecraft_name.to_owned()))
    } else {
        (None, None)
    };
    Ok(ParsedDevSessionToken {
        account_id,
        kind,
        minecraft_uuid,
        minecraft_name,
        expires_at_unix_seconds,
    })
}

fn dev_session_signature(payload: &str, secret: &[u8]) -> String {
    let mut mac =
        HmacSha256::new_from_slice(secret).expect("HMAC accepts session secrets of any length");
    mac.update(payload.as_bytes());
    hex_encode(&mac.finalize().into_bytes())
}

fn verify_dev_session_signature(
    payload: &str,
    signature: &str,
    secret: &[u8],
) -> Result<(), StatusCode> {
    let signature = hex_decode(signature).ok_or(StatusCode::UNAUTHORIZED)?;
    let mut mac =
        HmacSha256::new_from_slice(secret).expect("HMAC accepts session secrets of any length");
    mac.update(payload.as_bytes());
    mac.verify_slice(&signature)
        .map_err(|_| StatusCode::UNAUTHORIZED)
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut encoded = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        encoded.push(HEX[(byte >> 4) as usize] as char);
        encoded.push(HEX[(byte & 0x0f) as usize] as char);
    }
    encoded
}

fn hex_decode(value: &str) -> Option<Vec<u8>> {
    if value.len() % 2 != 0 {
        return None;
    }
    value
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            let high = hex_value(pair[0])?;
            let low = hex_value(pair[1])?;
            Some((high << 4) | low)
        })
        .collect()
}

fn hex_value(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct ParsedDevSessionToken {
    account_id: Uuid,
    kind: SessionKind,
    minecraft_uuid: Option<Uuid>,
    minecraft_name: Option<String>,
    expires_at_unix_seconds: i64,
}

fn current_unix_seconds() -> i64 {
    Utc::now().timestamp()
}

#[derive(Clone, Debug, Deserialize)]
struct PresenceWebsocketQuery {
    access_token: Option<String>,
}

async fn presence_websocket(
    State(state): State<BackendState>,
    headers: HeaderMap,
    Query(query): Query<PresenceWebsocketQuery>,
    ws: WebSocketUpgrade,
) -> Result<Response, StatusCode> {
    let token = authorization_token_from_headers(&headers)
        .map(str::to_owned)
        .or_else(|_| {
            query
                .access_token
                .as_deref()
                .map(str::trim)
                .filter(|token| !token.is_empty())
                .map(str::to_owned)
                .ok_or(StatusCode::UNAUTHORIZED)
        })?;
    authorize_session_token(&state, &token).await?;
    let initial_snapshot = state.presence_snapshot().await.map_err(|error| {
        tracing::error!(%error, "failed to refresh websocket presence snapshot");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(ws.on_upgrade(move |socket| stream_presence(socket, state, initial_snapshot)))
}

async fn stream_presence(
    mut socket: WebSocket,
    state: BackendState,
    initial_snapshot: Vec<PresenceUpdate>,
) {
    for update in initial_snapshot {
        if send_presence_update(&mut socket, &update).await.is_err() {
            return;
        }
    }

    let mut receiver = state.subscribe_presence();
    loop {
        match receiver.recv().await {
            Ok(update) => {
                if send_presence_update(&mut socket, &update).await.is_err() {
                    return;
                }
            }
            Err(broadcast::error::RecvError::Lagged(_)) => continue,
            Err(broadcast::error::RecvError::Closed) => return,
        }
    }
}

async fn send_presence_update(
    socket: &mut WebSocket,
    update: &PresenceUpdate,
) -> Result<(), axum::Error> {
    let payload = serde_json::to_string(update).expect("presence update should serialize");
    socket.send(Message::Text(payload.into())).await
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct HealthResponse {
    pub ok: bool,
    pub service: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DevSessionRequest {
    pub account_id: Uuid,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DevSessionResponse {
    pub account_id: Uuid,
    pub token_type: String,
    pub session_kind: SessionKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub minecraft_uuid: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub minecraft_name: Option<String>,
    pub access_token: String,
    pub authorization_header: String,
    pub issued_at_unix_seconds: i64,
    pub expires_at_unix_seconds: i64,
}

impl DevSessionResponse {
    fn new_dev(account_id: Uuid, secret: &[u8]) -> Self {
        let issued_at_unix_seconds = current_unix_seconds();
        let expires_at_unix_seconds = issued_at_unix_seconds + DEV_SESSION_TTL_SECONDS;
        let access_token =
            dev_session_token_with_expiry(account_id, expires_at_unix_seconds, secret);
        Self {
            account_id,
            token_type: "Bearer".to_owned(),
            session_kind: SessionKind::Dev,
            minecraft_uuid: None,
            minecraft_name: None,
            authorization_header: format!("Bearer {access_token}"),
            access_token,
            issued_at_unix_seconds,
            expires_at_unix_seconds,
        }
    }

    fn new_minecraft(
        account_id: Uuid,
        minecraft_uuid: Uuid,
        minecraft_name: impl Into<String>,
        minecraft_expires_at_unix_seconds: Option<i64>,
        secret: &[u8],
    ) -> Self {
        let issued_at_unix_seconds = current_unix_seconds();
        let default_expires_at = issued_at_unix_seconds + DEV_SESSION_TTL_SECONDS;
        let expires_at_unix_seconds = minecraft_expires_at_unix_seconds
            .map(|expires_at| expires_at.min(default_expires_at))
            .unwrap_or(default_expires_at);
        let minecraft_name = minecraft_name.into();
        let access_token = minecraft_session_token_with_expiry(
            account_id,
            minecraft_uuid,
            &minecraft_name,
            expires_at_unix_seconds,
            secret,
        );
        Self {
            account_id,
            token_type: "Bearer".to_owned(),
            session_kind: SessionKind::Minecraft,
            minecraft_uuid: Some(minecraft_uuid),
            minecraft_name: Some(minecraft_name),
            authorization_header: format!("Bearer {access_token}"),
            access_token,
            issued_at_unix_seconds,
            expires_at_unix_seconds,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CurrentSessionResponse {
    pub account_id: Uuid,
    pub token_type: String,
    pub session_kind: SessionKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub minecraft_uuid: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub minecraft_name: Option<String>,
    pub expires_at_unix_seconds: i64,
    pub seconds_remaining: i64,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionKind {
    Dev,
    Minecraft,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftSessionExchangeRequest {
    #[serde(default)]
    pub account_id: Option<Uuid>,
    pub minecraft_uuid: Uuid,
    pub minecraft_name: String,
    pub access_token: String,
    pub expires_at_unix_seconds: Option<i64>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
struct MinecraftProfileVerificationResponse {
    id: String,
    name: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PresencePayload {
    pub state: PresenceState,
    pub pack_id: Option<String>,
    pub server_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftAccountLinkPayload {
    pub minecraft_uuid: Uuid,
    pub minecraft_name: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AccountSearchQuery {
    pub minecraft_name: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AccountSearchResult {
    pub account_id: Uuid,
    pub minecraft_uuid: Uuid,
    pub minecraft_name: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftAccountLink {
    pub account_id: Uuid,
    pub minecraft_uuid: Uuid,
    pub minecraft_name: String,
    pub linked_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FriendRequestPayload {
    pub target_account_id: Uuid,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BlockAccountPayload {
    pub target_account_id: Uuid,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MuteAccountPayload {
    pub target_account_id: Uuid,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FriendSummary {
    pub account_id: Uuid,
    pub status: FriendStatus,
    pub muted: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BlockedAccountSummary {
    pub account_id: Uuid,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MutedAccountSummary {
    pub account_id: Uuid,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FriendStatus {
    PendingInbound,
    PendingOutbound,
    Friends,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PresenceUpdate {
    pub account_id: Uuid,
    pub state: PresenceState,
    pub pack_id: Option<String>,
    pub server_id: Option<String>,
    pub updated_at: DateTime<Utc>,
}

impl PresenceUpdate {
    pub fn offline(account_id: Uuid) -> Self {
        Self {
            account_id,
            state: PresenceState::Idle,
            pack_id: None,
            server_id: None,
            updated_at: Utc::now(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{to_bytes, Body},
        http::{Request, StatusCode},
    };
    use futures_util::StreamExt;
    use shared::PackStatus;
    use tokio::net::TcpListener;
    use tokio_tungstenite::connect_async;
    use tower::ServiceExt;

    fn dev_session(account_id: Uuid) -> String {
        let state = BackendState::default();
        format!(
            "Bearer {}",
            dev_session_token_with_expiry(
                account_id,
                current_unix_seconds() + DEV_SESSION_TTL_SECONDS,
                state.session_secret.as_bytes(),
            )
        )
    }

    fn dev_access_token(account_id: Uuid) -> String {
        dev_session(account_id)
            .strip_prefix("Bearer ")
            .expect("dev session helper should return bearer")
            .to_owned()
    }

    async fn spawn_minecraft_profile_server(status: StatusCode, body: serde_json::Value) -> String {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("test profile server should bind");
        let addr = listener
            .local_addr()
            .expect("test profile server address should be available");
        let app = Router::new().route(
            "/minecraft/profile",
            get(move || {
                let body = body.clone();
                async move { (status, Json(body)) }
            }),
        );
        tokio::spawn(async move {
            axum::serve(listener, app)
                .await
                .expect("test profile server should run");
        });
        format!("http://{addr}/minecraft/profile")
    }

    async fn spawn_slow_minecraft_profile_server(
        delay: Duration,
        body: serde_json::Value,
    ) -> String {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("test profile server should bind");
        let addr = listener
            .local_addr()
            .expect("test profile server address should be available");
        let app = Router::new().route(
            "/minecraft/profile",
            get(move || {
                let body = body.clone();
                async move {
                    tokio::time::sleep(delay).await;
                    (StatusCode::OK, Json(body))
                }
            }),
        );
        tokio::spawn(async move {
            axum::serve(listener, app)
                .await
                .expect("test profile server should run");
        });
        format!("http://{addr}/minecraft/profile")
    }

    #[test]
    fn default_backend_config_is_localhost() {
        let config = BackendConfig::from_values(None, None, None, None, None, None, None)
            .expect("default local config should be valid");
        assert!(!config.bind_addr.is_empty());
        assert!(!config.session_secret.is_empty());
        assert_eq!(config.minecraft_profile_url, DEFAULT_MINECRAFT_PROFILE_URL);
        assert!(config.allow_dev_sessions);
        assert_eq!(config.cors_origins, default_cors_origins());
    }

    #[test]
    fn postgres_backend_config_requires_configured_session_secret() {
        let error = BackendConfig::from_values(
            None,
            Some("postgres://localhost/theboyslauncher".to_owned()),
            None,
            None,
            None,
            None,
            None,
        )
        .expect_err("Postgres mode should require an explicit session secret")
        .to_string();

        assert!(error.contains("THEBOYS_BACKEND_SESSION_SECRET is required"));
    }

    #[test]
    fn postgres_backend_config_rejects_default_or_short_session_secret() {
        let default_error = BackendConfig::from_values(
            None,
            Some("postgres://localhost/theboyslauncher".to_owned()),
            None,
            Some(DEFAULT_DEV_SESSION_SECRET.to_owned()),
            None,
            None,
            None,
        )
        .expect_err("Postgres mode should reject default development secret")
        .to_string();
        let short_error = BackendConfig::from_values(
            None,
            Some("postgres://localhost/theboyslauncher".to_owned()),
            None,
            Some("short-secret".to_owned()),
            None,
            None,
            None,
        )
        .expect_err("Postgres mode should reject short secrets")
        .to_string();

        assert!(default_error.contains("development fallback secret"));
        assert!(short_error.contains("at least"));
    }

    #[test]
    fn postgres_backend_config_accepts_strong_session_secret() {
        let config = BackendConfig::from_values(
            Some("127.0.0.1:5000".to_owned()),
            Some("postgres://localhost/theboyslauncher".to_owned()),
            Some("state.json".to_owned()),
            Some("hosted-secret-that-is-long-enough-for-hmac".to_owned()),
            Some("http://127.0.0.1:9000/profile".to_owned()),
            None,
            Some("https://launcher.dylan.lol, http://127.0.0.1:1420, tauri://localhost".to_owned()),
        )
        .expect("Postgres mode should accept strong explicit secret");

        assert_eq!(config.bind_addr, "127.0.0.1:5000");
        assert_eq!(
            config.database_url.as_deref(),
            Some("postgres://localhost/theboyslauncher")
        );
        assert_eq!(config.state_path, Some(PathBuf::from("state.json")));
        assert_eq!(
            config.session_secret,
            "hosted-secret-that-is-long-enough-for-hmac"
        );
        assert_eq!(
            config.minecraft_profile_url,
            "http://127.0.0.1:9000/profile"
        );
        assert!(!config.allow_dev_sessions);
        assert_eq!(
            config.cors_origins,
            vec![
                "https://launcher.dylan.lol".to_owned(),
                "http://127.0.0.1:1420".to_owned(),
                "tauri://localhost".to_owned()
            ]
        );
    }

    #[test]
    fn default_cors_origins_include_packaged_tauri_origins() {
        let origins = default_cors_origins();

        assert!(origins.contains(&"tauri://localhost".to_owned()));
        assert!(origins.contains(&"http://tauri.localhost".to_owned()));
        assert!(origins.contains(&"https://tauri.localhost".to_owned()));
    }

    #[test]
    fn backend_config_rejects_invalid_minecraft_profile_urls() {
        let invalid_scheme = BackendConfig::from_values(
            None,
            None,
            None,
            None,
            Some("file:///tmp/profile.json".to_owned()),
            None,
            None,
        )
        .expect_err("profile verification URL should require HTTP(S)")
        .to_string();
        let missing_host = BackendConfig::from_values(
            None,
            None,
            None,
            None,
            Some("https:///minecraft/profile".to_owned()),
            None,
            None,
        )
        .expect_err("profile verification URL should require a host")
        .to_string();

        assert!(invalid_scheme.contains("THEBOYS_BACKEND_MINECRAFT_PROFILE_URL"));
        assert!(missing_host.contains("requires a host") || missing_host.contains("invalid"));
    }

    #[test]
    fn hosted_backend_config_requires_https_minecraft_profile_url_unless_loopback() {
        let remote_http = BackendConfig::from_values(
            None,
            Some("postgres://localhost/theboyslauncher".to_owned()),
            None,
            Some("hosted-secret-that-is-long-enough-for-hmac".to_owned()),
            Some("http://minecraft.example/profile".to_owned()),
            None,
            None,
        )
        .expect_err("hosted mode should reject insecure remote profile verification URLs")
        .to_string();
        let loopback_http = BackendConfig::from_values(
            None,
            Some("postgres://localhost/theboyslauncher".to_owned()),
            None,
            Some("hosted-secret-that-is-long-enough-for-hmac".to_owned()),
            Some("http://127.0.0.1:9000/profile".to_owned()),
            None,
            None,
        )
        .expect("hosted test mode should allow loopback profile verification URLs");

        assert!(remote_http.contains("must use https in hosted mode"));
        assert_eq!(
            loopback_http.minecraft_profile_url,
            "http://127.0.0.1:9000/profile"
        );
    }

    #[test]
    fn postgres_backend_config_can_explicitly_allow_dev_sessions() {
        let config = BackendConfig::from_values(
            None,
            Some("postgres://localhost/theboyslauncher".to_owned()),
            None,
            Some("hosted-secret-that-is-long-enough-for-hmac".to_owned()),
            None,
            Some("true".to_owned()),
            None,
        )
        .expect("Postgres mode should accept explicit dev-session override");

        assert!(config.allow_dev_sessions);
    }

    #[test]
    fn backend_config_rejects_invalid_dev_session_flag() {
        let error = BackendConfig::from_values(
            None,
            None,
            None,
            None,
            None,
            Some("maybe".to_owned()),
            None,
        )
        .expect_err("invalid boolean flag should fail")
        .to_string();

        assert!(error.contains("THEBOYS_BACKEND_ALLOW_DEV_SESSIONS"));
    }

    #[test]
    fn backend_config_rejects_wildcard_or_path_cors_origins() {
        let wildcard =
            BackendConfig::from_values(None, None, None, None, None, None, Some("*".to_owned()))
                .expect_err("wildcard CORS origins should fail")
                .to_string();
        let path = BackendConfig::from_values(
            None,
            None,
            None,
            None,
            None,
            None,
            Some("https://launcher.dylan.lol/api".to_owned()),
        )
        .expect_err("path-bearing CORS origins should fail")
        .to_string();

        assert!(wildcard.contains("explicit origins"));
        assert!(path.contains("must not include paths"));
    }

    #[test]
    fn backend_state_can_use_configured_session_secret() {
        let account_id = Uuid::new_v4();
        let default_state = BackendState::default();
        let custom_state = BackendState::default().with_session_secret("custom-secret");
        let token = dev_session_token_with_expiry(
            account_id,
            current_unix_seconds() + DEV_SESSION_TTL_SECONDS,
            custom_state.session_secret.as_bytes(),
        );

        assert!(parse_authorization_token(&token, custom_state.session_secret.as_bytes()).is_ok());
        assert!(
            parse_authorization_token(&token, default_state.session_secret.as_bytes()).is_err()
        );
    }

    #[test]
    fn postgres_initial_schema_covers_social_state_tables() {
        for table in [
            "accounts",
            "minecraft_account_links",
            "presence_updates",
            "friend_requests",
            "friendships",
            "account_blocks",
            "account_mutes",
        ] {
            assert!(
                POSTGRES_INITIAL_SCHEMA_SQL
                    .contains(&format!("CREATE TABLE IF NOT EXISTS {table}")),
                "migration should create {table}"
            );
        }
    }

    #[test]
    fn postgres_initial_schema_preserves_route_invariants() {
        for invariant in [
            "UNIQUE (minecraft_name_normalized)",
            "CHECK (state <> 'playing' OR pack_id IS NOT NULL)",
            "CHECK (server_id IS NULL OR pack_id IS NOT NULL)",
            "CHECK (requester_account_id <> target_account_id)",
            "CHECK (left_account_id < right_account_id)",
            "CHECK (blocker_account_id <> blocked_account_id)",
            "CHECK (muter_account_id <> muted_account_id)",
        ] {
            assert!(
                POSTGRES_INITIAL_SCHEMA_SQL.contains(invariant),
                "migration should include invariant: {invariant}"
            );
        }
    }

    #[test]
    fn postgres_migration_list_is_validated() {
        validate_postgres_migrations(POSTGRES_MIGRATIONS)
            .expect("embedded Postgres migrations should validate");
        assert_eq!(POSTGRES_MIGRATIONS[0].name, "0001_initial_social_state.sql");
    }

    #[test]
    fn postgres_migration_checksums_are_stable_sha256_hex() {
        let checksum = postgres_migration_checksum(POSTGRES_INITIAL_SCHEMA_SQL);
        assert_eq!(checksum.len(), 64);
        assert!(checksum
            .chars()
            .all(|character| character.is_ascii_hexdigit()));
        assert_eq!(
            checksum,
            postgres_migration_checksum(POSTGRES_INITIAL_SCHEMA_SQL)
        );
        assert_ne!(
            checksum,
            postgres_migration_checksum(&format!("{POSTGRES_INITIAL_SCHEMA_SQL}\n-- changed"))
        );
    }

    #[test]
    fn postgres_migration_validation_rejects_empty_or_unsorted_entries() {
        assert!(validate_postgres_migrations(&[]).is_err());
        assert!(validate_postgres_migrations(&[
            PostgresMigration {
                name: "0002_next.sql",
                sql: "SELECT 1;",
            },
            PostgresMigration {
                name: "0001_previous.sql",
                sql: "SELECT 1;",
            },
        ])
        .is_err());
        assert!(validate_postgres_migrations(&[PostgresMigration {
            name: "0001_empty.sql",
            sql: "   ",
        }])
        .is_err());
    }

    #[test]
    fn presence_state_database_values_match_schema_constraint() {
        for (state, database_value) in [
            (PresenceState::Online, "online"),
            (PresenceState::Idle, "idle"),
            (PresenceState::Playing, "playing"),
        ] {
            assert_eq!(presence_state_as_db(&state), database_value);
            assert_eq!(
                presence_state_from_db(database_value).expect("database value should parse"),
                state
            );
            assert!(
                POSTGRES_INITIAL_SCHEMA_SQL.contains(database_value),
                "schema should allow {database_value}"
            );
        }

        assert!(presence_state_from_db("offline").is_err());
    }

    #[tokio::test]
    #[ignore = "requires TEST_DATABASE_URL pointing at a disposable Postgres database"]
    async fn live_postgres_migrations_create_social_state_tables() {
        let database_url =
            std::env::var("TEST_DATABASE_URL").expect("TEST_DATABASE_URL must be set");
        apply_postgres_migrations(&database_url)
            .await
            .expect("migrations should apply");
        apply_postgres_migrations(&database_url)
            .await
            .expect("migrations should be idempotent after ledger insert");
        let pool = PgPool::connect(&database_url)
            .await
            .expect("test database should connect");
        let ledger_exists = sqlx::query_scalar::<_, bool>(
            "SELECT to_regclass('public.theboyslauncher_schema_migrations') IS NOT NULL",
        )
        .fetch_one(&pool)
        .await
        .expect("ledger existence query should run");
        assert!(ledger_exists, "expected migration ledger table to exist");
        for table in [
            "accounts",
            "minecraft_account_links",
            "presence_updates",
            "friend_requests",
            "friendships",
            "account_blocks",
            "account_mutes",
        ] {
            let exists = sqlx::query_scalar::<_, bool>(
                "SELECT to_regclass(('public.' || $1)::text) IS NOT NULL",
            )
            .bind(table)
            .fetch_one(&pool)
            .await
            .expect("table existence query should run");
            assert!(exists, "expected table {table} to exist");
        }
        let applied_count = sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM theboyslauncher_schema_migrations WHERE name = $1 AND checksum = $2",
        )
        .bind(POSTGRES_MIGRATIONS[0].name)
        .bind(postgres_migration_checksum(POSTGRES_MIGRATIONS[0].sql))
        .fetch_one(&pool)
        .await
        .expect("migration ledger query should run");
        assert_eq!(applied_count, 1);
        pool.close().await;
    }

    #[tokio::test]
    #[ignore = "requires TEST_DATABASE_URL pointing at a disposable Postgres database"]
    async fn live_postgres_presence_persists_across_state_instances() {
        let database_url =
            std::env::var("TEST_DATABASE_URL").expect("TEST_DATABASE_URL must be set");
        apply_postgres_migrations(&database_url)
            .await
            .expect("migrations should apply");
        let pool = PgPool::connect(&database_url)
            .await
            .expect("test database should connect");
        sqlx::query("TRUNCATE presence_updates, accounts CASCADE")
            .execute(&pool)
            .await
            .expect("test database should reset social state");
        pool.close().await;

        let account_id = Uuid::new_v4();
        let state = BackendState::with_postgres(&database_url)
            .await
            .expect("state should connect to Postgres");
        let response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/presence/{account_id}"))
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::from(
                        serde_json::json!({
                            "state": "playing",
                            "packId": "winterpack",
                            "serverId": "the-cabin"
                        })
                        .to_string(),
                    ))
                    .expect("request should build"),
            )
            .await
            .expect("response should be returned");
        assert_eq!(response.status(), StatusCode::OK);
        drop(state);

        let reloaded_state = BackendState::with_postgres(&database_url)
            .await
            .expect("state should reload Postgres presence");
        let presence = reloaded_state
            .presence_snapshot()
            .await
            .expect("presence snapshot should load from Postgres");
        assert_eq!(presence.len(), 1);
        assert_eq!(presence[0].account_id, account_id);
        assert_eq!(presence[0].state, PresenceState::Playing);
        assert_eq!(presence[0].pack_id.as_deref(), Some("winterpack"));
        assert_eq!(presence[0].server_id.as_deref(), Some("the-cabin"));
    }

    #[tokio::test]
    #[ignore = "requires TEST_DATABASE_URL pointing at a disposable Postgres database"]
    async fn live_postgres_minecraft_account_link_persists_across_state_instances() {
        let database_url =
            std::env::var("TEST_DATABASE_URL").expect("TEST_DATABASE_URL must be set");
        apply_postgres_migrations(&database_url)
            .await
            .expect("migrations should apply");
        let pool = PgPool::connect(&database_url)
            .await
            .expect("test database should connect");
        sqlx::query("TRUNCATE minecraft_account_links, accounts CASCADE")
            .execute(&pool)
            .await
            .expect("test database should reset account-link state");
        pool.close().await;

        let account_id = Uuid::new_v4();
        let minecraft_uuid = Uuid::new_v4();
        let state = BackendState::with_postgres(&database_url)
            .await
            .expect("state should connect to Postgres");
        let response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri(format!("/accounts/{account_id}/minecraft"))
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::from(
                        serde_json::json!({
                            "minecraftUuid": minecraft_uuid,
                            "minecraftName": "DurableUser"
                        })
                        .to_string(),
                    ))
                    .expect("request should build"),
            )
            .await
            .expect("response should be returned");
        assert_eq!(response.status(), StatusCode::OK);
        drop(state);

        let reloaded_state = BackendState::with_postgres(&database_url)
            .await
            .expect("state should reload Postgres account links");
        let response = app(reloaded_state.clone())
            .oneshot(
                Request::builder()
                    .uri(format!("/accounts/{account_id}/minecraft"))
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::OK);
        let link = read_json::<MinecraftAccountLink>(response).await;
        assert_eq!(link.account_id, account_id);
        assert_eq!(link.minecraft_uuid, minecraft_uuid);
        assert_eq!(link.minecraft_name, "DurableUser");

        let response = app(reloaded_state)
            .oneshot(
                Request::builder()
                    .uri("/accounts/search?minecraftName=durable")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::OK);
        let results = read_json::<Vec<AccountSearchResult>>(response).await;
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].account_id, account_id);
        assert_eq!(results[0].minecraft_uuid, minecraft_uuid);
        assert_eq!(results[0].minecraft_name, "DurableUser");
    }

    #[tokio::test]
    #[ignore = "requires TEST_DATABASE_URL pointing at a disposable Postgres database"]
    async fn live_postgres_minecraft_bearer_requires_matching_account_link() {
        let database_url =
            std::env::var("TEST_DATABASE_URL").expect("TEST_DATABASE_URL must be set");
        apply_postgres_migrations(&database_url)
            .await
            .expect("migrations should apply");
        let pool = PgPool::connect(&database_url)
            .await
            .expect("test database should connect");
        sqlx::query("TRUNCATE minecraft_account_links, accounts CASCADE")
            .execute(&pool)
            .await
            .expect("test database should reset account-link state");
        pool.close().await;

        let account_id = Uuid::new_v4();
        let state = BackendState::with_postgres(&database_url)
            .await
            .expect("state should connect to Postgres")
            .with_dev_sessions_allowed(false);
        state
            .persist_account_link_to_postgres(&MinecraftAccountLink {
                account_id,
                minecraft_uuid: account_id,
                minecraft_name: "DurableUser".to_owned(),
                linked_at: Utc::now(),
            })
            .await
            .expect("account link should persist");

        let matching_token = minecraft_session_token_with_expiry(
            account_id,
            account_id,
            "DurableUser",
            current_unix_seconds() + 900,
            state.session_secret.as_bytes(),
        );
        let matching_response = app(state.clone())
            .oneshot(
                Request::builder()
                    .uri("/sessions/current")
                    .header(header::AUTHORIZATION, format!("Bearer {matching_token}"))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(matching_response.status(), StatusCode::OK);

        let stale_name_token = minecraft_session_token_with_expiry(
            account_id,
            account_id,
            "OldName",
            current_unix_seconds() + 900,
            state.session_secret.as_bytes(),
        );
        let stale_name_response = app(state.clone())
            .oneshot(
                Request::builder()
                    .uri("/sessions/current")
                    .header(header::AUTHORIZATION, format!("Bearer {stale_name_token}"))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(stale_name_response.status(), StatusCode::UNAUTHORIZED);

        let stale_uuid_token = minecraft_session_token_with_expiry(
            account_id,
            Uuid::new_v4(),
            "DurableUser",
            current_unix_seconds() + 900,
            state.session_secret.as_bytes(),
        );
        let stale_uuid_response = app(state)
            .oneshot(
                Request::builder()
                    .uri("/sessions/current")
                    .header(header::AUTHORIZATION, format!("Bearer {stale_uuid_token}"))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(stale_uuid_response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    #[ignore = "requires TEST_DATABASE_URL pointing at a disposable Postgres database"]
    async fn live_postgres_friend_request_acceptance_persists_across_state_instances() {
        let database_url =
            std::env::var("TEST_DATABASE_URL").expect("TEST_DATABASE_URL must be set");
        apply_postgres_migrations(&database_url)
            .await
            .expect("migrations should apply");
        let pool = PgPool::connect(&database_url)
            .await
            .expect("test database should connect");
        sqlx::query("TRUNCATE friend_requests, friendships, accounts CASCADE")
            .execute(&pool)
            .await
            .expect("test database should reset friend graph state");
        pool.close().await;

        let requester = Uuid::new_v4();
        let target = Uuid::new_v4();
        let request_state = BackendState::with_postgres(&database_url)
            .await
            .expect("state should connect to Postgres");
        let response = app(request_state.clone())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/friends/{requester}/requests"))
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(header::AUTHORIZATION, dev_session(requester))
                    .body(Body::from(
                        serde_json::json!({ "targetAccountId": target }).to_string(),
                    ))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::OK);
        drop(request_state);

        let accept_state = BackendState::with_postgres(&database_url)
            .await
            .expect("state should reload pending friend request");
        let response = app(accept_state.clone())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/friends/{target}/requests/{requester}/accept"))
                    .header(header::AUTHORIZATION, dev_session(target))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::OK);
        drop(accept_state);

        let reloaded_state = BackendState::with_postgres(&database_url)
            .await
            .expect("state should reload accepted friendship");
        let response = app(reloaded_state)
            .oneshot(
                Request::builder()
                    .uri(format!("/friends/{requester}"))
                    .header(header::AUTHORIZATION, dev_session(requester))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::OK);
        let friends = read_json::<Vec<FriendSummary>>(response).await;
        assert_eq!(friends.len(), 1);
        assert_eq!(friends[0].account_id, target);
        assert_eq!(friends[0].status, FriendStatus::Friends);
    }

    #[tokio::test]
    #[ignore = "requires TEST_DATABASE_URL pointing at a disposable Postgres database"]
    async fn live_postgres_blocks_and_mutes_persist_across_state_instances() {
        let database_url =
            std::env::var("TEST_DATABASE_URL").expect("TEST_DATABASE_URL must be set");
        apply_postgres_migrations(&database_url)
            .await
            .expect("migrations should apply");
        let pool = PgPool::connect(&database_url)
            .await
            .expect("test database should connect");
        sqlx::query(
            "TRUNCATE account_blocks, account_mutes, friend_requests, friendships, accounts CASCADE",
        )
        .execute(&pool)
        .await
        .expect("test database should reset relationship filters");
        pool.close().await;

        let account_id = Uuid::new_v4();
        let muted = Uuid::new_v4();
        let blocked = Uuid::new_v4();
        let state = BackendState::with_postgres(&database_url)
            .await
            .expect("state should connect to Postgres");
        let response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/mutes/{account_id}"))
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::from(
                        serde_json::json!({ "targetAccountId": muted }).to_string(),
                    ))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::OK);
        drop(state);

        let reloaded_state = BackendState::with_postgres(&database_url)
            .await
            .expect("state should reload muted account");
        let response = app(reloaded_state.clone())
            .oneshot(
                Request::builder()
                    .uri(format!("/mutes/{account_id}"))
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::OK);
        let muted_accounts = read_json::<Vec<MutedAccountSummary>>(response).await;
        assert_eq!(muted_accounts.len(), 1);
        assert_eq!(muted_accounts[0].account_id, muted);

        let response = app(reloaded_state.clone())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/blocks/{account_id}"))
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::from(
                        serde_json::json!({ "targetAccountId": muted }).to_string(),
                    ))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::OK);
        let response = app(reloaded_state)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/blocks/{account_id}"))
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::from(
                        serde_json::json!({ "targetAccountId": blocked }).to_string(),
                    ))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::OK);

        let final_state = BackendState::with_postgres(&database_url)
            .await
            .expect("state should reload blocked accounts");
        let response = app(final_state.clone())
            .oneshot(
                Request::builder()
                    .uri(format!("/blocks/{account_id}"))
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::OK);
        let blocked_accounts = read_json::<Vec<BlockedAccountSummary>>(response).await;
        assert_eq!(blocked_accounts.len(), 2);
        assert!(blocked_accounts
            .iter()
            .any(|summary| summary.account_id == muted));
        assert!(blocked_accounts
            .iter()
            .any(|summary| summary.account_id == blocked));

        let response = app(final_state)
            .oneshot(
                Request::builder()
                    .uri(format!("/mutes/{account_id}"))
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::OK);
        let muted_accounts = read_json::<Vec<MutedAccountSummary>>(response).await;
        assert!(muted_accounts.is_empty());
    }

    #[test]
    fn offline_presence_has_no_pack_or_server() {
        let update = PresenceUpdate::offline(Uuid::new_v4());

        assert_eq!(update.state, PresenceState::Idle);
        assert!(update.pack_id.is_none());
        assert!(update.server_id.is_none());
    }

    #[test]
    fn presence_payload_validation_rejects_contradictory_state() {
        let account_id = Uuid::new_v4();
        let idle_with_pack = PresencePayload {
            state: PresenceState::Idle,
            pack_id: Some("winterpack".to_owned()),
            server_id: None,
        };
        let playing_with_server_only = PresencePayload {
            state: PresenceState::Playing,
            pack_id: None,
            server_id: Some("the-cabin".to_owned()),
        };

        assert!(presence_update_from_payload(account_id, idle_with_pack).is_err());
        assert!(presence_update_from_payload(account_id, playing_with_server_only).is_err());
    }

    #[test]
    fn minecraft_account_link_validation_rejects_invalid_names() {
        let account_id = Uuid::new_v4();
        let minecraft_uuid = Uuid::new_v4();

        for minecraft_name in ["", "name with spaces", "this_name_is_way_too_long"] {
            let payload = MinecraftAccountLinkPayload {
                minecraft_uuid,
                minecraft_name: minecraft_name.to_owned(),
            };

            assert!(minecraft_account_link_from_payload(account_id, payload).is_err());
        }
    }

    #[test]
    fn minecraft_account_link_validation_rejects_nil_identities() {
        let payload = MinecraftAccountLinkPayload {
            minecraft_uuid: Uuid::nil(),
            minecraft_name: "Builder_01".to_owned(),
        };

        assert!(minecraft_account_link_from_payload(Uuid::new_v4(), payload).is_err());

        let payload = MinecraftAccountLinkPayload {
            minecraft_uuid: Uuid::new_v4(),
            minecraft_name: "Builder_01".to_owned(),
        };

        assert!(minecraft_account_link_from_payload(Uuid::nil(), payload).is_err());
    }

    #[tokio::test]
    async fn health_endpoint_reports_ready() {
        let response = app(BackendState::default())
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn packs_endpoint_returns_curated_metadata() {
        let response = app(BackendState::default())
            .oneshot(
                Request::builder()
                    .uri("/packs")
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let packs = read_json::<Vec<PackSummary>>(response).await;
        assert_eq!(packs.len(), 1);
        assert_eq!(packs[0].id, "winterpack");
        assert_eq!(packs[0].status, PackStatus::NotInstalled);
        assert_eq!(packs[0].default_server.as_deref(), Some("The Cabin"));
    }

    #[tokio::test]
    async fn pack_detail_endpoint_returns_single_pack() {
        let response = app(BackendState::default())
            .oneshot(
                Request::builder()
                    .uri("/packs/winterpack")
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let pack = read_json::<PackSummary>(response).await;
        assert_eq!(pack.id, "winterpack");
        assert_eq!(pack.name, "WinterPack");
        assert_eq!(pack.status, PackStatus::NotInstalled);
    }

    #[tokio::test]
    async fn pack_detail_endpoint_returns_not_found_for_unknown_pack() {
        let response = app(BackendState::default())
            .oneshot(
                Request::builder()
                    .uri("/packs/missing")
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn local_cors_preflight_allows_tauri_dev_origin() {
        let response = app(BackendState::default())
            .oneshot(
                Request::builder()
                    .method(Method::OPTIONS)
                    .uri("/accounts/search?minecraftName=dy")
                    .header(header::ORIGIN, "http://localhost:1420")
                    .header(header::ACCESS_CONTROL_REQUEST_METHOD, "GET")
                    .header(header::ACCESS_CONTROL_REQUEST_HEADERS, "authorization")
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(header::ACCESS_CONTROL_ALLOW_ORIGIN),
            Some(&HeaderValue::from_static("http://localhost:1420"))
        );
        let allowed_headers = response
            .headers()
            .get(header::ACCESS_CONTROL_ALLOW_HEADERS)
            .expect("allowed headers should be present")
            .to_str()
            .expect("allowed headers should be valid");
        assert!(allowed_headers.contains("authorization"));
    }

    #[tokio::test]
    async fn configured_cors_preflight_allows_only_configured_hosted_origin() {
        let response = app_with_cors_origins(
            BackendState::default(),
            vec![
                "https://launcher.dylan.lol".to_owned(),
                "tauri://localhost".to_owned(),
                "http://tauri.localhost".to_owned(),
                "https://tauri.localhost".to_owned(),
            ],
        )
        .oneshot(
            Request::builder()
                .method(Method::OPTIONS)
                .uri("/sessions/current")
                .header(header::ORIGIN, "https://launcher.dylan.lol")
                .header(header::ACCESS_CONTROL_REQUEST_METHOD, "GET")
                .header(header::ACCESS_CONTROL_REQUEST_HEADERS, "authorization")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(header::ACCESS_CONTROL_ALLOW_ORIGIN),
            Some(&HeaderValue::from_static("https://launcher.dylan.lol"))
        );

        let tauri_response = app_with_cors_origins(
            BackendState::default(),
            vec![
                "https://launcher.dylan.lol".to_owned(),
                "tauri://localhost".to_owned(),
                "http://tauri.localhost".to_owned(),
                "https://tauri.localhost".to_owned(),
            ],
        )
        .oneshot(
            Request::builder()
                .method(Method::OPTIONS)
                .uri("/sessions/current")
                .header(header::ORIGIN, "tauri://localhost")
                .header(header::ACCESS_CONTROL_REQUEST_METHOD, "GET")
                .header(header::ACCESS_CONTROL_REQUEST_HEADERS, "authorization")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

        assert_eq!(tauri_response.status(), StatusCode::OK);
        assert_eq!(
            tauri_response
                .headers()
                .get(header::ACCESS_CONTROL_ALLOW_ORIGIN),
            Some(&HeaderValue::from_static("tauri://localhost"))
        );

        let rejected = app_with_cors_origins(
            BackendState::default(),
            vec![
                "https://launcher.dylan.lol".to_owned(),
                "tauri://localhost".to_owned(),
                "http://tauri.localhost".to_owned(),
                "https://tauri.localhost".to_owned(),
            ],
        )
        .oneshot(
            Request::builder()
                .method(Method::OPTIONS)
                .uri("/sessions/current")
                .header(header::ORIGIN, "https://evil.example")
                .header(header::ACCESS_CONTROL_REQUEST_METHOD, "GET")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

        assert_eq!(rejected.status(), StatusCode::OK);
        assert_eq!(
            rejected.headers().get(header::ACCESS_CONTROL_ALLOW_ORIGIN),
            None
        );
    }

    #[tokio::test]
    async fn dev_session_endpoint_issues_authorization_header_for_guarded_routes() {
        let account_id = Uuid::new_v4();
        let minecraft_uuid = Uuid::new_v4();
        let state = BackendState::default();
        let session_payload = serde_json::json!({ "accountId": account_id });

        let response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/dev/sessions")
                    .header("content-type", "application/json")
                    .body(Body::from(session_payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let session = read_json::<DevSessionResponse>(response).await;
        assert_eq!(session.account_id, account_id);
        assert_eq!(session.token_type, "Bearer");
        assert_eq!(session.session_kind, SessionKind::Dev);
        assert_eq!(session.minecraft_uuid, None);
        assert_eq!(session.minecraft_name, None);
        assert_eq!(
            parse_authorization_token(&session.access_token, state.session_secret.as_bytes())
                .expect("token should parse")
                .account_id,
            account_id
        );
        assert_eq!(
            session.authorization_header,
            format!("Bearer {}", session.access_token)
        );
        assert!(session.expires_at_unix_seconds > session.issued_at_unix_seconds);
        assert_eq!(
            session.expires_at_unix_seconds - session.issued_at_unix_seconds,
            DEV_SESSION_TTL_SECONDS
        );

        let link_payload = serde_json::json!({
            "minecraftUuid": minecraft_uuid,
            "minecraftName": "SessionUser"
        });
        let response = app(state)
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri(format!("/accounts/{account_id}/minecraft"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, session.authorization_header)
                    .body(Body::from(link_payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let link = read_json::<MinecraftAccountLink>(response).await;
        assert_eq!(link.account_id, account_id);
        assert_eq!(link.minecraft_uuid, minecraft_uuid);
        assert_eq!(link.minecraft_name, "SessionUser");
    }

    #[tokio::test]
    async fn dev_session_endpoint_rejects_nil_account_id() {
        let session_payload = serde_json::json!({ "accountId": Uuid::nil() });

        let response = app(BackendState::default())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/dev/sessions")
                    .header("content-type", "application/json")
                    .body(Body::from(session_payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn dev_session_endpoint_can_be_disabled_for_hosted_mode() {
        let account_id = Uuid::new_v4();
        let session_payload = serde_json::json!({ "accountId": account_id });
        let state = BackendState::default().with_dev_sessions_allowed(false);

        let response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/dev/sessions")
                    .header("content-type", "application/json")
                    .body(Body::from(session_payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::FORBIDDEN);

        let dev_bearer = format!(
            "Bearer {}",
            dev_session_token_with_expiry(
                account_id,
                current_unix_seconds() + 900,
                state.session_secret.as_bytes(),
            )
        );
        let response = app(state)
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/sessions/current")
                    .header(header::AUTHORIZATION, dev_bearer)
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn current_session_endpoint_reports_cached_bearer_identity() {
        let account_id = Uuid::new_v4();
        let state = BackendState::default();
        let session_payload = serde_json::json!({ "accountId": account_id });

        let response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/dev/sessions")
                    .header("content-type", "application/json")
                    .body(Body::from(session_payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::OK);
        let session = read_json::<DevSessionResponse>(response).await;

        let response = app(state)
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/sessions/current")
                    .header(header::AUTHORIZATION, session.authorization_header)
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let current = read_json::<CurrentSessionResponse>(response).await;
        assert_eq!(current.account_id, account_id);
        assert_eq!(current.token_type, "Bearer");
        assert_eq!(current.session_kind, SessionKind::Dev);
        assert_eq!(current.minecraft_uuid, None);
        assert_eq!(current.minecraft_name, None);
        assert_eq!(
            current.expires_at_unix_seconds,
            session.expires_at_unix_seconds
        );
        assert!(current.seconds_remaining > 0);
    }

    #[tokio::test]
    async fn hosted_mode_accepts_minecraft_sessions_but_rejects_dev_bearers() {
        let account_id = Uuid::new_v4();
        let minecraft_name = "HostedUser";
        let state = BackendState::default().with_dev_sessions_allowed(false);
        let dev_token = dev_session_token_with_expiry(
            account_id,
            current_unix_seconds() + 900,
            state.session_secret.as_bytes(),
        );
        let minecraft_token = minecraft_session_token_with_expiry(
            account_id,
            account_id,
            minecraft_name,
            current_unix_seconds() + 900,
            state.session_secret.as_bytes(),
        );

        let dev_response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/sessions/current")
                    .header(header::AUTHORIZATION, format!("Bearer {dev_token}"))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(dev_response.status(), StatusCode::UNAUTHORIZED);

        let minecraft_response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/sessions/current")
                    .header(header::AUTHORIZATION, format!("Bearer {minecraft_token}"))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(minecraft_response.status(), StatusCode::OK);
        let current = read_json::<CurrentSessionResponse>(minecraft_response).await;
        assert_eq!(current.account_id, account_id);
        assert_eq!(current.session_kind, SessionKind::Minecraft);
        assert_eq!(current.minecraft_uuid, Some(account_id));
        assert_eq!(current.minecraft_name.as_deref(), Some(minecraft_name));

        let guarded_response = app(state)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/presence/{account_id}"))
                    .header(header::AUTHORIZATION, format!("Bearer {minecraft_token}"))
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        serde_json::json!({ "state": "online" }).to_string(),
                    ))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(guarded_response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn current_session_endpoint_accepts_case_insensitive_bearer_scheme() {
        let account_id = Uuid::new_v4();
        let state = BackendState::default();
        let token = dev_session_token_with_expiry(
            account_id,
            current_unix_seconds() + 900,
            state.session_secret.as_bytes(),
        );

        let response = app(state)
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/sessions/current")
                    .header(header::AUTHORIZATION, format!("bearer   {token}"))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let current = read_json::<CurrentSessionResponse>(response).await;
        assert_eq!(current.account_id, account_id);
        assert_eq!(current.session_kind, SessionKind::Dev);
    }

    #[tokio::test]
    async fn current_session_endpoint_rejects_missing_or_expired_bearer() {
        let account_id = Uuid::new_v4();
        let state = BackendState::default();

        let missing = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/sessions/current")
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(missing.status(), StatusCode::UNAUTHORIZED);

        let expired = format!(
            "Bearer {}",
            dev_session_token_with_expiry(
                account_id,
                current_unix_seconds() - 1,
                state.session_secret.as_bytes()
            )
        );
        let expired = app(state)
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/sessions/current")
                    .header(header::AUTHORIZATION, expired)
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(expired.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn current_session_endpoint_rejects_malformed_bearer_headers() {
        let account_id = Uuid::new_v4();
        let state = BackendState::default();
        let token = dev_session_token_with_expiry(
            account_id,
            current_unix_seconds() + 900,
            state.session_secret.as_bytes(),
        );
        let cases = [
            token.clone(),
            format!("Basic {token}"),
            "Bearer".to_owned(),
            format!("Bearer {token} extra"),
        ];

        for authorization in cases {
            let response = app(state.clone())
                .oneshot(
                    Request::builder()
                        .method("GET")
                        .uri("/sessions/current")
                        .header(header::AUTHORIZATION, authorization)
                        .body(Body::empty())
                        .expect("request should build"),
                )
                .await
                .expect("router should respond");

            assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        }
    }

    #[tokio::test]
    async fn current_session_endpoint_allows_legacy_minecraft_sessions_only_when_enabled() {
        let account_id = Uuid::new_v4();
        let legacy_payload = format!("{account_id}:{}", current_unix_seconds() + 900);
        let legacy_signature =
            dev_session_signature(&legacy_payload, DEFAULT_DEV_SESSION_SECRET.as_bytes());
        let legacy_token =
            format!("{MINECRAFT_SESSION_TOKEN_PREFIX_V1}{legacy_payload}:{legacy_signature}");

        let local_response = app(BackendState::default())
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/sessions/current")
                    .header(header::AUTHORIZATION, format!("Bearer {legacy_token}"))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(local_response.status(), StatusCode::OK);
        let local_current = read_json::<CurrentSessionResponse>(local_response).await;
        assert_eq!(local_current.account_id, account_id);
        assert_eq!(local_current.session_kind, SessionKind::Minecraft);
        assert_eq!(local_current.minecraft_uuid, None);
        assert_eq!(local_current.minecraft_name, None);

        let hosted_response =
            app(BackendState::default().with_legacy_minecraft_sessions_allowed(false))
                .oneshot(
                    Request::builder()
                        .method("GET")
                        .uri("/sessions/current")
                        .header(header::AUTHORIZATION, format!("Bearer {legacy_token}"))
                        .body(Body::empty())
                        .expect("request should build"),
                )
                .await
                .expect("router should respond");

        assert_eq!(hosted_response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn minecraft_session_exchange_links_account_and_authorizes_guarded_routes() {
        let minecraft_uuid = Uuid::new_v4();
        let account_id = minecraft_uuid;
        let profile_url = spawn_minecraft_profile_server(
            StatusCode::OK,
            serde_json::json!({
                "id": minecraft_uuid.simple().to_string(),
                "name": "RealUser"
            }),
        )
        .await;
        let state = BackendState::default().with_minecraft_profile_url(profile_url);
        let expires_at = current_unix_seconds() + 900;
        let session_payload = serde_json::json!({
            "minecraftUuid": minecraft_uuid,
            "minecraftName": "RealUser",
            "accessToken": "minecraft-access-token",
            "expiresAtUnixSeconds": expires_at
        });

        let response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/sessions/minecraft")
                    .header("content-type", "application/json")
                    .body(Body::from(session_payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let session = read_json::<DevSessionResponse>(response).await;
        assert_eq!(session.account_id, account_id);
        assert_eq!(session.token_type, "Bearer");
        assert_eq!(session.session_kind, SessionKind::Minecraft);
        assert_eq!(session.minecraft_uuid, Some(minecraft_uuid));
        assert_eq!(session.minecraft_name.as_deref(), Some("RealUser"));
        assert!(session
            .access_token
            .starts_with(MINECRAFT_SESSION_TOKEN_PREFIX));
        assert!(session.expires_at_unix_seconds <= expires_at);
        let parsed =
            parse_authorization_token(&session.access_token, state.session_secret.as_bytes())
                .expect("token should parse");
        assert_eq!(parsed.account_id, account_id);
        assert_eq!(parsed.minecraft_uuid, Some(minecraft_uuid));
        assert_eq!(parsed.minecraft_name.as_deref(), Some("RealUser"));

        let response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/sessions/current")
                    .header(header::AUTHORIZATION, session.authorization_header.clone())
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::OK);
        let current = read_json::<CurrentSessionResponse>(response).await;
        assert_eq!(current.account_id, account_id);
        assert_eq!(current.session_kind, SessionKind::Minecraft);
        assert_eq!(current.minecraft_uuid, Some(minecraft_uuid));
        assert_eq!(current.minecraft_name.as_deref(), Some("RealUser"));
        assert_eq!(
            current.expires_at_unix_seconds,
            session.expires_at_unix_seconds
        );

        let response = app(state.clone())
            .oneshot(
                Request::builder()
                    .uri(format!("/accounts/{account_id}/minecraft"))
                    .header(header::AUTHORIZATION, session.authorization_header.clone())
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::OK);
        let link = read_json::<MinecraftAccountLink>(response).await;
        assert_eq!(link.account_id, account_id);
        assert_eq!(link.minecraft_uuid, minecraft_uuid);
        assert_eq!(link.minecraft_name, "RealUser");

        let presence_payload = serde_json::json!({
            "state": "playing",
            "packId": "winterpack"
        });
        let response = app(state)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/presence/{account_id}"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, session.authorization_header)
                    .body(Body::from(presence_payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[test]
    fn minecraft_session_response_caps_far_future_expiry_to_backend_ttl() {
        let account_id = Uuid::new_v4();
        let minecraft_uuid = Uuid::new_v4();
        let session = DevSessionResponse::new_minecraft(
            account_id,
            minecraft_uuid,
            "RealUser",
            Some(current_unix_seconds() + 365 * 24 * 60 * 60),
            DEFAULT_DEV_SESSION_SECRET.as_bytes(),
        );

        assert_eq!(session.account_id, account_id);
        assert_eq!(session.session_kind, SessionKind::Minecraft);
        assert_eq!(
            session.expires_at_unix_seconds - session.issued_at_unix_seconds,
            DEV_SESSION_TTL_SECONDS
        );
    }

    #[tokio::test]
    async fn minecraft_session_exchange_rejects_expired_or_conflicting_identity() {
        let first_account = Uuid::new_v4();
        let minecraft_uuid = Uuid::new_v4();
        let profile_url = spawn_minecraft_profile_server(
            StatusCode::OK,
            serde_json::json!({
                "id": minecraft_uuid.simple().to_string(),
                "name": "ClaimedUser"
            }),
        )
        .await;
        let state = BackendState::default().with_minecraft_profile_url(profile_url);
        state.account_links.write().await.insert(
            first_account,
            MinecraftAccountLink {
                account_id: first_account,
                minecraft_uuid,
                minecraft_name: "ClaimedUser".to_owned(),
                linked_at: Utc::now(),
            },
        );

        let expired_payload = serde_json::json!({
            "minecraftUuid": Uuid::new_v4(),
            "minecraftName": "ExpiredUser",
            "accessToken": "minecraft-access-token",
            "expiresAtUnixSeconds": current_unix_seconds() - 1
        });
        let response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/sessions/minecraft")
                    .header("content-type", "application/json")
                    .body(Body::from(expired_payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

        let conflicting_payload = serde_json::json!({
            "minecraftUuid": minecraft_uuid,
            "minecraftName": "ClaimedUser",
            "accessToken": "minecraft-access-token",
            "expiresAtUnixSeconds": current_unix_seconds() + 900
        });
        let response = app(state)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/sessions/minecraft")
                    .header("content-type", "application/json")
                    .body(Body::from(conflicting_payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::CONFLICT);
    }

    #[tokio::test]
    async fn minecraft_session_exchange_rejects_invalid_identity_before_profile_verification() {
        let payload = serde_json::json!({
            "minecraftUuid": Uuid::new_v4(),
            "minecraftName": "bad name",
            "accessToken": "minecraft-access-token",
            "expiresAtUnixSeconds": current_unix_seconds() + 900
        });
        let state =
            BackendState::default().with_minecraft_profile_url("http://127.0.0.1:9/profile");

        let response = app(state)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/sessions/minecraft")
                    .header("content-type", "application/json")
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn minecraft_session_exchange_rejects_mismatched_legacy_account_id() {
        let minecraft_uuid = Uuid::new_v4();
        let payload = serde_json::json!({
            "accountId": Uuid::new_v4(),
            "minecraftUuid": minecraft_uuid,
            "minecraftName": "GoodUser",
            "accessToken": "minecraft-access-token",
            "expiresAtUnixSeconds": current_unix_seconds() + 900
        });
        let state =
            BackendState::default().with_minecraft_profile_url("http://127.0.0.1:9/profile");

        let response = app(state)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/sessions/minecraft")
                    .header("content-type", "application/json")
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn minecraft_session_exchange_rejects_malformed_access_tokens_before_profile_verification(
    ) {
        let state =
            BackendState::default().with_minecraft_profile_url("http://127.0.0.1:9/profile");

        for access_token in ["", "token with spaces", "token\nnext"] {
            let payload = serde_json::json!({
                "minecraftUuid": Uuid::new_v4(),
                "minecraftName": "GoodUser",
                "accessToken": access_token,
                "expiresAtUnixSeconds": current_unix_seconds() + 900
            });

            let response = app(state.clone())
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/sessions/minecraft")
                        .header("content-type", "application/json")
                        .body(Body::from(payload.to_string()))
                        .expect("request should build"),
                )
                .await
                .expect("router should respond");

            assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        }
    }

    #[tokio::test]
    async fn minecraft_session_exchange_times_out_slow_profile_verification() {
        let minecraft_uuid = Uuid::new_v4();
        let profile_url = spawn_slow_minecraft_profile_server(
            Duration::from_millis(250),
            serde_json::json!({
                "id": minecraft_uuid.simple().to_string(),
                "name": "SlowUser"
            }),
        )
        .await;
        let state = BackendState::default()
            .with_minecraft_profile_url(profile_url)
            .with_minecraft_profile_timeout(Duration::from_millis(50));
        let payload = serde_json::json!({
            "minecraftUuid": minecraft_uuid,
            "minecraftName": "SlowUser",
            "accessToken": "minecraft-access-token",
            "expiresAtUnixSeconds": current_unix_seconds() + 900
        });

        let response = app(state)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/sessions/minecraft")
                    .header("content-type", "application/json")
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
    }

    #[tokio::test]
    async fn minecraft_session_exchange_rejects_profile_mismatch() {
        let payload_minecraft_uuid = Uuid::new_v4();
        let verified_minecraft_uuid = Uuid::new_v4();
        let profile_url = spawn_minecraft_profile_server(
            StatusCode::OK,
            serde_json::json!({
                "id": verified_minecraft_uuid.simple().to_string(),
                "name": "VerifiedUser"
            }),
        )
        .await;
        let state = BackendState::default().with_minecraft_profile_url(profile_url);
        let payload = serde_json::json!({
            "minecraftUuid": payload_minecraft_uuid,
            "minecraftName": "PayloadUser",
            "accessToken": "minecraft-access-token",
            "expiresAtUnixSeconds": current_unix_seconds() + 900
        });

        let response = app(state)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/sessions/minecraft")
                    .header("content-type", "application/json")
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }

    #[test]
    fn dev_session_tokens_include_and_parse_expiry() {
        let account_id = Uuid::new_v4();
        let state = BackendState::default();
        let token =
            dev_session_token_with_expiry(account_id, 12345, state.session_secret.as_bytes());

        let parsed = parse_authorization_token(&token, state.session_secret.as_bytes())
            .expect("token should parse");

        assert_eq!(parsed.account_id, account_id);
        assert_eq!(parsed.kind, SessionKind::Dev);
        assert_eq!(parsed.expires_at_unix_seconds, 12345);
        assert!(parse_authorization_token(
            &format!("{DEV_SESSION_TOKEN_PREFIX}{account_id}"),
            state.session_secret.as_bytes()
        )
        .is_err());
        assert!(
            parse_authorization_token("not-a-dev-session", state.session_secret.as_bytes())
                .is_err()
        );
    }

    #[test]
    fn dev_session_tokens_reject_forged_payloads_and_wrong_secret() {
        let account_id = Uuid::new_v4();
        let other_account_id = Uuid::new_v4();
        let state = BackendState::default();
        let token =
            dev_session_token_with_expiry(account_id, 12345, state.session_secret.as_bytes());
        let forged = token.replace(&account_id.to_string(), &other_account_id.to_string());

        assert!(parse_authorization_token(&forged, state.session_secret.as_bytes()).is_err());
        assert!(parse_authorization_token(&token, b"wrong-secret").is_err());
    }

    #[test]
    fn minecraft_session_tokens_parse_as_minecraft_kind() {
        let account_id = Uuid::new_v4();
        let minecraft_uuid = Uuid::new_v4();
        let state = BackendState::default();
        let token = minecraft_session_token_with_expiry(
            account_id,
            minecraft_uuid,
            "TokenUser",
            12345,
            state.session_secret.as_bytes(),
        );

        let parsed = parse_authorization_token(&token, state.session_secret.as_bytes())
            .expect("token should parse");

        assert_eq!(parsed.account_id, account_id);
        assert_eq!(parsed.kind, SessionKind::Minecraft);
        assert_eq!(parsed.minecraft_uuid, Some(minecraft_uuid));
        assert_eq!(parsed.minecraft_name.as_deref(), Some("TokenUser"));
        assert_eq!(parsed.expires_at_unix_seconds, 12345);

        let legacy_payload = format!("{account_id}:23456");
        let legacy_signature =
            dev_session_signature(&legacy_payload, state.session_secret.as_bytes());
        let legacy_token =
            format!("{MINECRAFT_SESSION_TOKEN_PREFIX_V1}{legacy_payload}:{legacy_signature}");
        let legacy = parse_authorization_token(&legacy_token, state.session_secret.as_bytes())
            .expect("legacy v1 token should parse");
        assert_eq!(legacy.account_id, account_id);
        assert_eq!(legacy.kind, SessionKind::Minecraft);
        assert_eq!(legacy.minecraft_uuid, None);
        assert_eq!(legacy.minecraft_name, None);
        assert_eq!(legacy.expires_at_unix_seconds, 23456);
        assert!(parse_authorization_token_with_legacy_minecraft_sessions(
            &legacy_token,
            state.session_secret.as_bytes(),
            false
        )
        .is_err());
    }

    #[tokio::test]
    async fn minecraft_account_link_round_trips_by_account_id() {
        let account_id = Uuid::new_v4();
        let minecraft_uuid = Uuid::new_v4();
        let state = BackendState::default();
        let payload = serde_json::json!({
            "minecraftUuid": minecraft_uuid,
            "minecraftName": "Builder_01"
        });

        let response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri(format!("/accounts/{account_id}/minecraft"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), 1024 * 1024)
            .await
            .expect("body should read");
        let link: MinecraftAccountLink =
            serde_json::from_slice(&body).expect("link should deserialize");
        assert_eq!(link.account_id, account_id);
        assert_eq!(link.minecraft_uuid, minecraft_uuid);
        assert_eq!(link.minecraft_name, "Builder_01");

        let response = app(state)
            .oneshot(
                Request::builder()
                    .uri(format!("/accounts/{account_id}/minecraft"))
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), 1024 * 1024)
            .await
            .expect("body should read");
        let readback: MinecraftAccountLink =
            serde_json::from_slice(&body).expect("link should deserialize");
        assert_eq!(readback, link);
    }

    #[tokio::test]
    async fn minecraft_account_link_read_requires_session_owner() {
        let account_id = Uuid::new_v4();
        let other_account = Uuid::new_v4();
        let state = BackendState::default();
        state.account_links.write().await.insert(
            account_id,
            MinecraftAccountLink {
                account_id,
                minecraft_uuid: Uuid::new_v4(),
                minecraft_name: "BuilderOne".to_owned(),
                linked_at: Utc::now(),
            },
        );

        let missing_session = app(state.clone())
            .oneshot(
                Request::builder()
                    .uri(format!("/accounts/{account_id}/minecraft"))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(missing_session.status(), StatusCode::UNAUTHORIZED);

        let wrong_session = app(state)
            .oneshot(
                Request::builder()
                    .uri(format!("/accounts/{account_id}/minecraft"))
                    .header(header::AUTHORIZATION, dev_session(other_account))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(wrong_session.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn json_store_persists_social_state_across_restarts() {
        let root = tempfile::tempdir().expect("tempdir should be available");
        let state_path = root.path().join("social-state.json");
        let account_id = Uuid::new_v4();
        let friend_id = Uuid::new_v4();
        let blocked_id = Uuid::new_v4();
        let minecraft_uuid = Uuid::new_v4();
        let state = BackendState::with_json_store(&state_path)
            .await
            .expect("state store should initialize");

        let link_payload = serde_json::json!({
            "minecraftUuid": minecraft_uuid,
            "minecraftName": "Builder_01"
        });
        let response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri(format!("/accounts/{account_id}/minecraft"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::from(link_payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::OK);

        let friend_request_payload = serde_json::json!({ "targetAccountId": friend_id });
        let response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/friends/{account_id}/requests"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::from(friend_request_payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::OK);

        let response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/friends/{friend_id}/requests/{account_id}/accept"))
                    .header(header::AUTHORIZATION, dev_session(friend_id))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::OK);

        let mute_payload = serde_json::json!({ "targetAccountId": friend_id });
        let response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/mutes/{account_id}"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::from(mute_payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::OK);

        let block_payload = serde_json::json!({ "targetAccountId": blocked_id });
        let response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/blocks/{account_id}"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::from(block_payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::OK);

        let presence_payload = serde_json::json!({
            "state": "playing",
            "packId": "winterpack",
            "serverId": "The Cabin"
        });
        let response = app(state)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/presence/{account_id}"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::from(presence_payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::OK);
        assert!(state_path.is_file());

        let restored = BackendState::with_json_store(&state_path)
            .await
            .expect("state store should reload");

        let response = app(restored.clone())
            .oneshot(
                Request::builder()
                    .uri(format!("/accounts/{account_id}/minecraft"))
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::OK);
        let link = read_json::<MinecraftAccountLink>(response).await;
        assert_eq!(link.minecraft_name, "Builder_01");
        assert_eq!(link.minecraft_uuid, minecraft_uuid);

        let response = app(restored.clone())
            .oneshot(
                Request::builder()
                    .uri(format!("/friends/{account_id}"))
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        let friends = read_json::<Vec<FriendSummary>>(response).await;
        assert_eq!(friends.len(), 1);
        assert_eq!(friends[0].account_id, friend_id);
        assert_eq!(friends[0].status, FriendStatus::Friends);
        assert!(friends[0].muted);

        let response = app(restored.clone())
            .oneshot(
                Request::builder()
                    .uri(format!("/blocks/{account_id}"))
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        let blocked = read_json::<Vec<BlockedAccountSummary>>(response).await;
        assert_eq!(blocked[0].account_id, blocked_id);

        let response = app(restored)
            .oneshot(
                Request::builder()
                    .uri("/presence")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        let presence = read_json::<Vec<PresenceUpdate>>(response).await;
        assert_eq!(presence.len(), 1);
        assert_eq!(presence[0].account_id, account_id);
        assert_eq!(presence[0].state, PresenceState::Playing);
        assert_eq!(presence[0].pack_id.as_deref(), Some("winterpack"));
        assert_eq!(presence[0].server_id.as_deref(), Some("The Cabin"));
    }

    #[tokio::test]
    async fn minecraft_account_link_returns_not_found_when_missing() {
        let account_id = Uuid::new_v4();

        let response = app(BackendState::default())
            .oneshot(
                Request::builder()
                    .uri(format!("/accounts/{account_id}/minecraft"))
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn minecraft_account_link_endpoint_rejects_invalid_names() {
        let account_id = Uuid::new_v4();
        let payload = serde_json::json!({
            "minecraftUuid": Uuid::new_v4(),
            "minecraftName": "bad name"
        });

        let response = app(BackendState::default())
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri(format!("/accounts/{account_id}/minecraft"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn minecraft_account_link_requires_session_owner() {
        let account_id = Uuid::new_v4();
        let payload = serde_json::json!({
            "minecraftUuid": Uuid::new_v4(),
            "minecraftName": "BuilderOne"
        });

        let response = app(BackendState::default())
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri(format!("/accounts/{account_id}/minecraft"))
                    .header("content-type", "application/json")
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn minecraft_account_link_rejects_expired_dev_session() {
        let account_id = Uuid::new_v4();
        let state = BackendState::default();
        let payload = serde_json::json!({
            "minecraftUuid": Uuid::new_v4(),
            "minecraftName": "ExpiredUser"
        });

        let response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri(format!("/accounts/{account_id}/minecraft"))
                    .header("content-type", "application/json")
                    .header(
                        header::AUTHORIZATION,
                        format!(
                            "Bearer {}",
                            dev_session_token_with_expiry(
                                account_id,
                                current_unix_seconds() - 1,
                                state.session_secret.as_bytes()
                            )
                        ),
                    )
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn minecraft_account_link_rejects_session_for_different_account() {
        let account_id = Uuid::new_v4();
        let other_account = Uuid::new_v4();
        let payload = serde_json::json!({
            "minecraftUuid": Uuid::new_v4(),
            "minecraftName": "BuilderOne"
        });

        let response = app(BackendState::default())
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri(format!("/accounts/{account_id}/minecraft"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(other_account))
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn minecraft_account_link_requires_minecraft_session_claim_match() {
        let account_id = Uuid::new_v4();
        let minecraft_uuid = Uuid::new_v4();
        let state = BackendState::default();
        let token = minecraft_session_token_with_expiry(
            account_id,
            minecraft_uuid,
            "ClaimedUser",
            current_unix_seconds() + 900,
            state.session_secret.as_bytes(),
        );

        let mismatched_payload = serde_json::json!({
            "minecraftUuid": Uuid::new_v4(),
            "minecraftName": "OtherUser"
        });
        let response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri(format!("/accounts/{account_id}/minecraft"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, format!("Bearer {token}"))
                    .body(Body::from(mismatched_payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::FORBIDDEN);

        let matching_payload = serde_json::json!({
            "minecraftUuid": minecraft_uuid,
            "minecraftName": "claimeduser"
        });
        let response = app(state)
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri(format!("/accounts/{account_id}/minecraft"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, format!("Bearer {token}"))
                    .body(Body::from(matching_payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::OK);
        let link = read_json::<MinecraftAccountLink>(response).await;
        assert_eq!(link.account_id, account_id);
        assert_eq!(link.minecraft_uuid, minecraft_uuid);
        assert_eq!(link.minecraft_name, "claimeduser");
    }

    #[tokio::test]
    async fn minecraft_account_link_rejects_duplicate_minecraft_uuid() {
        let first_account = Uuid::new_v4();
        let second_account = Uuid::new_v4();
        let minecraft_uuid = Uuid::new_v4();
        let state = BackendState::default();
        state.account_links.write().await.insert(
            first_account,
            MinecraftAccountLink {
                account_id: first_account,
                minecraft_uuid,
                minecraft_name: "BuilderOne".to_owned(),
                linked_at: Utc::now(),
            },
        );
        let payload = serde_json::json!({
            "minecraftUuid": minecraft_uuid,
            "minecraftName": "BuilderTwo"
        });

        let response = app(state)
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri(format!("/accounts/{second_account}/minecraft"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(second_account))
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::CONFLICT);
    }

    #[tokio::test]
    async fn minecraft_account_link_rejects_duplicate_minecraft_name_case_insensitively() {
        let first_account = Uuid::new_v4();
        let second_account = Uuid::new_v4();
        let state = BackendState::default();
        state.account_links.write().await.insert(
            first_account,
            MinecraftAccountLink {
                account_id: first_account,
                minecraft_uuid: Uuid::new_v4(),
                minecraft_name: "BuilderOne".to_owned(),
                linked_at: Utc::now(),
            },
        );
        let payload = serde_json::json!({
            "minecraftUuid": Uuid::new_v4(),
            "minecraftName": "builderone"
        });

        let response = app(state)
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri(format!("/accounts/{second_account}/minecraft"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(second_account))
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::CONFLICT);
    }

    #[tokio::test]
    async fn minecraft_account_link_allows_same_account_to_refresh_link() {
        let account_id = Uuid::new_v4();
        let minecraft_uuid = Uuid::new_v4();
        let state = BackendState::default();
        state.account_links.write().await.insert(
            account_id,
            MinecraftAccountLink {
                account_id,
                minecraft_uuid,
                minecraft_name: "BuilderOne".to_owned(),
                linked_at: Utc::now(),
            },
        );
        let payload = serde_json::json!({
            "minecraftUuid": minecraft_uuid,
            "minecraftName": "BuilderOne"
        });

        let response = app(state)
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri(format!("/accounts/{account_id}/minecraft"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn account_search_matches_linked_minecraft_names() {
        let first_account = Uuid::new_v4();
        let second_account = Uuid::new_v4();
        let ignored_account = Uuid::new_v4();
        let state = BackendState::default();
        {
            let mut links = state.account_links.write().await;
            links.insert(
                first_account,
                MinecraftAccountLink {
                    account_id: first_account,
                    minecraft_uuid: Uuid::new_v4(),
                    minecraft_name: "BuilderOne".to_owned(),
                    linked_at: Utc::now(),
                },
            );
            links.insert(
                second_account,
                MinecraftAccountLink {
                    account_id: second_account,
                    minecraft_uuid: Uuid::new_v4(),
                    minecraft_name: "BuilderTwo".to_owned(),
                    linked_at: Utc::now(),
                },
            );
            links.insert(
                ignored_account,
                MinecraftAccountLink {
                    account_id: ignored_account,
                    minecraft_uuid: Uuid::new_v4(),
                    minecraft_name: "Miner".to_owned(),
                    linked_at: Utc::now(),
                },
            );
        }

        let response = app(state)
            .oneshot(
                Request::builder()
                    .uri("/accounts/search?minecraftName=builder")
                    .header(header::AUTHORIZATION, dev_session(first_account))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let results = read_json::<Vec<AccountSearchResult>>(response).await;
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].minecraft_name, "BuilderOne");
        assert_eq!(results[1].minecraft_name, "BuilderTwo");
    }

    #[tokio::test]
    async fn account_search_requires_session() {
        let response = app(BackendState::default())
            .oneshot(
                Request::builder()
                    .uri("/accounts/search?minecraftName=builder")
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn account_search_rejects_short_queries() {
        let account_id = Uuid::new_v4();
        let response = app(BackendState::default())
            .oneshot(
                Request::builder()
                    .uri("/accounts/search?minecraftName=a")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn account_search_limits_results() {
        let state = BackendState::default();
        {
            let mut links = state.account_links.write().await;
            for index in 0..25 {
                let account_id = Uuid::new_v4();
                links.insert(
                    account_id,
                    MinecraftAccountLink {
                        account_id,
                        minecraft_uuid: Uuid::new_v4(),
                        minecraft_name: format!("Builder{index:02}"),
                        linked_at: Utc::now(),
                    },
                );
            }
        }

        let response = app(state)
            .oneshot(
                Request::builder()
                    .uri("/accounts/search?minecraftName=Builder")
                    .header(header::AUTHORIZATION, dev_session(Uuid::new_v4()))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let results = read_json::<Vec<AccountSearchResult>>(response).await;
        assert_eq!(results.len(), 20);
        assert_eq!(results[0].minecraft_name, "Builder00");
        assert_eq!(results[19].minecraft_name, "Builder19");
    }

    #[tokio::test]
    async fn friend_request_lists_pending_for_both_accounts() {
        let requester = Uuid::new_v4();
        let target = Uuid::new_v4();
        let state = BackendState::default();
        let payload = serde_json::json!({ "targetAccountId": target });

        let response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/friends/{requester}/requests"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(requester))
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let summary = read_json::<FriendSummary>(response).await;
        assert_eq!(summary.account_id, target);
        assert_eq!(summary.status, FriendStatus::PendingOutbound);

        let requester_response = app(state.clone())
            .oneshot(
                Request::builder()
                    .uri(format!("/friends/{requester}"))
                    .header(header::AUTHORIZATION, dev_session(requester))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        let requester_friends = read_json::<Vec<FriendSummary>>(requester_response).await;
        assert_eq!(requester_friends[0].status, FriendStatus::PendingOutbound);

        let target_response = app(state)
            .oneshot(
                Request::builder()
                    .uri(format!("/friends/{target}"))
                    .header(header::AUTHORIZATION, dev_session(target))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        let target_friends = read_json::<Vec<FriendSummary>>(target_response).await;
        assert_eq!(target_friends[0].account_id, requester);
        assert_eq!(target_friends[0].status, FriendStatus::PendingInbound);
    }

    #[tokio::test]
    async fn friend_request_acceptance_creates_friendship() {
        let requester = Uuid::new_v4();
        let target = Uuid::new_v4();
        let state = BackendState::default();
        state
            .friend_requests
            .write()
            .await
            .insert((requester, target));

        let response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/friends/{target}/requests/{requester}/accept"))
                    .header(header::AUTHORIZATION, dev_session(target))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let summary = read_json::<FriendSummary>(response).await;
        assert_eq!(summary.account_id, requester);
        assert_eq!(summary.status, FriendStatus::Friends);

        let response = app(state)
            .oneshot(
                Request::builder()
                    .uri(format!("/friends/{requester}"))
                    .header(header::AUTHORIZATION, dev_session(requester))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        let friends = read_json::<Vec<FriendSummary>>(response).await;
        assert_eq!(friends[0].account_id, target);
        assert_eq!(friends[0].status, FriendStatus::Friends);
    }

    #[tokio::test]
    async fn friend_list_requires_session_owner() {
        let account_id = Uuid::new_v4();
        let friend = Uuid::new_v4();
        let other_account = Uuid::new_v4();
        let state = BackendState::default();
        state
            .friendships
            .write()
            .await
            .insert(friendship_pair(account_id, friend));

        let missing_session = app(state.clone())
            .oneshot(
                Request::builder()
                    .uri(format!("/friends/{account_id}"))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(missing_session.status(), StatusCode::UNAUTHORIZED);

        let wrong_session = app(state)
            .oneshot(
                Request::builder()
                    .uri(format!("/friends/{account_id}"))
                    .header(header::AUTHORIZATION, dev_session(other_account))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(wrong_session.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn postgres_relationship_reads_fail_closed_on_refresh_error() {
        let account_id = Uuid::new_v4();
        let friend = Uuid::new_v4();
        let blocked = Uuid::new_v4();
        let pool = sqlx::postgres::PgPoolOptions::new()
            .acquire_timeout(std::time::Duration::from_millis(50))
            .connect_lazy("postgres://theboyslauncher:theboyslauncher@127.0.0.1:9/theboyslauncher")
            .expect("lazy pool should build");
        let mut state = BackendState::default();
        state.postgres_pool = Some(Arc::new(pool));
        state
            .friendships
            .write()
            .await
            .insert(friendship_pair(account_id, friend));
        state
            .blocked_accounts
            .write()
            .await
            .insert((account_id, blocked));

        let friends = app(state.clone())
            .oneshot(
                Request::builder()
                    .uri(format!("/friends/{account_id}"))
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(friends.status(), StatusCode::INTERNAL_SERVER_ERROR);

        let blocked_accounts = app(state)
            .oneshot(
                Request::builder()
                    .uri(format!("/blocks/{account_id}"))
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(blocked_accounts.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[tokio::test]
    async fn postgres_friend_request_does_not_mutate_memory_on_refresh_error() {
        let account_id = Uuid::new_v4();
        let target_account_id = Uuid::new_v4();
        let pool = sqlx::postgres::PgPoolOptions::new()
            .acquire_timeout(std::time::Duration::from_millis(50))
            .connect_lazy("postgres://theboyslauncher:theboyslauncher@127.0.0.1:9/theboyslauncher")
            .expect("lazy pool should build");
        let mut state = BackendState::default();
        state.postgres_pool = Some(Arc::new(pool));
        let state_after_request = state.clone();
        let payload = serde_json::json!({ "targetAccountId": target_account_id });

        let response = app(state)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/friends/{account_id}/requests"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
        assert!(
            state_after_request.friend_requests.read().await.is_empty(),
            "failed Postgres refresh must not leave stale in-memory friend requests"
        );
        assert!(
            state_after_request.friendships.read().await.is_empty(),
            "failed Postgres refresh must not leave stale in-memory friendships"
        );
    }

    #[tokio::test]
    async fn reverse_friend_request_auto_accepts() {
        let requester = Uuid::new_v4();
        let target = Uuid::new_v4();
        let state = BackendState::default();
        state
            .friend_requests
            .write()
            .await
            .insert((target, requester));
        let payload = serde_json::json!({ "targetAccountId": target });

        let response = app(state)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/friends/{requester}/requests"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(requester))
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let summary = read_json::<FriendSummary>(response).await;
        assert_eq!(summary.account_id, target);
        assert_eq!(summary.status, FriendStatus::Friends);
    }

    #[tokio::test]
    async fn friend_request_rejects_self_target() {
        let account_id = Uuid::new_v4();
        let payload = serde_json::json!({ "targetAccountId": account_id });

        let response = app(BackendState::default())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/friends/{account_id}/requests"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn friend_request_requires_session_owner() {
        let requester = Uuid::new_v4();
        let target = Uuid::new_v4();
        let payload = serde_json::json!({ "targetAccountId": target });

        let response = app(BackendState::default())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/friends/{requester}/requests"))
                    .header("content-type", "application/json")
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn friend_request_rejects_session_for_different_account() {
        let requester = Uuid::new_v4();
        let target = Uuid::new_v4();
        let other_account = Uuid::new_v4();
        let payload = serde_json::json!({ "targetAccountId": target });

        let response = app(BackendState::default())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/friends/{requester}/requests"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(other_account))
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn friend_request_acceptance_rejects_missing_request() {
        let requester = Uuid::new_v4();
        let target = Uuid::new_v4();

        let response = app(BackendState::default())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/friends/{target}/requests/{requester}/accept"))
                    .header(header::AUTHORIZATION, dev_session(target))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn block_account_lists_blocked_accounts() {
        let account_id = Uuid::new_v4();
        let blocked = Uuid::new_v4();
        let payload = serde_json::json!({ "targetAccountId": blocked });
        let state = BackendState::default();

        let response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/blocks/{account_id}"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let summary = read_json::<BlockedAccountSummary>(response).await;
        assert_eq!(summary.account_id, blocked);

        let response = app(state)
            .oneshot(
                Request::builder()
                    .uri(format!("/blocks/{account_id}"))
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        let blocked_accounts = read_json::<Vec<BlockedAccountSummary>>(response).await;
        assert_eq!(blocked_accounts[0].account_id, blocked);
    }

    #[tokio::test]
    async fn block_list_requires_session_owner() {
        let account_id = Uuid::new_v4();
        let blocked = Uuid::new_v4();
        let other_account = Uuid::new_v4();
        let state = BackendState::default();
        state
            .blocked_accounts
            .write()
            .await
            .insert((account_id, blocked));

        let missing_session = app(state.clone())
            .oneshot(
                Request::builder()
                    .uri(format!("/blocks/{account_id}"))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(missing_session.status(), StatusCode::UNAUTHORIZED);

        let wrong_session = app(state)
            .oneshot(
                Request::builder()
                    .uri(format!("/blocks/{account_id}"))
                    .header(header::AUTHORIZATION, dev_session(other_account))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(wrong_session.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn block_account_removes_friendship_and_pending_requests() {
        let account_id = Uuid::new_v4();
        let blocked = Uuid::new_v4();
        let state = BackendState::default();
        state
            .friendships
            .write()
            .await
            .insert(friendship_pair(account_id, blocked));
        state
            .friend_requests
            .write()
            .await
            .insert((blocked, account_id));
        let payload = serde_json::json!({ "targetAccountId": blocked });

        let response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/blocks/{account_id}"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::OK);

        let response = app(state)
            .oneshot(
                Request::builder()
                    .uri(format!("/friends/{account_id}"))
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        let friends = read_json::<Vec<FriendSummary>>(response).await;
        assert!(friends.is_empty());
    }

    #[tokio::test]
    async fn mute_account_lists_muted_accounts() {
        let account_id = Uuid::new_v4();
        let muted = Uuid::new_v4();
        let payload = serde_json::json!({ "targetAccountId": muted });
        let state = BackendState::default();

        let response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/mutes/{account_id}"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let summary = read_json::<MutedAccountSummary>(response).await;
        assert_eq!(summary.account_id, muted);

        let response = app(state)
            .oneshot(
                Request::builder()
                    .uri(format!("/mutes/{account_id}"))
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        let muted_accounts = read_json::<Vec<MutedAccountSummary>>(response).await;
        assert_eq!(muted_accounts[0].account_id, muted);
    }

    #[tokio::test]
    async fn mute_list_requires_session_owner() {
        let account_id = Uuid::new_v4();
        let muted = Uuid::new_v4();
        let other_account = Uuid::new_v4();
        let state = BackendState::default();
        state
            .muted_accounts
            .write()
            .await
            .insert((account_id, muted));

        let missing_session = app(state.clone())
            .oneshot(
                Request::builder()
                    .uri(format!("/mutes/{account_id}"))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(missing_session.status(), StatusCode::UNAUTHORIZED);

        let wrong_session = app(state)
            .oneshot(
                Request::builder()
                    .uri(format!("/mutes/{account_id}"))
                    .header(header::AUTHORIZATION, dev_session(other_account))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(wrong_session.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn friend_summary_marks_muted_friends() {
        let account_id = Uuid::new_v4();
        let friend = Uuid::new_v4();
        let state = BackendState::default();
        state
            .friendships
            .write()
            .await
            .insert(friendship_pair(account_id, friend));
        state
            .muted_accounts
            .write()
            .await
            .insert((account_id, friend));

        let response = app(state)
            .oneshot(
                Request::builder()
                    .uri(format!("/friends/{account_id}"))
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        let friends = read_json::<Vec<FriendSummary>>(response).await;

        assert_eq!(friends[0].account_id, friend);
        assert_eq!(friends[0].status, FriendStatus::Friends);
        assert!(friends[0].muted);
    }

    #[tokio::test]
    async fn mute_account_rejects_self_target() {
        let account_id = Uuid::new_v4();
        let payload = serde_json::json!({ "targetAccountId": account_id });

        let response = app(BackendState::default())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/mutes/{account_id}"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn unmute_account_clears_muted_account() {
        let account_id = Uuid::new_v4();
        let muted = Uuid::new_v4();
        let state = BackendState::default();
        state
            .muted_accounts
            .write()
            .await
            .insert((account_id, muted));

        let response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(format!("/mutes/{account_id}/{muted}"))
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::NO_CONTENT);

        let response = app(state)
            .oneshot(
                Request::builder()
                    .uri(format!("/mutes/{account_id}"))
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        let muted_accounts = read_json::<Vec<MutedAccountSummary>>(response).await;
        assert!(muted_accounts.is_empty());
    }

    #[tokio::test]
    async fn block_account_removes_mutes() {
        let account_id = Uuid::new_v4();
        let blocked = Uuid::new_v4();
        let state = BackendState::default();
        state
            .muted_accounts
            .write()
            .await
            .insert((account_id, blocked));
        let payload = serde_json::json!({ "targetAccountId": blocked });

        let response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/blocks/{account_id}"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::OK);

        let response = app(state)
            .oneshot(
                Request::builder()
                    .uri(format!("/mutes/{account_id}"))
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        let muted_accounts = read_json::<Vec<MutedAccountSummary>>(response).await;
        assert!(muted_accounts.is_empty());
    }

    #[tokio::test]
    async fn friend_request_rejects_blocked_relationships() {
        let requester = Uuid::new_v4();
        let target = Uuid::new_v4();
        let state = BackendState::default();
        state
            .blocked_accounts
            .write()
            .await
            .insert((target, requester));
        let payload = serde_json::json!({ "targetAccountId": target });

        let response = app(state)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/friends/{requester}/requests"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(requester))
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn unblock_account_allows_future_friend_requests() {
        let requester = Uuid::new_v4();
        let target = Uuid::new_v4();
        let state = BackendState::default();
        state
            .blocked_accounts
            .write()
            .await
            .insert((target, requester));

        let response = app(state.clone())
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(format!("/blocks/{target}/{requester}"))
                    .header(header::AUTHORIZATION, dev_session(target))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::NO_CONTENT);

        let payload = serde_json::json!({ "targetAccountId": target });
        let response = app(state)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/friends/{requester}/requests"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(requester))
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn list_presence_returns_sorted_snapshot() {
        let first = Uuid::nil();
        let second = Uuid::max();
        let state = BackendState::default();
        {
            let mut presence = state.presence.write().await;
            presence.insert(second, PresenceUpdate::offline(second));
            presence.insert(first, PresenceUpdate::offline(first));
        }

        let response = app(state)
            .oneshot(
                Request::builder()
                    .uri("/presence")
                    .header(header::AUTHORIZATION, dev_session(Uuid::new_v4()))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), 1024 * 1024)
            .await
            .expect("body should read");
        let snapshot: Vec<PresenceUpdate> =
            serde_json::from_slice(&body).expect("snapshot should deserialize");
        assert_eq!(snapshot[0].account_id, first);
        assert_eq!(snapshot[1].account_id, second);
    }

    #[tokio::test]
    async fn list_presence_requires_session() {
        let response = app(BackendState::default())
            .oneshot(
                Request::builder()
                    .uri("/presence")
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn postgres_presence_reads_fail_closed_on_refresh_error() {
        let account_id = Uuid::new_v4();
        let stale_account_id = Uuid::new_v4();
        let pool = sqlx::postgres::PgPoolOptions::new()
            .acquire_timeout(std::time::Duration::from_millis(50))
            .connect_lazy("postgres://theboyslauncher:theboyslauncher@127.0.0.1:9/theboyslauncher")
            .expect("lazy pool should build");
        let mut state = BackendState::default();
        state.postgres_pool = Some(Arc::new(pool));
        state.presence.write().await.insert(
            stale_account_id,
            PresenceUpdate {
                account_id: stale_account_id,
                state: PresenceState::Playing,
                pack_id: Some("stale-pack".to_owned()),
                server_id: None,
                updated_at: Utc::now(),
            },
        );

        let response = app(state)
            .oneshot(
                Request::builder()
                    .uri("/presence")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[tokio::test]
    async fn postgres_presence_write_does_not_mutate_memory_on_persist_error() {
        let account_id = Uuid::new_v4();
        let pool = sqlx::postgres::PgPoolOptions::new()
            .acquire_timeout(std::time::Duration::from_millis(50))
            .connect_lazy("postgres://theboyslauncher:theboyslauncher@127.0.0.1:9/theboyslauncher")
            .expect("lazy pool should build");
        let mut state = BackendState::default();
        state.postgres_pool = Some(Arc::new(pool));
        let state_after_request = state.clone();
        let mut presence_rx = state_after_request.subscribe_presence();
        let payload = serde_json::json!({
            "state": "playing",
            "packId": "winterpack",
            "serverId": "the-cabin"
        });

        let response = app(state)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/presence/{account_id}"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
        assert!(
            state_after_request.presence.read().await.is_empty(),
            "failed Postgres writes must not leave stale in-memory presence"
        );
        assert!(
            presence_rx.try_recv().is_err(),
            "failed Postgres writes must not broadcast uncommitted presence"
        );
    }

    #[tokio::test]
    async fn presence_endpoint_accepts_playing_state_with_pack() {
        let account_id = Uuid::new_v4();
        let payload = serde_json::json!({
            "state": "playing",
            "packId": "winterpack",
            "serverId": "the-cabin"
        });
        let response = app(BackendState::default())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/presence/{account_id}"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), 1024 * 1024)
            .await
            .expect("body should read");
        let update: PresenceUpdate =
            serde_json::from_slice(&body).expect("response should deserialize");
        assert_eq!(update.account_id, account_id);
        assert_eq!(update.state, PresenceState::Playing);
        assert_eq!(update.pack_id.as_deref(), Some("winterpack"));
    }

    #[tokio::test]
    async fn presence_endpoint_broadcasts_updates_to_subscribers() {
        let account_id = Uuid::new_v4();
        let state = BackendState::default();
        let mut presence_rx = state.subscribe_presence();
        let payload = serde_json::json!({
            "state": "playing",
            "packId": "winterpack",
            "serverId": "the-cabin"
        });

        let response = app(state)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/presence/{account_id}"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let update = tokio::time::timeout(std::time::Duration::from_secs(1), presence_rx.recv())
            .await
            .expect("presence update should be broadcast")
            .expect("presence channel should remain open");
        assert_eq!(update.account_id, account_id);
        assert_eq!(update.state, PresenceState::Playing);
        assert_eq!(update.server_id.as_deref(), Some("the-cabin"));
    }

    #[tokio::test]
    async fn presence_websocket_replays_snapshot_and_streams_updates() {
        let existing_account_id = Uuid::nil();
        let updated_account_id = Uuid::max();
        let state = BackendState::default();
        {
            let mut presence = state.presence.write().await;
            presence.insert(
                existing_account_id,
                PresenceUpdate::offline(existing_account_id),
            );
        }

        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("listener should bind");
        let addr = listener.local_addr().expect("listener should have addr");
        let server_state = state.clone();
        let server = tokio::spawn(async move {
            axum::serve(listener, app(server_state))
                .await
                .expect("server should run");
        });

        let socket_account_id = Uuid::new_v4();
        let access_token = dev_access_token(socket_account_id);
        let (mut socket, _) = connect_async(format!(
            "ws://{addr}/presence/ws?access_token={access_token}"
        ))
        .await
        .expect("authenticated websocket should connect");
        let snapshot_update = next_presence_message(&mut socket).await;
        assert_eq!(snapshot_update.account_id, existing_account_id);

        let payload = serde_json::json!({
            "state": "playing",
            "packId": "winterpack",
            "serverId": "the-cabin"
        });
        let response = app(state)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/presence/{updated_account_id}"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(updated_account_id))
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::OK);

        let streamed_update = next_presence_message(&mut socket).await;
        assert_eq!(streamed_update.account_id, updated_account_id);
        assert_eq!(streamed_update.state, PresenceState::Playing);

        server.abort();
    }

    #[tokio::test]
    async fn presence_websocket_rejects_missing_session() {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("listener should bind");
        let addr = listener.local_addr().expect("listener should have addr");
        let server = tokio::spawn(async move {
            axum::serve(listener, app(BackendState::default()))
                .await
                .expect("server should run");
        });

        let error = connect_async(format!("ws://{addr}/presence/ws"))
            .await
            .expect_err("unauthenticated websocket should be rejected");
        let message = error.to_string();
        assert!(
            message.contains("401") || message.contains("Unauthorized"),
            "unexpected websocket rejection: {message}"
        );

        server.abort();
    }

    #[tokio::test]
    async fn presence_websocket_fails_closed_when_postgres_snapshot_refresh_fails() {
        let stale_account_id = Uuid::new_v4();
        let pool = sqlx::postgres::PgPoolOptions::new()
            .acquire_timeout(std::time::Duration::from_millis(50))
            .connect_lazy("postgres://theboyslauncher:theboyslauncher@127.0.0.1:9/theboyslauncher")
            .expect("lazy pool should build");
        let mut state = BackendState::default();
        state.postgres_pool = Some(Arc::new(pool));
        state.presence.write().await.insert(
            stale_account_id,
            PresenceUpdate {
                account_id: stale_account_id,
                state: PresenceState::Playing,
                pack_id: Some("stale-pack".to_owned()),
                server_id: None,
                updated_at: Utc::now(),
            },
        );

        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("listener should bind");
        let addr = listener.local_addr().expect("listener should have addr");
        let server = tokio::spawn(async move {
            axum::serve(listener, app(state))
                .await
                .expect("server should run");
        });

        let access_token = dev_access_token(Uuid::new_v4());
        let error = connect_async(format!(
            "ws://{addr}/presence/ws?access_token={access_token}"
        ))
        .await
        .expect_err("websocket should fail before replaying stale presence");
        let message = error.to_string();
        assert!(
            message.contains("500") || message.contains("Internal Server Error"),
            "unexpected websocket rejection: {message}"
        );

        server.abort();
    }

    #[tokio::test]
    async fn presence_snapshot_is_sorted_by_account_id() {
        let first = Uuid::nil();
        let second = Uuid::max();
        let state = BackendState::default();
        {
            let mut presence = state.presence.write().await;
            presence.insert(second, PresenceUpdate::offline(second));
            presence.insert(first, PresenceUpdate::offline(first));
        }

        let snapshot = state
            .presence_snapshot()
            .await
            .expect("presence snapshot should read from memory");

        assert_eq!(snapshot[0].account_id, first);
        assert_eq!(snapshot[1].account_id, second);
    }

    #[tokio::test]
    async fn presence_endpoint_rejects_playing_without_pack() {
        let account_id = Uuid::new_v4();
        let payload = serde_json::json!({
            "state": "playing",
            "packId": null,
            "serverId": null
        });
        let response = app(BackendState::default())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/presence/{account_id}"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn presence_update_requires_session_owner() {
        let account_id = Uuid::new_v4();
        let payload = serde_json::json!({
            "state": "idle",
            "packId": null,
            "serverId": null
        });

        let response = app(BackendState::default())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/presence/{account_id}"))
                    .header("content-type", "application/json")
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn presence_update_rejects_session_for_different_account() {
        let account_id = Uuid::new_v4();
        let other_account = Uuid::new_v4();
        let payload = serde_json::json!({
            "state": "idle",
            "packId": null,
            "serverId": null
        });

        let response = app(BackendState::default())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/presence/{account_id}"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(other_account))
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn presence_endpoint_rejects_idle_with_pack_context() {
        let account_id = Uuid::new_v4();
        let payload = serde_json::json!({
            "state": "idle",
            "packId": "winterpack",
            "serverId": null
        });
        let response = app(BackendState::default())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/presence/{account_id}"))
                    .header("content-type", "application/json")
                    .header(header::AUTHORIZATION, dev_session(account_id))
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    async fn next_presence_message<S>(socket: &mut S) -> PresenceUpdate
    where
        S: futures_util::Stream<
                Item = Result<
                    tokio_tungstenite::tungstenite::Message,
                    tokio_tungstenite::tungstenite::Error,
                >,
            > + Unpin,
    {
        let message = tokio::time::timeout(std::time::Duration::from_secs(1), socket.next())
            .await
            .expect("presence message should arrive")
            .expect("socket should remain open")
            .expect("message should be valid");
        let text = message
            .into_text()
            .expect("presence message should be text");
        serde_json::from_str(&text).expect("presence update should deserialize")
    }

    async fn read_json<T>(response: axum::response::Response) -> T
    where
        T: serde::de::DeserializeOwned,
    {
        let body = to_bytes(response.into_body(), 1024 * 1024)
            .await
            .expect("body should read");
        serde_json::from_slice(&body).expect("json should deserialize")
    }
}
