CREATE TABLE IF NOT EXISTS availability_profiles (
    id BLOB PRIMARY KEY NOT NULL,
    preferences TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS linked_votes (
    event_id TEXT NOT NULL,
    name TEXT NOT NULL,
    profile_id BLOB NOT NULL REFERENCES availability_profiles (id),
    group_id TEXT,
    shared_email TEXT,
    submitted_at INTEGER NOT NULL,
    PRIMARY KEY (event_id, name)
);
CREATE TABLE IF NOT EXISTS finalized_polls (
    event_id TEXT PRIMARY KEY NOT NULL,
    choice TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profile_holds (
    event_id TEXT NOT NULL REFERENCES finalized_polls (event_id) ON DELETE CASCADE,
    profile_id BLOB NOT NULL REFERENCES availability_profiles (id),
    spans TEXT NOT NULL,
    PRIMARY KEY (event_id, profile_id)
);
CREATE INDEX IF NOT EXISTS profile_holds_profile ON profile_holds (profile_id);
