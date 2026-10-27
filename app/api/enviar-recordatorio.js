// Envio de recordatorios por Microsoft 365 (Microsoft Graph). Funciona de
// dos formas, segun que variables esten cargadas en Vercel:
//
// 1. Modo delegado (el que se usa hoy, decidido por Johany): envia desde
//    el buzon de Johany (jcueto@roxfarma.com) con el permiso delegado
//    Mail.Send que ella autorizo con su propia cuenta. Solo puede enviar
//    desde ese buzon, no desde otros de Roxfarma, y no necesita aprobacion
//    de administrador. Depende de la sesion de Johany: si su autorizacion
//    vence o se revoca, hay que volver a autorizar.
//      AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET,
//      SUPABASE_SERVICE_ROLE_KEY (la autorizacion se obtiene con el boton
//      "Autorizar Outlook", ver outlook-autorizar.js)
//
// 2. Modo aplicacion (si TI algun dia entrega la credencial corporativa):
//    client credentials, envia desde el buzon indicado sin depender de
//    nadie. Requiere aprobacion de administrador de TI.
//      M365_TENANT_ID, M365_CLIENT_ID, M365_CLIENT_SECRET,
//      M365_BUZON_REMITENTE
//
// Si no hay ninguna de las dos, responde "pendiente de configuracion" y no
// envia nada. No configurar otros metodos de envio (Resend, SMTP, Gmail,
// etc.): ver CLAUDE.md.

import { esEditor, supabaseServidor, leerCredencial, guardarCredencial, SCOPES_DELEGADO } from './_lib/outlook.js'

// Modo delegado: credenciales de la aplicacion + la autorizacion de la
// cuenta, que se guarda con el boton "Autorizar Outlook" (en
// correo_credenciales, necesita SUPABASE_SERVICE_ROLE_KEY) o, como
// respaldo, en OUTLOOK_REFRESH_TOKEN.
const DELEGADO = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET']
const APLICACION = ['M365_TENANT_ID', 'M365_CLIENT_ID', 'M365_CLIENT_SECRET', 'M365_BUZON_REMITENTE']
const tiene = vars => vars.every(k => process.env[k])
const delegadoConfigurado = () => tiene(DELEGADO) && !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.OUTLOOK_REFRESH_TOKEN)

async function tokenDelegado() {
  const { AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET } = process.env
  const sb = supabaseServidor()
  const cred = await leerCredencial(sb)
  if (!cred) throw new Error('Falta autorizar tu cuenta de Outlook: usa el botón "Autorizar Outlook" en Enviar recordatorios.')
  const refreshToken = cred.refresh_token
  const r = await fetch(`https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: AZURE_CLIENT_ID,
      client_secret: AZURE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: SCOPES_DELEGADO,
    }),
  })
  const data = await r.json()
  if (!r.ok) {
    const desc = data.error_description || data.error || 'desconocido'
    let ayuda = ''
    if (/AADSTS700082|AADSTS50173|AADSTS70008|expired|revoked/i.test(desc)) {
      ayuda = ' La autorización de tu cuenta de Outlook venció o fue revocada: vuelve a usar el botón "Autorizar Outlook".'
    } else if (/AADSTS7000215|AADSTS7000222|client_secret|client secret/i.test(desc)) {
      ayuda = ' El secreto de la aplicación (AZURE_CLIENT_SECRET) no es válido o venció.'
    }
    throw new Error('Error de autenticación con Outlook: ' + desc + ayuda)
  }
  await guardarCredencial(sb, data.refresh_token).catch(() => {})
  return data.access_token
}

async function tokenAplicacion() {
  const { M365_TENANT_ID, M365_CLIENT_ID, M365_CLIENT_SECRET } = process.env
  const r = await fetch(`https://login.microsoftonline.com/${M365_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: M365_CLIENT_ID,
      client_secret: M365_CLIENT_SECRET,
      grant_type: 'client_credentials',
      scope: 'https://graph.microsoft.com/.default',
    }),
  })
  const data = await r.json()
  if (!r.ok) {
    const desc = data.error_description || data.error || 'desconocido'
    throw new Error('Error de autenticación con Microsoft 365 (consultar con TI): ' + desc)
  }
  return data.access_token
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Solo POST' })
  }

  if (!(await esEditor(req))) {
    return res.status(401).json({ error: 'Solo un usuario con rol editor y sesión iniciada puede enviar correos.' })
  }

  const modo = delegadoConfigurado() ? 'delegado' : tiene(APLICACION) ? 'aplicacion' : null
  if (!modo) {
    return res.status(503).json({
      error: 'El envío automático por Outlook todavía no está configurado. Mientras tanto usa el botón "Copiar" y pega el correo en Outlook.',
      pendiente: true,
    })
  }

  const { to, cc, subject, html } = req.body
  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'Faltan campos: to, subject, html' })
  }

  const ALWAYS_CC = 'rramirez@roxfarma.com'
  const ccList = cc
    ? (Array.isArray(cc) ? cc : cc.split(/[;,]\s*/)).filter(Boolean)
    : []
  if (!ccList.some(e => e.toLowerCase() === ALWAYS_CC)) ccList.push(ALWAYS_CC)

  try {
    const accessToken = modo === 'delegado' ? await tokenDelegado() : await tokenAplicacion()
    const urlEnvio = modo === 'delegado'
      ? 'https://graph.microsoft.com/v1.0/me/sendMail'
      : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(process.env.M365_BUZON_REMITENTE)}/sendMail`

    const sendRes = await fetch(urlEnvio, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'HTML', content: html },
          toRecipients: (Array.isArray(to) ? to : [to]).map(address => ({ emailAddress: { address } })),
          ccRecipients: ccList.map(address => ({ emailAddress: { address } })),
        },
        saveToSentItems: true,
      }),
    })

    if (!sendRes.ok) {
      const errData = await sendRes.json().catch(() => ({}))
      const msg = errData.error?.message || `HTTP ${sendRes.status}`
      return res.status(sendRes.status).json({ error: 'Outlook rechazó el envío: ' + msg })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
