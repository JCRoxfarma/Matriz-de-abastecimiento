import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'
import { insertInBatches, fetchAll } from './importer'
import { CERRADAS } from './derive'

// El texto de los encabezados de mes trae el año y cambia cada ciclo (ej.
// "AGO.2026" o "AGOSTO 2026"), pero las tres primeras letras alcanzan para
// identificar el mes en ambos estilos.
const MES3 = { ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SET: 9, SEP: 9, OCT: 10, NOV: 11, DIC: 12 }

function parseMesHeader(v) {
  const s = String(v || '').toUpperCase().trim()
  const m = s.match(/([A-Z]{3,})\D*?(\d{4})/)
  if (!m) return null
  const mes = MES3[m[1].slice(0, 3)]
  const anio = parseInt(m[2], 10)
  if (!mes || !anio) return null
  return `${anio}-${String(mes).padStart(2, '0')}-01`
}

// Ninguna columna de la hoja "explosion" tiene una posicion fija: cada
// ciclo Roxfarma puede insertar, sacar o mover columnas (ya paso con el
// bloque de meses, con "OC EN TRANSITO"/"OC 1".."OC 4", y una vez hasta
// con una columna en blanco al principio que corrio todo un lugar a la
// derecha -- ese corrimiento hizo que "tipo" dejara de ser la columna A y
// el filtro por tipo "ME" no encontrara ninguna fila, sin lanzar ningun
// error). Por eso todo se ubica por el texto del encabezado, nunca por
// indice fijo.
const normalizarHeader = v => String(v || '').trim().toLowerCase()

function columnaObligatoria(header, nombreBuscado, nombreParaError) {
  const i = header.findIndex(h => normalizarHeader(h) === nombreBuscado)
  if (i === -1) {
    throw new Error(`No se encontró la columna "${nombreParaError}" en la hoja "explosion". Puede que la plantilla haya cambiado de columnas.`)
  }
  return i
}

// Ubica por texto todas las columnas de la hoja "explosion" que hacen
// falta, y cuenta cuantos meses trae de verdad el bloque de consumo en
// firme (antes eran siempre 5, ahora pueden ser menos) en vez de asumir
// un numero fijo.
function detectarColumnas(header) {
  const tipo = columnaObligatoria(header, 'tipo', 'tipo')
  const codigo = columnaObligatoria(header, 'codigo', 'codigo')
  const descripcion = columnaObligatoria(header, 'descripcion', 'descripcion')
  const disponible = columnaObligatoria(header, 'disponible', 'disponible')
  const cuarentena = columnaObligatoria(header, 'cuarentena', 'cuarentena')
  const stock = columnaObligatoria(header, 'stock', 'stock')
  const unidadIdx = columnaObligatoria(header, 'unidad', 'unidad')
  const clienteIdx = columnaObligatoria(header, 'cliente', 'Cliente')
  const grupo = header.findIndex(h => /^grupos?$/.test(normalizarHeader(h)))
  if (grupo === -1) {
    throw new Error('No se encontró la columna "Grupos" en la hoja "explosion". Puede que la plantilla haya cambiado de columnas.')
  }

  const proyectadoInicio = unidadIdx + 1
  const firmeInicio = clienteIdx + 1
  // Justo despues del bloque en firme viene el bloque de consumo
  // acumulado, con los mismos meses. Si sus encabezados tambien se leen
  // como mes, el conteo se detiene en cuanto un mes se repite, para no
  // mezclar el acumulado con el firme.
  let mesesCount = 0
  const mesesVistos = new Set()
  for (let mes = parseMesHeader(header[firmeInicio]); mes && !mesesVistos.has(mes); mes = parseMesHeader(header[firmeInicio + mesesCount])) {
    mesesVistos.add(mes)
    mesesCount++
  }
  if (mesesCount === 0) {
    throw new Error(`No se pudo leer ningún mes de consumo en firme despues de la columna "Cliente" (encabezado: "${header[firmeInicio]}"). Puede que la plantilla haya cambiado de columnas.`)
  }

  // El bloque de consumo proyectado (despues de "Unidad") es estadistico y
  // puede traer otra cantidad de meses que el bloque en firme, por eso se
  // ubica cada mes por su propio encabezado y no por la misma posicion
  // que el firme.
  const proyectadoPorMes = new Map()
  for (let i = proyectadoInicio; parseMesHeader(header[i]) && !proyectadoPorMes.has(parseMesHeader(header[i])); i++) {
    proyectadoPorMes.set(parseMesHeader(header[i]), i)
  }

  const versionCols = []
  header.forEach((h, i) => { if (normalizarHeader(h).startsWith('version')) versionCols.push(i) })

  return {
    tipo, codigo, descripcion, disponible, cuarentena, stock,
    proyectadoPorMes, cliente: clienteIdx, firmeInicio, mesesCount,
    version1: versionCols[0], version2: versionCols[1], version3: versionCols[2], grupo,
  }
}

