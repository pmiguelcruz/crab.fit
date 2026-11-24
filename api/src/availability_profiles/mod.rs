use std::{
    collections::{HashMap, HashSet},
    env,
    error::Error,
    sync::Arc,
};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use common::{Event, Person};
use schedule::{choices, Choices, Preferences, Span};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use sqlx::{sqlite::SqliteRow, Row, SqliteConnection, SqlitePool};

mod schedule;

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum ProfileSubmission {
    Create { key: String },
    Link { key: String },
    Unlink { key: String },
}

impl ProfileSubmission {
    pub fn key(&self) -> &str {
        match self {
            Self::Create { key } | Self::Link { key } | Self::Unlink { key } => key,
        }
    }
}

#[derive(Debug)]
pub enum ProfileError {
    Unauthorized,
    InvalidChoice,
    Store(sqlx::Error),
    Data(serde_json::Error),
}

impl From<sqlx::Error> for ProfileError {
    fn from(value: sqlx::Error) -> Self {
        Self::Store(value)
    }
}

impl From<serde_json::Error> for ProfileError {
    fn from(value: serde_json::Error) -> Self {
        Self::Data(value)
    }
}

struct LinkedVote {
    name: String,
    profile_id: Vec<u8>,
    group_id: Option<String>,
    shared_email: Option<String>,
    submitted_at: i64,
}

pub struct AvailabilityProfiles {
    db: SqlitePool,
}

impl AvailabilityProfiles {
    pub async fn from_env() -> Result<Option<Arc<Self>>, Box<dyn Error + Send + Sync>> {
        let Some(path) = env::var("AVAILABILITY_PROFILE_DB")
            .ok()
            .filter(|value| !value.is_empty())
        else {
            return Ok(None);
        };
        let db = crate::local_database::open(&path, include_str!("schema.sql")).await?;
        Ok(Some(Arc::new(Self { db })))
    }

    pub async fn hydrate(
        &self,
        event: &Event,
        slots: &HashSet<String>,
        people: &mut [Person],
    ) -> Result<HashSet<String>, ProfileError> {
        let linked = sqlx::query(
            "SELECT name, profile_id, group_id, shared_email, submitted_at
             FROM linked_votes WHERE event_id = ?",
        )
        .bind(&event.id)
        .try_map(|row: SqliteRow| {
            Ok(LinkedVote {
                name: row.try_get("name")?,
                profile_id: row.try_get("profile_id")?,
                group_id: row.try_get("group_id")?,
                shared_email: row.try_get("shared_email")?,
                submitted_at: row.try_get("submitted_at")?,
            })
        })
        .fetch_all(&self.db)
        .await?;
        if linked.is_empty() {
            return Ok(HashSet::new());
        }

        let choices = choices(slots, event.slot_size);
        let mut by_name = linked
            .into_iter()
            .map(|vote| (vote.name.clone(), vote))
            .collect::<HashMap<_, _>>();
        let mut linked_names = HashSet::new();
        let mut connection = self.db.acquire().await?;
        for person in people {
            let Some(link) = by_name.remove(&person.name) else {
                continue;
            };
            let (availability, tentative) =
                projected(&mut connection, &event.id, &link.profile_id, &choices).await?;
            person.availability = availability;
            person.tentative = tentative;
            person.group_id = link.group_id;
            person.shared_email = link.shared_email;
            person.submitted_at = Some(link.submitted_at);
            linked_names.insert(person.name.clone());
        }
        Ok(linked_names)
    }

    pub async fn preview(
        &self,
        event: &Event,
        slots: &HashSet<String>,
        key: &str,
    ) -> Result<(Vec<String>, Vec<String>), ProfileError> {
        let id = profile_id(key)?;
        let mut connection = self.db.acquire().await?;
        projected(
            &mut connection,
            &event.id,
            &id,
            &choices(slots, event.slot_size),
        )
        .await
    }

