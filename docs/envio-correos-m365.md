# Envío de recordatorios por Microsoft 365 — lo que se necesita de TI

> **Actualización 27/10/2026:** se usa el **permiso delegado** Mail.Send de
> la cuenta de Johany (jcueto@roxfarma.com): la app solo puede enviar desde
> ese buzón. TI (Kevin Bartra, HelpDesk) aprobó el enfoque y se encarga de:
> retirar Mail.Send de aplicación, agregar Mail.Send delegado, registrar el
> URI de redirección Web `https://matriz-de-abastecimiento-kappa.vercel.app/api/outlook/callback`,
> restringir la aplicación a usuarios autorizados y crear un secreto nuevo
> que TI carga directamente en Vercel como `AZURE_CLIENT_SECRET` (la
> directiva del inquilino no deja que Johany cree secretos).
>
> Luego Johany usa el botón **Autorizar Outlook** de Enviar recordatorios.
> El modo aplicación descrito abajo queda solo como referencia.

## Cómo funciona

La app envía en **modo aplicación** (OAuth 2.0 *client credentials*): usa un
registro de aplicación de Roxfarma en Microsoft Entra ID y manda el correo
desde un buzón corporativo. No usa la cuenta ni la clave de ninguna persona.

**Quién puede enviar:** solo una persona con sesión iniciada en la app y rol
`editor` (hoy, Johany). El servidor valida la sesión antes de usar la
credencial de Microsoft 365; sin sesión válida responde 401 y no envía nada.
El envío es manual: la persona revisa y aprueba cada correo y presiona
"Enviar". No hay envíos programados ni automáticos.

**Dónde corre:** la app está publicada en Vercel (equipo Roxfarma_Compras).
El envío lo hace una función de servidor de Vercel
(`app/api/enviar-recordatorio.js`), no la laptop de nadie ni Claude.
Claude Code solo se usó para escribir el código.

**Dónde se guarda la credencial:** como variables de entorno del proyecto en
Vercel (Settings → Environment Variables, tipo *Sensitive*). Solo las lee la
función de servidor; no están en el código, ni en GitHub, ni llegan al
navegador.

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
