use std::{env, error::Error, str::FromStr, sync::Arc, time::Duration};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::Utc;
use lettre::{
    message::{header::ContentType, Mailbox},
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};
use rand::{rngs::OsRng, Rng};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use sqlx::{Sqlite, SqlitePool, Transaction};
use url::Url;

const VERIFICATION_EXPIRY: i64 = 24 * 60 * 60;
const MAILBOX_COOLDOWN: i64 = 15 * 60;
const MAX_VERIFICATIONS_PER_HOUR: i64 = 100;

#[derive(Deserialize)]
#[serde(tag = "mode", rename_all = "snake_case")]
pub enum Trigger {
    Change,
    Responses { count: u16 },
    Quorum { count: u16 },
}

impl Trigger {
    pub fn valid(&self) -> bool {
        match self {
            Self::Change => true,
            Self::Responses { count } | Self::Quorum { count } => *count > 0,
        }
    }

    fn stored(&self) -> (&'static str, i64) {
        match self {
            Self::Change => ("change", 0),
            Self::Responses { count } => ("responses", i64::from(*count)),
            Self::Quorum { count } => ("quorum", i64::from(*count)),
        }
    }
}

pub struct VoteProgress {
    pub responses: usize,
    pub quorum: usize,
    pub changed: bool,
}

pub struct Notifications {
    db: SqlitePool,
    smtp: AsyncSmtpTransport<Tokio1Executor>,
    sender: Mailbox,
    frontend: Url,
}

impl Notifications {
    pub async fn from_env(
        frontend: &str,
    ) -> Result<Option<Arc<Self>>, Box<dyn Error + Send + Sync>> {
        let Some(relay) = env::var("NOTIFICATION_SMTP_URL")
            .ok()
            .filter(|value| !value.is_empty())
        else {
            return Ok(None);
        };
        let smtp = AsyncSmtpTransport::<Tokio1Executor>::from_url(&relay)
            .map_err(|_| "Invalid NOTIFICATION_SMTP_URL")?
            .timeout(Some(Duration::from_secs(15)))
            .build();
        let sender = Mailbox::from_str(&env::var("NOTIFICATION_FROM")?)
            .map_err(|_| "Invalid NOTIFICATION_FROM")?;
        let frontend = Url::parse(frontend)?;
        if !matches!(frontend.scheme(), "http" | "https")
            || frontend.path() != "/"
            || frontend.query().is_some()
            || frontend.fragment().is_some()
            || !frontend.username().is_empty()
            || frontend.password().is_some()
        {
            return Err("FRONTEND_URL must be a frontend origin for vote notifications".into());
        }

        let db = crate::local_database::open(
            &env::var("NOTIFICATION_DB")?,
            include_str!("notifications.sql"),
        )
        .await?;
        Ok(Some(Arc::new(Self {
            db,
            smtp,
            sender,
            frontend,
        })))
    }

    pub async fn subscribe(
        &self,
        event: &str,
        email: &str,
        trigger: Trigger,
    ) -> Result<(), sqlx::Error> {
        let now = Utc::now().timestamp();
        let mut tx = self.db.begin().await?;
        sqlx::query("DELETE FROM subscriptions WHERE active = 0 AND expires_at < ?")
            .bind(now)
            .execute(&mut *tx)
            .await?;

        let (recent, mailbox_recent): (i64, i64) = sqlx::query_as(
            "SELECT COUNT(*), COALESCE(SUM(lower(email) = lower(?) AND requested_at > ?), 0)
             FROM subscriptions WHERE requested_at > ?",
        )
        .bind(email)
        .bind(now - MAILBOX_COOLDOWN)
        .bind(now - 3600)
        .fetch_one(&mut *tx)
        .await?;
        if recent >= MAX_VERIFICATIONS_PER_HOUR || mailbox_recent > 0 {
            return Ok(());
        }

        let confirmation = random_token();
        let unsubscribe = random_token();
        let (mode, threshold) = trigger.stored();
        let subscription: Option<(i64,)> = sqlx::query_as(
            "INSERT INTO subscriptions
                (event_id, email, mode, threshold, confirmation_hash, unsubscribe_token, requested_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(event_id, email) DO UPDATE SET
                mode = excluded.mode,
                threshold = excluded.threshold,
                confirmation_hash = excluded.confirmation_hash,
                unsubscribe_token = excluded.unsubscribe_token,
                requested_at = excluded.requested_at,
                expires_at = excluded.expires_at
             WHERE subscriptions.active = 0
             RETURNING id",
        )
            .bind(event).bind(email).bind(mode).bind(threshold)
            .bind(token_digest(&confirmation)).bind(&unsubscribe).bind(now).bind(now + VERIFICATION_EXPIRY)
            .fetch_optional(&mut *tx).await?;
        if let Some((id,)) = subscription {
            let confirm_url = self.link(event, "confirm-notifications", &confirmation);
            let unsubscribe_url = self.link(event, "unsubscribe-notifications", &unsubscribe);
            enqueue(&mut tx, id, "confirmation", "Confirm Crab Fit vote notifications", &format!(
                "Confirm that you want vote notifications for this poll:\n\n{confirm_url}\n\nTo cancel this request, open:\n{unsubscribe_url}"
            ), now).await?;
        }
        tx.commit().await
    }

    pub async fn confirm(&self, event: &str, token: &str) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE subscriptions
             SET active = 1, confirmation_hash = NULL
             WHERE event_id = ? AND confirmation_hash = ? AND expires_at >= ? AND active = 0",
        )
        .bind(event)
        .bind(token_digest(token))
        .bind(Utc::now().timestamp())
        .execute(&self.db)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn unsubscribe(&self, event: &str, token: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM subscriptions WHERE event_id = ? AND unsubscribe_token = ?")
            .bind(event)
            .bind(token)
            .execute(&self.db)
            .await?;
        Ok(())
    }

