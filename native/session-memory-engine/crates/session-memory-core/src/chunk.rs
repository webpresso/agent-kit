//! Text chunking using text-splitter + tiktoken-rs.

use text_splitter::TextSplitter;

/// Default target chunk size in tokens.
const DEFAULT_CHUNK_SIZE: usize = 512;

/// Split `text` into token-aware chunks of at most `max_tokens` tokens.
/// Returns owned `String` chunks.
pub fn chunk_text(text: &str, max_tokens: Option<usize>) -> Vec<String> {
    let size = max_tokens.unwrap_or(DEFAULT_CHUNK_SIZE);
    let splitter = TextSplitter::new(size);
    splitter.chunks(text).map(|s| s.to_owned()).collect()
}

/// Convert HTML to Markdown, then chunk.
pub fn chunk_html(html: &str, max_tokens: Option<usize>) -> Vec<String> {
    let md = htmd::convert(html).unwrap_or_else(|_| html.to_owned());
    chunk_text(&md, max_tokens)
}
