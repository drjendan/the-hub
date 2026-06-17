-- =====================================================================
-- Incremental RAG re-indexing. Run AFTER rag.sql.
-- Adds source_id so a single knowledge item's chunks can be replaced on edit
-- (auto-reindex) without rebuilding the whole corpus. Non-destructive.
-- After running this, click "Sync knowledge" once to backfill source_id on
-- existing chunks; thereafter edits re-embed automatically.
-- =====================================================================

alter table public.knowledge_chunks add column if not exists source_id uuid;
create index if not exists idx_kchunks_source on public.knowledge_chunks(source_id);

-- End of rag_incremental.sql
