use std::collections::HashSet;

use axum::{
    extract::{self, Path},
    http::StatusCode,
    Json,
};
use common::{Adaptor, Event, EventGroup, SlotSize};
use rand::{distributions::Alphanumeric, seq::SliceRandom, thread_rng, Rng};
use regex::Regex;

use crate::{
    errors::ApiError,
    payloads::{ApiResult, EventInput, EventResponse, GroupEdit},
    State,
};

#[utoipa::path(
    get,
    path = "/event/{event_id}",
    params(
        ("event_id", description = "The ID of the event"),
    ),
    responses(
        (status = 200, description = "Ok", body = EventResponse),
        (status = 404, description = "Not found"),
        (status = 429, description = "Too many requests"),
    ),
    tag = "event",
)]
/// Get details about an event
pub async fn get_event<A: Adaptor>(
    extract::State(state): State<A>,
    Path(event_id): Path<String>,
) -> ApiResult<EventResponse, A> {
    let adaptor = &state.lock().await.adaptor;

    let event = adaptor
        .get_event(event_id)
        .await
        .map_err(ApiError::AdaptorError)?;

    match event {
        Some(event) => Ok(Json(event.into())),
        None => Err(ApiError::NotFound),
    }
}

#[utoipa::path(
    post,
    path = "/event",
    request_body(content = EventInput, description = "New event details"),
    responses(
        (status = 201, description = "Created", body = EventResponse),
        (status = 415, description = "Unsupported input format"),
        (status = 422, description = "Invalid input provided"),
        (status = 429, description = "Too many requests"),
    ),
    tag = "event",
)]
/// Create a new event
pub async fn create_event<A: Adaptor>(
    extract::State(state): State<A>,
    Json(input): Json<EventInput>,
) -> Result<(StatusCode, Json<EventResponse>), ApiError<A>> {
    if !valid_choices(&input.times, input.slot_size)
        || input.timezone.parse::<chrono_tz::Tz>().is_err()
    {
        return Err(ApiError::InvalidInput);
    }
    let adaptor = &state.lock().await.adaptor;

    // Get the current timestamp
    let now = chrono::offset::Utc::now();

    // Generate a name if none provided
    let name = match input.name.as_deref().map(str::trim) {
        Some(name) if !name.is_empty() => name.to_owned(),
        _ => generate_name(),
    };

    if name.chars().count() > 255 || name.chars().any(char::is_control) {
        return Err(ApiError::InvalidInput);
    }
    let groups = validate_groups(input.groups, &[]).ok_or(ApiError::InvalidInput)?;

    let mut times = input.times;
    times.sort_unstable();
    times.dedup();
    // Put specific-date slots in chronological order for calendar imports.
    if times[0].len() == 13 {
        times.sort_by_cached_key(|time| {
            format!("{}{}{}{}", &time[9..], &time[7..9], &time[5..7], &time[..4])
        });
    }

    // Generate an ID
    let mut id = generate_id(&name);

    // Check the ID doesn't already exist
    while (adaptor
        .get_event(id.clone())
        .await
        .map_err(ApiError::AdaptorError)?)
    .is_some()
    {
        id = generate_id(&name);
    }

    let event = adaptor
        .create_event(Event {
            id,
            name,
            created_at: now,
            visited_at: now,
            times,
            timezone: input.timezone,
            slot_size: input.slot_size,
            groups,
        })
        .await
        .map_err(ApiError::AdaptorError)?;

    // Update stats
    adaptor
        .increment_stat_event_count()
        .await
        .map_err(ApiError::AdaptorError)?;

    Ok((StatusCode::CREATED, Json(event.into())))
}

// Generate a random name based on an adjective and a crab species
pub(super) fn validate_groups(
    input: Vec<GroupEdit>,
    existing: &[EventGroup],
) -> Option<Vec<EventGroup>> {
    if input.len() > 20 {
        return None;
    }
    let mut reserved: HashSet<_> = existing.iter().map(|group| group.id.clone()).collect();
    let mut ids = HashSet::new();
    let mut names = HashSet::new();
    let mut groups = Vec::with_capacity(input.len());
    let mut rng = thread_rng();
    for group in input {
        let name = group.name.trim();
        if name.is_empty()
            || name.chars().count() > 64
            || name.chars().any(char::is_control)
            || !names.insert(name.to_lowercase())
        {
            return None;
        }
        let id = if let Some(id) = group.id {
            if !existing.iter().any(|group| group.id == id) || !ids.insert(id.clone()) {
                return None;
            }
            id
        } else {
            loop {
                let id: String = (&mut rng)
                    .sample_iter(Alphanumeric)
                    .take(12)
                    .map(char::from)
                    .collect();
                if reserved.insert(id.clone()) {
                    break id;
                }
            }
        };
        groups.push(EventGroup {
            id,
            name: name.to_owned(),
        });
    }
    Some(groups)
}

