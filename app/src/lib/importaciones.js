import { supabase } from './supabaseClient'

// Trae la ultima importacion de cada tipo (programacion e ingresos), para
// mostrar fijo en la pantalla que archivo se subio y cuando.
export async function ultimasImportaciones() {
  const { data, error } = await supabase
    .from('importaciones')
    .select('tipo,archivo,filas,creado_en')
    .order('creado_en', { ascending: false })
    .limit(10)
  if (error) throw error
  const porTipo = {}
  for (const r of data) {
    if (!porTipo[r.tipo]) porTipo[r.tipo] = r
  }
  return porTipo
}

// Historial de importaciones (pestana Archivos), de la mas reciente a la
// mas antigua.
export async function listarImportaciones(limite = 20) {
  const { data, error } = await supabase
    .from('importaciones')
    .select('tipo,archivo,filas,creado_en')
    .order('creado_en', { ascending: false })
    .limit(limite)
  if (error) throw error
  return data
}

export function hace(fechaIso) {
  const ms = Date.now() - new Date(fechaIso).getTime()
  const min = Math.round(ms / 60000)
  if (min < 1) return 'recien'
  if (min < 60) return `hace ${min} min`
  const horas = Math.round(min / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.round(horas / 24)
  return `hace ${dias} d`
}
