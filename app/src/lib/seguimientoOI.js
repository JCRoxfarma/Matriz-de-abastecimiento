import { supabase } from './supabaseClient'
import { enrich, withEntregas } from './derive'
import { fetchAll } from './importer'

export const ETAPAS = [
  { n: 1, k: 'culminacion', l: 'Confirmación de culminación' },
  { n: 2, k: 'coordinacion', l: 'Coordinación según Incoterm' },
  { n: 3, k: 'despacho', l: 'Despacho internacional' },
  { n: 4, k: 'documentos', l: 'Documentos para nacionalización' },
  { n: 5, k: 'numeracion', l: 'Numeración y preliquidación' },
  { n: 6, k: 'pago', l: 'Pago de derechos' },
  { n: 7, k: 'desaduanaje', l: 'Desaduanaje' },
  { n: 8, k: 'ingreso', l: 'Ingreso a almacén' },
]

export function etapasVisibles(incoterm) {
  if (incoterm === 'EXW') return ETAPAS
  return ETAPAS.filter(e => e.n !== 2)
}

export function calcularEtapa(seg, row) {
  if (row && (row.fecha_real_ingreso || (!row.abierto && row.cant_ingresada > 0))) return 9
  if (!seg) return 1
  const inc = seg.incoterm
  if (!seg.fecha_disponibilidad) return 1
  if (inc === 'EXW' && !seg.fecha_recojo) return 2
  if (!(seg.confirmacion_salida || seg.eta)) return 3
  const docs = seg.doc_factura_comercial && seg.doc_packing_list && seg.doc_bl_awb
    && seg.doc_certificado_origen && seg.doc_seguro && seg.doc_ficha_tecnica
  if (!docs) return 4
  if (!(seg.numero_dua && seg.aprobacion_interna)) return 5
  if (!(seg.fecha_pago_derechos && seg.confirmacion_agente)) return 6
  if (!seg.carga_liberada) return 7
  if (row && row.cant_ingresada > 0) return 8
  if (!seg.fecha_ingreso_almacen) return 8
  return 9
}

export function etapaLabel(n) {
  if (n === 9) return 'Completado'
  return ETAPAS.find(e => e.n === n)?.l || ''
}

export function contarDocs(seg) {
  if (!seg) return 0
  return [seg.doc_factura_comercial, seg.doc_packing_list, seg.doc_bl_awb,
    seg.doc_certificado_origen, seg.doc_seguro, seg.doc_ficha_tecnica]
    .filter(Boolean).length
}

export async function cargarOI() {
  const [oc, seg] = await Promise.all([
    fetchAll('programacion_oc', '*', q => q.eq('tipo_documento', 'OI')),
    fetchAll('seguimiento_oi', '*'),
  ])
  const segMap = new Map(seg.map(s => [s.id_entrega, s]))
  const rows = withEntregas(oc.map(r => {
    const s = segMap.get(r.id_entrega) || null
    const enriched = enrich(r)
    const etapa = calcularEtapa(s, enriched)
    // estadoGestionBase: el estado tal cual esta en la base, para poder
    // recalcular con enrich si despues cambia el ajuste de cantidad.
    return { ...enriched, estadoGestionBase: r.estado_gestion, seg: s, etapa, etapaLabel: etapaLabel(etapa) }
  }))
  return rows
}

export async function guardarSeguimientoOI(id_entrega, patch) {
  const row = { ...patch, id_entrega, updated_at: new Date().toISOString() }
  const { error } = await supabase.from('seguimiento_oi')
    .upsert(row, { onConflict: 'id_entrega' })
  if (error) throw error
}
