use std::{env, error::Error, fmt::Display};

use async_trait::async_trait;
use chrono::{DateTime, NaiveDateTime, Utc};
use common::{Adaptor, Event, EventGroup, Person, Stats};
use google_cloud::{
    authorize::ApplicationCredentials,
    datastore::{Client, Filter, FromValue, IntoValue, Key, KeyID, Query, Value},
    error::ConvertError,
};
use tokio::sync::Mutex;

pub struct DatastoreAdaptor {
    client: Mutex<Client>,
}

// Keys
const STATS_KIND: &str = "Stats";
const EVENT_KIND: &str = "Event";
const PERSON_KIND: &str = "Person";
const STATS_EVENTS_ID: &str = "eventCount";
const STATS_PEOPLE_ID: &str = "personCount";

#[async_trait]
impl Adaptor for DatastoreAdaptor {
    type Error = DatastoreAdaptorError;

    async fn get_stats(&self) -> Result<Stats, Self::Error> {
        let mut client = self.client.lock().await;

        let event_key = Key::new(STATS_KIND).id(STATS_EVENTS_ID);
        let event_stats: DatastoreStats = client.get(event_key).await?.unwrap_or_default();

        let person_key = Key::new(STATS_KIND).id(STATS_PEOPLE_ID);
        let person_stats: DatastoreStats = client.get(person_key).await?.unwrap_or_default();

        Ok(Stats {
            event_count: event_stats.value,
            person_count: person_stats.value,
        })
    }

    async fn increment_stat_event_count(&self) -> Result<i64, Self::Error> {
        let mut client = self.client.lock().await;

        let key = Key::new(STATS_KIND).id(STATS_EVENTS_ID);
        let mut event_stats: DatastoreStats = client.get(key.clone()).await?.unwrap_or_default();

        event_stats.value += 1;
        client.put((key, event_stats.clone())).await?;
        Ok(event_stats.value)
    }

    async fn increment_stat_person_count(&self) -> Result<i64, Self::Error> {
        let mut client = self.client.lock().await;

        let key = Key::new(STATS_KIND).id(STATS_PEOPLE_ID);
        let mut person_stats: DatastoreStats = client.get(key.clone()).await?.unwrap_or_default();

        person_stats.value += 1;
        client.put((key, person_stats.clone())).await?;
        Ok(person_stats.value)
    }

    async fn get_people(&self, event_id: String) -> Result<Option<Vec<Person>>, Self::Error> {
        let mut client = self.client.lock().await;

        // Check the event exists
        if client
            .get::<DatastoreEvent, _>(Key::new(EVENT_KIND).id(event_id.clone()))
            .await?
            .is_none()
        {
            return Ok(None);
        }

        Ok(Some(
            client
                .query(
                    Query::new(PERSON_KIND)
                        .filter(Filter::Equal("eventId".into(), event_id.into_value())),
                )
                .await?
                .into_iter()
                .filter_map(|entity| {
                    DatastorePerson::from_value(entity.properties().clone())
                        .ok()
                        .map(|ds_person| ds_person.into())
                })
                .collect(),
        ))
    }

    async fn upsert_person(
        &self,
        event_id: String,
        person: Person,
    ) -> Result<Option<Person>, Self::Error> {
        let mut client = self.client.lock().await;

        // Check the event exists
        if client
            .get::<DatastoreEvent, _>(Key::new(EVENT_KIND).id(event_id.clone()))
            .await?
            .is_none()
        {
            return Ok(None);
        }

        // Check if person exists
        let existing_person = client
            .query(
                Query::new(PERSON_KIND)
                    .filter(Filter::Equal(
                        "eventId".into(),
                        event_id.clone().into_value(),
                    ))
                    .filter(Filter::Equal(
                        "name".into(),
                        person.name.clone().into_value(),
                    )),
            )
            .await?;

        let mut key = Key::new(PERSON_KIND);
        if let Some(entity) = existing_person.first() {
            key = entity.key().clone();
        }

        client
            .put((key, DatastorePerson::from_person(person.clone(), event_id)))
            .await?;

        Ok(Some(person))
    }

    async fn delete_person(&self, event_id: String, name: String) -> Result<bool, Self::Error> {
        let mut client = self.client.lock().await;
        let people = client
            .query(
                Query::new(PERSON_KIND)
                    .filter(Filter::Equal("eventId".into(), event_id.into_value()))
                    .filter(Filter::Equal("name".into(), name.into_value())),
            )
            .await?;
        if people.is_empty() {
            return Ok(false);
        }
        client
            .delete_all(people.iter().map(|person| person.key()))
            .await?;
        Ok(true)
    }