    pub async fn remove_event(&self, event: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM subscriptions WHERE event_id = ?")
            .bind(event)
            .execute(&self.db)
            .await?;
        Ok(())
    }

    pub async fn record_vote(
        &self,
        event: &str,
        title: &str,
        progress: VoteProgress,
    ) -> Result<(), sqlx::Error> {
        if !progress.changed {
            return Ok(());
        }
        let mut tx = self.db.begin().await?;
        let subscriptions: Vec<(i64, String, String)> = sqlx::query_as(
            "SELECT id, mode, unsubscribe_token FROM subscriptions
             WHERE event_id = ? AND active = 1 AND
                (mode = 'change' OR (triggered = 0 AND
                    ((mode = 'responses' AND threshold <= ?) OR (mode = 'quorum' AND threshold <= ?))))",
        )
            .bind(event).bind(progress.responses as i64).bind(progress.quorum as i64)
            .fetch_all(&mut *tx).await?;

        let now = Utc::now().timestamp();
        let poll_url = self.link(event, "", "");
        for (id, mode, token) in subscriptions {
            let unsubscribe_url = self.link(event, "unsubscribe-notifications", &token);
            let update = match mode.as_str() {
                "responses" => format!(
                    "The poll reached your response target. {} people have responded.",
                    progress.responses
                ),
                "quorum" => format!(
                    "The poll reached your availability target. A choice has {} people available.",
                    progress.quorum
                ),
                _ => "Someone submitted or updated their availability.".to_owned(),
            };
            let body = format!(
                "{update}\n\n{title}\n{poll_url}\n\nStop these notifications:\n{unsubscribe_url}"
            );
            enqueue(
                &mut tx,
                id,
                "vote",
                "Crab Fit availability update",
                &body,
                now,
            )
            .await?;
            if mode != "change" {
                sqlx::query("UPDATE subscriptions SET triggered = 1 WHERE id = ?")
                    .bind(id)
                    .execute(&mut *tx)
                    .await?;
            }
        }
        tx.commit().await
    }

    pub async fn run(self: Arc<Self>) {
        let mut timer = tokio::time::interval(Duration::from_secs(3));
        loop {
            timer.tick().await;
            if let Err(error) = self.deliver_due().await {
                tracing::warn!(%error, "Could not process Crab Fit mail queue");
            }
        }
    }

    async fn deliver_due(&self) -> Result<(), sqlx::Error> {
        let now = Utc::now().timestamp();
        sqlx::query("DELETE FROM subscriptions WHERE active = 0 AND expires_at < ?")
            .bind(now)
            .execute(&self.db)
            .await?;
        for _ in 0..8 {
            let next: Option<(String, String, String, String, i64)> = sqlx::query_as(
                "SELECT o.id, s.email, o.subject, o.body, o.attempts
                 FROM outbox o JOIN subscriptions s ON s.id = o.subscription_id
                 WHERE o.available_at <= ? ORDER BY o.available_at LIMIT 1",
            )
            .bind(now)
            .fetch_optional(&self.db)
            .await?;
            let Some((id, email, subject, body, attempts)) = next else {
                break;
            };
            let result = self.deliver(&id, &email, subject, body).await;
            if result.is_ok() || attempts >= 5 {
                if result.is_err() {
                    tracing::warn!(mail_id = id, "Abandoning Crab Fit email after retries");
                }
                sqlx::query("DELETE FROM outbox WHERE id = ?")
                    .bind(id)
                    .execute(&self.db)
                    .await?;
            } else {
                let retry_at = Utc::now().timestamp() + (15_i64 << attempts);
                sqlx::query(
                    "UPDATE outbox SET attempts = attempts + 1, available_at = ? WHERE id = ?",
                )
                .bind(retry_at)
                .bind(id)
                .execute(&self.db)
                .await?;
            }
        }
        Ok(())
    }