    pub async fn save(
        &self,
        event: &Event,
        slots: &HashSet<String>,
        action: ProfileSubmission,
        person: &mut Person,
        submitted_at: i64,
    ) -> Result<(), ProfileError> {
        let id = profile_id(action.key())?;
        let mut tx = self.db.begin().await?;
        authorize_link(&mut tx, &event.id, &person.name, &id).await?;
        if matches!(action, ProfileSubmission::Create { .. }) {
            sqlx::query(
                "INSERT INTO availability_profiles (id, preferences) VALUES (?, ?)
                         ON CONFLICT(id) DO NOTHING",
            )
            .bind(&id)
            .bind(serde_json::to_string(&Preferences::default())?)
            .execute(&mut *tx)
            .await?;
        }
        let (mut preferences, holds) = state(&mut tx, &id, &event.id).await?;
        let choices = choices(slots, event.slot_size);
        preferences.replace_choices(&choices, &person.availability, &person.tentative, &holds);
        sqlx::query("UPDATE availability_profiles SET preferences = ? WHERE id = ?")
            .bind(serde_json::to_string(&preferences)?)
            .bind(&id)
            .execute(&mut *tx)
            .await?;
        sqlx::query(
            "INSERT INTO linked_votes (event_id, name, profile_id, group_id, shared_email, submitted_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(event_id, name) DO UPDATE SET group_id = excluded.group_id,
                 shared_email = excluded.shared_email, submitted_at = excluded.submitted_at",
        )
            .bind(&event.id).bind(&person.name).bind(&id).bind(&person.group_id)
            .bind(&person.shared_email).bind(submitted_at).execute(&mut *tx).await?;
        tx.commit().await?;
        (person.availability, person.tentative) = preferences.project(&choices, &holds);
        Ok(())
    }

    pub async fn verify_link(
        &self,
        event: &str,
        name: &str,
        key: &str,
    ) -> Result<(), ProfileError> {
        let id = profile_id(key)?;
        let mut connection = self.db.acquire().await?;
        if !authorize_link(&mut connection, event, name, &id).await? {
            return Err(ProfileError::Unauthorized);
        }
        Ok(())
    }

    pub async fn unlink(&self, event: &str, name: &str) -> Result<(), ProfileError> {
        sqlx::query("DELETE FROM linked_votes WHERE event_id = ? AND name = ?")
            .bind(event)
            .bind(name)
            .execute(&self.db)
            .await?;
        Ok(())
    }

    pub async fn final_choice(&self, event: &str) -> Result<Option<String>, ProfileError> {
        Ok(
            sqlx::query_scalar("SELECT choice FROM finalized_polls WHERE event_id = ?")
                .bind(event)
                .fetch_optional(&self.db)
                .await?,
        )
    }

    pub async fn set_final_choice(
        &self,
        event: &Event,
        slots: &HashSet<String>,
        selected: Option<&str>,
        people: &[Person],
    ) -> Result<(), ProfileError> {
        let mut tx = self.db.begin().await?;
        sqlx::query("DELETE FROM finalized_polls WHERE event_id = ?")
            .bind(&event.id)
            .execute(&mut *tx)
            .await?;
        if let Some(selected) = selected {
            let choices = choices(slots, event.slot_size);
            let spans = choices.get(selected).ok_or(ProfileError::InvalidChoice)?;
            let confirmed: HashSet<_> = people
                .iter()
                .filter(|person| person.availability.iter().any(|choice| choice == selected))
                .map(|person| &person.name)
                .collect();
            sqlx::query("INSERT INTO finalized_polls (event_id, choice) VALUES (?, ?)")
                .bind(&event.id)
                .bind(selected)
                .execute(&mut *tx)
                .await?;
            let spans = serde_json::to_string(spans)?;
            let linked: Vec<(String, Vec<u8>)> =
                sqlx::query_as("SELECT name, profile_id FROM linked_votes WHERE event_id = ?")
                    .bind(&event.id)
                    .fetch_all(&mut *tx)
                    .await?;
            for (name, id) in linked {
                if confirmed.contains(&name) {
                    sqlx::query(
                        "INSERT INTO profile_holds (event_id, profile_id, spans) VALUES (?, ?, ?)
                                 ON CONFLICT(event_id, profile_id) DO NOTHING",
                    )
                    .bind(&event.id)
                    .bind(id)
                    .bind(&spans)
                    .execute(&mut *tx)
                    .await?;
                }
            }
        }
        tx.commit().await?;
        Ok(())
    }