    async fn get_event(&self, id: String) -> Result<Option<Event>, Self::Error> {
        let mut client = self.client.lock().await;

        let key = Key::new(EVENT_KIND).id(id.clone());
        let existing_event = client.get::<DatastoreEvent, _>(key.clone()).await?;

        // A failed visit update must not discard a successfully read poll.
        if let Some(mut event) = existing_event.clone() {
            event.visited = Utc::now().timestamp();
            if let Err(error) = client.put((key, event)).await {
                tracing::warn!(%error, "Could not record poll visit");
            }
        }

        Ok(existing_event.map(|e| e.to_event(id)))
    }

    async fn create_event(&self, event: Event) -> Result<Event, Self::Error> {
        let mut client = self.client.lock().await;

        let key = Key::new(EVENT_KIND).id(event.id.clone());

        let ds_event: DatastoreEvent = event.clone().into();
        client.put((key, ds_event)).await?;

        Ok(event)
    }

    async fn list_events(&self) -> Result<Vec<Event>, Self::Error> {
        let mut client = self.client.lock().await;
        let entities = client.query(Query::new(EVENT_KIND)).await?;
        let mut events = Vec::new();
        for entity in entities {
            if let KeyID::StringID(id) = entity.key().get_id() {
                let event = DatastoreEvent::from_value(entity.properties().clone())?;
                events.push(event.to_event(id.clone()));
            }
        }
        Ok(events)
    }

    async fn update_event(
        &self,
        id: String,
        name: String,
        times: Option<Vec<String>>,
        groups: Option<Vec<EventGroup>>,
    ) -> Result<Option<Event>, Self::Error> {
        let mut client = self.client.lock().await;
        let key = Key::new(EVENT_KIND).id(id.clone());
        let Some(mut event) = client.get::<DatastoreEvent, _>(key.clone()).await? else {
            return Ok(None);
        };
        event.name = name;
        if let Some(times) = times {
            event.times = times;
        }
        if let Some(groups) = groups {
            event.groups = groups.into_iter().map(DatastoreGroup::from).collect();
        }
        let updated = event.to_event(id);
        client.put((key, event)).await?;
        Ok(Some(updated))
    }

    async fn delete_event(&self, id: String) -> Result<bool, Self::Error> {
        let mut client = self.client.lock().await;
        let key = Key::new(EVENT_KIND).id(id.clone());
        if client
            .get::<DatastoreEvent, _>(key.clone())
            .await?
            .is_none()
        {
            return Ok(false);
        }

        let people = client
            .query(Query::new(PERSON_KIND).filter(Filter::Equal("eventId".into(), id.into_value())))
            .await?;
        // Keep the event addressable until all participant deletions succeed, so
        // a failed batch can be retried. Datastore limits each commit to 500 keys.
        for batch in people.chunks(500) {
            client
                .delete_all(batch.iter().map(|entity| entity.key()))
                .await?;
        }
        client.delete(&key).await?;
        Ok(true)
    }

    async fn delete_events(&self, cutoff: DateTime<Utc>) -> Result<Stats, Self::Error> {
        let mut client = self.client.lock().await;

        let mut keys_to_delete: Vec<Key> = client
            .query(Query::new(EVENT_KIND).filter(Filter::LesserThan(
                "visited".into(),
                cutoff.timestamp().into_value(),
            )))
            .await?
            .iter()
            .map(|entity| entity.key().clone())
            .collect();

        let event_count = keys_to_delete.len() as i64;

        let events_to_delete = keys_to_delete.clone();
        for e in events_to_delete.iter() {
            if let KeyID::StringID(id) = e.get_id() {
                let mut event_people_to_delete: Vec<Key> = client
                    .query(
                        Query::new(PERSON_KIND)
                            .filter(Filter::Equal("eventId".into(), id.clone().into_value())),
                    )
                    .await?
                    .iter()
                    .map(|entity| entity.key().clone())
                    .collect();
                keys_to_delete.append(&mut event_people_to_delete);
            }
        }

        let person_count = keys_to_delete.len() as i64 - event_count;

        client.delete_all(keys_to_delete).await?;

        Ok(Stats {
            event_count,
            person_count,
        })
    }
}

impl DatastoreAdaptor {
    pub async fn new() -> Self {
        // Load credentials
        let credentials: ApplicationCredentials = serde_json::from_str(
            &env::var("GCP_CREDENTIALS").expect("Expected GCP_CREDENTIALS environment variable"),
        )
        .expect("GCP_CREDENTIALS environment variable is not valid JSON");

        // Connect to datastore
        let client = Client::from_credentials(credentials.project_id.clone(), credentials.clone())
            .await
            .expect("Failed to setup datastore client");
        let client = Mutex::new(client);

        println!(
            "🎛️  Connected to datastore in project {}",
            credentials.project_id
        );

        Self { client }
    }
}

