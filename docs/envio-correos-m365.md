# Envío de recordatorios por Microsoft 365 — lo que se necesita de TI

Estado: **pendiente de validación de TI.** El código ya está listo
(`app/api/enviar-recordatorio.js`); solo falta que TI confirme el mecanismo
y entregue los datos. Mientras tanto, los correos se envían con el botón
**Copiar** y se pegan en Outlook.

## Cómo funciona

La app envía en **modo aplicación** (OAuth 2.0 *client credentials*): usa un
registro de aplicación de Roxfarma en Microsoft Entra ID y manda el correo
desde un buzón corporativo. No usa la cuenta ni la clave de ninguna persona.

Cada correo sale con copia a rramirez@roxfarma.com y queda guardado en
"Elementos enviados" del buzón remitente.

## Lo que hay que pedirle a TI

1. **Registro de aplicación**: confirmar si se reutiliza la aplicación que
   tiene el secreto "Recordatorios" (vence 29/09/2028).
2. **Permiso**: la aplicación necesita el permiso de aplicación
   `Mail.Send` de Microsoft Graph, con consentimiento de administrador.
3. **Restricción recomendada**: limitar ese permiso solo al buzón remitente
   (RBAC for Applications en Exchange Online, o Application Access Policy),
   para que la app no pueda enviar como cualquier usuario.
4. **Buzón remitente**: cuál buzón se usa (por ejemplo, un buzón compartido
   de Compras).
5. **Datos para cargar en Vercel** (Settings → Environment Variables):

| Variable | Qué es |
|---|---|
| `M365_TENANT_ID` | ID del directorio (tenant) de Roxfarma |
| `M365_CLIENT_ID` | ID de la aplicación (client ID) |
| `M365_CLIENT_SECRET` | Valor del secreto autorizado |
| `M365_BUZON_REMITENTE` | Correo del buzón remitente |

Después de cargarlas hay que hacer **Redeploy** en Vercel.
