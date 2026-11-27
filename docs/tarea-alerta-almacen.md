# Alerta diaria de ingresos a Almacén (material de empaque)

Pedido de Almacén a Johany (25/11/2026). Tarea programada de Claude
"Alerta de ingresos a almacén (ME)" (https://claude.ai/code/routines/trig_01UaLumjHBcTKWaQkqcGyiDA),
lunes a viernes 1:50 p. m. (Lima), para que llegue a las 2 p. m. (pedido de Johany, 27/11/2026), con los conectores Microsoft 365 y Supabase.

- Para: rrupay@roxfarma.com, gurodriguez@roxfarma.com, dmachado@roxfarma.com (jefes de almacén). CC: jcueto@, cfalconi@ y rramirez@roxfarma.com (27/11/2026).
- Contenido: entregas de material de empaque (OC y OI, sin CIFARMA ni GABBLAN)
  con saldo por llegar y fecha efectiva (confirmada o programada) en los
  próximos 2 días hábiles; aparte, las vencidas o de hoy que siguen pendientes.
- Mismas reglas que la app: excluye Cerrado / Orden Anulada, cuenta el
  desmedro como recibido y da por cerradas las OI con 90% o más recibido.
- Se envía desde el buzón de Johany con el conector de Microsoft 365 de su
  cuenta (no desde la app: TI no aprobó que la app envíe correos).

## Formato (aprobado por Johany el 27/11/2026, "versión A")

El conector de Microsoft 365 no admite estilos ni atributos HTML (ni con
`outlook_send_mail` ni con borradores: los quita o rechaza el correo). Por eso
la alerta va como tabla simple (`table/tr/th/td` sin atributos), con la fecha
y el día de la semana ("Lun 30/11/2026"). Columnas: Fecha, Tipo, N° orden,
Código, Material, Proveedor, Cantidad por llegar, Fecha confirmada. Un
diseño con colores y bordes (como el recordatorio a proveedores) solo es
posible generándolo en la app para que Johany lo envíe desde su Outlook.
Antes de cambiar el formato, mandar primero una prueba solo a Johany.

Actualización 27/11/2026: formato final "prueba 4": una tabla simple por
cada día con su título ("Lunes 30/11/2026 (8 entregas)"), columnas Tipo,
N° orden, Código, Material, Proveedor, Cantidad por llegar, Fecha
confirmada. La tabla dibujada con caracteres (`pre`) se descartó porque se
parte en pantallas angostas.
