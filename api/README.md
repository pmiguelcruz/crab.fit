# Crab Fit API

This is the API for Crab Fit, written in Rust. It uses the [axum](https://crates.io/crates/axum) framework to run a HTTP server, and supports multiple storage adaptors.

## API docs

OpenAPI compatible API docs are generated using [utoipa](https://crates.io/crates/utoipa). You can visit them at [https://api.crab.fit/docs](https://api.crab.fit/docs).

## Storage adaptors

| Adaptor | Works with |
| ------- | ---------- |
| `memory-adaptor` | Stores data in memory |
| `sql-adaptor` | Postgres, MySQL, SQLite |
| `datastore-adaptor` | Google Datastore |

To choose an adaptor, specify it in the `features` when compiling, e.g. `cargo run --features sql-adaptor`.

Some adaptors require environment variables to be set. You can specify them in a `.env` file and they'll be loaded in using [dotenvy](https://crates.io/crates/dotenvy). See a specific adaptor's readme for more information.

> **Note**
> `memory-adaptor` is the default if no features are specified. Ensure you specify a different adaptor when deploying.

### Docker

Build the API image from this directory. The Docker build and API checks use
Rust 1.92.0. The image uses Google Datastore by default. To connect it to a
SQL database, build with `STORAGE_ADAPTOR=sql-adaptor`.

```sh
docker build -t crabfit-api .
docker build --build-arg STORAGE_ADAPTOR=sql-adaptor -t crabfit-api:sql .
```

Provide `FRONTEND_URL` and the selected adaptor's environment variables when
starting the container. Set `ADMIN_PIN_KEY` to enable event management.

### Adding an adaptor

See [adding an adaptor](adaptors/README.md#adding-an-adaptor) in the adaptors readme.

## Environment

### CORS

In release mode, a `FRONTEND_URL` environment variable is required to correctly restrict cross-origin requests to the frontend.

### Event management and participant sign-in

This fork's admin PIN is sealed with AES-256-GCM in `src/admin_pin.sealed`.
Supply the matching `ADMIN_PIN_KEY` as a 32-byte base64url value in the private
API environment or in git-ignored `api/.env` during development. Keep that key
outside the repository and the frontend environment. Admin sign-in is disabled
when the key is absent. Select **Admin** in the footer to sign in.
Admin sessions expire after eight hours or an API restart. The API limits
failed PIN attempts to five in a 15-minute window.

Management lists events in the configured store, including events created
before this update. Renaming or moving dates preserves the event URL and
responses on overlapping slots. Creation, the full event list, edits, and
deletion all require an admin session. New event links use random identifiers.
The availability grid displays responses only
on the current schedule. Duplicating an event gives its schedule a new
link. Events stay in the configured store until an admin deletes them.
An admin can remove individual participants. A signed-in participant may
also remove their own response.

Participant login at `GET /event/{event_id}/people/{person_name}` returns a
one-hour token in the `token` field. Use it as the bearer credential for one
successful availability PATCH. A successful submission returns the saved
availability and its `submitted_at` UTC timestamp for the browser receipt.
Use `tentative` for a separate list of tentative choices. Each choice can
appear in only one list. Omitting `tentative` keeps tentative choices that
remain valid and do not overlap the new confirmed choices.
New participant entries require a password. Existing password-protected
entries use their original passwords. Older entries saved without a password
remain available to admins, who can remove them if a participant needs to
register again with the same name.
Sessions are held by the API process. If running multiple API instances,
route a session's requests to the same instance.

### Respondent groups

To offer groups, include a `groups` array of objects with a `name` when
creating the poll. The API assigns each group an ID. Submit a response with
`group_id` set to one of the poll's group IDs to join it. Omit the field to
keep the current assignment or set it to `null` to clear it. Admin edits can
rename a group by including its ID and new name, or remove a group by leaving
it out of the array. Removing a group preserves its participants' choices.

### Shared participant emails

Participants can include `shared_email` in a signed-in availability submission.
This shares the address with event admins. Omit the field to keep the previous
choice or send `null` to stop sharing. `GET /event/{id}/emails` lists the
addresses that participants chose to share, with duplicates removed, and
requires an admin session. Ordinary
availability results and receipts exclude email addresses.

### Vote notifications

Set these variables to offer email subscriptions in the admin results panel:

| Variable | Value |
| -------- | ----- |
| `NOTIFICATION_SMTP_URL` | An SMTP relay URL, such as `smtps://user:password@mail.example.org:465` or `smtp://mail.example.org:587?tls=required`. |
| `NOTIFICATION_FROM` | A sender address authorized by the relay. |
| `NOTIFICATION_DB` | A private, writable SQLite file on persistent storage for subscriptions and queued mail. Use one notification-enabled API instance per file. |
| `FRONTEND_URL` | The browser-facing frontend origin used in confirmation and unsubscribe links. |

Notifications are disabled when `NOTIFICATION_SMTP_URL` is absent. Recipients
confirm their address using a one-time link. Admins can request updates when
someone changes a vote, or a one-time update when a response or confirmed
attendance target is reached. Pending updates can be grouped into one
email. SMTP failures are retried, and each email includes a stop link.

### Shared availability profiles

Set `AVAILABILITY_PROFILE_DB` to a private, writable SQLite file on persistent
storage. This enables the **Shared availability** controls on poll pages and
**Set final choice** in the admin interface. Keep the file alongside the
event database when backing up a self-hosted installation.

Participants sign in to each poll before linking its response with a profile
key. Linking lets edits in one poll update overlapping choices in other
linked polls. Timed choices use UTC intervals and can have different slot
lengths. Dated times, recurring times, specific days, and recurring weekdays
each keep their own availability. The profile key is retained by the browser
after a successful link. It can be entered in another browser to use the
same profile.

Setting a final choice reserves it for linked participants who marked that
choice available. The original poll keeps their responses and matching
choices become unavailable in the participants' other linked polls. Clearing
or removing the final choice releases its reservations.

### Self-hosted URLs and listening address

Set the API's `FRONTEND_URL` to the browser-facing frontend origin, for example
`https://meet.example.org`, with no path or trailing slash. Configure
`NEXT_PUBLIC_API_URL` when building the frontend. It must be reachable from
both participants' browsers and the frontend server, for example
`https://api.meet.example.org`. Share links use the frontend origin displayed
in the browser.

The API listens on `0.0.0.0:3000` by default. Set `LISTEN_ADDR` to override
the IP address and port, for example `127.0.0.1:3000` for local development.

### Reverse proxy rate limits

The API limits requests by the IP address of the immediate connection. If
the API runs behind a reverse proxy, set `TRUSTED_PROXY_IPS` to the exact
connection IP addresses of the proxy, separated by commas. Configure that
proxy to overwrite `X-Real-IP` with the visitor's IP address. For example,
the Nginx location forwarding traffic to the API can include:

```nginx
proxy_set_header X-Real-IP $remote_addr;
```

Leave `TRUSTED_PROXY_IPS` unset for direct connections. A missing or invalid
client address falls back to the connection IP.

### Poll slot sizes

On event creation, set `slot_size` to `quarter_hour`, `half_hour`, `hour`,
or `day`. For a timed poll, put every selectable start time in `times`, in
UTC as `HHmm-DDMMYYYY` for specific dates or `HHmm-d` for recurring weekdays
with Sunday as `0`. A dates-only poll uses `YYYY-MM-DD` civil dates or ISO
weekday numbers `1`–`7` without shifting by time zone. Participant
availability contains the exact selected strings.

An omitted `slot_size` keeps the older format. The API expands each stored
hour into four selectable quarter-hour starts. SQL migration
`m03_slot_size` adds a nullable column and keeps existing schedules and
responses.
