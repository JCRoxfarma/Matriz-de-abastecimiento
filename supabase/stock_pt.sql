-- Stock de producto terminado (noviembre 2026, definido por Johany).
-- Sale del MISMO reporte de stock que ya se sube para material de empaque
-- (trae todos los almacenes). Para PT el stock vigente es la suma de:
--   P01 = APT principal disponible
--   P02 = APT principal cuarentena
--   P19 = APT productos de contingencia
-- Los demas almacenes P (muestras, maquila, suministros...) no cuentan.
-- Igual que stock_diario: cada carga borra todo y mete lo nuevo.

create table if not exists stock_pt (
  id bigint generated always as identity primary key,
  codigo text not null,
  descripcion text,
  unidad text,
  stock_p01 numeric not null default 0,   -- disponible
  stock_p02 numeric not null default 0,   -- cuarentena
  stock_p19 numeric not null default 0,   -- contingencia
  stock_total numeric not null default 0,
  fecha_stock date not null,
  actualizado_en timestamptz not null default now()
);

create unique index if not exists idx_stock_pt_codigo on stock_pt (codigo);

alter table stock_pt enable row level security;

drop policy if exists "usuarios logueados leen stock_pt" on stock_pt;
create policy "usuarios logueados leen stock_pt" on stock_pt
  for select using (auth.uid() is not null);
drop policy if exists "editores registran stock_pt" on stock_pt;
create policy "editores registran stock_pt" on stock_pt
  for insert with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'));
drop policy if exists "editores borran stock_pt" on stock_pt;
create policy "editores borran stock_pt" on stock_pt
  for delete using (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'));
