import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'
import { PROGRAMACION_COLUMNS, EDITABLE_ON_APP, INGRESOS_COLUMNS, INGRESOS_RAW_COLUMNS } from './schema'

const cleanText = v => {
  if (v == null) return null
  const s = String(v).replace(/_x000[dD]_/g, '').replace(/_x000[aA]_/g, ' ').trim()
  return s === '' ? null : s
}
const isoDate = v => {
  if (v == null || v === '') return null
  if (v instanceof Date) {
    if (isNaN(v)) return null
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, '0'), day = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  // Las filas que Johany agrega a mano a veces quedan fuera del formato de
  // fecha de la tabla, y el Excel guarda "26/08/2026" como texto en vez de
  // fecha. new Date() de JS no entiende dia/mes/año (lo confunde con el
  // formato americano mes/dia/año y falla), asi que se parsea a mano.
  const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) {
    const [, d, mo, y] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const d = new Date(v)
  if (isNaN(d)) return null
  const y = d.getFullYear(), mm = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mm}-${day}`
}
const toNumber = v => (v == null || v === '') ? null : Number(v)
const toInt = v => (v == null || v === '') ? null : parseInt(v, 10)
// El archivo de ingresos a veces trae el numero de OC como "OC2500003055"
// en vez de 2500003055. Se le quita cualquier letra pegada adelante.
const toOc = v => {
  if (v == null || v === '') return null
  const s = String(v).replace(/^\D+/, '').trim()
  return s === '' ? null : parseInt(s, 10)
}

function convertCell(type, value) {
  if (type === 'date') return isoDate(value)
  if (type === 'number') return toNumber(value)
  if (type === 'int') return toInt(value)
  if (type === 'oc') return toOc(value)
  return cleanText(value)
}

export function mapRow(rawRow, columns) {
  const out = {}
  for (const { header, field, type } of columns) out[field] = convertCell(type, rawRow[header])
  return out
}

// Supabase (PostgREST) nunca devuelve mas de 1000 filas en un solo select,
// aunque no se ponga ningun .limit() -- lo corta solo. Sin esto, cualquier
// tabla que crezca mas alla de eso empieza a perder filas en silencio, sin
// ningun error. Se usa para toda lectura completa de una tabla, no solo al
// importar.
export async function fetchAll(table, select, filter = q => q) {
  const pageSize = 1000
  let from = 0
  let all = []
  while (true) {
    const { data, error } = await filter(supabase.from(table).select(select)).range(from, from + pageSize - 1)
    if (error) throw error
    all = all.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

export async function upsertInBatches(table, rows, onConflict, size = 200) {
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size)
    const { error } = await supabase.from(table).upsert(batch, { onConflict })
    if (error) throw error
  }
}

async function registrarImportacion(tipo, archivo, filas) {
  const { error } = await supabase.from('importaciones').insert({ tipo, archivo, filas })
  if (error) throw error
}

export async function insertInBatches(table, rows, size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size)
    if (!batch.length) continue
    const { error } = await supabase.from(table).insert(batch)
    if (error) throw error
  }
}

// Reparte los ingresos de una OC+SKU entre sus entregas en orden (E01 antes
// que E02), y marca en que fecha se completo cada una. Asi lo hace hoy el
// Excel de Johany: el proveedor entrega la E01 completa antes de mandar la E02.
// Cada entrega se llena hasta su programado efectivo: lo del Excel mas el
// ajuste excepcional hecho desde la app (igual que enrich en derive.js).
// Asi, si se unen dos entregas (+12,000 en la E01 y -12,000 en la E02),
// lo que llega completa primero la E01 unificada.
const programadoEfectivo = e => Math.max(0, (e.cant_programada || 0) + (e.ajuste_cantidad || 0))

export function calcularIngresos(entregas, eventos) {
  entregas.sort((a, b) => (a.orden_entrega || 0) - (b.orden_entrega || 0))
  eventos.sort((a, b) => (a.fecha_ingreso || '').localeCompare(b.fecha_ingreso || ''))

  let entregaIdx = 0
  let acumuladoEnEntrega = 0
  for (const ev of eventos) {
    let restante = ev.cantidad_ingresada || 0
    while (restante > 0 && entregaIdx < entregas.length) {
      const e = entregas[entregaIdx]
      const falta = programadoEfectivo(e) - acumuladoEnEntrega
      const usar = Math.min(restante, Math.max(falta, 0))
      acumuladoEnEntrega += usar
      restante -= usar
      if (acumuladoEnEntrega >= programadoEfectivo(e)) {
        e._fechaCompleta = ev.fecha_ingreso
        entregaIdx++
        acumuladoEnEntrega = 0
      }
    }
  }
  const totalIngresado = eventos.reduce((a, e) => a + (e.cantidad_ingresada || 0), 0)
  let restanteGlobal = totalIngresado
  entregas.forEach((e, i) => {
    // Cada entrega se llena hasta su propio programado, y el resto pasa a
    // la siguiente (asi entregan los proveedores). La ultima entrega de la
    // OC+SKU no tiene a donde pasar lo que sobre, asi que se queda con
    // todo lo que llegue de mas: si no, una demasia (llego mas de lo
    // programado) se perdia sin mostrarse en ningun lado.
    const esUltima = i === entregas.length - 1
    const prog = programadoEfectivo(e)
    const fill = esUltima ? restanteGlobal : Math.min(restanteGlobal, prog)
    restanteGlobal -= fill
    const saldo = Math.max(0, prog - fill)
    e.cant_ingresada = fill
    e.saldo_pendiente = saldo
    e.pct_ingreso = prog ? Math.round((fill / prog) * 1000) / 10 : 0
    // "Parcial" ya no es un estado aparte: si queda saldo, sea porque no
    // llego nada o porque llego solo una parte, para el seguimiento da lo
    // mismo, sigue Pendiente. La cantidad exacta que ya llego se sigue
    // viendo en Cant. Ingresada / Saldo pendiente / % de avance.
    e.estado_ingreso = saldo > 0 ? 'Pendiente' : 'Completo'
    e.fecha_real_ingreso = e._fechaCompleta || null
    e.dias_atraso = (e.fecha_real_ingreso && e.fecha_programada_ingreso)
      ? Math.max(0, Math.round((new Date(e.fecha_real_ingreso) - new Date(e.fecha_programada_ingreso)) / 864e5))
      : null
    e.valor_ingresado = e.precio_unitario != null ? Math.round(e.precio_unitario * fill * 100) / 100 : null
    e.valor_pendiente = e.precio_unitario != null ? Math.round(e.precio_unitario * saldo * 100) / 100 : null
    delete e._fechaCompleta
  })
}

// Junta entregas y eventos de ingreso por OC+SKU, y llama a calcularIngresos
// en cada grupo. Lo usan tanto el importador del Excel combinado como el
// del archivo de ingresos aparte.
function recalcularGrupos(entregas, eventos) {
  const eventosPorGrupo = new Map()
  for (const ev of eventos) {
    const k = `${ev.oc}|${ev.codigo}`
    if (!eventosPorGrupo.has(k)) eventosPorGrupo.set(k, [])
    eventosPorGrupo.get(k).push(ev)
  }
  const entregasPorGrupo = new Map()
  for (const e of entregas) {
    const k = `${e.oc}|${e.sku}`
    if (!entregasPorGrupo.has(k)) entregasPorGrupo.set(k, [])
    entregasPorGrupo.get(k).push(e)
  }
  for (const [k, grupo] of entregasPorGrupo) calcularIngresos(grupo, eventosPorGrupo.get(k) || [])
}

export async function importarExcel(file, onStep) {
  onStep?.('Leyendo el archivo...')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })

  const shProg = wb.Sheets['ProgramacionOC']
  if (!shProg) {
    throw new Error('El archivo no tiene la hoja "ProgramacionOC" esperada.')
  }
  // La hoja "IngresosSistema" es opcional: el Excel que se descarga desde
  // Exportar Excel (por ejemplo para agregar OC nuevas a mano) solo trae
  // ProgramacionOC, y eso es valido, simplemente no hay ingresos nuevos
  // que sumar en esta importacion.
  const shIng = wb.Sheets['IngresosSistema']
  const rawProg = XLSX.utils.sheet_to_json(shProg, { defval: null })
  const rawIng = shIng ? XLSX.utils.sheet_to_json(shIng, { defval: null }) : []

  onStep?.('Revisando lo que ya tienes guardado...')
  const existentesProg = await fetchAll('programacion_oc',
    'id_entrega,fecha_programada_ingreso,estado_gestion,motivo_demora,responsable_accion,criticidad,observaciones,cierre_manual,motivo_cierre,reabierta,historial,fecha_confirmada,ajuste_cantidad,motivo_ajuste')
  const existentesPorId = new Map(existentesProg.map(r => [r.id_entrega, r]))

  const existentesIng = await fetchAll('ingresos_sistema', 'numero_analisis,oc,codigo,cantidad_ingresada,fecha_ingreso')
  const numerosExistentes = new Set(existentesIng.map(r => r.numero_analisis))

  onStep?.('Preparando las entregas...')
  const entregas = rawProg.map(raw => {
    const base = mapRow(raw, PROGRAMACION_COLUMNS)
    // "Origen" no viene del Excel: se calcula solo a partir de "Tipo
    // documento" ('OC' -> 'Local', 'OI' -> 'Importado'), asi Johany no
    // tiene que agregar ni mantener ninguna columna nueva en su archivo.
    base.origen = base.tipo_documento === 'OI' ? 'Importado' : base.tipo_documento === 'OC' ? 'Local' : null
    // No confiamos en que la columna "ID entrega" del Excel siempre venga
    // llena (a veces esta vacia): la armamos nosotros mismos con OC, SKU
    // y N. entrega, que es exactamente como esta armada cuando si viene.
    base.id_entrega = `${base.oc}-${base.sku}-${base.n_entrega}`
    // Tampoco confiamos en la columna "Orden entrega" del Excel (esta pensada
    // para salir de una formula sobre N. entrega, pero a veces viene vacia o
    // repetida). La calculamos nosotros mismos para que el reparto FIFO de
    // ingresos siempre llene primero la E01, nunca al reves.
    base.orden_entrega = parseInt(String(base.n_entrega || '').replace(/\D/g, ''), 10) || null
    const prev = existentesPorId.get(base.id_entrega)
    const editable = {}
    for (const col of EDITABLE_ON_APP) {
      if (col.field === 'estado_gestion') {
        // El estado de gestion es un campo que solo debe moverlo la gente
        // desde el panel de la app (En seguimiento / Reprogramado / Cerrado).
        // No se toma nunca del Excel, ni siquiera en una fila nueva: si se
        // tomara, un "Cerrado" viejo o mal puesto en su archivo original se
        // quedaria pegado para siempre, aunque la entrega siga con saldo
        // pendiente. Si queda vacio, la app ya calcula sola un estado
        // razonable (Cerrado si no queda saldo, Atrasado si se paso la
        // fecha, o "En seguimiento" por defecto) en derive.js/exporter.js.
        editable.estado_gestion = prev ? prev.estado_gestion : null
      } else {
        editable[col.field] = prev ? prev[col.field] : convertCell(col.type, raw[col.header])
      }
    }
    return {
      ...base,
      ...editable,
      // Solo se protege la fecha si de verdad se reprogramo desde la app
      // (eso queda anotado en el historial). Si nunca se toco desde ahi,
      // se deja pasar la que traiga el Excel, para que las correcciones
      // que hagas en tu archivo (fechas mal cargadas, vacias, etc.) si
      // lleguen. Sin esto, cualquier dato viejo o mal cargado se quedaba
      // pegado para siempre.
      fecha_programada_ingreso: (prev && prev.historial && prev.historial.length > 0) ? prev.fecha_programada_ingreso : base.fecha_programada_ingreso,
      reabierta: prev ? prev.reabierta : false,
      historial: prev ? prev.historial : [],
      fecha_confirmada: prev ? prev.fecha_confirmada : null,
      ajuste_cantidad: prev ? (prev.ajuste_cantidad || 0) : 0,
      motivo_ajuste: prev ? prev.motivo_ajuste : null,
    }
  }).filter(e => e.id_entrega && e.sku)

  // A veces el Excel trae la misma entrega repetida dos veces (mismo OC,
  // SKU y numero de entrega, cargada desde dos archivos de origen distintos).
  // Nos quedamos con una sola copia para no duplicar cantidades.
  const entregasUnicas = [...new Map(entregas.map(e => [e.id_entrega, e])).values()]

  onStep?.('Sumando los ingresos nuevos...')
  const ingresosNuevosRaw = rawIng
    .map(raw => mapRow(raw, INGRESOS_COLUMNS))
    .filter(e => e.numero_analisis && !numerosExistentes.has(e.numero_analisis))
  // Igual que con las entregas, el Excel puede traer el mismo ingreso
  // repetido dos veces si viene de dos archivos de origen distintos.
  const ingresosNuevos = [...new Map(ingresosNuevosRaw.map(e => [e.numero_analisis, e])).values()]

  onStep?.('Calculando avance de cada entrega...')
  recalcularGrupos(entregasUnicas, [...existentesIng, ...ingresosNuevos])

  onStep?.('Guardando en la base de datos...')
  await upsertInBatches('programacion_oc', entregasUnicas, 'id_entrega')
  await insertInBatches('ingresos_sistema', ingresosNuevos)
  await registrarImportacion('programacion', file.name, entregasUnicas.length)

  return {
    entregas: entregasUnicas.length,
    ingresosNuevos: ingresosNuevos.length,
  }
}

// El archivo que Johany descarga aparte del sistema, con lo que entro
// realmente a almacen. No trae la programacion de OC, asi que aqui solo se
// agregan los ingresos nuevos y se recalculan las entregas ya guardadas.
export async function importarIngresos(file, onStep) {
  onStep?.('Leyendo el archivo...')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const hoja = wb.Sheets[wb.SheetNames[0]]
  if (!hoja) throw new Error('No se pudo leer el archivo.')
  const rawIng = XLSX.utils.sheet_to_json(hoja, { defval: null })

  onStep?.('Revisando lo que ya tienes guardado...')
  const existentesIng = await fetchAll('ingresos_sistema', 'numero_analisis,oc,codigo,cantidad_ingresada,fecha_ingreso')
  const numerosExistentes = new Set(existentesIng.map(r => r.numero_analisis))

  onStep?.('Sumando los ingresos nuevos...')
  const ingresosNuevosRaw = rawIng
    .map(raw => ({ ...mapRow(raw, INGRESOS_RAW_COLUMNS), archivo_origen_ingreso: file.name }))
    .filter(e => e.numero_analisis && !numerosExistentes.has(e.numero_analisis))
  const ingresosNuevos = [...new Map(ingresosNuevosRaw.map(e => [e.numero_analisis, e])).values()]
    .map(e => ({ ...e, ingreso_acumulado: e.cantidad_ingresada }))

  onStep?.('Calculando avance de cada entrega...')
  const entregas = await fetchAll('programacion_oc',
    'id_entrega,oc,sku,orden_entrega,cant_programada,precio_unitario,fecha_programada_ingreso')
  recalcularGrupos(entregas, [...existentesIng, ...ingresosNuevos])

  onStep?.('Guardando en la base de datos...')
  await insertInBatches('ingresos_sistema', ingresosNuevos)
  const actualizaciones = entregas.map(e => ({
    id_entrega: e.id_entrega,
    // oc y sku son obligatorias en la tabla: aunque no cambien, Postgres
    // las exige presentes al construir la fila del upsert.
    oc: e.oc,
    sku: e.sku,
    cant_ingresada: e.cant_ingresada,
    saldo_pendiente: e.saldo_pendiente,
    pct_ingreso: e.pct_ingreso,
    estado_ingreso: e.estado_ingreso,
    fecha_real_ingreso: e.fecha_real_ingreso,
    dias_atraso: e.dias_atraso,
    valor_ingresado: e.valor_ingresado,
    valor_pendiente: e.valor_pendiente,
  }))
  await upsertInBatches('programacion_oc', actualizaciones, 'id_entrega')
  await registrarImportacion('ingresos', file.name, ingresosNuevos.length)

  return {
    ingresosNuevos: ingresosNuevos.length,
    entregasActualizadas: entregas.length,
  }
}
