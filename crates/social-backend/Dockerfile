FROM rust:1-bookworm AS builder

WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY config ./config
COPY crates ./crates
COPY src-tauri ./src-tauri
RUN cargo build -p social-backend --release

FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/social-backend /usr/local/bin/social-backend

ENV THEBOYS_BACKEND_BIND=0.0.0.0:4074
EXPOSE 4074

CMD ["social-backend"]
