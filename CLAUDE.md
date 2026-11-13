# Seguimiento de materiales de empaque

Aplicación interna de Roxfarma para el seguimiento de OC de materiales de
empaque. La usan compras, planeamiento y almacén.

## Decisiones fijas del proyecto

- **Con login, por roles.** Cada persona entra con su correo de Roxfarma y
  una clave (Supabase Auth). El rol vive en la tabla `perfiles`: `editor`
  puede ver y editar el seguimiento; `lector` solo puede ver. No hay
  registro abierto: las cuentas las crea Johany desde el panel de Supabase.
- **Marcha blanca (agosto 2026).** Por ahora solo Johany Cueto es `editor`.
  Rosmery Ramirez y Cesar Falconi son `lector`. Ricardo Zegarra (otro
  comprador) todavía no tiene cuenta: se agrega cuando Johany lo converse
  con él. No cambiar quién es editor sin que Johany lo pida.
- **Todo gratis**: Supabase (base de datos) y Vercel (hosting), ambos en su
  capa gratuita.
- El código de la aplicación vive en `app/` (React + Vite). No usa Tailwind,
  el estilo está en `app/src/App.css`, heredado del prototipo original.
- El esquema de la base de datos vive en `supabase/schema.sql`, y las
  reglas de login y permisos en `supabase/auth.sql`.

## Envío de correos: borradores para el Outlook de Johany (noviembre 2026)

- **TI no aprobó que la app envíe correos** (ni con permiso de aplicación ni
  delegado). Por eso los recordatorios se preparan en la app y Johany los
  envía desde su propio Outlook: botón **Borrador** / **Descargar
  borradores** (archivo `.eml` con `X-Unsent: 1`, se abre en Outlook de
  escritorio como correo nuevo listo para enviar) y **Abrir en Outlook**
  (copia el cuerpo y abre `mailto:` con destinatario, CC y asunto). Ver
  `app/src/lib/borradores.js`. Al preparar un correo se registra en "Últimos
  envíos". Siempre va CC a rramirez@roxfarma.com.
- En **Seguimiento OI** el botón **Solicitar estatus a proveedores** abre la
  misma pantalla (`EnviarRecordatorios` con `tipo="oi"`) con otro correo:
  estado de la OI, si la producción terminó, fecha de embarque (ETD) y ETA,
  tomados del panel de cada OI; lo que falta sale "Por confirmar".
- El botón de envío directo solo aparece si algún día TI lo habilita y la
  cuenta queda autorizada; el código de abajo se mantiene para ese caso.

## Envío directo desde la app (pendiente de TI, no activo)

- **Decisión de Johany (27/10/2026):** el envío automático usa el permiso
  **delegado** Mail.Send de su propia cuenta (jcueto@roxfarma.com), vía
  Microsoft Graph `/me/sendMail`. Solo puede enviar desde ese buzón, y no
  requiere aprobación de administrador de TI. Reemplaza la decisión
  anterior de esperar el permiso "de aplicación" de TI, que habría
  permitido enviar como cualquier usuario y por eso TI lo objetó.
