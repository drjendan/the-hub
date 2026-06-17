-- =====================================================================
-- Richer app profile fields. Run AFTER apps.sql.
-- All nullable so existing apps are unaffected. "What it does" reuses the
-- existing apps.description column. status_label is descriptive/operational
-- metadata, SEPARATE from the governance status (in_review/published) that
-- still controls launchability.
-- =====================================================================

alter table public.apps add column if not exists primary_users text;
alter table public.apps add column if not exists key_features  text;
alter table public.apps add column if not exists data_inputs   text;
alter table public.apps add column if not exists status_label  text;

-- End of apps_profile.sql
