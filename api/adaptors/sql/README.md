# SQL Adaptor

This adaptor works with [Postgres](https://www.postgresql.org/), [MySQL](https://www.mysql.com/) or [SQLite](https://sqlite.org/index.html) databases.

## Environment

To use this adaptor, make sure you have the `DATABASE_URL` environment variable set to the database url for your chosen database.

Example:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/crabfit"
```

## Schema upgrades

The SQL adaptor applies pending SeaORM migrations to `DATABASE_URL` on
startup. Back up the database before starting a new API build against an
existing instance. The migration registry is in
[`src/migration/mod.rs`](src/migration/mod.rs). Run the new build against a
copy of the database first and check that existing events and responses load.
