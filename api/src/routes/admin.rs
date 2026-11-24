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
    routes::{
        event::{event_response, valid_choices, validate_groups},
        person::{available_slots, read_people, remove_person},
    },
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
    let mut response = Vec::with_capacity(events.len());
    for event in events {
        response.push(event_response(&state, event).await?);
    }
    Ok(([(header::CACHE_CONTROL, "no-store")], Json(response)))
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
    let mut groups = None;
    if input.times.is_some() || input.groups.is_some() {
        let event = state
            .adaptor
            .get_event(id.clone())
            .await
            .map_err(ApiError::AdaptorError)?
            .ok_or(ApiError::NotFound)?;
        if input
            .times
            .as_ref()
            .is_some_and(|choices| !valid_choices(choices, event.slot_size))
        {
            return Err(ApiError::InvalidInput);
        }
        if let Some(group_edits) = input.groups {
            groups =
                Some(validate_groups(group_edits, &event.groups).ok_or(ApiError::InvalidInput)?);
        }
    }

    let event = state
        .adaptor
        .update_event(id, name.to_owned(), input.times, groups)
        .await
        .map_err(ApiError::AdaptorError)?
        .ok_or(ApiError::NotFound)?;
    if let Some(profiles) = &state.profiles {
        if profiles
            .final_choice(&event.id)
            .await?
            .is_some_and(|choice| !available_slots(&event).contains(&choice))
        {
            profiles
                .set_final_choice(&event, &available_slots(&event), None, &[])
                .await?;
        }
    }
    Ok(Json(event_response(&state, event).await?))
}

#[derive(serde::Deserialize)]
pub struct FinalChoice {
    choice: Option<String>,
}

pub async fn set_final_choice<A: Adaptor>(
    extract::State(state): State<A>,
    Path(id): Path<String>,
    bearer: BearerHeader,
    Json(input): Json<FinalChoice>,
) -> ApiResult<EventResponse, A> {
    let state = state.lock().await;
    admin_token(&state.sessions, &bearer)?;
    let profiles = state.profiles.as_ref().ok_or(ApiError::Unavailable)?;
    let event = state
        .adaptor
        .get_event(id)
        .await
        .map_err(ApiError::AdaptorError)?
        .ok_or(ApiError::NotFound)?;
    let slots = available_slots(&event);
    let (people, _) = read_people(&state, &event, &slots).await?;
    profiles
        .set_final_choice(&event, &slots, input.choice.as_deref(), &people)
        .await?;
    Ok(Json(event_response(&state, event).await?))
}

pub async fn delete_event<A: Adaptor>(
    extract::State(state): State<A>,
    Path(id): Path<String>,
    bearer: BearerHeader,
) -> Result<StatusCode, ApiError<A>> {
    let mut state = state.lock().await;
    admin_token(&state.sessions, &bearer)?;
    if !state
        .adaptor
        .delete_event(id.clone())
        .await
        .map_err(ApiError::AdaptorError)?
    {
        return Err(ApiError::NotFound);
    }
    state.sessions.revoke_participant(&id, None);
    if let Some(notifications) = &state.notifications {
        if let Err(error) = notifications.remove_event(&id).await {
            tracing::warn!(%error, "Could not remove deleted poll notifications");
        }
    }
    if let Some(profiles) = &state.profiles {
        if let Err(error) = profiles.remove_event(&id).await {
            tracing::warn!(?error, "Could not remove deleted poll profile links");
        }
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_people<A: Adaptor>(
    extract::State(state): State<A>,
    Path(id): Path<String>,
    bearer: BearerHeader,
) -> Result<([(header::HeaderName, &'static str); 1], Json<Vec<String>>), ApiError<A>> {
    let state = state.lock().await;
    admin_token(&state.sessions, &bearer)?;
    let people = state
        .adaptor
        .get_people(id)
        .await
        .map_err(ApiError::AdaptorError)?
        .ok_or(ApiError::NotFound)?;
    let mut names: Vec<_> = people.into_iter().map(|person| person.name).collect();
    names.sort_unstable_by_key(|name| name.to_lowercase());
    Ok(([(header::CACHE_CONTROL, "no-store")], Json(names)))
}

pub async fn delete_person<A: Adaptor>(
    extract::State(state): State<A>,
    Path((event_id, person_name)): Path<(String, String)>,
    bearer: BearerHeader,
) -> Result<StatusCode, ApiError<A>> {
    let mut state = state.lock().await;
    admin_token(&state.sessions, &bearer)?;
    remove_person(&mut state, event_id, person_name).await
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
