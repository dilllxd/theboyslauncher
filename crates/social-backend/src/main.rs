use anyhow::Result;
use social_backend::{
    app_with_cors_origins, apply_postgres_migrations, BackendConfig, BackendState,
};

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter("social_backend=debug")
        .with_target(false)
        .init();

    let config = BackendConfig::from_env()?;
    let state = if let Some(database_url) = config.database_url.as_deref() {
        tracing::info!("applying social backend Postgres migrations");
        apply_postgres_migrations(database_url).await?;
        tracing::info!("loading social backend Postgres state");
        BackendState::with_postgres(database_url).await?
    } else if let Some(path) = config.state_path.as_ref() {
        tracing::info!(state_path = %path.display(), "loading social backend JSON state store");
        BackendState::with_json_store(path).await?
    } else {
        BackendState::default()
    }
    .with_session_secret(config.session_secret.clone())
    .with_minecraft_profile_url(config.minecraft_profile_url.clone())
    .with_dev_sessions_allowed(config.allow_dev_sessions)
    .with_legacy_minecraft_sessions_allowed(config.database_url.is_none());
    let listener = tokio::net::TcpListener::bind(&config.bind_addr).await?;
    tracing::info!(bind = %config.bind_addr, "social backend listening");
    axum::serve(listener, app_with_cors_origins(state, config.cors_origins)).await?;
    Ok(())
}
