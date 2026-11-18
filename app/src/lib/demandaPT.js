import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'

// Demanda de producto terminado: hoja DATOS del Excel "Cobertura_Maquila"
// de Johany. Se toma el plan de ventas mensual (la demanda), el lote, el
// proveedor, el lead time y la venta real. El stock de esa hoja NO se usa:
// el stock vigente sale de stock_pt (P01 + P02 + P19).

const norm = v => String(v ?? '').trim().toUpperCase()
const mesKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`
const num = v => {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

// Lee la hoja DATOS. Fila 1: titulos de bloque ("PLAN DE VENTAS 2026",
// "PLAN DE VENTAS 2027", "CANTIDAD VENDIDA real 2026"); fila 2: encabezados
// (CODIGO, DESCRIPCION, meses..., LOTE, PROVEEDOR, LEAD TIME...).
export function leerHojaDatos(wb) {
  const nombre = wb.SheetNames.find(n => norm(n) === 'DATOS')
  if (!nombre) throw new Error('El archivo no tiene la hoja "DATOS".')
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, defval: null })
  const t = (rows[0] || []).map(norm)
  const h = (rows[1] || []).map(norm)
  const col = nombreCol => h.findIndex(x => x === nombreCol)
  const iCod = col('CODIGO'), iDes = col('DESCRIPCION'), iLote = col('LOTE'), iProv = col('PROVEEDOR'), iLt = col('LEAD TIME')
  if (iCod < 0) throw new Error('No se encontró la columna CODIGO en la hoja DATOS.')

  // Bloques de meses: cada "PLAN DE VENTAS aaaa" son 12 columnas desde ahi.
  const bloquesPlan = []
  t.forEach((x, i) => { const m = x.match(/PLAN DE VENTAS (\d{4})/); if (m) bloquesPlan.push({ i, anio: Number(m[1]) }) })
  if (!bloquesPlan.length) throw new Error('No se encontró "PLAN DE VENTAS" en la hoja DATOS.')
  const iReal = t.findIndex(x => x.includes('CANTIDAD VENDIDA'))
  const anioReal = iReal >= 0 ? Number((t[iReal].match(/(\d{4})/) || [])[1]) || bloquesPlan[0].anio : null

  const productos = []
  for (const r of rows.slice(2)) {
    const codigo = String(r[iCod] ?? '').trim()
    if (!/^\d{5,}$/.test(codigo)) continue
    const plan = {}
    for (const b of bloquesPlan) for (let k = 0; k < 12; k++) {
      const v = num(r[b.i + k]); if (v != null) plan[mesKey(b.anio, k + 1)] = v
    }
    const venta_real = {}
    if (iReal >= 0) for (let k = 0; k < 12; k++) { const v = num(r[iReal + k]); if (v != null) venta_real[mesKey(anioReal, k + 1)] = v }
    productos.push({
      codigo,
      descripcion: iDes >= 0 ? String(r[iDes] ?? '').trim() : null,
      proveedor: iProv >= 0 ? String(r[iProv] ?? '').trim() : null,
      lote: iLote >= 0 ? num(r[iLote]) : null,
      lead_time_dias: iLt >= 0 ? num(r[iLt]) : null,
      plan, venta_real,
    })
  }
  if (!productos.length) throw new Error('La hoja DATOS no tiene productos con código.')
  return productos
}

export async function importarDemandaPT(file, onStep) {
  onStep?.('Leyendo la hoja DATOS...')
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const productos = leerHojaDatos(wb).map(p => ({ ...p, archivo: file.name, actualizado_en: new Date().toISOString() }))
  onStep?.('Guardando...')
  const { error } = await supabase.from('demanda_pt').upsert(productos, { onConflict: 'codigo' })
  if (error) throw error
  return { productos: productos.length }
}

export async function obtenerDemandaPT() {
  const { data, error } = await supabase.from('demanda_pt').select('*').order('codigo')
  if (error) throw error
  return data || []
}

// --- Cobertura ---------------------------------------------------------
// Para cada producto: parte del stock vigente (stock_pt), descuenta la
// demanda mes a mes (el mes en curso solo por los dias que faltan) y suma
// lo que falta llegar de sus OC abiertas en el mes de su fecha (si ya
// vencio, cuenta en el mes actual). Dice en que mes se queda sin stock,
// hasta cuando pedir (quiebre - lead time) y cuanto pedir: lotes completos
// para cubrir hasta 2 meses despues del quiebre.
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre']
export const nombreMesCorto = k => { const [y, m] = k.split('-').map(Number); return `${MESES_LARGO[m - 1].slice(0, 3)}-${String(y).slice(2)}` }
const isoHoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const sumarDias = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const x = new Date(y, m - 1, d + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }

export function calcularCobertura({ producto, stockVigente, ocAbiertas, hoy = isoHoy(), mesesExtra = 2 }) {
  const mesHoy = hoy.slice(0, 7)
  const meses = Object.keys(producto.plan).filter(k => k >= mesHoy).sort()
  const [yh, mh, dh] = hoy.split('-').map(Number)
  const diasMes = new Date(yh, mh, 0).getDate()
  const fraccionHoy = (diasMes - dh + 1) / diasMes

  const llegadas = {}
  for (const oc of ocAbiertas) {
    const f = oc.fecha || hoy
    const k = f.slice(0, 7) < mesHoy ? mesHoy : f.slice(0, 7)
    llegadas[k] = (llegadas[k] || 0) + oc.saldo
  }

  let saldo = stockVigente
  let quiebre = null
  const detalle = []
  // Cobertura solo con stock (sin OC), en meses.
  let sinOC = stockVigente, cobertura = 0, contando = true
  for (const k of meses) {
    const dem = (producto.plan[k] || 0) * (k === mesHoy ? fraccionHoy : 1)
    const lleg = llegadas[k] || 0
    const inicio = saldo
    saldo = saldo + lleg - dem
    detalle.push({ mes: k, inicio, demanda: dem, llegadas: lleg, fin: saldo })
    if (saldo < 0 && !quiebre) {
      // Dia aproximado del mes en que se acaba.
      const disponible = inicio + lleg
      const dIni = k === mesHoy ? dh : 1
      const diasK = new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)), 0).getDate()
      const porDia = dem / (diasK - dIni + 1)
      const dia = Math.min(diasK, dIni + Math.max(0, Math.floor(disponible / (porDia || 1))))
      quiebre = { mes: k, fecha: `${k}-${String(dia).padStart(2, '0')}` }
    }
    if (contando) {
      if (sinOC >= dem) { sinOC -= dem; cobertura += k === mesHoy ? fraccionHoy : 1 } else { cobertura += dem ? (sinOC / dem) * (k === mesHoy ? fraccionHoy : 1) : 0; contando = false }
    }
  }

  let pedirAntes = null, sugerido = 0
  if (quiebre) {
    pedirAntes = producto.lead_time_dias ? sumarDias(quiebre.fecha, -producto.lead_time_dias) : null
    const iq = detalle.findIndex(x => x.mes === quiebre.mes)
    const hasta = detalle[Math.min(detalle.length - 1, iq + mesesExtra)]
    const falta = Math.max(0, -hasta.fin)
    const lote = producto.lote || 0
    sugerido = lote > 0 ? Math.ceil(falta / lote) * lote : Math.ceil(falta)
  }
  let estado = 'cubierto'
  if (quiebre) {
    if (pedirAntes && pedirAntes < hoy) estado = 'tarde'
    else if (pedirAntes && pedirAntes <= sumarDias(hoy, 30)) estado = 'pedir_ya'
    else estado = 'con_tiempo'
  }
  const enCamino = ocAbiertas.reduce((a, o) => a + o.saldo, 0)
  return { meses: detalle, quiebre, pedirAntes, sugerido, estado, cobertura, enCamino }
}
