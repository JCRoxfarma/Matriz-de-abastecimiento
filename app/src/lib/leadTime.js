import { supabase } from './supabaseClient'

// Tipos de material para el lead time. Se detectan por palabras de la
// descripcion, en este orden (el primero que calce gana: "TUBO ALUMINIO"
// es tubo, no blister; una caja que dice "EMBALAJE" es embalaje, no
// estuche). Si un codigo cae en el tipo equivocado, se le pone
// su propio lead time en la pestana "Lead time".
export const TIPOS = [
  { id: 'tubo', label: 'Tubos', re: /\bTUBOS?\b/ },
  { id: 'prospecto', label: 'Prospectos / insertos', re: /\b(PROSP|INSERT)/ },
  { id: 'etiqueta', label: 'Etiquetas', re: /\bETIQ/ },
  { id: 'embalaje', label: 'Cajas de embalaje', re: /EMBALAJ/ },
  { id: 'caja', label: 'Estuches', re: /\b(CJS?|CAJAS?|ESTUCHES?)\b/ },
  { id: 'frasco', label: 'Frascos', re: /\b(FCOS?|FRASCOS?)\b/ },
  { id: 'tapa', label: 'Tapas', re: /\b(TAPAS?|TAPON(ES)?)\b/ },
  { id: 'blister', label: 'Blíster / foil', re: /\b(BLISTER|FOIL|PVC)/ },
  { id: 'otro', label: 'Otros', re: null },
]
export const TIPO_LABEL = Object.fromEntries(TIPOS.map(t => [t.id, t.label]))

export function detectarTipo(descripcion) {
  const d = String(descripcion || '').toUpperCase()
  return (TIPOS.find(t => t.re && t.re.test(d)) || TIPOS[TIPOS.length - 1]).id
}

// Lead time configurado para una entrega de programacion_oc: el propio del
// codigo si lo tiene, si no el de su tipo segun su origen (Local /
// Importado). Mismas reglas que Explosion de materiales.
export function leadTimeEsperado(row, leadTimes) {
  if (!leadTimes) return null
  const excepcion = leadTimes.materiales.get(String(row.sku)) || null
  const origen = excepcion?.origen || row.origen || 'Local'
  const tipo = detectarTipo(row.descripcion)
  const porTipo = leadTimes.tipos.get(tipo)
  const delTipo = porTipo ? (origen === 'Importado' ? porTipo.importado : porTipo.local) : null
  const dias = excepcion?.dias ?? delTipo ?? null
  return { dias, tipo, tipoLabel: TIPO_LABEL[tipo], origen, fuente: excepcion?.dias != null ? 'propio' : 'tipo' }
}

// Lead time real: dias desde la emision de la orden hasta que la entrega
// se completo (fecha real de ingreso). Si aun no llega, los dias que van.
export function leadTimeReal(row) {
  if (!row.fecha_emision_oc) return null
  const desde = new Date(row.fecha_emision_oc + 'T00:00:00')
  if (row.fecha_real_ingreso) {
    return { llego: true, dias: Math.round((new Date(row.fecha_real_ingreso + 'T00:00:00') - desde) / 864e5) }
  }
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return { llego: false, dias: Math.round((hoy - desde) / 864e5) }
}

// Devuelve null si las tablas todavia no existen en Supabase (falta correr
// supabase/lead_time.sql): el resto de la explosion sigue funcionando, solo
// sin fecha limite para pedir.
export async function obtenerLeadTimes() {
  const [tipos, materiales] = await Promise.all([
    supabase.from('lead_time_tipos').select('tipo,dias_local,dias_importado'),
    supabase.from('lead_time_materiales').select('codigo,origen,dias'),
  ])
  if (tipos.error || materiales.error) return null
  return {
    tipos: new Map(tipos.data.map(t => [t.tipo, { local: t.dias_local, importado: t.dias_importado }])),
    materiales: new Map(materiales.data.map(m => [m.codigo, { origen: m.origen, dias: m.dias }])),
  }
}

export async function guardarLeadTimeTipo(tipo, campos) {
  // upsert y no update: un tipo agregado despues (ej. embalaje) todavia
  // no tiene fila en la tabla hasta que se le pone su primer valor.
  const { error } = await supabase.from('lead_time_tipos')
    .upsert({ tipo, ...campos, actualizado_en: new Date().toISOString() })
  if (error) throw error
}

// Si el codigo queda sin origen ni dias propios, se borra la excepcion y
// vuelve a usar los valores por defecto.
export async function guardarLeadTimeMaterial(codigo, { origen, dias }) {
  if (!origen && dias == null) {
    const { error } = await supabase.from('lead_time_materiales').delete().eq('codigo', codigo)
    if (error) throw error
    return
  }
  const { error } = await supabase.from('lead_time_materiales')
    .upsert({ codigo, origen: origen || null, dias: dias ?? null, actualizado_en: new Date().toISOString() })
  if (error) throw error
}
