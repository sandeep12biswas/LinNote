//! Optional self-hosted sync server.
//!
//! Per the architecture plan:
//! - Axum (Rust) HTTP + WebSocket API
//! - PostgreSQL for metadata + sync state
//! - MinIO / S3 for binary attachments
//! - Deployed via `docker-compose.yml` alongside this crate
//!
//! Phase 5 (weeks 11-14): receives/broadcasts Automerge CRDT changes
//! from clients (see `src-tauri/src/sync/`) over WebSocket, and persists
//! sync state + metadata to Postgres.

use axum::{routing::get, Router};

async fn health() -> &'static str {
    "ok"
}

#[tokio::main]
async fn main() {
    let app = Router::new().route("/health", get(health));
    // TODO(phase-5): GET /ws websocket route for CRDT change broadcast.
    // TODO(phase-5): Postgres pool (sqlx) + MinIO/S3 client for attachments.

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8787")
        .await
        .expect("failed to bind sync server port");
    println!("linnote-server listening on {}", listener.local_addr().unwrap());
    axum::serve(listener, app).await.expect("server error");
}
