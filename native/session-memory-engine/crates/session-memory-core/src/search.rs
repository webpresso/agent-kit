//! Search result types shared between store and napi layers.

/// A single search result from any tier (porter, trigram, or Levenshtein).
#[derive(Debug, Clone)]
pub struct SearchHit {
    pub content: String,
    pub source: String,
    /// BM25 rank (lower = more relevant for FTS5; for Levenshtein this is negated similarity).
    pub rank: f64,
    pub tier: String,
}
