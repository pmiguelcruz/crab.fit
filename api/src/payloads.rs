use axum::Json;
use common::{Event, EventGroup, Person, SlotSize, Stats};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{availability_profiles::ProfileSubmission, errors::ApiError};

pub type ApiResult<T, A> = Result<Json<T>, ApiError<A>>;

#[derive(Deserialize, ToSchema)]
pub struct EventInput {
    pub name: Option<String>,
    #[schema(value_type = Option<String>)]
    pub slot_size: Option<SlotSize>,
    pub times: Vec<String>,
    pub timezone: String,
    #[serde(default)]
    /// Optional names of respondent groups. IDs are assigned when the poll is created.
    pub groups: Vec<GroupEdit>,
}

#[derive(Deserialize, ToSchema)]
pub struct GroupEdit {
    pub id: Option<String>,
    pub name: String,
}

#[derive(Serialize, ToSchema)]
pub struct GroupResponse {
    pub id: String,
    pub name: String,
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
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub groups: Vec<GroupResponse>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notifications_available: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shared_availability_available: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub final_choice: Option<String>,
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
            notifications_available: None,
            shared_availability_available: None,
            final_choice: None,
            groups: value
                .groups
                .into_iter()
                .map(|EventGroup { id, name }| GroupResponse { id, name })
                .collect(),
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
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub tentative: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_id: Option<String>,
    pub created_at: i64,
}

impl From<Person> for PersonResponse {
    fn from(value: Person) -> Self {
        Self {
            name: value.name,
            availability: value.availability,
            tentative: value.tentative,
            group_id: value.group_id,
            created_at: value.created_at.timestamp(),
        }
    }
}

#[derive(Deserialize, ToSchema)]
pub struct PersonInput {
    pub availability: Vec<String>,
    pub tentative: Option<Vec<String>>,
    /// Omit to keep the current group. Set to null to clear it.
    #[serde(default, deserialize_with = "optional_string_change")]
    #[schema(value_type = Option<String>, nullable)]
    pub group_id: Option<Option<String>>,
    /// Share an address with visitors to this poll. Omit to keep it or set it to null to clear it.
    #[serde(default, deserialize_with = "optional_string_change")]
    #[schema(value_type = Option<String>, nullable)]
    pub shared_email: Option<Option<String>>,
    #[schema(value_type = Option<Object>)]
    pub profile: Option<ProfileSubmission>,
}

// An omitted field leaves existing data in place. An explicit null removes it.
fn optional_string_change<'de, D: serde::Deserializer<'de>>(
    value: D,
) -> Result<Option<Option<String>>, D::Error> {
    Option::deserialize(value).map(Some)
}

#[derive(Deserialize)]
pub struct EventEdit {
    pub name: String,
    pub times: Option<Vec<String>>,
    pub groups: Option<Vec<GroupEdit>>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shared_email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_linked: Option<bool>,
}

#[derive(Serialize, ToSchema)]
pub struct Submission {
    #[serde(flatten)]
    pub person: PersonResponse,
    pub submitted_at: i64,
}
