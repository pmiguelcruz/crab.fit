CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY,
    event_id TEXT NOT NULL,
    email TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('change', 'responses', 'quorum')),
    threshold INTEGER NOT NULL,
    confirmation_hash BLOB,
    unsubscribe_token TEXT NOT NULL UNIQUE,
    requested_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 0,
    triggered INTEGER NOT NULL DEFAULT 0,
    UNIQUE (event_id, email)
);
CREATE INDEX IF NOT EXISTS subscription_requested_at ON subscriptions (requested_at);
CREATE TABLE IF NOT EXISTS outbox (
    id TEXT PRIMARY KEY,
    subscription_id INTEGER NOT NULL REFERENCES subscriptions (id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    available_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    UNIQUE (subscription_id, kind)
);
CREATE INDEX IF NOT EXISTS outbox_available_at ON outbox (available_at);
