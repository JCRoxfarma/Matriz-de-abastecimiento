-- Stock actualizado del sistema: reemplaza el stock congelado de la
-- explosion con el stock real del ERP (almacenes E01/E02/E24). Se sube
-- desde el reporte "stock al DD.MM.xls" que Johany baja del sistema.
-- Cada carga borra todo y mete los datos frescos — solo importa el
-- ultimo archivo, no se guarda historial.

create table if not exists stock_diario (
  id bigint generated always as identity primary key,
  codigo text not null,
  descripcion text,
  stock_e01 numeric not null default 0,   -- cuarentena
  stock_e02 numeric not null default 0,   -- aprobados
  stock_e24 numeric not null default 0,   -- almacen externo (aprobados + cuarentena)
  stock_total numeric not null default 0,
  version text,
  fecha_stock date not null,
  actualizado_en timestamptz not null default now()
);

create unique index if not exists idx_stock_diario_codigo on stock_diario (codigo);

alter table stock_diario enable row level security;

create policy "usuarios logueados leen stock_diario" on stock_diario
  for select using (auth.uid() is not null);
create policy "editores registran stock_diario" on stock_diario
  for insert with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'));
create policy "editores borran stock_diario" on stock_diario
  for delete using (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'));
