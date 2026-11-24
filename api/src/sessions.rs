use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::{rngs::OsRng, Rng};

pub const ADMIN_TTL: Duration = Duration::from_secs(8 * 60 * 60);
pub const PARTICIPANT_TTL: Duration = Duration::from_secs(60 * 60);

#[derive(PartialEq, Eq)]
pub enum Session {
    Admin,
    Participant { event: String, name: String },
}

#[derive(Default)]
pub struct Sessions {
    entries: HashMap<String, (Session, Instant)>,
}

impl Sessions {
    pub fn issue(&mut self, session: Session, ttl: Duration) -> Option<String> {
        let now = Instant::now();
        self.entries.retain(|_, (_, expires)| *expires > now);
        if self.entries.len() >= 10_000 {
            return None;
        }
        let token = URL_SAFE_NO_PAD.encode(OsRng.gen::<[u8; 32]>());
        self.entries.insert(token.clone(), (session, now + ttl));
        Some(token)
    }

    pub fn get(&self, token: &str) -> Option<&Session> {
        self.entries
            .get(token)
            .filter(|(_, expires)| *expires > Instant::now())
            .map(|(session, _)| session)
    }

    pub fn revoke(&mut self, token: &str) {
        self.entries.remove(token);
    }
}

pub struct AdminPin {
    pin: Option<String>,
    attempts: u8,
    resets_at: Instant,
}

impl AdminPin {
    pub fn new(pin: Option<String>) -> Self {
        if let Some(pin) = &pin {
            assert!(
                pin.len() == 4 && pin.bytes().all(|byte| byte.is_ascii_digit()),
                "ADMIN_PIN must be four digits"
            );
        }
        Self {
            pin,
            attempts: 0,
            resets_at: Instant::now(),
        }
    }

    pub fn verify(&mut self, guess: &str) -> Result<(), axum::http::StatusCode> {
        use axum::http::StatusCode;

        let now = Instant::now();
        if self.resets_at <= now {
            self.attempts = 0;
            self.resets_at = now + Duration::from_secs(15 * 60);
        }
        if self.attempts >= 5 {
            return Err(StatusCode::TOO_MANY_REQUESTS);
        }
        if self.pin.as_deref() == Some(guess) {
            self.attempts = 0;
            self.resets_at = now;
            return Ok(());
        }
        self.attempts += 1;
        Err(StatusCode::UNAUTHORIZED)
    }
}
