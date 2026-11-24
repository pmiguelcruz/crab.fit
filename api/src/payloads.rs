use axum::Json;
use common::{Event, Person, SlotSize, Stats};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::errors::ApiError;

pub type ApiResult<T, A> = Result<Json<T>, ApiError<A>>;

#[derive(Deserialize, ToSchema)]
pub struct EventInput {
    pub name: Option<String>,
    #[schema(value_type = Option<String>)]
    pub slot_size: Option<SlotSize>,
    pub times: Vec<String>,
    pub timezone: String,
}

#[derive(Serialize, ToSchema)]
pub struct EventResponse {
    pub id: String,
    pub name: String,
    pub times: Vec<String>,
    pub timezone: String,
    pub created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Option<String>)]
    pub slot_size: Option<SlotSize>,
}

impl From<Event> for EventResponse {
    fn from(value: Event) -> Self {
        Self {
            id: value.id,
            name: value.name,
            times: value.times,
            timezone: value.timezone,
            slot_size: value.slot_size,
            created_at: value.created_at.timestamp(),
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct StatsResponse {
    pub event_count: i64,
    pub person_count: i64,
    pub version: String,
}

impl From<Stats> for StatsResponse {
    fn from(value: Stats) -> Self {
        Self {
            event_count: value.event_count,
            person_count: value.person_count,
            version: env!("CARGO_PKG_VERSION").to_string(),
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct PersonResponse {
    pub name: String,
    pub availability: Vec<String>,
    pub created_at: i64,
}

impl From<Person> for PersonResponse {
    fn from(value: Person) -> Self {
        Self {
            name: value.name,
            availability: value.availability,
            created_at: value.created_at.timestamp(),
        }
    }
}

#[derive(Deserialize, ToSchema)]
pub struct PersonInput {
    pub availability: Vec<String>,
}

#[derive(Deserialize)]
pub struct EventEdit {
    pub name: String,
    pub times: Option<Vec<String>>,
}

#[derive(Deserialize)]
pub struct PinInput {
    pub pin: String,
}

#[derive(Serialize)]
pub struct TokenResponse {
    pub token: String,
}

#[derive(Serialize, ToSchema)]
pub struct PersonLogin {
    #[serde(flatten)]
    pub person: PersonResponse,
    pub token: String,
}

#[derive(Serialize, ToSchema)]
pub struct Submission {
    #[serde(flatten)]
    pub person: PersonResponse,
    pub submitted_at: i64,
}
