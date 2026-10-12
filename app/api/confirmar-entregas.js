import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY,
)

function simpleHash(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}

function verificarToken(token) {
  const dot = (token || '').lastIndexOf('.')
  if (dot < 1) return null
  const b64 = token.slice(0, dot)
  const hmac = token.slice(dot + 1)
  try {
    const raw = b64.replace(/-/g, '+').replace(/_/g, '/')
    const proveedor = decodeURIComponent(escape(atob(raw)))
    const expected = simpleHash('roxfarma-confirmar-2026' + proveedor)
    if (hmac !== expected) return null
    return proveedor
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const token = req.query.token || req.body?.token
  const proveedor = verificarToken(token)
  if (!proveedor) {
    return res.status(403).json({ error: 'Token invalido o expirado.' })
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('programacion_oc')
      .select('id_entrega, oc, sku, descripcion, cant_programada, cant_ingresada, fecha_programada_ingreso, fecha_confirmada, estado_gestion, ajuste_cantidad')
      .ilike('proveedor', proveedor)
    if (error) return res.status(500).json({ error: error.message })

    const abiertas = (data || []).filter(r => {
      const ajuste = r.ajuste_cantidad || 0
      const prog = (r.cant_programada || 0) + ajuste
      const saldo = Math.max(0, prog - (r.cant_ingresada || 0))
      return saldo > 0 && !['Cerrado', 'Orden Anulada'].includes(r.estado_gestion)
    })

    return res.status(200).json({
      proveedor,
      entregas: abiertas.map(r => ({
        id: r.id_entrega,
        oc: r.oc,
        sku: r.sku,
        descripcion: r.descripcion,
        cantidad: Math.max(0, (r.cant_programada || 0) + (r.ajuste_cantidad || 0) - (r.cant_ingresada || 0)),
        fecha_programada: r.fecha_programada_ingreso,
        fecha_confirmada: r.fecha_confirmada,
      })),
    })
  }

  if (req.method === 'POST') {
    const { confirmaciones } = req.body
    if (!Array.isArray(confirmaciones) || confirmaciones.length === 0) {
      return res.status(400).json({ error: 'Envía un array de confirmaciones [{id, fecha}]' })
    }

    const ids = confirmaciones.map(c => c.id)
    const { data: rows } = await supabase
      .from('programacion_oc')
      .select('id_entrega, proveedor')
      .in('id_entrega', ids)

    const norm = s => (s || '').trim().toUpperCase()
    const provNorm = norm(proveedor)
    const validos = (rows || []).filter(r => norm(r.proveedor) === provNorm)
    const idsValidos = new Set(validos.map(r => r.id_entrega))

    const errores = []
    const exitosos = []

    for (const c of confirmaciones) {
      if (!idsValidos.has(c.id)) {
        errores.push({ id: c.id, error: 'No pertenece a este proveedor' })
        continue
      }
      const { error } = await supabase
        .from('programacion_oc')
        .update({ fecha_confirmada: c.fecha })
        .eq('id_entrega', c.id)
      if (error) {
        errores.push({ id: c.id, error: error.message })
      } else {
        exitosos.push(c.id)
      }
    }

    return res.status(200).json({ ok: true, confirmados: exitosos.length, errores })
  }

  return res.status(405).json({ error: 'Metodo no permitido' })
}
