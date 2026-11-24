use axum::{
    extract::{self, Path},
    headers::{authorization::Bearer, Authorization},
    http::{header, StatusCode},
    Json, TypedHeader,
};
use common::Adaptor;

use crate::{
    errors::ApiError,
    payloads::{ApiResult, EventEdit, EventResponse, PinInput, TokenResponse},
    routes::event::valid_times,
    sessions::{Session, ADMIN_TTL},
    State,
};

type BearerHeader = Option<TypedHeader<Authorization<Bearer>>>;

pub async fn login<A: Adaptor>(
    extract::State(state): State<A>,
    Json(input): Json<PinInput>,
) -> Result<([(header::HeaderName, &'static str); 1], Json<TokenResponse>), StatusCode> {
    let mut state = state.lock().await;
    state.admin_pin.verify(&input.pin)?;
    let token = state
        .sessions
        .issue(Session::Admin, ADMIN_TTL)
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    Ok((
        [(header::CACHE_CONTROL, "no-store")],
        Json(TokenResponse { token }),
    ))
}

pub async fn logout<A: Adaptor>(
    extract::State(state): State<A>,
    bearer: BearerHeader,
) -> Result<StatusCode, ApiError<A>> {
    let mut state = state.lock().await;
    let token = admin_token(&state.sessions, &bearer)?;
    state.sessions.revoke(token);
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_events<A: Adaptor>(
    extract::State(state): State<A>,
    bearer: BearerHeader,
) -> Result<
    (
        [(header::HeaderName, &'static str); 1],
        Json<Vec<EventResponse>>,
    ),
    ApiError<A>,
> {
    let state = state.lock().await;
    admin_token(&state.sessions, &bearer)?;
    let mut events = state
        .adaptor
        .list_events()
        .await
        .map_err(ApiError::AdaptorError)?;
    events.sort_unstable_by(|a, b| {
        b.created_at
            .cmp(&a.created_at)
            .then_with(|| a.id.cmp(&b.id))
    });
    Ok((
        [(header::CACHE_CONTROL, "no-store")],
        Json(events.into_iter().map(EventResponse::from).collect()),
    ))
}

pub async fn update_event<A: Adaptor>(
    extract::State(state): State<A>,
    Path(id): Path<String>,
    bearer: BearerHeader,
    Json(input): Json<EventEdit>,
) -> ApiResult<EventResponse, A> {
    let state = state.lock().await;
    admin_token(&state.sessions, &bearer)?;

    let name = input.name.trim();
    if name.is_empty() || name.chars().count() > 255 || name.chars().any(char::is_control) {
        return Err(ApiError::InvalidInput);
    }
    if input
        .times
        .as_deref()
        .is_some_and(|times| !valid_times(times))
    {
        return Err(ApiError::InvalidInput);
    }

    let event = state
        .adaptor
        .update_event(id, name.to_owned(), input.times)
        .await
        .map_err(ApiError::AdaptorError)?
        .ok_or(ApiError::NotFound)?;
    Ok(Json(event.into()))
}

pub async fn delete_event<A: Adaptor>(
    extract::State(state): State<A>,
    Path(id): Path<String>,
    bearer: BearerHeader,
) -> Result<StatusCode, ApiError<A>> {
    let state = state.lock().await;
    admin_token(&state.sessions, &bearer)?;
    if !state
        .adaptor
        .delete_event(id)
        .await
        .map_err(ApiError::AdaptorError)?
    {
        return Err(ApiError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

fn admin_token<'a, A: Adaptor>(
    sessions: &crate::sessions::Sessions,
    bearer: &'a BearerHeader,
) -> Result<&'a str, ApiError<A>> {
    let token = bearer.as_ref().ok_or(ApiError::NotAuthorized)?.0.token();
    if sessions.get(token) != Some(&Session::Admin) {
        return Err(ApiError::NotAuthorized);
    }
    Ok(token)
}
