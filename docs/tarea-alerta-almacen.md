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
