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

### Adding an adaptor

See [adding an adaptor](adaptors/README.md#adding-an-adaptor) in the adaptors readme.

## Environment

### CORS

In release mode, a `FRONTEND_URL` environment variable is required to correctly restrict cross-origin requests to the frontend.

### Cleanup task

By default, anyone can run the cleanup task at `/tasks/cleanup`. This is usually not an issue, as it's based on when the events were last visited, and not when it's run, but if you'd prefer to restrict runs of the cleanup task (as it can be intensive), set a `CRON_KEY` environment variable in `.env`. This will require sending an `X-Cron-Key` header to the route with a value that matches `CRON_KEY`, or the route will return a 401 Unauthorized error.

### Event management and participant sign-in

Set `ADMIN_PIN` to four digits in the API environment (or in the ignored
`api/.env` during development). Open **About → Admin interface** on the
frontend to sign in. Admin sessions expire after eight hours or an API restart.
The API limits failed admin PIN attempts to five in a 15-minute window.

Management lists events in the configured store, including events created
before this update. Renaming or moving dates preserves the event URL and
responses on overlapping slots. The availability grid displays responses only
on the current schedule. Duplicating an event gives its schedule a new
link. An admin can remove individual participants or delete the event and
all its responses. A signed-in participant may also remove their own response.

Participant login at `GET /event/{event_id}/people/{person_name}` returns a
one-hour token in the `token` field. Use it as the bearer credential for one
successful availability PATCH. A successful submission returns the saved
availability and its `submitted_at` UTC timestamp for the browser receipt.
Use `tentative` for a separate list of tentative choices. Each choice can
appear in only one list. Omitting `tentative` keeps tentative choices that
remain valid and do not overlap the new confirmed choices.
Event passwords remain optional, with existing passwords required at sign-in.
Sessions are held by the API process. If running multiple API instances,
route a session's requests to the same instance.

### Respondent groups

To offer groups, include a `groups` array of objects with a `name` when
creating the poll. The API assigns each group an ID. Submit a response with
`group_id` set to one of the poll's group IDs to join it. Omit the field to
keep the current assignment or set it to `null` to clear it. Admin edits can
rename a group by including its ID and new name, or remove a group by leaving
it out of the array. Removing a group preserves its participants' choices.

### Self-hosted URLs and listening address

Set the API's `FRONTEND_URL` to the browser-facing frontend origin, for example
`https://meet.example.org`, with no path or trailing slash. Configure
`NEXT_PUBLIC_API_URL` when building the frontend. It must be reachable from
both participants' browsers and the frontend server, for example
`https://api.meet.example.org`. Share links use the frontend origin displayed
in the browser.

The API listens on `0.0.0.0:3000` by default. Set `LISTEN_ADDR` to override
the IP address and port, for example `127.0.0.1:3000` for local development.

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
