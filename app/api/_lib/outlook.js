// Piezas compartidas por las funciones de correo (enviar-recordatorio,
// outlook-autorizar, outlook/callback). Vercel no publica como ruta los
// archivos que empiezan con "_", asi que esto no es un endpoint.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// Unica cuenta desde la que se envia en modo delegado (decision de
// Johany, ver CLAUDE.md). La autorizacion de cualquier otra cuenta se
// rechaza.
export const CUENTA_OUTLOOK = (process.env.OUTLOOK_CUENTA || 'jcueto@roxfarma.com').toLowerCase()
export const SCOPES_DELEGADO = 'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access'

// Solo puede usar estas funciones quien tiene sesion iniciada en la app
// con rol "editor". Se valida el token de sesion de Supabase que manda el
// navegador: Supabase dice de quien es el token y se lee su rol en
// "perfiles"; si el token no es valido o el rol no es editor, se rechaza.
// Sin esto, cualquiera que conozca la URL podria enviar correos desde el
// buzon de Roxfarma.
export async function esEditor(req) {
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
// vence a los ~90 dias. El mas reciente se guarda en correo_credenciales
// (sin acceso desde el navegador, ver supabase/correo_credenciales.sql),
// asi la autorizacion se mantiene viva mientras se envie al menos un
// correo cada pocos meses.
export function supabaseServidor() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return url && key ? createClient(url, key) : null
}

export async function leerCredencial(sb) {
  if (sb) {
    const { data } = await sb.from('correo_credenciales').select('refresh_token,cuenta,actualizado_en').eq('id', 1).maybeSingle()
    if (data?.refresh_token) return data
  }
  return process.env.OUTLOOK_REFRESH_TOKEN ? { refresh_token: process.env.OUTLOOK_REFRESH_TOKEN, cuenta: null, actualizado_en: null } : null
}

export async function guardarCredencial(sb, refreshToken, cuenta) {
  if (!sb || !refreshToken) return
  const fila = { id: 1, refresh_token: refreshToken, actualizado_en: new Date().toISOString() }
  if (cuenta) fila.cuenta = cuenta
  const { error } = await sb.from('correo_credenciales').upsert(fila)
  if (error) throw error
}

// "state" del inicio de sesion con Microsoft: lleva la hora y va firmado
// con el secreto de la aplicacion, para que el regreso (outlook/callback)
// solo acepte inicios de sesion que empezaron desde la app hace poco.
const firmar = texto => createHmac('sha256', process.env.AZURE_CLIENT_SECRET || '').update(texto).digest('base64url')

export function crearState() {
  const cuerpo = Buffer.from(JSON.stringify({ t: Date.now(), n: randomBytes(8).toString('hex') })).toString('base64url')
  return `${cuerpo}.${firmar(cuerpo)}`
}

export function stateValido(state, maxMinutos = 15) {
  const [cuerpo, firma] = String(state || '').split('.')
  if (!cuerpo || !firma) return false
  const esperada = firmar(cuerpo)
  if (firma.length !== esperada.length || !timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return false
  try {
    const { t } = JSON.parse(Buffer.from(cuerpo, 'base64url').toString())
    return Date.now() - t < maxMinutos * 60000
  } catch {
    return false
  }
}

// La direccion de regreso tiene que estar registrada tal cual en la
// aplicacion de Microsoft (Autenticacion > Web > URI de redireccion).
export function urlRegreso(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `https://${host}/api/outlook/callback`
}