    async fn deliver(
        &self,
        id: &str,
        email: &str,
        subject: String,
        body: String,
    ) -> Result<(), ()> {
        let recipient = email.parse::<lettre::Address>().map_err(|_| ())?;
        let message = Message::builder()
            .from(self.sender.clone())
            .to(Mailbox::new(None, recipient))
            .subject(subject)
            .message_id(Some(format!(
                "<crabfit-{id}@{}>",
                self.sender.email.domain()
            )))
            .header(ContentType::TEXT_PLAIN)
            .body(body)
            .map_err(|_| ())?;
        self.smtp.send(message).await.map_err(|_| ())?;
        Ok(())
    }

    fn link(&self, event: &str, action: &str, token: &str) -> Url {
        let mut url = self.frontend.clone();
        url.path_segments_mut()
            .expect("a frontend origin has path segments")
            .push(event);
        if !action.is_empty() {
            url.set_fragment(Some(&format!("{action}={token}")));
        }
        url
    }
}

async fn enqueue(
    tx: &mut Transaction<'_, Sqlite>,
    subscription: i64,
    kind: &str,
    subject: &str,
    body: &str,
    now: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO outbox (id, subscription_id, kind, subject, body, available_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(subscription_id, kind) DO UPDATE SET
            id = excluded.id, body = excluded.body, available_at = excluded.available_at, attempts = 0
         WHERE excluded.kind = 'confirmation'",
    )
        .bind(random_token()).bind(subscription).bind(kind).bind(subject).bind(body).bind(now)
        .execute(&mut **tx).await?;
    Ok(())
}

fn random_token() -> String {
    URL_SAFE_NO_PAD.encode(OsRng.gen::<[u8; 32]>())
}

fn token_digest(value: &str) -> Vec<u8> {
    Sha256::digest(value.as_bytes()).to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    #[tokio::test]
    async fn confirmation_is_scoped_to_the_poll_and_thresholds_send_once() {
        let db = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::query(include_str!("notifications.sql"))
            .execute(&db)
            .await
            .unwrap();
        let service = Notifications {
            db,
            smtp: AsyncSmtpTransport::<Tokio1Executor>::unencrypted_localhost(),
            sender: "crabfit@example.org".parse().unwrap(),
            frontend: Url::parse("http://localhost:1234").unwrap(),
        };
        let address = "participant@example.org";
        for event in ["poll-one", "poll-two"] {
            service
                .subscribe(event, address, Trigger::Quorum { count: 2 })
                .await
                .unwrap();
        }
        let (body,): (String,) =
            sqlx::query_as("SELECT body FROM outbox WHERE kind = 'confirmation'")
                .fetch_one(&service.db)
                .await
                .unwrap();
        let (subscribers,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM subscriptions")
            .fetch_one(&service.db)
            .await
            .unwrap();
        assert_eq!(subscribers, 1);
        let token = body
            .split("#confirm-notifications=")
            .nth(1)
            .unwrap()
            .lines()
            .next()
            .unwrap();
        let vote = || VoteProgress {
            responses: 3,
            quorum: 2,
            changed: true,
        };
        service
            .record_vote("poll-one", "One", vote())
            .await
            .unwrap();
        assert_eq!(queued_vote_count(&service.db).await, 0);
        assert!(!service.confirm("poll-two", token).await.unwrap());
        assert!(service.confirm("poll-one", token).await.unwrap());
        assert!(!service.confirm("poll-one", token).await.unwrap());
        service
            .record_vote("poll-one", "One", vote())
            .await
            .unwrap();
        assert_eq!(queued_vote_count(&service.db).await, 1);
        sqlx::query("DELETE FROM outbox WHERE kind = 'vote'")
            .execute(&service.db)
            .await
            .unwrap();
        service
            .record_vote("poll-one", "One", vote())
            .await
            .unwrap();
        assert_eq!(queued_vote_count(&service.db).await, 0);
    }

    async fn queued_vote_count(db: &SqlitePool) -> i64 {
        sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM outbox WHERE kind = 'vote'")
            .fetch_one(db)
            .await
            .unwrap()
            .0
    }
}