    pub async fn remove_event(&self, event: &str) -> Result<(), ProfileError> {
        let mut tx = self.db.begin().await?;
        remove_event(&mut tx, event).await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn prune(&self, active: &HashSet<String>) -> Result<(), ProfileError> {
        let mut tx = self.db.begin().await?;
        let events: Vec<String> = sqlx::query_scalar(
            "SELECT event_id FROM linked_votes UNION SELECT event_id FROM finalized_polls",
        )
        .fetch_all(&mut *tx)
        .await?;
        for event in events.iter().filter(|id| !active.contains(*id)) {
            remove_event(&mut tx, event).await?;
        }
        tx.commit().await?;
        Ok(())
    }
}

async fn authorize_link(
    conn: &mut SqliteConnection,
    event: &str,
    name: &str,
    id: &[u8],
) -> Result<bool, ProfileError> {
    let existing: Option<Vec<u8>> =
        sqlx::query_scalar("SELECT profile_id FROM linked_votes WHERE event_id = ? AND name = ?")
            .bind(event)
            .bind(name)
            .fetch_optional(conn)
            .await?;
    match existing {
        Some(existing) if existing != id => Err(ProfileError::Unauthorized),
        Some(_) => Ok(true),
        None => Ok(false),
    }
}

async fn projected(
    conn: &mut SqliteConnection,
    event: &str,
    profile: &[u8],
    choices: &Choices,
) -> Result<(Vec<String>, Vec<String>), ProfileError> {
    let (preferences, holds) = state(conn, profile, event).await?;
    Ok(preferences.project(choices, &holds))
}

async fn state(
    conn: &mut SqliteConnection,
    profile: &[u8],
    current_event: &str,
) -> Result<(Preferences, Vec<Span>), ProfileError> {
    let preferences: String =
        sqlx::query_scalar("SELECT preferences FROM availability_profiles WHERE id = ?")
            .bind(profile)
            .fetch_optional(&mut *conn)
            .await?
            .ok_or(ProfileError::Unauthorized)?;
    let reservations: Vec<String> = sqlx::query_scalar(
        "SELECT spans FROM profile_holds WHERE profile_id = ? AND event_id <> ?",
    )
    .bind(profile)
    .bind(current_event)
    .fetch_all(&mut *conn)
    .await?;
    let mut holds = Vec::new();
    for reservation in reservations {
        holds.extend(serde_json::from_str::<Vec<Span>>(&reservation)?);
    }
    Ok((serde_json::from_str(&preferences)?, holds))
}

fn profile_id(key: &str) -> Result<Vec<u8>, ProfileError> {
    let decoded = URL_SAFE_NO_PAD
        .decode(key)
        .map_err(|_| ProfileError::Unauthorized)?;
    if decoded.len() != 32 {
        return Err(ProfileError::Unauthorized);
    }
    Ok(Sha256::digest(decoded).to_vec())
}

async fn remove_event(conn: &mut SqliteConnection, event: &str) -> Result<(), ProfileError> {
    sqlx::query("DELETE FROM linked_votes WHERE event_id = ?")
        .bind(event)
        .execute(&mut *conn)
        .await?;
    sqlx::query("DELETE FROM finalized_polls WHERE event_id = ?")
        .bind(event)
        .execute(&mut *conn)
        .await?;
    Ok(())
}
