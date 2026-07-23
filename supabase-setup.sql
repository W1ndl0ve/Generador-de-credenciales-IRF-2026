-- Ejecuta este archivo una sola vez desde Supabase > SQL Editor.
-- Crea la tabla, los buckets privados y permisos de carga de solo inserción.

create extension if not exists pgcrypto;

create table if not exists public.credential_records (
    id uuid primary key,
    full_name text not null check (char_length(full_name) between 2 and 60),
    role text not null check (role in ('becario', 'mentor', 'organizador')),
    region text,
    photo_path text not null,
    credential_path text not null,
    photo_bytes integer not null check (photo_bytes between 1 and 1048576),
    credential_bytes integer not null check (credential_bytes between 1 and 1572864),
    created_at timestamptz not null default timezone('utc', now()),
    constraint credential_region_by_role check (
        (role = 'becario' and region is not null and char_length(region) between 2 and 40)
        or
        (role in ('mentor', 'organizador') and region is null)
    ),
    constraint credential_photo_path_matches_record check (
        photo_path = role || '/' || id::text || '/photo.webp'
    ),
    constraint credential_image_path_matches_record check (
        credential_path = role || '/' || id::text || '/credencial.webp'
    )
);

alter table public.credential_records enable row level security;

revoke all on table public.credential_records from anon, authenticated;
grant usage on schema public to anon;
grant insert on table public.credential_records to anon;

drop policy if exists "Evento IRF26 - registrar credencial" on public.credential_records;
create policy "Evento IRF26 - registrar credencial"
on public.credential_records
for insert
to anon
with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
    ('irf-photos', 'irf-photos', false, 1048576, array['image/webp']),
    ('irf-credentials', 'irf-credentials', false, 1572864, array['image/webp'])
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Evento IRF26 - subir fotos" on storage.objects;
create policy "Evento IRF26 - subir fotos"
on storage.objects
for insert
to anon
with check (
    bucket_id = 'irf-photos'
    and name ~ '^(becario|mentor|organizador)/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/photo\.webp$'
);

drop policy if exists "Evento IRF26 - subir credenciales" on storage.objects;
create policy "Evento IRF26 - subir credenciales"
on storage.objects
for insert
to anon
with check (
    bucket_id = 'irf-credentials'
    and name ~ '^(becario|mentor|organizador)/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/credencial\.webp$'
);

-- No se crean políticas SELECT, UPDATE ni DELETE:
-- el navegador puede subir, pero no listar, leer, cambiar o borrar archivos/registros.
