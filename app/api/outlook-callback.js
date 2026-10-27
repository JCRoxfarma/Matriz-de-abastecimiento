// Regreso del inicio de sesion con Microsoft (ver outlook-autorizar.js).
// Cambia el codigo por los tokens, confirma que la cuenta autorizada sea
// la de Johany y guarda la autorizacion en correo_credenciales. Despues
// vuelve a la app con ?outlook=ok o ?outlook=error.

import { stateValido, urlRegreso, supabaseServidor, guardarCredencial, SCOPES_DELEGADO, CUENTA_OUTLOOK } from './_lib/outlook.js'

function volver(res, ok, mensaje) {
  const q = new URLSearchParams({ outlook: ok ? 'ok' : 'error' })
  if (mensaje) q.set('msg', mensaje)
  res.writeHead(302, { Location: `/?${q}` })
  res.end()
}

export default async function handler(req, res) {
  const { code, state, error, error_description: errorDesc } = req.query || {}

  if (error) return volver(res, false, `Microsoft no autorizó: ${errorDesc || error}`)
  if (!code || !stateValido(state)) return volver(res, false, 'El inicio de sesión no empezó desde la app o tardó demasiado. Vuelve a intentarlo.')

  const sb = supabaseServidor()
  if (!sb) return volver(res, false, 'Falta SUPABASE_SERVICE_ROLE_KEY en Vercel.')

  try {
    const tokenRes = await fetch(`https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.AZURE_CLIENT_ID,
        client_secret: process.env.AZURE_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: urlRegreso(req),
        scope: SCOPES_DELEGADO,
      }),
    })
    const tokens = await tokenRes.json()
    if (!tokenRes.ok) return volver(res, false, `Error de Microsoft: ${tokens.error_description || tokens.error || 'desconocido'}`)
    if (!tokens.refresh_token) return volver(res, false, 'Microsoft no entregó la autorización permanente (offline_access).')

    // Solo se acepta la cuenta definida para enviar: si alguien entra con
    // otra cuenta, no se guarda nada.
    const meRes = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const me = await meRes.json()
    const cuenta = String(me.mail || me.userPrincipalName || '').toLowerCase()
    if (cuenta !== CUENTA_OUTLOOK) {
      return volver(res, false, `Entraste con ${cuenta || 'otra cuenta'}; solo se acepta ${CUENTA_OUTLOOK}.`)
    }

    await guardarCredencial(sb, tokens.refresh_token, cuenta)
    return volver(res, true)
  } catch (err) {
    return volver(res, false, err.message)
  }
}