// Igual que en "explosion": ubicado por texto, no por posicion.
function detectarColumnasDetalle(header) {
  const codigo = columnaObligatoria(header, 'cod.material', 'Cod.Material')
  const fechaFabricacion = columnaObligatoria(header, 'fecha fabricacion', 'Fecha Fabricacion')
  return { codigo, fechaFabricacion }
}

// El nombre del archivo trae la fecha de corte real (ej.
// "Explosion_Analisis__2026.08.27.xlsx"). Se usa para ordenar "anterior
// vs. actual" en vez de la fecha en que se subio -- asi, si algun dia hay
// que volver a subir un archivo viejo (ej. para corregir una carga que
// fallo a la mitad), el orden no se invierte solo porque se subio despues.
function fechaCorteDesdeNombre(nombreArchivo) {
  const m = String(nombreArchivo || '').match(/(\d{4})\.(\d{2})\.(\d{2})/)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

const toNum = v => (v == null || v === '') ? null : Number(v)
const cleanText = v => {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function toDateOnly(v) {
  if (v == null || v === '') return null
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d) ? null : d
}
const fechaStr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const primerDiaMes = d => new Date(d.getFullYear(), d.getMonth(), 1)
// Regla de anticipacion: el material debe ingresar ~el dia 10 del mes
// anterior al de fabricacion (fabricacion octubre -> requerido ~10 de
// setiembre).
const fechaRequeridaDesdeFabricacion = mesFabricacion => new Date(mesFabricacion.getFullYear(), mesFabricacion.getMonth() - 1, 10)

// Solo puede haber un snapshot con rol 'anterior' y uno con rol 'actual' a
// la vez (ver el indice unico en supabase/explosion.sql). "Cargar
// explosión nueva" hace rotar: lo que hasta ahora era 'actual' pasa a ser
// el nuevo 'anterior', y el que era 'anterior' antes de eso pierde el rol
// (se queda en la base como historial, ya no se compara). "Corregir
// explosión anterior" solo reemplaza el 'anterior', sin tocar el 'actual'
// -- para cuando Johany subio mal un archivo y necesita arreglarlo sin
// perder la comparacion en curso.
async function fijarRol(rol) {
  if (rol === 'actual') {
    const { error: errLimpiar } = await supabase.from('explosion_snapshots').update({ rol: null }).eq('rol', 'anterior')
    if (errLimpiar) throw errLimpiar
    const { error: errAscender } = await supabase.from('explosion_snapshots').update({ rol: 'anterior' }).eq('rol', 'actual')
    if (errAscender) throw errAscender
  } else {
    const { error } = await supabase.from('explosion_snapshots').update({ rol: null }).eq('rol', 'anterior')
    if (error) throw error
  }
}

// Lee la hoja "explosion" del archivo que Johany sube periodicamente,
// guarda un snapshot nuevo con solo los materiales ME (uno por mes), para
// poder compararlo despues contra el snapshot anterior. rol es 'actual'
// (Cargar explosión nueva) o 'anterior' (Corregir explosión anterior).
export async function importarExplosion(file, rol, onStep) {
  onStep?.('Leyendo el archivo...')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const sh = wb.Sheets['explosion']
  if (!sh) throw new Error('El archivo no tiene la hoja "explosion" esperada.')
  const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: null })
  const header = rows[0] || []
  const dataRows = rows.slice(1)

  const C = detectarColumnas(header)
  const mesFechas = []
  for (let i = 0; i < C.mesesCount; i++) {
    mesFechas.push(parseMesHeader(header[C.firmeInicio + i]))
  }

  onStep?.('Buscando el mes de fabricación...')
  // El mes de fabricacion mas proximo sale de "explosion_detallada.", no
  // de la hoja principal. Se calcula el resumen (minimo por codigo) aqui
  // y no se guardan las filas crudas del detalle.
  const fabricacionPorCodigo = new Map()
  const shDet = wb.Sheets['explosion_detallada.']
  if (shDet) {
    const detRows = XLSX.utils.sheet_to_json(shDet, { header: 1, defval: null })
    const D = detectarColumnasDetalle(detRows[0] || [])
    for (const row of detRows.slice(1)) {
      if (!row) continue
      const codigo = cleanText(row[D.codigo])
      const fecha = toDateOnly(row[D.fechaFabricacion])
      if (!codigo || !fecha) continue
      const actual = fabricacionPorCodigo.get(codigo)
      if (!actual || fecha < actual) fabricacionPorCodigo.set(codigo, fecha)
    }
  }

  onStep?.('Preparando los materiales...')
  const materiales = []
  for (const row of dataRows) {
    if (!row || row[C.tipo] !== 'ME') continue
    const codigo = cleanText(row[C.codigo])
    if (!codigo) continue
    const fechaFabricacion = fabricacionPorCodigo.get(codigo)
    const mesFabricacionProximo = fechaFabricacion ? primerDiaMes(fechaFabricacion) : null
    const base = {
      codigo,
      descripcion: cleanText(row[C.descripcion]),
      cliente: cleanText(row[C.cliente]),
      grupo: row[C.grupo] != null ? (parseInt(row[C.grupo], 10) || null) : null,
      stock: toNum(row[C.stock]),
      disponible: toNum(row[C.disponible]),
      cuarentena: toNum(row[C.cuarentena]),
      version1: cleanText(row[C.version1]),
      version2: cleanText(row[C.version2]),
      version3: cleanText(row[C.version3]),
      mes_fabricacion_proximo: mesFabricacionProximo ? fechaStr(mesFabricacionProximo) : null,
      fecha_requerida_ingreso: mesFabricacionProximo ? fechaStr(fechaRequeridaDesdeFabricacion(mesFabricacionProximo)) : null,
    }
    for (let i = 0; i < C.mesesCount; i++) {
      materiales.push({
        ...base,
        mes: mesFechas[i],
        consumo_proyectado: C.proyectadoPorMes.has(mesFechas[i]) ? toNum(row[C.proyectadoPorMes.get(mesFechas[i])]) : null,
        consumo_firme: toNum(row[C.firmeInicio + i]),
      })
    }
  }

  // Si ningun material caeria en la explosion (ej. el filtro por tipo
  // "ME" no encontro nada porque las columnas se corrieron y "tipo" ya
  // no dice lo que creiamos que decia), es mejor avisar claro que guardar
  // un snapshot vacio en silencio -- eso ya paso una vez y la comparacion
  // salio con 0 materiales sin ningun error.
  if (materiales.length === 0) {
    throw new Error('No se encontró ningún material tipo "ME" en la hoja "explosion". Revisa que el archivo sea el correcto -- si es el correcto, puede que la plantilla haya cambiado y haya que ajustar el importador.')
  }

  onStep?.('Actualizando el snapshot anterior...')
  await fijarRol(rol)

  onStep?.('Guardando el snapshot...')
  const { data: snap, error: errSnap } = await supabase
    .from('explosion_snapshots')
    .insert({ archivo: file.name, fecha_corte: fechaCorteDesdeNombre(file.name), rol })
    .select('id')
    .single()
  if (errSnap) throw errSnap

  const conSnapshot = materiales.map(m => ({ ...m, snapshot_id: snap.id }))
  onStep?.('Guardando los materiales...')
  await insertInBatches('explosion_materiales', conSnapshot)

  // Verificacion de integridad: si algun lote fallo a la mitad sin lanzar
  // error (ej. se corto la conexion), es mejor avisar claro que dejar un
  // snapshot incompleto que despues se compara como si estuviera bien.
  const { count, error: errCount } = await supabase
    .from('explosion_materiales')
    .select('id', { count: 'exact', head: true })
    .eq('snapshot_id', snap.id)
  if (errCount) throw errCount
  if (count !== conSnapshot.length) {
    throw new Error(`Se guardaron ${count} de ${conSnapshot.length} filas esperadas. El snapshot quedó incompleto -- borra este snapshot (archivo "${file.name}") en Supabase y vuelve a intentar.`)
  }

  return {
    materiales: new Set(materiales.map(m => m.codigo)).size,
    filas: conSnapshot.length,
    snapshotId: snap.id,
  }
}

