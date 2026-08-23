//! Sync engine.
//!
//! Per the architecture plan:
//! - `automerge-rs` (CRDT) for conflict-free offline-first merging
//! - Every page is a CRDT document; auto-merges on reconnect
//! - Works peer-to-peer or via the optional self-hosted `server/` (Axum)
//!
//! Phase 5 (weeks 11-14): integrate automerge-rs, implement reconnect/merge
//! logic, and surface a conflict-resolution UI in the frontend.

// TODO(phase-5): wrap each page's block tree in an Automerge document,
// diff/merge on local edits, and push/pull changes over the sync
// server's WebSocket API (see `server/`).