#[derive(FromValue, IntoValue, Default, Clone)]
struct DatastoreStats {
    value: i64,
}

#[derive(IntoValue, Clone)]
struct DatastoreEvent {
    name: String,
    created: i64,
    visited: i64,
    times: Vec<String>,
    timezone: String,
    #[datastore(rename = "slot_size")]
    slot_size: Option<String>,
    groups: Vec<DatastoreGroup>,
}

#[derive(Clone, FromValue, IntoValue)]
struct DatastoreGroup {
    id: String,
    name: String,
}

impl From<EventGroup> for DatastoreGroup {
    fn from(EventGroup { id, name }: EventGroup) -> Self {
        Self { id, name }
    }
}

fn optional_value<T: FromValue>(value: Option<Value>) -> Result<Option<T>, ConvertError> {
    match value {
        None | Some(Value::OptionValue(None)) => Ok(None),
        Some(Value::OptionValue(Some(value))) => T::from_value(*value).map(Some),
        Some(value) => T::from_value(value).map(Some),
    }
}

impl FromValue for DatastoreEvent {
    fn from_value(value: Value) -> Result<Self, ConvertError> {
        let Value::EntityValue(mut properties) = value else {
            return Err(ConvertError::UnexpectedPropertyType {
                expected: "entity".into(),
                got: value.type_name().into(),
            });
        };
        // The SDK's generated decoder requires every property, even Option fields.
        let slot_size = optional_value(properties.remove("slot_size"))?;
        let groups = properties
            .remove("groups")
            .map(Vec::from_value)
            .transpose()?;
        let mut required = |name: &str| {
            properties
                .remove(name)
                .ok_or_else(|| ConvertError::MissingProperty(name.into()))
        };
        Ok(Self {
            name: String::from_value(required("name")?)?,
            created: i64::from_value(required("created")?)?,
            visited: i64::from_value(required("visited")?)?,
            times: Vec::from_value(required("times")?)?,
            timezone: String::from_value(required("timezone")?)?,
            slot_size,
            groups: groups.unwrap_or_default(),
        })
    }
}

#[derive(IntoValue)]
#[allow(non_snake_case)]
struct DatastorePerson {
    name: String,
    password: Option<String>,
    created: i64,
    eventId: String,
    availability: Vec<String>,
    tentative: Vec<String>,
    #[datastore(rename = "group_id")]
    group_id: Option<String>,
    #[datastore(rename = "shared_email")]
    shared_email: Option<String>,
    #[datastore(rename = "submitted_at")]
    submitted_at: Option<i64>,
}

impl FromValue for DatastorePerson {
    fn from_value(value: Value) -> Result<Self, ConvertError> {
        let Value::EntityValue(mut properties) = value else {
            return Err(ConvertError::UnexpectedPropertyType {
                expected: "entity".into(),
                got: value.type_name().into(),
            });
        };
        let tentative = properties
            .remove("tentative")
            .map(Vec::from_value)
            .transpose()?;
        let password = optional_value(properties.remove("password"))?;
        let group_id = optional_value(properties.remove("group_id"))?;
        let shared_email = optional_value(properties.remove("shared_email"))?;
        let submitted_at = optional_value(properties.remove("submitted_at"))?;
        let mut required = |name: &str| {
            properties
                .remove(name)
                .ok_or_else(|| ConvertError::MissingProperty(name.into()))
        };
        Ok(Self {
            name: String::from_value(required("name")?)?,
            password,
            created: i64::from_value(required("created")?)?,
            eventId: String::from_value(required("eventId")?)?,
            availability: Vec::from_value(required("availability")?)?,
            tentative: tentative.unwrap_or_default(),
            group_id,
            shared_email,
            submitted_at,
        })
    }
}

impl From<DatastorePerson> for Person {
    fn from(value: DatastorePerson) -> Self {
        Self {
            name: value.name,
            password_hash: value.password,
            created_at: unix_to_date(value.created),
            availability: value.availability,
            tentative: value.tentative,
            group_id: value.group_id,
            shared_email: value.shared_email,
            submitted_at: value.submitted_at,
        }
    }
}

impl DatastorePerson {
    fn from_person(person: Person, event_id: String) -> Self {
        Self {
            name: person.name,
            password: person.password_hash,
            created: person.created_at.timestamp(),
            eventId: event_id,
            availability: person.availability,
            tentative: person.tentative,
            group_id: person.group_id,
            shared_email: person.shared_email,
            submitted_at: person.submitted_at,
        }
    }
}

impl From<Event> for DatastoreEvent {
    fn from(value: Event) -> Self {
        Self {
            name: value.name,
            created: value.created_at.timestamp(),
            visited: value.visited_at.timestamp(),
            times: value.times,
            timezone: value.timezone,
            slot_size: value.slot_size.map(|size| size.as_str().to_owned()),
            groups: value.groups.into_iter().map(DatastoreGroup::from).collect(),
        }
    }
}

