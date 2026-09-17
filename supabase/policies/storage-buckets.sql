-- v0.1.4 production bucket settings
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('community-avatars', 'community-avatars', true, 1048576, array['image/png','image/jpeg','image/webp','image/gif']),
  ('community-files', 'community-files', false, 5767168, array['image/png','application/json','application/octet-stream','text/json'])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