fn generate_name() -> String {
    let adjectives: Vec<String> =
        serde_json::from_slice(include_bytes!("../res/adjectives.json")).unwrap();
    let crabs: Vec<String> = serde_json::from_slice(include_bytes!("../res/crabs.json")).unwrap();

    format!(
        "{} {} Crab",
        adjectives.choose(&mut thread_rng()).unwrap(),
        crabs.choose(&mut thread_rng()).unwrap()
    )
}

// Generate a slug for the crab fit
fn generate_id(name: &str) -> String {
    let mut id = encode_name(name.to_string());
    if id.replace('-', "").is_empty() {
        id = encode_name(generate_name());
    }
    id.truncate(248);
    let number = thread_rng().gen_range(100000..=999999);
    format!("{}-{}", id, number)
}

// Use punycode to encode the name
fn encode_name(name: String) -> String {
    let pc = punycode::encode(&name.trim().to_lowercase())
        .unwrap_or(String::from(""))
        .trim()
        .replace(|c: char| !c.is_ascii_alphanumeric() && c != ' ', "");
    let re = Regex::new(r"\s+").unwrap();
    re.replace_all(&pc, "-").to_string()
}

pub(super) fn valid_choices(choices: &[String], slot_size: Option<SlotSize>) -> bool {
    if slot_size != Some(SlotSize::Day) {
        return valid_times(choices);
    }
    let Some(first) = choices.first() else {
        return false;
    };
    choices.iter().all(|choice| {
        let bytes = choice.as_bytes();
        if bytes.len() != first.len() {
            return false;
        }
        match bytes {
            [b'1'..=b'7'] => true,
            [year @ .., b'-', m1, m2, b'-', d1, d2] if year.len() == 4 => {
                year.iter().chain([m1, m2, d1, d2]).all(u8::is_ascii_digit)
                    && chrono::NaiveDate::parse_from_str(choice, "%Y-%m-%d").is_ok()
            }
            _ => false,
        }
    })
}

fn valid_times(times: &[String]) -> bool {
    let Some(first) = times.first() else {
        return false;
    };
    times.iter().all(|time| {
        if time.len() != first.len() || !time.is_ascii() {
            return false;
        }
        let Some((clock, date)) = time.split_once('-') else {
            return false;
        };
        if clock.len() != 4
            || !clock.bytes().all(|b| b.is_ascii_digit())
            || chrono::NaiveTime::parse_from_str(clock, "%H%M").is_err()
        {
            return false;
        }
        match date.as_bytes() {
            [b'0'..=b'6'] => true,
            digits if digits.len() == 8 && digits.iter().all(u8::is_ascii_digit) => {
                chrono::NaiveDate::parse_from_str(date, "%d%m%Y").is_ok()
            }
            _ => false,
        }
    })
}

#[cfg(test)]
mod tests {
    use super::{valid_choices, valid_times, SlotSize};

    #[test]
    fn day_polls_accept_either_calendar_dates_or_iso_weekdays() {
        let accepts = |choices: &[&str]| {
            valid_choices(
                &choices
                    .iter()
                    .map(|choice| choice.to_string())
                    .collect::<Vec<_>>(),
                Some(SlotSize::Day),
            )
        };
        assert!(accepts(&["2028-02-29", "2028-03-01"]));
        assert!(accepts(&["1", "7"]));
        assert!(!accepts(&["0"]));
        assert!(!accepts(&["2027-02-29"]));
        assert!(!accepts(&["2028-2-029"]));
        assert!(!accepts(&["2028-02-29", "7"]));
        assert!(!accepts(&["0930-1"]));
    }

    #[test]
    fn validates_specific_dates_and_recurring_weekdays() {
        for valid in [
            vec!["0000-0", "2315-6"],
            vec!["0945-29022028", "1215-01032028"],
        ] {
            assert!(valid_times(
                &valid.into_iter().map(str::to_owned).collect::<Vec<_>>()
            ));
        }
        for invalid in [
            vec![],
            vec!["2400-1"],
            vec!["0960-3"],
            vec!["0900-7"],
            vec!["900-1"],
            vec!["0900-1", "0900-01032028"],
            vec!["0900-29022027"],
            vec!["0900-31042028"],
        ] {
            assert!(!valid_times(
                &invalid.into_iter().map(str::to_owned).collect::<Vec<_>>()
            ));
        }
    }
}
