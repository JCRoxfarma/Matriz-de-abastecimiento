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
//      OUTLOOK_REFRESH_TOKEN
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

import { createClient } from '@supabase/supabase-js'

const DELEGADO = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'OUTLOOK_REFRESH_TOKEN']
const APLICACION = ['M365_TENANT_ID', 'M365_CLIENT_ID', 'M365_CLIENT_SECRET', 'M365_BUZON_REMITENTE']
const tiene = vars => vars.every(k => process.env[k])

// Solo puede enviar quien tiene sesion iniciada en la app con rol
// "editor". Se valida el token de sesion de Supabase que manda el
// navegador: Supabase dice de quien es el token y se lee su rol en
// "perfiles"; si el token no es valido o el rol no es editor, se rechaza.
// Sin esto, cualquiera que conozca la URL podria enviar correos desde el
// buzon de Roxfarma.
async function esEditor(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const url = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!token || !url || !anonKey) return false
  try {
    const headers = { apikey: anonKey, Authorization: `Bearer ${token}` }
    const u = await fetch(`${url}/auth/v1/user`, { headers })
    if (!u.ok) return false
    const { id } = await u.json()
    if (!id) return false
    const r = await fetch(`${url}/rest/v1/perfiles?select=rol&id=eq.${encodeURIComponent(id)}`, { headers })
    if (!r.ok) return false
    const filas = await r.json()
    return Array.isArray(filas) && filas.length === 1 && filas[0].rol === 'editor'
  } catch {
    return false
  }
}

// Microsoft entrega un refresh token nuevo cada vez que se usa, y cada uno
// vence a los ~90 dias. Si hay SUPABASE_SERVICE_ROLE_KEY, el mas reciente
// se guarda en la tabla correo_credenciales (sin acceso desde el
// navegador, ver supabase/correo_credenciales.sql), asi la autorizacion se
// mantiene viva mientras se envie al menos un correo cada pocos meses. Sin
// esa tabla se usa siempre el de Vercel, que vence a los ~90 dias de haberse
// obtenido.
function supabaseServidor() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return url && key ? createClient(url, key) : null
}

async function leerRefreshToken(sb) {
  if (sb) {
    const { data } = await sb.from('correo_credenciales').select('refresh_token').eq('id', 1).maybeSingle()
    if (data?.refresh_token) return data.refresh_token
  }
  return process.env.OUTLOOK_REFRESH_TOKEN
}

async function guardarRefreshToken(sb, refreshToken) {
  if (!sb || !refreshToken) return
  await sb.from('correo_credenciales')
    .upsert({ id: 1, refresh_token: refreshToken, actualizado_en: new Date().toISOString() })
}

async function tokenDelegado() {
  const { AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET } = process.env
  const sb = supabaseServidor()
  const refreshToken = await leerRefreshToken(sb)
  const r = await fetch(`https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: AZURE_CLIENT_ID,
      client_secret: AZURE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: 'https://graph.microsoft.com/Mail.Send offline_access',
    }),
  })
  const data = await r.json()
  if (!r.ok) {
    const desc = data.error_description || data.error || 'desconocido'
    let ayuda = ''
    if (/AADSTS700082|AADSTS50173|AADSTS70008|expired|revoked/i.test(desc)) {
      ayuda = ' La autorización de tu cuenta de Outlook venció o fue revocada: hay que volver a autorizar y actualizar OUTLOOK_REFRESH_TOKEN en Vercel.'
    } else if (/AADSTS7000215|AADSTS7000222|client_secret|client secret/i.test(desc)) {
      ayuda = ' El secreto de la aplicación (AZURE_CLIENT_SECRET) no es válido o venció.'
    }
    throw new Error('Error de autenticación con Outlook: ' + desc + ayuda)
  }
  await guardarRefreshToken(sb, data.refresh_token).catch(() => {})
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

  const modo = tiene(DELEGADO) ? 'delegado' : tiene(APLICACION) ? 'aplicacion' : null
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
