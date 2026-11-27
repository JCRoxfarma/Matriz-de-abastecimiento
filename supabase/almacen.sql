-- Rol "almacen" (aprobado por Johany, 27/11/2026).
-- Almacen entra a la app con su propia cuenta y SOLO ve los ingresos por
-- llegar (OC, OI y producto terminado): fecha, orden, codigo, material,
-- proveedor, cantidad por llegar y si la fecha esta confirmada. Nada de
-- precios, valores, gestion, stock, explosion ni archivos, y no edita nada.
--
-- La proteccion esta en la base: las tablas solo las leen editor y lector
-- (es_interno). Almacen lee unicamente lo que devuelve ingresos_almacen().

-- 1. Nuevo rol permitido en perfiles.
alter table perfiles drop constraint if exists perfiles_rol_check;
alter table perfiles add constraint perfiles_rol_check
  check (rol in ('editor', 'lector', 'almacen'));

-- 2. Quien es "interno" (puede leer las tablas completas).
create or replace function public.es_interno()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from perfiles where id = auth.uid() and rol in ('editor', 'lector'))
$$;

-- 3. Las lecturas que antes pedian solo "sesion iniciada" ahora piden ser
--    editor o lector. Las reglas de escritura (solo editor) no cambian.
do $$
declare t record;
begin
  for t in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and cmd = 'SELECT' and qual = '(auth.uid() IS NOT NULL)'
  loop
    execute format('alter policy %I on public.%I using (public.es_interno())', t.policyname, t.tablename);
  end loop;
end $$;

-- 4. Lo unico que ve almacen: entregas con saldo por llegar.
--    Mismas reglas que la app: excluye Cerrado / Orden Anulada, el
--    desmedro cuenta como recibido y las OI con 90% o mas se dan por cerradas.
create or replace function public.ingresos_almacen()
returns table (
  categoria text, tipo text, oc bigint, sku text, n_entrega text,
  descripcion text, proveedor text, por_llegar numeric, fecha date, confirmada boolean
)
language sql stable security definer set search_path = public
as $$
  with base as (
    select
      case when proveedor ~* '(cifarma|gab+lan)' then 'Producto terminado' else 'Material de empaque' end as categoria,
      case when origen = 'Importado' then 'OI' else 'OC' end as tipo,
      oc, sku, n_entrega, descripcion, proveedor,
      coalesce(cant_programada,0) + coalesce(ajuste_cantidad,0) as prog,
      coalesce(cant_ingresada,0) + case when desmedro then coalesce(cant_rechazada,0) else 0 end as recibido,
      coalesce(fecha_confirmada, fecha_programada_ingreso) as fecha,
      fecha_confirmada is not null as confirmada
    from programacion_oc
    where coalesce(estado_gestion,'') not in ('Cerrado','Orden Anulada')
  )
  select categoria, tipo, oc::bigint, sku::text, n_entrega::text, descripcion, proveedor,
         (prog - recibido)::numeric, fecha, confirmada
  from base
  where exists (select 1 from perfiles where id = auth.uid() and rol in ('editor','lector','almacen'))
    and prog - recibido > 0
    and not (tipo = 'OI' and recibido > 0 and recibido >= prog * 0.9)
    and fecha is not null
  order by fecha, proveedor, oc
$$;

revoke all on function public.ingresos_almacen() from public, anon;
grant execute on function public.ingresos_almacen() to authenticated;
