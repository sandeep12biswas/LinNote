//! OCR for embedded images, via Tesseract Rust bindings.
//!
//! Phase 3 (weeks 7-9): wire this into the attachment pipeline so
//! images dropped onto a page get OCR'd text attached for search.

// TODO(phase-3): run Tesseract over newly attached images and store the
// extracted text so it's picked up by the FTS5 index (see `db::schema`).
