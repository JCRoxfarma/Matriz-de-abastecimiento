import { supabase } from './supabaseClient'
import { fmt, fdate } from './derive'

// --- CRUD contactos ---

export async function cargarContactos() {
  const { data, error } = await supabase
    .from('proveedores_contacto')
    .select('*')
    .order('nombre')
  if (error) throw error
  return data || []
}

export async function guardarContacto({ id, nombre, correo, correo_cc, telefono }) {
  const payload = { nombre, correo: correo || null, correo_cc: correo_cc || null, telefono: telefono || null, actualizado_en: new Date().toISOString() }
  if (id) {
    const { error } = await supabase.from('proveedores_contacto').update(payload).eq('id', id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('proveedores_contacto').insert(payload)
    if (error) throw error
  }
}

export async function eliminarContacto(id) {
  const { error } = await supabase.from('proveedores_contacto').delete().eq('id', id)
  if (error) throw error
}

// --- Historial de envios ---

export async function cargarHistorial(limite = 50) {
  const { data, error } = await supabase
    .from('recordatorios_enviados')
    .select('*')
    .order('enviado_en', { ascending: false })
    .limit(limite)
  if (error) throw error
  return data || []
}

export async function registrarEnvio(proveedor, correo, entregas) {
  const { error } = await supabase.from('recordatorios_enviados').insert({
    proveedor,
    correo_destino: correo,
    tipo: 'manual',
    entregas_incluidas: entregas,
  })
  if (error) throw error
}

// --- Generacion de email ---

function diasTexto(r) {
  if (r.dd == null) return 'sin fecha'
  if (r.dd < 0) return `${-r.dd} dia${-r.dd !== 1 ? 's' : ''} de atraso`
  if (r.dd === 0) return 'hoy'
  return `faltan ${r.dd} dia${r.dd !== 1 ? 's' : ''}`
}

// Fecha que manda para los recordatorios: la que confirmo el proveedor si
// la hay, si no la programada. Es la misma "fecha efectiva" que usa el
// filtro de mes de Seguimiento OC, para que las dos pantallas cuenten las
// mismas entregas.
export const fechaEfectiva = r => r.fecha_confirmada || r.fecha_programada_ingreso

// Meses de las entregas que van en el correo (segun su fecha efectiva,
// igual que el filtro de mes de esta pantalla), en orden: "noviembre",
// "noviembre y diciembre", "noviembre, diciembre y enero 2027". El año
// solo se pone si no es el año en curso.
export function mesesDelCorreo(filas) {
  const claves = [...new Set(filas.map(r => fechaEfectiva(r)?.slice(0, 7)).filter(Boolean))].sort()
  const anioActual = new Date().getFullYear()
  const nombres = claves.map(c => {
    const [y, m] = c.split('-').map(Number)
    const mes = new Date(y, m - 1, 1).toLocaleDateString('es-PE', { month: 'long' }).toLowerCase()
    return y === anioActual ? mes : `${mes} ${y}`
  })
  if (nombres.length <= 1) return nombres[0] || ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

// "Recordatorio de entregas pendientes noviembre - ADHESIVOS DEL NORTE S.A.C."
// (formato pedido por Johany). Si hay entregas vencidas se antepone URGENTE.
export function generarAsunto(proveedor, filas) {
  const atrasadas = filas.filter(r => r.dd != null && r.dd < 0).length
  const meses = mesesDelCorreo(filas)
  const asunto = `Recordatorio de entregas pendientes${meses ? ` ${meses}` : ''} - ${proveedor}`
  return atrasadas > 0 ? `URGENTE: ${asunto}` : asunto
}

export function generarToken(proveedor) {
  const payload = proveedor.trim().toUpperCase()
  const b64 = btoa(unescape(encodeURIComponent(payload)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  let hash = 0
  const key = 'roxfarma-confirmar-2026'
  const str = key + payload
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  const hmac = Math.abs(hash).toString(16).padStart(8, '0')
  return `${b64}.${hmac}`
}

export function generarEmailHtml(proveedor, filas, linkConfirmacion) {
  const filasHtml = filas
    .sort((a, b) => (fechaEfectiva(a) || '').localeCompare(fechaEfectiva(b) || ''))
    .map(r => {
      const esAtraso = r.dd != null && r.dd < 0
      const bgFila = esAtraso ? 'background:#fef2f2' : ''
      return `<tr style="${bgFila}">
      <td style="border:1px solid #d0d5dd;padding:8px;text-align:center">${r.oc}</td>
      <td style="border:1px solid #d0d5dd;padding:8px">${r.sku}</td>
      <td style="border:1px solid #d0d5dd;padding:8px">${r.descripcion || ''}</td>
      <td style="border:1px solid #d0d5dd;padding:8px;text-align:right">${fmt(r.saldo_pendiente)}</td>
      <td style="border:1px solid #d0d5dd;padding:8px;text-align:center">${fdate(fechaEfectiva(r))}</td>
      <td style="border:1px solid #d0d5dd;padding:8px;text-align:center;${esAtraso ? 'color:#dc2626;font-weight:600' : ''}">${diasTexto(r)}</td>
      <td style="border:1px solid #d0d5dd;padding:8px;text-align:center;${r.estado_confirmacion === 'Confirmada' ? 'color:#16a34a;font-weight:600' : 'color:#d97706;font-weight:600'}">${r.estado_confirmacion || 'Pendiente'}</td>
    </tr>`
    }).join('')

  const atrasadas = filas.filter(r => r.dd != null && r.dd < 0).length
  const proximas = filas.filter(r => r.dd != null && r.dd >= 0 && r.dd <= 7).length

  let alerta = ''
  if (atrasadas > 0) {
    alerta = `<div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;margin:16px 0;border-radius:4px">
      <strong style="color:#dc2626">Atencion:</strong> Tiene <strong>${atrasadas}</strong> entrega${atrasadas > 1 ? 's' : ''} con fecha vencida. Favor coordinar la entrega a la brevedad.
    </div>`
  } else if (proximas > 0) {
    alerta = `<div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;margin:16px 0;border-radius:4px">
      <strong style="color:#b45309">Proximas:</strong> Tiene <strong>${proximas}</strong> entrega${proximas > 1 ? 's' : ''} programada${proximas > 1 ? 's' : ''} en los proximos 7 dias.
    </div>`
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Calibri,Arial,sans-serif;font-size:14px;color:#344054;margin:0;padding:0;background:#f9fafb">
  <div style="max-width:820px;margin:0 auto;padding:20px">
    <div style="background:#00167b;padding:16px 24px;border-radius:8px 8px 0 0">
      <h2 style="color:#ffffff;margin:0;font-size:18px">Recordatorio de entregas pendientes</h2>
      <div style="color:#a3b8ff;font-size:12px;margin-top:4px">${new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
    </div>
    <div style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
      <p>Estimados <strong>${proveedor}</strong>,</p>
      <p>Les recordamos que tienen las siguientes entregas de materiales de empaque pendientes de ingreso a nuestro almacen:</p>
      ${alerta}
      <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:13px">
        <thead>
          <tr style="background:#00167b;color:#ffffff">
            <th style="border:1px solid #00167b;padding:8px">OC</th>
            <th style="border:1px solid #00167b;padding:8px">SKU</th>
            <th style="border:1px solid #00167b;padding:8px">Material</th>
            <th style="border:1px solid #00167b;padding:8px;text-align:right">Cantidad pendiente</th>
            <th style="border:1px solid #00167b;padding:8px">F. entrega</th>
            <th style="border:1px solid #00167b;padding:8px">Estado</th>
            <th style="border:1px solid #00167b;padding:8px">Confirmacion</th>
          </tr>
        </thead>
        <tbody>
          ${filasHtml}
        </tbody>
      </table>
      <p>Total: <strong>${filas.length}</strong> entrega${filas.length > 1 ? 's' : ''} pendiente${filas.length > 1 ? 's' : ''}${atrasadas > 0 ? `, de las cuales <strong style="color:#dc2626">${atrasadas}</strong> ya pasaron su fecha programada` : ''}.</p>
      ${linkConfirmacion ? `<div style="text-align:center;margin:24px 0">
        <a href="${linkConfirmacion}" style="display:inline-block;background:#00167b;color:#ffffff;padding:14px 36px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600">Confirmar fechas de entrega</a>
        <div style="font-size:11px;color:#98a2b3;margin-top:8px">Haga clic para confirmar o modificar las fechas directamente</div>
      </div>` : ''}
      <p style="margin-top:16px">Favor confirmar que las entregas se realizaran en las fechas indicadas. De existir algun cambio o retraso, agradeceré nos lo comuniquen a la brevedad para poder coordinarlo.</p>
      <p style="margin-top:24px">Saludos cordiales,</p>
      <p style="margin:4px 0"><strong>Johany Cueto</strong><br>
      Compras - Materiales de empaque<br>
      <span style="color:#0060ae">Roxfarma S.A.</span></p>
    </div>
    <div style="text-align:center;margin-top:12px;font-size:11px;color:#98a2b3">
      Correo generado desde el sistema de seguimiento de materiales de empaque.
    </div>
  </div>
</body>
</html>`
}

// --- Solicitud de estatus a proveedores de importacion (Seguimiento OI) ---

// "Solicitud de estatus de importacion noviembre - PROVEEDOR"
export function generarAsuntoOI(proveedor, filas) {
  const meses = mesesDelCorreo(filas)
  return `Solicitud de estatus de importación${meses ? ` ${meses}` : ''} - ${proveedor}`
}

// Lo que ya se sabe de cada OI (cargado en su panel de Seguimiento OI) se
// muestra; lo que falta sale "Por confirmar", para que el proveedor lo
// complete en su respuesta.
const porConfirmar = '<span style="color:#d97706;font-weight:600">Por confirmar</span>'

function produccionTexto(r) {
  const seg = r.seg || {}
  if (seg.fecha_disponibilidad) return `<span style="color:#16a34a;font-weight:600">Terminada</span><br><span style="font-size:11px;color:#667085">disponible ${fdate(seg.fecha_disponibilidad)}</span>`
  if (seg.cantidad_lista) return `Parcial: ${fmt(seg.cantidad_lista)} listas`
  return porConfirmar
}

export function generarEmailHtmlOI(proveedor, filas) {
  const filasHtml = [...filas]
    .sort((a, b) => (fechaEfectiva(a) || '').localeCompare(fechaEfectiva(b) || ''))
    .map(r => {
      const seg = r.seg || {}
      const td = 'border:1px solid #d0d5dd;padding:8px'
      return `<tr>
      <td style="${td};text-align:center">${r.oc}</td>
      <td style="${td}">${r.sku}</td>
      <td style="${td}">${r.descripcion || ''}</td>
      <td style="${td};text-align:right">${fmt(r.saldo_pendiente)}</td>
      <td style="${td};text-align:center">${r.etapaLabel || ''}</td>
      <td style="${td};text-align:center">${produccionTexto(r)}</td>
      <td style="${td};text-align:center">${seg.etd ? fdate(seg.etd) : porConfirmar}</td>
      <td style="${td};text-align:center">${seg.eta ? fdate(seg.eta) : porConfirmar}</td>
    </tr>`
    }).join('')

  const th = 'border:1px solid #00167b;padding:8px'
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Calibri,Arial,sans-serif;font-size:14px;color:#344054;margin:0;padding:0;background:#f9fafb">
  <div style="max-width:880px;margin:0 auto;padding:20px">
    <div style="background:#00167b;padding:16px 24px;border-radius:8px 8px 0 0">
      <h2 style="color:#ffffff;margin:0;font-size:18px">Solicitud de estatus de importación</h2>
      <div style="color:#a3b8ff;font-size:12px;margin-top:4px">${new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
    </div>
    <div style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
      <p>Estimados <strong>${proveedor}</strong>,</p>
      <p>Les agradeceremos confirmar el estatus actual de las siguientes órdenes de importación pendientes:</p>
      <ul style="margin:8px 0 8px 20px;padding:0">
        <li>¿La producción ya fue <strong>terminada</strong>? (si no, fecha estimada de término)</li>
        <li><strong>Fecha de embarque</strong> (ETD)</li>
        <li><strong>Fecha estimada de llegada</strong> (ETA)</li>
      </ul>
      <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:13px">
        <thead>
          <tr style="background:#00167b;color:#ffffff">
            <th style="${th}">OI</th>
            <th style="${th}">SKU</th>
            <th style="${th}">Material</th>
            <th style="${th};text-align:right">Cantidad pendiente</th>
            <th style="${th}">Estado</th>
            <th style="${th}">Producción</th>
            <th style="${th}">Fecha de embarque (ETD)</th>
            <th style="${th}">ETA</th>
          </tr>
        </thead>
        <tbody>
          ${filasHtml}
        </tbody>
      </table>
      <p>Los datos marcados como <span style="color:#d97706;font-weight:600">Por confirmar</span> son los que aún no tenemos. Si alguna fecha ya informada cambió, por favor indíquenoslo.</p>
      <p style="margin-top:24px">Saludos cordiales,</p>
      <p style="margin:4px 0"><strong>Johany Cueto</strong><br>
      Compras - Materiales de empaque<br>
      <span style="color:#0060ae">Roxfarma S.A.</span></p>
    </div>
    <div style="text-align:center;margin-top:12px;font-size:11px;color:#98a2b3">
      Correo generado desde el sistema de seguimiento de materiales de empaque.
    </div>
  </div>
</body>
</html>`
}

// --- Envio ---

export async function enviarRecordatorio(to, cc, subject, html) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/enviar-recordatorio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: JSON.stringify({ to, cc, subject, html }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Error enviando correo')
  return data
}

// --- Autorizacion de Outlook (modo delegado, ver api/outlook-autorizar.js) ---

async function llamarOutlookAutorizar(method) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/outlook-autorizar', {
    method,
    headers: { Authorization: `Bearer ${session?.access_token || ''}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Error consultando Outlook')
  return data
}

export const estadoOutlook = () => llamarOutlookAutorizar('GET')

export async function autorizarOutlook() {
  const { url } = await llamarOutlookAutorizar('POST')
  window.location.href = url
}

// --- Utilidad de mes ---

export function claveMes(offset) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function nombreCorto(clave) {
  const [y, m] = clave.split('-')
  const nombre = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-PE', { month: 'long' })
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${y}`
}
