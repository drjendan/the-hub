-- =====================================================================
-- Per-tenant company logos. Run AFTER schema.sql.
--   * adds organizations.logo_url (public URL of the uploaded logo)
--   * creates a public Storage bucket for the image files
--
-- The bucket is PUBLIC READ (logos render via their public URL). Writes happen
-- ONLY through the service role in /api/admin/logo, which checks that the caller
-- is a global admin or an owner of that company — so no anon/authenticated write
-- policies are needed. Size + mime are also enforced at the storage layer.
-- =====================================================================

alter table public.organizations add column if not exists logo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-logos', 'company-logos', true, 1048576,
        array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- End of logos.sql
