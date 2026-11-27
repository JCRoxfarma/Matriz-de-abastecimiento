# Alerta diaria de ingresos a Almacén (material de empaque)

Pedido de Almacén a Johany (25/11/2026). Tarea programada de Claude
"Alerta de ingresos a almacén (ME)" (https://claude.ai/code/routines/trig_01UaLumjHBcTKWaQkqcGyiDA),
lunes a viernes 2:50 p. m. (Lima), con los conectores Microsoft 365 y Supabase.

- Para: rrupay@roxfarma.com, gurodriguez@roxfarma.com, dmachado@roxfarma.com (jefes de almacén). CC: jcueto@roxfarma.com.
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
