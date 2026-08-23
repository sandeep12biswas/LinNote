//! SQLite schema: notebooks -> sections -> pages -> blocks.
//!
//! This mirrors the OneNote-style hierarchy from the architecture plan.
//! Phase 4 adds an FTS5 virtual table over `blocks.content` for search,
//! and a `tags` table + join table for the tag/colour-label system.

pub const MIGRATIONS: &[&str] = &[
    r#"
    CREATE TABLE IF NOT EXISTS notebooks (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sections (
        id          TEXT PRIMARY KEY,
        notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        position    INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pages (
        id          TEXT PRIMARY KEY,
        section_id  TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
        title       TEXT NOT NULL,
        position    INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
    );

    -- One row per block (text, heading, image, checklist, table, code,
    -- divider, canvas/ink). `content` holds block-specific JSON.
    CREATE TABLE IF NOT EXISTS blocks (
        id          TEXT PRIMARY KEY,
        page_id     TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
        block_type  TEXT NOT NULL,
        content     TEXT NOT NULL,
        position    INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
    );
    "#,
    // TODO(phase-4): FTS5 virtual table + triggers to keep it in sync with `blocks`.
    // TODO(phase-4): `tags` + `page_tags` tables for colour-labelled tags.
];
