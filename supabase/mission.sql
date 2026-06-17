-- =====================================================================
-- Per-company mission statement. Run AFTER schema.sql.
-- Same lightweight pattern as logos.sql (a nullable column on organizations).
-- =====================================================================

alter table public.organizations add column if not exists mission_statement text;

-- End of mission.sql