- Variables en Vercel: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
  `AZURE_CLIENT_SECRET` (registro de aplicación "Seguimiento ME -
  Recordatorios" del directorio de Roxfarma) y `SUPABASE_SERVICE_ROLE_KEY`.
  La autorización de la cuenta se obtiene con el botón **Autorizar
  Outlook** de Enviar recordatorios (`api/outlook-autorizar.js` →
  `api/outlook/callback.js`, que solo acepta jcueto@roxfarma.com) y se
  guarda en `correo_credenciales` (`supabase/correo_credenciales.sql`,
  solo servidor). Cada envío la renueva, así no vence mientras se use.
- `app/api/enviar-recordatorio.js` también soporta el modo aplicación
  (variables `M365_*`) por si TI lo entrega más adelante. Detalle en
  `docs/envio-correos-m365.md`.
- Solo un usuario con sesión iniciada y rol `editor` puede llamar a la API
  de envío: no quitar esa validación.
- **No configurar otros métodos de envío** (Resend, SMTP, Gmail, etc.).
- No modificar funcionalidades que ya están operativas al trabajar en
  otros módulos.

## Cómo se actualizan los datos

Los datos "de verdad" viven en Supabase, no en el Excel. El Excel de Johany
(`ProgramacionOC` + `IngresosSistema`) se sube desde el botón **Importar
Excel** de la pestaña **Archivos** (`app/src/Archivos.jsx`, con el historial
de importaciones) (`app/src/lib/importer.js`), y:

- `programacion_oc` se actualiza por `upsert`, usando la columna **ID
  entrega** como llave. El importador nunca confía en la columna "ID
  entrega" ni en "Orden entrega" del Excel (a veces vienen vacías): las
  calcula siempre él mismo a partir de OC + SKU + N° entrega.
- Los campos de gestión (`motivo_demora`, `responsable_accion`,
  `criticidad`, `observaciones`, `cierre_manual`, `motivo_cierre`) **no se
  pisan** en filas que ya existían: esos los maneja la gente desde la app,
  no el Excel.
- `estado_gestion` es 100% manejado desde la app (panel de cada entrega):
  nunca se toma del Excel, ni siquiera la primera vez que se crea una fila.
  Si nadie lo tocó desde la app queda vacío, y la propia app calcula un
  estado razonable al vuelo (Cerrado si ya no queda saldo, Atrasado si se
  pasó la fecha, o "En seguimiento" por defecto). Así un "Cerrado" viejo o
  mal puesto en el Excel original no se queda pegado para siempre en una
  entrega que en realidad sigue pendiente. Si una fila queda mal cerrada de
  antes de este cambio, se destraba con el botón **Reabrir línea para
  editar** del panel (o con una limpieza puntual por SQL).
- `fecha_programada_ingreso` también queda protegida, pero solo si de
  verdad se reprogramó desde la app (eso se nota porque la fila ya tiene
  `historial`). Si nunca se tocó desde ahí, se deja pasar la fecha que
  traiga el Excel, para que las correcciones que Johany haga en su archivo
  sí lleguen.
- `ingresos_sistema` solo agrega filas nuevas (dedup por `numero_analisis`),
  nunca se borran ni se pisan las anteriores. **Única excepción (aprobada
  por Johany, nov-2026):** el estado de calidad (`estado_ingreso_sistema`,
  columna `est`) de un análisis que ya existía sí se actualiza en cada
  importación (Espera → Aprobado / Rechazado). Cantidad y fecha nunca.
- **Rechazos de calidad** (`supabase/rechazos.sql`): un lote `Rechazado` no
  cuenta como ingresado (almacén le da salida y el proveedor repone con la
  misma OC). El importador lo anota en la entrega que se estaba llenando
  (`cant_rechazada`, `fecha_rechazo`) y esa entrega vuelve a quedar con
  saldo. Mientras falte la reposición la fila sale en rojo con la etiqueta
  "Rechazo de calidad", primero en la tabla y con un aviso arriba; al
  completarse queda "Tuvo rechazo". En el panel (`RechazoCalidad.jsx`) se
  marca `nc_enviada` (nota de crédito enviada a contabilidad: solo el check,
  sin número, por decisión de Johany). OTIF: la entrega rechazada no cuenta
  como a tiempo; su llegada real es la de la reposición aprobada. Los
  correos marcan "Reposición por rechazo de calidad" e Indicadores tiene la
  sección Rechazos de calidad.
- **Desmedro en tránsito (solo OI):** si lo rechazado es mercadería rota en
  el transporte, no es culpa del proveedor ni se repone. En el panel de la
  OI se marca "Rotura en tránsito: cerrar como gasto por desmedro"
  (`desmedro`); la cantidad dañada es la misma del rechazo. Esa parte se da
  por cerrada (saldo, reparto del importador e In Full la cuentan como
  recibida), la línea queda con etiqueta ámbar "Desmedro", no sale en
  rechazos por proveedor ni pide nota de crédito, y Indicadores →
  Importaciones muestra el gasto por desmedro (precio × unidades dañadas).
- Cada importación recalcula `cant_ingresada`, `saldo_pendiente`,
  `pct_ingreso`, `estado_ingreso`, `fecha_real_ingreso` y `dias_atraso` en
  `programacion_oc`, cruzando por OC + SKU contra todos los eventos de
  `ingresos_sistema` acumulados hasta la fecha. El reparto es en orden: la
  entrega más antigua (según `orden_entrega`, calculado del N° entrega, ej.
  E01 antes que E02) se llena primero, porque así entregan los proveedores.
- **Entregas parciales que cambian de cantidad:** en el panel de la OC, el
  "Ajuste excepcional de cantidad" ofrece compensar la diferencia en la
  última entrega de la misma OC + SKU (el total de la OC no cambia). Al
  guardar un cambio de cantidad se vuelve a repartir lo ingresado de esa
  OC + SKU al instante (`recalcularEntregasDe` en `importer.js`, mismo
  cálculo que al importar).
- `dias_atraso` nunca es negativo: si llega antes de lo programado, queda en
  0 (así lo calcula también el Excel original de Johany).
- El Excel de Johany a veces trae la misma entrega duplicada (mismo OC +
  SKU + N° de entrega, cargada desde dos archivos de origen). El importador
  deduplica por `ID entrega` antes de calcular, quedándose con una copia.
  Lo mismo pasa con `ingresos_sistema`: deduplica por `numero_analisis`.
- El botón **Exportar Excel** de la app (`app/src/lib/exporter.js`) genera
  una copia nueva de `programacion_oc` en el mismo formato del Excel
  original, con los datos y el seguimiento más al día. Es de un solo
  sentido (base de datos → Excel): el archivo de Johany no se actualiza
  solo, porque vive en su computadora y no en la nube.

## Categorías: material de empaque y producto terminado (noviembre 2026)

Johany ve dos categorías. El Excel no trae el tipo, así que la categoría se
calcula por el proveedor (`categoriaDe` en `app/src/lib/derive.js`): CIFARMA
y GABBLAN son **Producto terminado**; todo lo demás es **Material de
empaque**. El selector Todos / Material de empaque / Producto terminado (a la
derecha de las pestañas, se recuerda en el navegador) filtra Seguimiento OC,
Seguimiento OI, Indicadores y los correos. No toca la base de datos ni la
explosión de materiales. Si se agrega otro proveedor de producto terminado,
se suma a `PROV_PT`.

## Indicadores (noviembre 2026)

Pestaña **Indicadores** (`app/src/Indicadores.jsx`), visible para todos.
Reglas de OTIF definidas por Johany: **a tiempo** = llegó el mismo día o
antes de la fecha comprometida; **completo** = llegó al menos el 95% del
programado efectivo (llegar de más también es completo); **meta 90%**. Se
mide cada entrega cuya fecha comprometida ya pasó (las vencidas sin llegar
cuentan como no cumplidas; las anuladas no cuentan), por defecto contra la
fecha **original** (antes de reprogramar), con opción de fecha vigente. El
atraso promedio es solo de lo que llegó tarde.
El botón **Exportar cumplimiento** (sección OTIF) descarga un Excel de un
mes, de todos los proveedores o de uno (para enviárselo): hoja Resumen por
proveedor y hoja Detalle por entrega (`lib/exportarCumplimiento.js`), con
las mismas entregas y reglas que la pestaña (incluida la fecha base elegida).
La sección **Lead time real vs esperado** mide días desde la emisión de la
OC/OI (`fecha_emision_oc`) hasta que la entrega quedó completa
(`fecha_real_ingreso`), contra el lead time configurado; las entregas con
ingreso anterior a la emisión (OC de regularización) se excluyen. El mismo
cálculo se ve en el bloque **Lead time** de los paneles de OC y OI
(`LeadTimeEntrega.jsx`, helpers en `lib/leadTime.js`).

## Login y permisos: qué implica

Las reglas de acceso (RLS) de Supabase exigen sesión iniciada para leer
`programacion_oc` e `ingresos_sistema`, y exigen rol `editor` (consultando
la tabla `perfiles`) para insertar o actualizar filas. La app también
esconde los botones de importar y el formulario de gestión para quien es
`lector`, pero la protección real está en las reglas de Supabase, no en la
interfaz. Crear una cuenta nueva es un proceso manual: se crea el usuario
desde Supabase Authentication → Users, y después se le agrega una fila en
`perfiles` con su rol.

## Piezas del arnés que faltan (a propósito)

No tiene ambiente de prueba ni pruebas automáticas todavía. Se dejaron fuera
del primer alcance porque el proyecto es un experimento interno de bajo
riesgo. Si se agregan más adelante, van en `app/` sin tocar la estructura
actual.
