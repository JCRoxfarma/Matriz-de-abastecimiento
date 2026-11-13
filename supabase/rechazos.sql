-- Rechazos de calidad (noviembre 2026, definido por Johany).
--
-- Cuando Calidad rechaza un lote, almacen le da salida y el proveedor
-- repone con la misma OC. Por eso:
--   * lo rechazado (ingresos_sistema.estado_ingreso_sistema = 'Rechazado')
--     no cuenta como ingresado: la entrega vuelve a quedar con saldo;
--   * cada importacion actualiza el estado de calidad de los analisis que
--     ya existian (Espera -> Aprobado / Rechazado). Solo el estado: la
--     cantidad y la fecha de un ingreso nunca se pisan.
--
-- cant_rechazada y fecha_rechazo los calcula el importador (igual que
-- cant_ingresada). nc_enviada lo marca la gente desde el panel: la nota de
-- credito del proveedor ya se envio a contabilidad.

alter table programacion_oc add column if not exists cant_rechazada numeric not null default 0;
alter table programacion_oc add column if not exists fecha_rechazo date;
alter table programacion_oc add column if not exists nc_enviada boolean not null default false;

drop policy if exists "editores actualizan estado de ingresos_sistema" on ingresos_sistema;
create policy "editores actualizan estado de ingresos_sistema" on ingresos_sistema
  for update using (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'))
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'));
