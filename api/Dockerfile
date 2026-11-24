# Build the API for the configured storage adaptor. Hosted builds use Datastore by default.

FROM rust:1.92.0-bookworm AS toolchain

FROM toolchain AS builder
ARG STORAGE_ADAPTOR=datastore-adaptor

WORKDIR /usr/src/app
COPY . .
# Will build and cache the binary and dependent crates in release mode
RUN --mount=type=cache,target=/usr/local/cargo,from=toolchain,source=/usr/local/cargo \
    --mount=type=cache,target=target \
    cargo build --locked --release --features "$STORAGE_ADAPTOR" && mv ./target/release/crabfit-api ./api

# Runtime image
FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Run as "app" user
RUN useradd -ms /bin/bash app

USER app
WORKDIR /app

# Get compiled binaries from builder's cargo install directory
COPY --from=builder /usr/src/app/api /app/api

# Run the app
EXPOSE 3000
CMD ["./api"]
