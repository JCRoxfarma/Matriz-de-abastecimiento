// Boton "Autorizar Outlook" de Enviar recordatorios (solo editor).
//   GET  -> estado: si ya hay una autorizacion guardada y de que cuenta.
//   POST -> devuelve la direccion de inicio de sesion de Microsoft; el
//           navegador va ahi, Johany entra con su cuenta, y Microsoft la
//           devuelve a /api/outlook/callback, que guarda la autorizacion.

import { esEditor, supabaseServidor, leerCredencial, crearState, urlRegreso, SCOPES_DELEGADO, CUENTA_OUTLOOK } from './_lib/outlook.js'

const FALTAN = () => ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'SUPABASE_SERVICE_ROLE_KEY'].filter(k => !process.env[k])

export default async function handler(req, res) {
  if (!(await esEditor(req))) {
    return res.status(401).json({ error: 'Solo un usuario con rol editor y sesión iniciada puede autorizar Outlook.' })
  }

  const faltan = FALTAN()

  if (req.method === 'GET') {
    let cred = null
    if (!faltan.length) cred = await leerCredencial(supabaseServidor()).catch(() => null)
    return res.status(200).json({
      configurado: faltan.length === 0,
      faltan,
      autorizado: !!cred,
      cuenta: cred?.cuenta || null,
      actualizado_en: cred?.actualizado_en || null,
      cuentaEsperada: CUENTA_OUTLOOK,
    })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo GET o POST' })

  if (faltan.length) {
    return res.status(503).json({ error: `Faltan variables en Vercel: ${faltan.join(', ')}.` })
  }

  const params = new URLSearchParams({
    client_id: process.env.AZURE_CLIENT_ID,
    response_type: 'code',
    redirect_uri: urlRegreso(req),
    response_mode: 'query',
    scope: SCOPES_DELEGADO,
    state: crearState(),
    login_hint: CUENTA_OUTLOOK,
    prompt: 'select_account',
  })
  return res.status(200).json({
    url: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/authorize?${params}`,
  })
}
