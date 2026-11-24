use std::collections::{BTreeSet, HashSet};

use axum::{
    extract::{self, Path},
    headers::{authorization::Bearer, Authorization},
    http::{header, StatusCode},
    Json, TypedHeader,
};
use base64::{engine::general_purpose, Engine};
use common::{Adaptor, Event, EventGroup, Person};
use email_address::{EmailAddress, Options as EmailOptions};

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

    let event = adaptor
        .get_event(event_id.clone())
        .await
        .map_err(ApiError::AdaptorError)?
        .ok_or(ApiError::NotFound)?;
    let slots = available_slots(&event);
    let people = adaptor
        .get_people(event_id)
        .await
        .map_err(ApiError::AdaptorError)?
        .ok_or(ApiError::NotFound)?;

    Ok(Json(
        people
            .into_iter()
            .map(|person| active_response(person, &slots, &event.groups))
            .filter(|person| {
                !person.availability.is_empty()
                    || !person.tentative.is_empty()
                    || person.group_id.is_some()
            })
            .collect(),
    ))
}

#[utoipa::path(
    get,
    path = "/event/{event_id}/emails",
    params(("event_id", description = "The ID of the event")),
    responses(
        (status = 200, description = "Addresses participants chose to share for this event", body = [String]),
        (status = 404, description = "Event not found"),
        (status = 429, description = "Too many requests"),
    ),
    tag = "person",
)]
pub async fn get_shared_emails<A: Adaptor>(
    extract::State(state): State<A>,
    Path(event_id): Path<String>,
) -> Result<([(header::HeaderName, &'static str); 1], Json<Vec<String>>), ApiError<A>> {
    let people = state
        .lock()
        .await
        .adaptor
        .get_people(event_id)
        .await
        .map_err(ApiError::AdaptorError)?
        .ok_or(ApiError::NotFound)?;
    let emails: BTreeSet<_> = people
        .into_iter()
        .filter_map(|person| person.shared_email)
        .collect();
    Ok((
        [(header::CACHE_CONTROL, "no-store")],
        Json(emails.into_iter().collect()),
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
    let event = adaptor
        .get_event(event_id.clone())
        .await
        .map_err(ApiError::AdaptorError)?
        .ok_or(ApiError::NotFound)?;
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
                        tentative: vec![],
                        group_id: None,
                        shared_email: None,
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
    let shared_email = person.shared_email.clone();
    let person = active_response(person, &available_slots(&event), &event.groups);
    Ok((
        [(header::CACHE_CONTROL, "no-store")],
        Json(PersonLogin {
            person,
            token,
            shared_email,
        }),
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
    let token = participant_token(&state.sessions, &bearer, &event_id, &person_name)?;
    let submitted_email = input
        .shared_email
        .map(|value| {
            value
                .map(|email| normalize_shared_email(&email))
                .transpose()
        })
        .transpose()
        .map_err(|_| ApiError::InvalidSharedEmail)?;

    let adaptor = &state.adaptor;
    let event = adaptor
        .get_event(event_id.clone())
        .await
        .map_err(ApiError::AdaptorError)?
        .ok_or(ApiError::NotFound)?;
    let slots = available_slots(&event);
    let mut availability = input.availability;
    let firm: HashSet<_> = availability.iter().cloned().collect();
    if !firm.is_subset(&slots)
        || input.tentative.as_ref().is_some_and(|times| {
            times
                .iter()
                .any(|time| !slots.contains(time) || firm.contains(time))
        })
        || input
            .group_id
            .as_ref()
            .and_then(|id| id.as_deref())
            .is_some_and(|id| !has_group(&event.groups, id))
    {
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
    let mut tentative = input.tentative.unwrap_or(person.tentative);
    tentative.retain(|time| slots.contains(time) && !firm.contains(time));
    tentative.sort_unstable();
    tentative.dedup();
    let group_id = input
        .group_id
        .unwrap_or(person.group_id)
        .filter(|id| has_group(&event.groups, id));
    let shared_email = submitted_email.unwrap_or(person.shared_email);
    let person = adaptor
        .upsert_person(
            event_id,
            Person {
                availability,
                tentative,
                group_id,
                shared_email,
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

fn normalize_shared_email(input: &str) -> Result<String, ()> {
    let email = input.trim();
    if email.len() > 254 || email.chars().any(char::is_control) {
        return Err(());
    }
    let email = EmailAddress::parse_with_options(
        email,
        EmailOptions {
            allow_display_text: false,
            allow_domain_literal: false,
            ..EmailOptions::default()
        },
    )
    .map_err(|_| ())?;
    Ok(format!(
        "{}@{}",
        email.local_part(),
        email.domain().to_lowercase()
    ))
}

pub async fn delete_person<A: Adaptor>(
    extract::State(state): State<A>,
    Path((event_id, person_name)): Path<(String, String)>,
    bearer: Option<TypedHeader<Authorization<Bearer>>>,
) -> Result<StatusCode, ApiError<A>> {
    let mut state = state.lock().await;
    participant_token(&state.sessions, &bearer, &event_id, &person_name)?;
    remove_person(&mut state, event_id, person_name).await
}

pub(super) async fn remove_person<A: Adaptor>(
    state: &mut crate::ApiState<A>,
    event_id: String,
    person_name: String,
) -> Result<StatusCode, ApiError<A>> {
    if !state
        .adaptor
        .delete_person(event_id.clone(), person_name.clone())
        .await
        .map_err(ApiError::AdaptorError)?
    {
        return Err(ApiError::NotFound);
    }
    state
        .sessions
        .revoke_participant(&event_id, Some(&person_name));
    Ok(StatusCode::NO_CONTENT)
}

fn participant_token<'a, A: Adaptor>(
    sessions: &crate::sessions::Sessions,
    bearer: &'a Option<TypedHeader<Authorization<Bearer>>>,
    event_id: &str,
    person_name: &str,
) -> Result<&'a str, ApiError<A>> {
    let token = bearer.as_ref().ok_or(ApiError::NotAuthorized)?.0.token();
    match sessions.get(token) {
        Some(Session::Participant { event, name }) if event == event_id && name == person_name => {
            Ok(token)
        }
        _ => Err(ApiError::NotAuthorized),
    }
}

fn available_slots(event: &Event) -> HashSet<String> {
    if event.slot_size.is_some() {
        return event.times.iter().cloned().collect();
    }
    // Legacy events store hourly markers and collect quarter-hour responses.
    event
        .times
        .iter()
        .filter_map(|time| Some((time.get(..2)?, time.get(4..)?)))
        .flat_map(|(hour, date)| {
            ["00", "15", "30", "45"].map(|minute| format!("{hour}{minute}{date}"))
        })
        .collect()
}

fn has_group(groups: &[EventGroup], id: &str) -> bool {
    groups.iter().any(|group| group.id == id)
}

fn active_response(
    person: Person,
    slots: &HashSet<String>,
    groups: &[EventGroup],
) -> PersonResponse {
    let mut response = PersonResponse::from(person);
    response.availability.retain(|time| slots.contains(time));
    response.tentative.retain(|time| slots.contains(time));
    response.group_id = response.group_id.filter(|id| has_group(groups, id));
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
