-- 24/11/2026, aprobado por Johany. Calidad reutilizo el N° de analisis
-- ME0260001355: el 21/11 era SAL GRANULADA (OC 2600003529, 30 und, sin
-- entregas en programacion_oc) y en "ingreso 24.11_09am.xls" pasa a ser el
-- ingreso de Euroform de la OC 2600003277. Se reemplaza el registro y se
-- reparte en la OC (E01 de 20,000 completa; misma regla que el importador).
update ingresos_sistema set
  archivo_origen_ingreso = 'ingreso 24.11_09am.xls',
  fecha_ingreso = '2026-11-23',
  oc = 2600003277,
  codigo = '010201014',
  descripcion = 'FCO.PLAST.GRAB.CEVADUOL Solución Rectal',
  proveedor = 'EUROFORM SRL',
  cantidad_ingresada = 20000,
  ingreso_acumulado = 20000,
  moneda = 'US$',
  precio = 0.397,
  lote = 'V13',
  fecha_oc = '2026-10-27',
  estado_ingreso_sistema = 'Espera'
where numero_analisis = 'ME0260001355' and oc = 2600003529;

update programacion_oc set
  cant_ingresada = 20000, saldo_pendiente = 0, pct_ingreso = 100,
  estado_ingreso = 'Completo', fecha_real_ingreso = '2026-11-23',
  dias_atraso = 7, valor_ingresado = 7940, valor_pendiente = 0
where id_entrega = '2600003277-010201014-E01' and cant_ingresada = 0;
