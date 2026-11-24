use std::collections::HashSet;

use axum::{
    extract::{self, Path},
    headers::{authorization::Bearer, Authorization},
    http::header,
    Json, TypedHeader,
};
use base64::{engine::general_purpose, Engine};
use common::{Adaptor, Person};

use crate::{
    errors::ApiError,
    payloads::{ApiResult, PersonInput, PersonLogin, PersonResponse, Submission},
    sessions::{Session, PARTICIPANT_TTL},
    State,
};

#[utoipa::path(
    get,
    path = "/event/{event_id}/people",
    params(
        ("event_id", description = "The ID of the event"),
    ),
    responses(
        (status = 200, description = "Ok", body = [PersonResponse]),
        (status = 404, description = "Event not found"),
        (status = 429, description = "Too many requests"),
    ),
    tag = "person",
)]
/// Get availabilities for an event
pub async fn get_people<A: Adaptor>(
    extract::State(state): State<A>,
    Path(event_id): Path<String>,
) -> ApiResult<Vec<PersonResponse>, A> {
    let adaptor = &state.lock().await.adaptor;

    let times = adaptor
        .get_event(event_id.clone())
        .await
        .map_err(ApiError::AdaptorError)?
        .ok_or(ApiError::NotFound)?
        .times;
    let slots = expand_times(&times);
    let people = adaptor
        .get_people(event_id)
        .await
        .map_err(ApiError::AdaptorError)?
        .ok_or(ApiError::NotFound)?;

    Ok(Json(
        people
            .into_iter()
            .map(|person| active_response(person, &slots))
            .filter(|person| !person.availability.is_empty())
            .collect(),
    ))
}

