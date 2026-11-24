use axum::{
    extract::{self, Path},
    http::StatusCode,
    Json,
};
use common::Adaptor;
use serde::Deserialize;

use crate::{
    errors::ApiError,
    notifications::Trigger,
    routes::{
        admin::{admin_token, BearerHeader},
        person::normalize_shared_email,
    },
    State,
};

#[derive(Deserialize)]
pub struct EmailSubscription {
    email: String,
    #[serde(flatten)]
    trigger: Trigger,
}

#[derive(Deserialize)]
pub struct NotificationToken {
    token: String,
}

impl NotificationToken {
    fn valid(&self) -> bool {
        self.token.len() == 43
            && self
                .token
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    }
}

pub async fn subscribe<A: Adaptor>(
    extract::State(state): State<A>,
    Path(event): Path<String>,
    bearer: BearerHeader,
    Json(input): Json<EmailSubscription>,
) -> Result<StatusCode, ApiError<A>> {
    let state = state.lock().await;
    admin_token(&state.sessions, &bearer)?;
    if !input.trigger.valid() {
        return Err(ApiError::InvalidInput);
    }
    let email = normalize_shared_email(&input.email).map_err(|_| ApiError::InvalidSharedEmail)?;
    if email.parse::<lettre::Address>().is_err() {
        return Err(ApiError::InvalidSharedEmail);
    }
    let notifications = state.notifications.as_ref().ok_or(ApiError::Unavailable)?;
    state
        .adaptor
        .get_event(event.clone())
        .await
        .map_err(ApiError::AdaptorError)?
        .ok_or(ApiError::NotFound)?;
    notifications
        .subscribe(&event, &email, input.trigger)
        .await
        .map_err(store_error)?;
    Ok(StatusCode::ACCEPTED)
}

pub async fn confirm<A: Adaptor>(
    extract::State(state): State<A>,
    Path(event): Path<String>,
    Json(input): Json<NotificationToken>,
) -> Result<StatusCode, ApiError<A>> {
    if !input.valid() {
        return Err(ApiError::InvalidInput);
    }
    let state = state.lock().await;
    let notifications = state.notifications.as_ref().ok_or(ApiError::Unavailable)?;
    if !notifications
        .confirm(&event, &input.token)
        .await
        .map_err(store_error)?
    {
        return Err(ApiError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn unsubscribe<A: Adaptor>(
    extract::State(state): State<A>,
    Path(event): Path<String>,
    Json(input): Json<NotificationToken>,
) -> Result<StatusCode, ApiError<A>> {
    if !input.valid() {
        return Err(ApiError::InvalidInput);
    }
    let notifications = state
        .lock()
        .await
        .notifications
        .clone()
        .ok_or(ApiError::Unavailable)?;
    notifications
        .unsubscribe(&event, &input.token)
        .await
        .map_err(store_error)?;
    Ok(StatusCode::NO_CONTENT)
}

fn store_error<A: Adaptor>(error: sqlx::Error) -> ApiError<A> {
    tracing::error!(%error, "Could not update poll notifications");
    ApiError::Unavailable
}
