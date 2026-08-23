//! Local AI integration (summarise / ask), via Ollama.
//!
//! Per the architecture plan: talks to a local Ollama REST endpoint by
//! default (no cloud), or an OpenAI-compatible endpoint if configured.

// TODO: POST page content to the configured Ollama endpoint for
// summarisation / Q&A, streaming the response back to the frontend.
