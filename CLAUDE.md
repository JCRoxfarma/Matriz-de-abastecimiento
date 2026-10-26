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

## Envío de correos: solo Microsoft 365 autorizado por TI (octubre 2026)

- La app debe funcionar desde el entorno corporativo de Roxfarma, **sin
  depender de credenciales personales** de nadie (nada de refresh tokens
  de la cuenta de Johany ni de `/me/sendMail`).
- El único método de envío permitido es **Microsoft 365 (Microsoft
  Graph)** con el mecanismo que valide TI. TI está evaluando reutilizar el
  secreto existente "Recordatorios" (vence el 29/09/2028).
- **No crear credenciales nuevas ni configurar otros métodos de envío**
  (Resend, SMTP, Gmail, etc.) sin validación de TI.
- `app/api/enviar-recordatorio.js` ya está preparado en modo aplicación
  (client credentials, envía desde un buzón de Roxfarma). Mientras falten
  las variables `M365_*` en Vercel responde "pendiente de configuración" y
  no envía nada; el botón **Copiar** (pegar en Outlook) sigue funcionando.
  Detalle de lo que se le pide a TI en `docs/envio-correos-m365.md`.
- No modificar funcionalidades que ya están operativas al trabajar en
  otros módulos.

## Cómo se actualizan los datos

Los datos "de verdad" viven en Supabase, no en el Excel. El Excel de Johany
(`ProgramacionOC` + `IngresosSistema`) se sube desde el botón **Importar
Excel** de la app (`app/src/lib/importer.js`), y:

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
  nunca se borran ni se pisan las anteriores.
- Cada importación recalcula `cant_ingresada`, `saldo_pendiente`,
  `pct_ingreso`, `estado_ingreso`, `fecha_real_ingreso` y `dias_atraso` en
  `programacion_oc`, cruzando por OC + SKU contra todos los eventos de
  `ingresos_sistema` acumulados hasta la fecha. El reparto es en orden: la
  entrega más antigua (según `orden_entrega`, calculado del N° entrega, ej.
  E01 antes que E02) se llena primero, porque así entregan los proveedores.
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
