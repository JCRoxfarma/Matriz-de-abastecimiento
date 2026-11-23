-- Demanda de producto terminado (noviembre 2026, Johany).
-- Sale de la hoja DATOS del Excel "Cobertura_Maquila" de Johany: plan de
-- ventas mensual 2026-2027 (la demanda), lote de compra, proveedor, lead
-- time en dias y venta real 2026. Una fila por producto; cada carga
-- reemplaza el plan del producto. El stock NO se toma de ahi: el stock
-- vigente sale de stock_pt (P01 + P02 + P19).

create table if not exists demanda_pt (
  codigo text primary key,
  descripcion text,
  proveedor text,
  lote numeric,
  lead_time_dias integer,
  plan jsonb not null default '{}'::jsonb,        -- {"2026-11": 2300, ...}
  venta_real jsonb not null default '{}'::jsonb,  -- {"2026-01": 1087, ...}
  archivo text,
  actualizado_en timestamptz not null default now()
);

alter table demanda_pt enable row level security;

drop policy if exists "usuarios logueados leen demanda_pt" on demanda_pt;
create policy "usuarios logueados leen demanda_pt" on demanda_pt
  for select using (auth.uid() is not null);
drop policy if exists "editores registran demanda_pt" on demanda_pt;
create policy "editores registran demanda_pt" on demanda_pt
  for insert with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'));
drop policy if exists "editores actualizan demanda_pt" on demanda_pt;
create policy "editores actualizan demanda_pt" on demanda_pt
  for update using (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'))
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'));
