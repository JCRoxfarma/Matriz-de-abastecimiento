import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'
import { insertInBatches } from './importer'

const ALMACENES = ['E01', 'E02', 'E24']
// Producto terminado (nov-2026, Johany): del mismo reporte, el stock
// vigente de PT es P01 (disponible) + P02 (cuarentena) + P19 (contingencia).
const ALMACENES_PT = ['P01', 'P02', 'P19']

function fechaDesdeTexto(texto) {
  const m = String(texto || '').match(/(\d{1,2})\.(\d{1,2})/)
  if (!m) return null
  const dia = m[1].padStart(2, '0')
  const mes = m[2].padStart(2, '0')
  return `${new Date().getFullYear()}-${mes}-${dia}`
}

export async function importarStock(file, onStep) {
  onStep?.('Leyendo el archivo...')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sh = wb.Sheets[wb.SheetNames[0]]
  if (!sh) throw new Error('El archivo no tiene hojas.')
  const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: null })
  const header = rows[0] || []

  const iAlm = header.indexOf('alm_codigo')
  const iCodigo = header.indexOf('art_codigo')
  const iDescripcion = header.indexOf('art_nombre')
  const iStock = header.indexOf('stock')
  const iVersion = header.indexOf('version')
  const iUnidad = header.indexOf('ume_abrv')

  if (iAlm === -1 || iCodigo === -1 || iStock === -1) {
    throw new Error('No se encontraron las columnas esperadas (alm_codigo, art_codigo, stock). ¿Es el archivo correcto?')
  }

  onStep?.('Procesando stock por almacén...')
  const porCodigo = new Map()
  const porCodigoPT = new Map()
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const alm = String(row[iAlm] || '').trim()
    if (ALMACENES_PT.includes(alm)) {
      const codigo = String(row[iCodigo] || '').trim()
      if (codigo) {
        if (!porCodigoPT.has(codigo)) {
          porCodigoPT.set(codigo, {
            codigo,
            descripcion: iDescripcion >= 0 && row[iDescripcion] != null ? String(row[iDescripcion]).trim() : null,
            unidad: iUnidad >= 0 && row[iUnidad] != null ? String(row[iUnidad]).trim() : null,
            stock_p01: 0, stock_p02: 0, stock_p19: 0, stock_total: 0,
          })
        }
        const pt = porCodigoPT.get(codigo)
        const stock = Number(row[iStock]) || 0
        pt['stock_' + alm.toLowerCase()] += stock
        pt.stock_total += stock
      }
      continue
    }
    if (!ALMACENES.includes(alm)) continue
    const codigo = String(row[iCodigo] || '').trim()
    if (!codigo) continue
    const stock = Number(row[iStock]) || 0
    const version = iVersion >= 0 && row[iVersion] != null ? String(row[iVersion]).trim() : null
    const descripcion = iDescripcion >= 0 && row[iDescripcion] != null ? String(row[iDescripcion]).trim() : null

    if (!porCodigo.has(codigo)) {
      porCodigo.set(codigo, { codigo, descripcion, stock_e01: 0, stock_e02: 0, stock_e24: 0, stock_total: 0, versiones: new Set() })
    }
    const entry = porCodigo.get(codigo)
    if (alm === 'E01') entry.stock_e01 += stock
    else if (alm === 'E02') entry.stock_e02 += stock
    else if (alm === 'E24') entry.stock_e24 += stock
    entry.stock_total += stock
    if (version) entry.versiones.add(version)
    if (!entry.descripcion && descripcion) entry.descripcion = descripcion
  }

  if (porCodigo.size === 0) {
    throw new Error('No se encontró ningún material en los almacenes E01, E02 o E24.')
  }

  const fechaStock = fechaDesdeTexto(file.name) || fechaDesdeTexto(wb.SheetNames[0]) || new Date().toISOString().slice(0, 10)

  onStep?.('Guardando en la base de datos...')
  const { error: errDelete } = await supabase.from('stock_diario').delete().gt('id', 0)
  if (errDelete) throw errDelete

  const filas = [...porCodigo.values()].map(e => ({
    codigo: e.codigo,
    descripcion: e.descripcion,
    stock_e01: e.stock_e01,
    stock_e02: e.stock_e02,
    stock_e24: e.stock_e24,
    stock_total: e.stock_total,
    version: [...e.versiones].filter(Boolean).join(', ') || null,
    fecha_stock: fechaStock,
  }))

  await insertInBatches('stock_diario', filas)

  // Stock de producto terminado, en su propia tabla. Si fallara, no se
  // pierde la carga de material de empaque (ya guardada arriba).
  let productosPT = 0
  let errorPT = null
  if (porCodigoPT.size > 0) {
    try {
      const { error: errDelPT } = await supabase.from('stock_pt').delete().gt('id', 0)
      if (errDelPT) throw errDelPT
      await insertInBatches('stock_pt', [...porCodigoPT.values()].map(e => ({ ...e, fecha_stock: fechaStock })))
      productosPT = porCodigoPT.size
    } catch (e) { errorPT = e.message || String(e) }
  }

  return { materiales: porCodigo.size, fecha: fechaStock, productosPT, errorPT }
}

// Stock vigente de producto terminado (P01 + P02 + P19) por codigo.
export async function obtenerStockPT() {
  try {
    const { data, error } = await supabase.from('stock_pt')
      .select('codigo,descripcion,unidad,stock_p01,stock_p02,stock_p19,stock_total,fecha_stock')
    if (error || !data || data.length === 0) return null
    return { mapa: new Map(data.map(r => [r.codigo, r])), fecha: data[0].fecha_stock }
  } catch {
    return null
  }
}

export async function obtenerStockDiario() {
  try {
    const { data, error } = await supabase
      .from('stock_diario')
      .select('codigo,stock_e01,stock_e02,stock_e24,stock_total,version,fecha_stock')
    if (error || !data || data.length === 0) return null

    const mapa = new Map()
    for (const row of data) {
      mapa.set(row.codigo, {
        e01: row.stock_e01,
        e02: row.stock_e02,
        e24: row.stock_e24,
        total: row.stock_total,
        version: row.version,
      })
    }
    return { mapa, fecha: data[0].fecha_stock }
  } catch {
    return null
  }
}
