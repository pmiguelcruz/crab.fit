use std::error::Error;

use async_trait::async_trait;
use chrono::{DateTime, Utc};

/// Data storage adaptor, all methods on an adaptor can return an error if
/// something goes wrong, or potentially None if the data requested was not found.
#[async_trait]
pub trait Adaptor: Send + Sync {
    type Error: Error;

    async fn get_stats(&self) -> Result<Stats, Self::Error>;
    async fn increment_stat_event_count(&self) -> Result<i64, Self::Error>;
    async fn increment_stat_person_count(&self) -> Result<i64, Self::Error>;

    async fn get_people(&self, event_id: String) -> Result<Option<Vec<Person>>, Self::Error>;
    async fn upsert_person(
        &self,
        event_id: String,
        person: Person,
    ) -> Result<Option<Person>, Self::Error>;

    async fn delete_person(&self, event_id: String, name: String) -> Result<bool, Self::Error>;

    /// Get an event and update visited date to current time
    async fn get_event(&self, id: String) -> Result<Option<Event>, Self::Error>;
    async fn create_event(&self, event: Event) -> Result<Event, Self::Error>;

    async fn list_events(&self) -> Result<Vec<Event>, Self::Error>;
    async fn update_event(
        &self,
        id: String,
        name: String,
        times: Option<Vec<String>>,
    ) -> Result<Option<Event>, Self::Error>;
    async fn delete_event(&self, id: String) -> Result<bool, Self::Error>;

    /// Delete events older than a cutoff date, as well as any associated people
    /// Returns the amount of events and people deleted
    async fn delete_events(&self, cutoff: DateTime<Utc>) -> Result<Stats, Self::Error>;
}

#[derive(Clone)]
pub struct Stats {
    pub event_count: i64,
    pub person_count: i64,
}

#[derive(Clone)]
pub struct Event {
    pub slot_size: Option<SlotSize>,
    pub id: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub visited_at: DateTime<Utc>,
    pub times: Vec<String>,
    pub timezone: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SlotSize {
    QuarterHour,
    HalfHour,
    Hour,
    Day,
}

impl SlotSize {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::QuarterHour => "quarter_hour",
            Self::HalfHour => "half_hour",
            Self::Hour => "hour",
            Self::Day => "day",
        }
    }
}

impl std::str::FromStr for SlotSize {
    type Err = ();

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "quarter_hour" => Ok(Self::QuarterHour),
            "half_hour" => Ok(Self::HalfHour),
            "hour" => Ok(Self::Hour),
            "day" => Ok(Self::Day),
            _ => Err(()),
        }
    }
}

#[derive(Clone)]
pub struct Person {
    pub name: String,
    pub password_hash: Option<String>,
    pub created_at: DateTime<Utc>,
    pub availability: Vec<String>,
}