impl DatastoreEvent {
    fn to_event(&self, event_id: String) -> Event {
        Event {
            id: event_id,
            name: self.name.clone(),
            created_at: unix_to_date(self.created),
            visited_at: unix_to_date(self.visited),
            times: self.times.clone(),
            timezone: self.timezone.clone(),
            slot_size: self.slot_size.as_deref().and_then(|size| size.parse().ok()),
            groups: self
                .groups
                .iter()
                .map(|group| EventGroup {
                    id: group.id.clone(),
                    name: group.name.clone(),
                })
                .collect(),
        }
    }
}

fn unix_to_date(unix: i64) -> DateTime<Utc> {
    DateTime::from_utc(NaiveDateTime::from_timestamp_opt(unix, 0).unwrap(), Utc)
}

#[derive(Debug)]
pub enum DatastoreAdaptorError {
    DatastoreError(google_cloud::error::Error),
}

impl Display for DatastoreAdaptorError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DatastoreAdaptorError::DatastoreError(e) => write!(f, "Datastore Error: {}", e),
        }
    }
}

impl Error for DatastoreAdaptorError {}

impl From<google_cloud::error::Error> for DatastoreAdaptorError {
    fn from(value: google_cloud::error::Error) -> Self {
        Self::DatastoreError(value)
    }
}

impl From<google_cloud::error::ConvertError> for DatastoreAdaptorError {
    fn from(value: google_cloud::error::ConvertError) -> Self {
        Self::DatastoreError(google_cloud::error::Error::Convert(value))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use common::SlotSize;

    #[test]
    fn reads_responses_written_before_tentative_availability_existed() {
        let record = DatastorePerson {
            name: "Ada".into(),
            password: Some("saved-hash".into()),
            created: 1,
            eventId: "legacy-poll".into(),
            availability: vec!["0900-4".into()],
            tentative: vec!["0915-4".into()],
            group_id: Some("group-id".into()),
            shared_email: Some("ada@example.org".into()),
            submitted_at: Some(10),
        };
        let Value::EntityValue(mut properties) = record.into_value() else {
            panic!("expected person properties");
        };
        let saved = DatastorePerson::from_value(Value::EntityValue(properties.clone())).unwrap();
        assert_eq!(saved.tentative, ["0915-4"]);
        assert_eq!(saved.password.as_deref(), Some("saved-hash"));
        assert_eq!(saved.group_id.as_deref(), Some("group-id"));
        assert_eq!(saved.shared_email.as_deref(), Some("ada@example.org"));
        assert_eq!(saved.submitted_at, Some(10));

        properties.remove("tentative");
        properties.remove("group_id");
        properties.remove("shared_email");
        properties.remove("submitted_at");
        let legacy = DatastorePerson::from_value(Value::EntityValue(properties)).unwrap();
        assert!(legacy.tentative.is_empty());
        assert_eq!(legacy.availability, ["0900-4"]);
        assert_eq!(legacy.password.as_deref(), Some("saved-hash"));
        assert!(legacy.group_id.is_none());
        assert!(legacy.shared_email.is_none());
        assert!(legacy.submitted_at.is_none());
    }

    #[test]
    fn reads_events_written_before_slot_size_existed() {
        let record = DatastoreEvent {
            name: "Legacy poll".into(),
            created: 1,
            visited: 2,
            times: vec!["0915-4".into()],
            timezone: "UTC".into(),
            slot_size: Some("half_hour".into()),
            groups: vec![DatastoreGroup {
                id: "test-group".into(),
                name: "Test group".into(),
            }],
        };
        let Value::EntityValue(mut properties) = record.into_value() else {
            panic!("expected event properties");
        };

        let event = DatastoreEvent::from_value(Value::EntityValue(properties.clone()))
            .unwrap()
            .to_event("poll".into());
        assert_eq!(event.slot_size, Some(SlotSize::HalfHour));
        assert_eq!(event.groups.first().unwrap().name, "Test group");

        properties.insert("slot_size".into(), "hour".into_value());
        let event = DatastoreEvent::from_value(Value::EntityValue(properties.clone()))
            .unwrap()
            .to_event("poll".into());
        assert_eq!(event.slot_size, Some(SlotSize::Hour));

        properties.remove("slot_size");
        properties.remove("groups");
        let event = DatastoreEvent::from_value(Value::EntityValue(properties))
            .unwrap()
            .to_event("poll".into());
        assert_eq!(event.slot_size, None);
        assert_eq!(event.times, ["0915-4"]);
        assert!(event.groups.is_empty());
    }
}
