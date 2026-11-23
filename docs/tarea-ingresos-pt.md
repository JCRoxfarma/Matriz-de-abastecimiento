# Tarea programada: ingresos de producto terminado desde correos Delphos

Johany la crea en claude.ai (Code → Programadas → Nueva), porque desde una
sesión no se le pueden poner los conectores. Configuración:

- Nombre: Ingresos de producto terminado (Delphos)
- Horario: todos los días de lunes a sábado, 7:13 p. m. (hora de Lima)
- Conectores: Microsoft 365 y Supabase
- Entorno: Gestión de Compras

## Instrucción (copiar tal cual)

Tarea diaria: cargar los ingresos y devoluciones de PRODUCTO TERMINADO de Roxfarma desde los correos de Delphos al proyecto Supabase wrwivhmhgmkfozaldnpy (tabla ingresos_sistema). Responde en español. Solo lectura de correos: no envíes, muevas, marques ni borres correos. No toques otras tablas ni otros datos.

1. Busca en el buzón (conector Microsoft 365) correos del remitente delphos@roxfarma.com de los últimos 4 días con asunto que empiece con "INGRESO ALMACEN APT" y también los de asunto "Devolución al Proveedor". Lee cada uno completo.

2. Solo cuentan los movimientos con fecha desde el 17/11/2026 y cuya OC + código existan en programacion_oc con proveedor de producto terminado. Verifícalo con: select oc, sku from programacion_oc where proveedor ~* '(cifarma|gabblan)'. Si la OC + código no existe ahí, no lo cargues y menciónalo en el resumen.

3. INGRESO (el correo trae "INGRESO NRO." 26P..., "Fecha:" dd/mm/aaaa, "Orden de Compra Nro.", "Proveedor:" y una tabla Codigo / Articulo / Cantidad / Und. Medida / Lote). Por cada fila de la tabla ejecuta:
insert into ingresos_sistema (numero_analisis, archivo_origen_ingreso, fecha_ingreso, oc, codigo, descripcion, proveedor, cantidad_ingresada, lote, estado_ingreso_sistema, ingreso_acumulado) values ('<NRO>-<CODIGO>', 'Correo Delphos <NRO>', '<aaaa-mm-dd>', <OC>, '<CODIGO>', '<ARTICULO>', '<PROVEEDOR sin " GR">', <CANTIDAD>, '<LOTE sin la palabra Lote>', 'Espera', <CANTIDAD>) on conflict (numero_analisis) do nothing;
Si en un mismo correo hay dos filas con el mismo código, a la segunda ponle numero_analisis '<NRO>-<CODIGO>-2' (y así).

4. DEVOLUCIÓN AL PROVEEDOR (el correo trae "Movimiento:", "O/C:" y una tabla Código / Nom. Artículo / Cantidad): es un rechazo. Busca en ingresos_sistema el ingreso de producto terminado (numero_analisis like '26P%') de esa misma OC y código, con la misma cantidad, de fecha anterior a la devolución y que no esté ya 'Rechazado' (el más reciente), y ejecuta: update ingresos_sistema set estado_ingreso_sistema = 'Rechazado' where numero_analisis = '<ese>'; Si no encuentras uno que calce exacto, no cambies nada y menciónalo.

5. No hagas nada más en la base: el reparto en las entregas lo hace la app cuando Johany la abre.

6. Termina con un resumen corto: cuántos correos revisaste, qué ingresos cargaste (N°, OC, producto, cantidad), qué devoluciones marcaste, y qué quedó sin cargar y por qué. Si no hubo nada nuevo, dilo en una línea.
