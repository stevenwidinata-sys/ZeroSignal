# Zero Signal API. Build from the repository root (the backend reads
# ../shared/*.json at compile time):
#   docker build -f backend/Dockerfile -t zerosignal-api .

# ---- build ----
# Pinned: newer Rust versions cannot build sqlx 0.7 (never-type change).
FROM rust:1.97-slim-bookworm AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config && rm -rf /var/lib/apt/lists/*
COPY shared ./shared
COPY backend ./backend
WORKDIR /app/backend
RUN cargo build --release --locked

# ---- run ----
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 app
COPY --from=build /app/backend/target/release/backend /usr/local/bin/zerosignal-api
USER app
ENV RUST_LOG=info
# Render (and most hosts) set PORT; the server listens on it.
EXPOSE 8080
CMD ["zerosignal-api"]