// Ya no hay que adivinar el orden por fecha: cada snapshot dice sola si es
// la 'anterior' o la 'actual' (columna rol), puesta por fijarRol al
// importar. Como mucho hay un snapshot de cada rol a la vez.
export async function obtenerSnapshotsActuales() {
  const { data, error } = await supabase
    .from('explosion_snapshots')
    .select('id,archivo,creado_en,fecha_corte,rol')
    .in('rol', ['anterior', 'actual'])
  if (error) throw error
  return {
    actual: data.find(s => s.rol === 'actual') || null,
    anterior: data.find(s => s.rol === 'anterior') || null,
  }
}

export async function obtenerMaterialesDeSnapshot(snapshotId) {
  // Un snapshot completo son ~5 filas por material (una por mes): con mas
  // de 200 materiales ya se pasa de las 1000 filas que Supabase devuelve
  // como maximo en un solo select. Sin paginar, se perdian materiales en
  // silencio y aparecian como "Nuevo" o "Ya no aparece" sin serlo -- por
  // eso salian ~113 materiales nuevos cuando en realidad eran ~9.
  return fetchAll('explosion_materiales', '*', q => q.eq('snapshot_id', snapshotId))
}

// Para cada codigo, suma el saldo pendiente de todas sus entregas
// realmente abiertas en programacion_oc (Pendiente, En seguimiento,
// Reprogramado o Atrasado -- una entrega atrasada igual sigue siendo
// material que va a llegar) y guarda la fecha programada mas proxima entre
// esas. Una entrega que Johany ya cerro a mano (estado "Cerrado"), aunque
// le haya quedado saldo por tolerancia, no cuenta como pendiente: ya no va
// a llegar mas -- es la misma regla que decide "abierto" en Seguimiento OC
// (ver CERRADAS en lib/derive.js). Tambien se guarda el detalle de OC por
// entrega, para poder mostrar en pantalla cual OC exactamente cubre el
// consumo, no solo el total.
// Ademas guarda el origen (Local / Importado) de la ultima compra del
// material, abierta o cerrada, para elegir su lead time.
export async function obtenerOcPorSku(codigos) {
  const m = new Map()
  if (!codigos.length) return m
  const data = await fetchAll('programacion_oc', 'oc,sku,cant_programada,ajuste_cantidad,cant_ingresada,fecha_programada_ingreso,fecha_confirmada,estado_gestion,origen,tipo_documento,fecha_emision_oc', q => q.in('sku', codigos))
  for (const row of data) {
    if (!m.has(row.sku)) m.set(row.sku, { saldoPendiente: 0, fechaProgramada: null, entregas: [], origen: null, fechaUltimaCompra: null })
    const acc = m.get(row.sku)
    // Filas cargadas antes de que existiera "origen" solo tienen el tipo
    // de documento: OI (las de Seguimiento OI) es importado, OC es local.
    const origen = row.origen || (row.tipo_documento === 'OI' ? 'Importado' : row.tipo_documento === 'OC' ? 'Local' : null)
    if (origen) {
      const fechaCompra = row.fecha_emision_oc || row.fecha_programada_ingreso || ''
      if (!acc.origen || fechaCompra > acc.fechaUltimaCompra) {
        acc.origen = origen
        acc.fechaUltimaCompra = fechaCompra
      }
    }
    // Mismo saldo que se ve en Seguimiento OC / OI (ver enrich en
    // derive.js): incluye el ajuste excepcional de cantidad, que el saldo
    // guardado en la base no tiene.
    const saldo = Math.max(0, (row.cant_programada || 0) + (row.ajuste_cantidad || 0) - (row.cant_ingresada || 0))
    if (saldo <= 0 || CERRADAS.includes(row.estado_gestion)) continue
    acc.saldoPendiente += saldo
    const fechaEfectiva = row.fecha_confirmada || row.fecha_programada_ingreso
    acc.entregas.push({ oc: row.oc, saldo, fecha: fechaEfectiva })
    if (fechaEfectiva) {
      if (!acc.fechaProgramada || fechaEfectiva < acc.fechaProgramada) {
        acc.fechaProgramada = fechaEfectiva
      }
    }
  }
  return m
}

// El stock que trae la explosion es una foto fija del dia que se armo el
// archivo (fecha_corte). Un ingreso que llega despues de esa fecha ya deja
// de contar como "OC pendiente" (obtenerOcPorSku), pero el stock del
// archivo todavia no lo tiene -- sin esto, esas unidades parecian
// esfumarse hasta que Johany suba una explosion mas nueva. Se suma por
// separado desde ingresos_sistema, que si se actualiza con cada Excel que
// ella sube.
export async function obtenerIngresosPosterioresA(codigos, fechaCorte) {
  const m = new Map()
  if (!codigos.length || !fechaCorte) return m
  const data = await fetchAll('ingresos_sistema', 'codigo,cantidad_ingresada,fecha_ingreso',
    q => q.in('codigo', codigos).gt('fecha_ingreso', fechaCorte))
  for (const row of data) {
    m.set(row.codigo, (m.get(row.codigo) || 0) + (row.cantidad_ingresada || 0))
  }
  return m
}
