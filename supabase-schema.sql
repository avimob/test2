create extension if not exists "pgcrypto";

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  price numeric(14,2) not null check (price >= 0),
  neighborhood text not null,
  location text not null,
  type text not null check (type in ('casa', 'apartamento', 'kitnet', 'terreno', 'loja')),
  bedrooms integer not null check (bedrooms >= 0),
  whatsapp text not null,
  image_paths text[] not null default '{}',
  cover_image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists properties_type_idx on public.properties (type);
create index if not exists properties_neighborhood_idx on public.properties (neighborhood);
create index if not exists properties_price_idx on public.properties (price);
create index if not exists properties_bedrooms_idx on public.properties (bedrooms);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_properties_updated_at on public.properties;
create trigger trg_properties_updated_at
before update on public.properties
for each row execute function public.set_updated_at();

alter table public.properties enable row level security;

drop policy if exists "Public can read properties" on public.properties;
create policy "Public can read properties"
on public.properties
for select
using (true);

drop policy if exists "Authenticated can manage properties" on public.properties;
create policy "Authenticated can manage properties"
on public.properties
for all
to authenticated
using (true)
with check (true);

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'Supabase Storage nao encontrado. Pulando criacao de bucket/policies de imagens.';
    return;
  end if;

  execute $sql$
    insert into storage.buckets (id, name, public)
    values ('property-images', 'property-images', true)
    on conflict (id) do nothing
  $sql$;

  execute $sql$drop policy if exists "Public can view property images" on storage.objects$sql$;
  execute $sql$
    create policy "Public can view property images"
    on storage.objects
    for select
    using (bucket_id = 'property-images')
  $sql$;

  execute $sql$drop policy if exists "Authenticated can upload property images" on storage.objects$sql$;
  execute $sql$
    create policy "Authenticated can upload property images"
    on storage.objects
    for insert
    to authenticated
    with check (bucket_id = 'property-images')
  $sql$;

  execute $sql$drop policy if exists "Authenticated can update property images" on storage.objects$sql$;
  execute $sql$
    create policy "Authenticated can update property images"
    on storage.objects
    for update
    to authenticated
    using (bucket_id = 'property-images')
    with check (bucket_id = 'property-images')
  $sql$;

  execute $sql$drop policy if exists "Authenticated can delete property images" on storage.objects$sql$;
  execute $sql$
    create policy "Authenticated can delete property images"
    on storage.objects
    for delete
    to authenticated
    using (bucket_id = 'property-images')
  $sql$;
end;
$$;
