use std::env;

use axum::{extract, http::HeaderMap};
use chrono::{Duration, Utc};
use common::Adaptor;
use tracing::info;

use crate::{
    errors::ApiError,
    routes::admin::{admin_token, BearerHeader},
    State,
};

#[utoipa::path(
    get,
    path = "/tasks/cleanup",
    responses(
        (status = 200, description = "Cleanup complete"),
        (status = 401, description = "Missing or incorrect X-Cron-Key header"),
        (status = 429, description = "Too many requests"),
    ),
    security(("admin-session" = []), ("cron-key" = [])),
    tag = "tasks",
)]
/// Delete events older than 3 months
pub async fn cleanup<A: Adaptor>(
    extract::State(state): State<A>,
    headers: HeaderMap,
    bearer: BearerHeader,
) -> Result<(), ApiError<A>> {
    // Check cron key
    let cron_key_header: String = headers
        .get("X-Cron-Key")
        .map(|k| k.to_str().unwrap_or_default().into())
        .unwrap_or_default();
    let env_key = env::var("CRON_KEY").unwrap_or_default();
    let state = state.lock().await;
    if (env_key.is_empty() || cron_key_header != env_key)
        && admin_token::<A>(&state.sessions, &bearer).is_err()
    {
        return Err(ApiError::NotAuthorized);
    }

    info!("Running cleanup task");

    let adaptor = &state.adaptor;

    let result = adaptor
        .delete_events(Utc::now() - Duration::days(90))
        .await
        .map_err(ApiError::AdaptorError)?;

    if state.notifications.is_some() || state.profiles.is_some() {
        match adaptor.list_events().await {
            Ok(events) => {
                let active_ids = events.into_iter().map(|event| event.id).collect();
                if let Some(notifications) = &state.notifications {
                    if let Err(error) = notifications.prune(&active_ids).await {
                        tracing::warn!(%error, "Could not remove expired poll notifications");
                    }
                }
                if let Some(profiles) = &state.profiles {
                    if let Err(error) = profiles.prune(&active_ids).await {
                        tracing::warn!(?error, "Could not remove expired poll profile links");
                    }
                }
            }
            Err(error) => tracing::warn!(%error, "Could not identify expired poll notifications"),
        }
    }

    info!(
        "Cleanup successful: {} events and {} people removed",
        result.event_count, result.person_count
    );

    Ok(())
}
