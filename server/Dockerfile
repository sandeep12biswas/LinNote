# Build/run image for the optional self-hosted sync server.
# Phase 5 stub — flesh out once server/src/main.rs grows past the health check.

FROM rust:1-slim AS build
WORKDIR /app
COPY Cargo.toml ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
COPY --from=build /app/target/release/linnote-server /usr/local/bin/linnote-server
EXPOSE 8787
CMD ["linnote-server"]