#[utoipa::path(
    get,
    path = "/event/{event_id}/people/{person_name}",
    params(
        ("event_id", description = "The ID of the event"),
        ("person_name", description = "The name of the person"),
    ),
    security((), ("password" = [])),
    responses(
        (status = 200, description = "Ok", body = PersonLogin),
        (status = 401, description = "Incorrect password"),
        (status = 404, description = "Event not found"),
        (status = 415, description = "Unsupported input format"),
        (status = 422, description = "Invalid input provided"),
        (status = 429, description = "Too many requests"),
    ),
    tag = "person",
)]
/// Login or create a person for an event
pub async fn get_person<A: Adaptor>(
    extract::State(state): State<A>,
    Path((event_id, person_name)): Path<(String, String)>,
    bearer: Option<TypedHeader<Authorization<Bearer>>>,
) -> Result<([(header::HeaderName, &'static str); 1], Json<PersonLogin>), ApiError<A>> {
    let mut state = state.lock().await;
    let adaptor = &state.adaptor;
    let times = adaptor
        .get_event(event_id.clone())
        .await
        .map_err(ApiError::AdaptorError)?
        .ok_or(ApiError::NotFound)?
        .times;
    let password = parse_password(bearer);
    let existing_people = adaptor
        .get_people(event_id.clone())
        .await
        .map_err(ApiError::AdaptorError)?
        .ok_or(ApiError::NotFound)?;

    let person = match existing_people
        .into_iter()
        .find(|person| person.name.to_lowercase() == person_name.to_lowercase())
    {
        Some(person) if verify_password(&person, password.clone()) => person,
        Some(_) => return Err(ApiError::NotAuthorized),
        None => {
            if person_name.trim().is_empty()
                || person_name.chars().count() > 255
                || person_name.chars().any(char::is_control)
            {
                return Err(ApiError::InvalidInput);
            }
            let password_hash = password
                .map(|raw| bcrypt::hash(raw, 10))
                .transpose()
                .map_err(|_| ApiError::InvalidInput)?;
            let person = adaptor
                .upsert_person(
                    event_id.clone(),
                    Person {
                        name: person_name,
                        password_hash,
                        created_at: chrono::Utc::now(),
                        availability: vec![],
                    },
                )
                .await
                .map_err(ApiError::AdaptorError)?
                .ok_or(ApiError::NotFound)?;
            adaptor
                .increment_stat_person_count()
                .await
                .map_err(ApiError::AdaptorError)?;
            person
        }
    };

    let token = state
        .sessions
        .issue(
            Session::Participant {
                event: event_id,
                name: person.name.clone(),
            },
            PARTICIPANT_TTL,
        )
        .ok_or(ApiError::Unavailable)?;
    let person = active_response(person, &expand_times(&times));
    Ok((
        [(header::CACHE_CONTROL, "no-store")],
        Json(PersonLogin { person, token }),
    ))
}

#[utoipa::path(
    patch,
    path = "/event/{event_id}/people/{person_name}",
    params(
        ("event_id", description = "The ID of the event"),
        ("person_name", description = "The name of the person"),
    ),
    security(("participant-session" = [])),
    request_body(content = PersonInput, description = "Person details"),
    responses(
        (status = 200, description = "Ok", body = Submission),
        (status = 401, description = "Missing, expired or used participant session"),
        (status = 404, description = "Event or person not found"),
        (status = 415, description = "Unsupported input format"),
        (status = 422, description = "Invalid input provided"),
        (status = 429, description = "Too many requests"),
    ),
    tag = "person",
)]
/// Update a person's availabilities
pub async fn update_person<A: Adaptor>(
    extract::State(state): State<A>,
    Path((event_id, person_name)): Path<(String, String)>,
    bearer: Option<TypedHeader<Authorization<Bearer>>>,
    Json(input): Json<PersonInput>,
) -> ApiResult<Submission, A> {
    let mut state = state.lock().await;
    let bearer = bearer.ok_or(ApiError::NotAuthorized)?;
    let token = bearer.0.token();
    let Some(Session::Participant { event, name }) = state.sessions.get(token) else {
        return Err(ApiError::NotAuthorized);
    };
    if event != &event_id || name != &person_name {
        return Err(ApiError::NotAuthorized);
    }

    let adaptor = &state.adaptor;
    let times = adaptor
        .get_event(event_id.clone())
        .await
        .map_err(ApiError::AdaptorError)?
        .ok_or(ApiError::NotFound)?
        .times;
    let slots = expand_times(&times);
    let mut availability = input.availability;
    if availability.iter().any(|slot| !slots.contains(slot)) {
        return Err(ApiError::InvalidInput);
    }
    availability.sort_unstable();
    availability.dedup();

    let person = adaptor
        .get_people(event_id.clone())
        .await
        .map_err(ApiError::AdaptorError)?
        .ok_or(ApiError::NotFound)?
        .into_iter()
        .find(|person| person.name == person_name)
        .ok_or(ApiError::NotFound)?;
    let person = adaptor
        .upsert_person(
            event_id,
            Person {
                availability,
                ..person
            },
        )
        .await
        .map_err(ApiError::AdaptorError)?
        .ok_or(ApiError::NotFound)?;
    state.sessions.revoke(token);

    Ok(Json(Submission {
        person: person.into(),
        submitted_at: chrono::Utc::now().timestamp(),
    }))
}

fn expand_times(times: &[String]) -> HashSet<String> {
    // Use the same quarter-hour grid as the frontend.
    times
        .iter()
        .filter_map(|time| Some((time.get(..2)?, time.get(4..)?)))
        .flat_map(|(hour, date)| {
            ["00", "15", "30", "45"].map(|minute| format!("{hour}{minute}{date}"))
        })
        .collect()
}

fn active_response(person: Person, slots: &HashSet<String>) -> PersonResponse {
    let mut response = PersonResponse::from(person);
    response.availability.retain(|time| slots.contains(time));
    response
}

pub fn parse_password(bearer: Option<TypedHeader<Authorization<Bearer>>>) -> Option<String> {
    bearer.map(|TypedHeader(Authorization(b))| {
        String::from_utf8(
            general_purpose::STANDARD
                .decode(b.token().trim())
                .unwrap_or(vec![]),
        )
        .unwrap_or("".to_owned())
    })
}

pub fn verify_password(person: &Person, raw: Option<String>) -> bool {
    match &person.password_hash {
        Some(hash) => bcrypt::verify(raw.unwrap_or("".to_owned()), hash).unwrap_or(false),
        // Specifically allow a user who doesn't have a password
        // set to log in with or without any password input
        None => true,
    }
}
