//! Plugin system.
//!
//! Per the architecture plan: `Extism` (WASM sandbox) for safe third-party
//! plugins. Built-in OCR (Tesseract) and local AI (Ollama) integrations
//! live alongside this as first-party "plugins" in `ocr/` and `ai/`.
//!
//! Later phase, after core editing/sync/search are stable.

// TODO: load/host WASM plugins via Extism, exposing a narrow host API
// (read/write current page blocks, read attachments) to the sandbox.
