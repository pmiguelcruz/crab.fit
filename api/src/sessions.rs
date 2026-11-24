use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::{rngs::OsRng, Rng};
use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM};

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

    pub fn revoke_participant(&mut self, event_id: &str, person_name: Option<&str>) {
        self.entries.retain(|_, (session, _)| match session {
            Session::Admin => true,
            Session::Participant { event, name } => {
                event != event_id || person_name.is_some_and(|person| name != person)
            }
        });
    }

    pub fn revoke(&mut self, token: &str) {
        self.entries.remove(token);
    }
}

pub struct AdminPin {
    pin: Option<[u8; 4]>,
    attempts: u8,
    resets_at: Instant,
}

impl AdminPin {
    pub fn load(key: Option<&str>) -> Result<Self, &'static str> {
        let pin = if let Some(key) = key {
            let key = URL_SAFE_NO_PAD
                .decode(key)
                .map_err(|_| "Invalid ADMIN_PIN_KEY encoding")?;
            let key = UnboundKey::new(&AES_256_GCM, &key)
                .map_err(|_| "ADMIN_PIN_KEY must decode to 32 bytes")?;
            let mut sealed = URL_SAFE_NO_PAD
                .decode(include_str!("admin_pin.sealed").trim())
                .map_err(|_| "Invalid encrypted admin PIN encoding")?;
            let nonce = Nonce::try_assume_unique_for_key(
                sealed.get(..12).ok_or("Missing admin PIN nonce")?,
            )
            .map_err(|_| "Invalid admin PIN nonce")?;
            let plaintext = LessSafeKey::new(key)
                .open_in_place(
                    nonce,
                    Aad::from(b"crab-fit:admin-pin:v1"),
                    &mut sealed[12..],
                )
                .map_err(|_| "Could not decrypt admin PIN")?;
            let pin: [u8; 4] = (&*plaintext)
                .try_into()
                .map_err(|_| "Invalid admin PIN length")?;
            if !pin.iter().all(u8::is_ascii_digit) {
                return Err("Invalid admin PIN");
            }
            Some(pin)
        } else {
            None
        };
        Ok(Self::new(pin))
    }

    fn new(pin: Option<[u8; 4]>) -> Self {
        Self {
            pin,
            attempts: 0,
            resets_at: Instant::now(),
        }
    }

    pub fn verify(&mut self, guess: &str) -> Result<(), axum::http::StatusCode> {
        use axum::http::StatusCode;

        let pin = self.pin.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
        let now = Instant::now();
        if self.resets_at <= now {
            self.attempts = 0;
            self.resets_at = now + Duration::from_secs(15 * 60);
        }
        if self.attempts >= 5 {
            return Err(StatusCode::TOO_MANY_REQUESTS);
        }
        if ring::constant_time::verify_slices_are_equal(pin, guess.as_bytes()).is_ok() {
            self.attempts = 0;
            self.resets_at = now;
            return Ok(());
        }
        self.attempts += 1;
        Err(StatusCode::UNAUTHORIZED)
    }
}

#[cfg(test)]
mod tests {
    use axum::http::StatusCode;

    use super::*;

    #[test]
    fn admin_pin_locks_after_five_bad_guesses() {
        let mut pin = AdminPin::new(Some(*b"7315"));
        assert!(pin.verify("7315").is_ok());
        for _ in 0..5 {
            assert_eq!(pin.verify("4620"), Err(StatusCode::UNAUTHORIZED));
        }
        assert_eq!(pin.verify("7315"), Err(StatusCode::TOO_MANY_REQUESTS));
        let mut unset = AdminPin::new(None);
        assert_eq!(unset.verify("7315"), Err(StatusCode::SERVICE_UNAVAILABLE));
    }

    #[test]
    fn participant_removal_revokes_only_matching_sessions() {
        let mut sessions = Sessions::default();
        let issued = |sessions: &mut Sessions, event: &str, name: &str| {
            sessions
                .issue(
                    Session::Participant {
                        event: event.into(),
                        name: name.into(),
                    },
                    PARTICIPANT_TTL,
                )
                .unwrap()
        };
        let target = issued(&mut sessions, "event-a", "participant");
        let other_person = issued(&mut sessions, "event-a", "another");
        let other_event = issued(&mut sessions, "event-b", "participant");
        let admin = sessions.issue(Session::Admin, ADMIN_TTL).unwrap();
        sessions.revoke_participant("event-a", Some("participant"));
        assert!(sessions.get(&target).is_none());
        assert!(sessions.get(&other_person).is_some());
        assert!(sessions.get(&other_event).is_some());

        sessions.revoke_participant("event-a", None);
        assert!(sessions.get(&other_person).is_none());
        assert!(sessions.get(&other_event).is_some());
        assert!(sessions.get(&admin) == Some(&Session::Admin));
    }
}
