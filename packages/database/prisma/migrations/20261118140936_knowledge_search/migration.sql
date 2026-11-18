-- Knowledge search: full-text (weighted), fuzzy titles (trigrams) and semantic (pgvector).
ALTER TABLE "knowledge"
  ADD COLUMN "embeddedAt" TIMESTAMPTZ(3),
  ADD COLUMN "embedding" vector(384),
  ADD COLUMN "embeddingModel" TEXT,
  ADD COLUMN "searchText" TEXT NOT NULL DEFAULT '',
  -- 'simple' configuration: no language-specific stemming, works for French and English content alike.
  ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("searchText", '')), 'B')
  ) STORED;

CREATE INDEX "knowledge_search_vector_idx" ON "knowledge" USING GIN ("searchVector");
CREATE INDEX "knowledge_title_trgm_idx" ON "knowledge" USING GIN ("title" gin_trgm_ops);
-- Cosine distance; HNSW keeps queries fast without training (works on an empty table).
CREATE INDEX "knowledge_embedding_hnsw_idx" ON "knowledge" USING hnsw ("embedding" vector_cosine_ops);
