-- Lead time de compra: dias desde que se emite la OC hasta que el material
-- llega a almacen. Se configura por tipo de material (caja, etiqueta,
-- frasco...) y por origen (Local / Importado), y se puede poner un valor
-- propio a un codigo especifico cuando no calza con su tipo.
--
-- Correr una sola vez desde el SQL Editor de Supabase.

create table if not exists lead_time_tipos (
  tipo text primary key,           -- id del tipo, ver TIPOS en app/src/lib/leadTime.js
  dias_local int,
  dias_importado int,
  actualizado_en timestamptz not null default now()
);

-- Excepciones por codigo. Cualquier campo vacio usa el valor por defecto:
-- origen vacio = el de la ultima OC/OI del material; dias vacio = el de su
-- tipo y origen.
create table if not exists lead_time_materiales (
  codigo text primary key,
  origen text check (origen in ('Local', 'Importado')),
  dias int,
  actualizado_en timestamptz not null default now()
);

insert into lead_time_tipos (tipo) values
  ('embalaje'), ('caja'), ('etiqueta'), ('prospecto'), ('tubo'), ('frasco'), ('tapa'), ('blister'), ('otro')
on conflict (tipo) do nothing;

alter table lead_time_tipos enable row level security;
alter table lead_time_materiales enable row level security;

create policy "usuarios logueados leen lead_time_tipos" on lead_time_tipos
  for select using (auth.uid() is not null);
create policy "editores actualizan lead_time_tipos" on lead_time_tipos
  for update using (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'))
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'));

create policy "usuarios logueados leen lead_time_materiales" on lead_time_materiales
  for select using (auth.uid() is not null);
create policy "editores registran lead_time_materiales" on lead_time_materiales
  for insert with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'));
create policy "editores actualizan lead_time_materiales" on lead_time_materiales
  for update using (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'))
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'));
create policy "editores borran lead_time_materiales" on lead_time_materiales
  for delete using (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'));
