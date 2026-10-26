// A partir de las filas ya comparadas de compararExplosiones (parte 1) y
// lo que ya esta pendiente de recibir por OC (programacion_oc), calcula
// si de verdad hace falta comprar mas, cuanto, hasta cuando alcanza lo que
// hay, y para cuando hay que emitir la OC segun el lead time del material.

import { detectarTipo } from './leadTime'

function mermaPorGrupo(grupo) {
  if (grupo === 1 || grupo === 2) return 10
  if (grupo === 3 || grupo === 4) return 5
  return 0
}

// Los "tubos" tienen su propia regla de compra, aparte del grupo: el
// proveedor solo los vende en lotes de 20,000 unidades como minimo, y la
// merma es siempre 10% (no la del grupo que le haya tocado). Se detectan
// por la palabra "TUBO" en la descripcion -- unico criterio hoy; si
// aparecen otras categorias con lote minimo, hay que ampliar esto.
const LOTE_MINIMO_TUBO = 20000
const MERMA_TUBO = 10
function esTubo(descripcion) {
  return /\btubo\b/i.test(descripcion || '')
}

// Tope de cobertura de stock por grupo (confirmado con Johany): no tiene
// sentido comprar para tener guardado mas de esto, aunque el consumo
// futuro total de la explosion sea mayor -- se vuelve a comprar mas
// adelante cuando toque. Se usa el maximo del rango que dio Johany para
// Grupo 3/4 (1.5 a 2 meses).
function coberturaMesesPorGrupo(grupo) {
  if (grupo === 1 || grupo === 2) return 2.5
  if (grupo === 3 || grupo === 4) return 2
  return null // sin grupo conocido: no se limita, usa todo el horizonte
}

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const DIA = 86400000

function mesActualIso() {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`
}

// El consumo del mes en curso no se cuenta (confirmado con Johany): su
// material ya tuvo que ingresar el dia 10 del mes anterior, o sea que ya
// esta en planta o ya se consumio, y el stock de hoy ya lo refleja. La
// planificacion empieza en el mes siguiente.
function mesesPorPlanificar(meses) {
  const mesActual = mesActualIso()
  return [...meses].filter(m => m.mes > mesActual).sort((a, b) => a.mes.localeCompare(b.mes))
}

// Suma el consumo en firme de los proximos "mesesCobertura" meses. Un mes
// que cae aunque sea parcialmente dentro de la ventana se cuenta completo
// (redondeando la cantidad de meses hacia arriba), no a prorrata por dias:
// el consumo real de un mes suele ser una corrida de produccion puntual,
// no algo repartido parejo dia a dia. Si mesesCobertura es null, usa todo
// el horizonte disponible.
function necesidadHastaCobertura(futuros, mesesCobertura) {
  const ventana = mesesCobertura == null ? futuros : futuros.slice(0, Math.ceil(mesesCobertura))
  return ventana.reduce((a, m) => a + (m.actual || 0), 0)
}

// Primer mes en que el consumo acumulado supera lo disponible: ahi se
// acaba el material. null si alcanza para todo el horizonte.
function mesEnQueSeAcaba(futuros, disponible) {
  let acumulado = 0
  for (const m of futuros) {
    acumulado += m.actual || 0
    if (acumulado > disponible) return m.mes
  }
  return null
}

// Regla de Johany: el material de un mes de fabricacion debe estar en
// almacen como maximo el dia 10 del mes anterior (fabricacion noviembre ->
// requerido 10 de octubre).
function fechaRequeridaParaMes(mes) {
  const [y, mo] = mes.split('-').map(Number)
  return iso(new Date(y, mo - 2, 10))
}

function mesAnterior(mes) {
  const [y, mo] = mes.split('-').map(Number)
  return iso(new Date(y, mo - 2, 1))
}

// Si el mes de fabricacion mas proximo del snapshot ya paso, busca el
// siguiente mes con consumo que aun no haya pasado y recalcula la fecha
// requerida. Solo se usa para "pedido tardio" (evidencia de que
// planeamiento pidio el material fuera de fecha), no para decidir la
// compra.
function mesFabricacionEfectivo(mesFabOriginal, fechaReqOriginal, meses) {
  if (!mesFabOriginal) return { mesFab: null, fechaReq: null }
  const mesActual = mesActualIso()
  if (mesFabOriginal >= mesActual) return { mesFab: mesFabOriginal, fechaReq: fechaReqOriginal }
  const proximo = [...meses]
    .filter(m => m.mes >= mesActual && (m.actual || 0) > 0)
    .sort((a, b) => a.mes.localeCompare(b.mes))[0]
  if (!proximo) return { mesFab: mesFabOriginal, fechaReq: fechaReqOriginal }
  return { mesFab: proximo.mes, fechaReq: fechaRequeridaParaMes(proximo.mes) }
}

// Margenes para el estado segun la fecha limite para emitir la OC.
const DIAS_PEDIR_YA = 7
const DIAS_PEDIR_PRONTO = 30

export function calcularCompraSugerida(filas, ocPorSku, ingresosPorSku = new Map(), fechaCorte = null, stockDiario = null, leadTimes = null) {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const hoyIso = iso(hoy)

  return filas.map(f => {
    const tubo = esTubo(f.descripcion)
    const mermaPct = tubo ? MERMA_TUBO : mermaPorGrupo(f.grupo)
    const loteMinimo = tubo ? LOTE_MINIMO_TUBO : null
    const mesesCobertura = coberturaMesesPorGrupo(f.grupo)
    const futuros = mesesPorPlanificar(f.meses)
    const necesidad = necesidadHastaCobertura(futuros, mesesCobertura)
    const oc = ocPorSku.get(f.codigo) || { saldoPendiente: 0, fechaProgramada: null, entregas: [], origen: null }
    const stockDiarioEntry = stockDiario?.get(f.codigo) || null
    // El stock que trae la explosion queda congelado en la fecha del
    // archivo (fecha_corte): si una OC ingresa despues de esa fecha, deja
    // de contar como "pendiente" pero el stock del archivo todavia no la
    // tiene. Se suma aparte lo que ya ingreso a almacen despues del corte,
    // salvo que haya stock del sistema (ese ya esta al dia).
    const ingresosPosterioresAlCorte = stockDiarioEntry ? 0 : (ingresosPorSku.get(f.codigo) || 0)
    const stock = stockDiarioEntry ? stockDiarioEntry.total : ((f.stock || 0) + ingresosPosterioresAlCorte)

    const faltanteReal = Math.max(0, necesidad - stock - oc.saldoPendiente)
    // La merma se aplica sobre lo que de verdad falta comprar, no sobre
    // toda la necesidad. El lote minimo es un piso del proveedor, no se le
    // suma merma aparte.
    const conMerma = Math.ceil(faltanteReal * (1 + mermaPct / 100))
    const loteMinimoAplicado = faltanteReal > 0 && loteMinimo && faltanteReal < loteMinimo
    const compraSugerida = faltanteReal <= 0 ? 0 : loteMinimoAplicado ? loteMinimo : conMerma

    // Hasta cuando alcanza: con stock + OC pendiente, y con solo el stock
    // (para saber si la OC pendiente llega antes de que se acabe).
    const mesSeAcaba = mesEnQueSeAcaba(futuros, stock + oc.saldoPendiente)
    const mesSeAcabaSoloStock = mesEnQueSeAcaba(futuros, stock)
    const alcanzaHasta = mesSeAcaba ? mesAnterior(mesSeAcaba) : (futuros.length ? futuros[futuros.length - 1].mes : null)
    const alcanzaTodoElHorizonte = !mesSeAcaba
    const fechaRequeridaIngreso = mesSeAcaba ? fechaRequeridaParaMes(mesSeAcaba) : null
    const fechaRequeridaSoloStock = mesSeAcabaSoloStock ? fechaRequeridaParaMes(mesSeAcabaSoloStock) : null

    // Lead time: tipo de material + origen (Local / Importado). El origen
    // sale de la ultima OC/OI del material, salvo que Johany le haya puesto
    // uno a mano; si nunca se compro, se asume Local.
    const tipo = detectarTipo(f.descripcion)
    const excepcion = leadTimes?.materiales.get(f.codigo) || null
    const origen = excepcion?.origen || oc.origen || 'Local'
    const origenFuente = excepcion?.origen ? 'manual' : oc.origen ? 'oc' : 'supuesto'
    const ltTipo = leadTimes?.tipos.get(tipo) || null
    const leadTimeTipo = ltTipo ? (origen === 'Importado' ? ltTipo.importado : ltTipo.local) : null
    const leadTime = excepcion?.dias ?? leadTimeTipo ?? null
    const leadTimeFuente = excepcion?.dias != null ? 'manual' : leadTimeTipo != null ? 'tipo' : null

    let fechaLimitePedido = null
    let diasParaPedir = null
    if (fechaRequeridaIngreso && leadTime != null) {
      const req = new Date(fechaRequeridaIngreso + 'T00:00:00')
      fechaLimitePedido = iso(new Date(req.getTime() - leadTime * DIA))
      diasParaPedir = Math.round((new Date(fechaLimitePedido + 'T00:00:00') - hoy) / DIA)
    }

    // La OC pendiente llega tarde si el stock solo se acaba antes de la
    // fecha programada de esa OC.
    const ocLlegaTarde = oc.saldoPendiente > 0 && !!oc.fechaProgramada && !!fechaRequeridaSoloStock
      && oc.fechaProgramada > fechaRequeridaSoloStock

    let estadoAbastecimiento
    if (faltanteReal > 0 && fechaRequeridaIngreso && fechaRequeridaIngreso < hoyIso) {
      estadoAbastecimiento = 'quiebre'
    } else if (faltanteReal > 0 && diasParaPedir != null && diasParaPedir < 0) {
      // Aun no se acaba, pero aunque se pida hoy ya no llega para el dia 10.
      estadoAbastecimiento = 'no_llega'
    } else if (ocLlegaTarde) {
      estadoAbastecimiento = 'oc_tarde'
    } else if (faltanteReal <= 0) {
      estadoAbastecimiento = 'cubierto'
    } else if (leadTime == null) {
      estadoAbastecimiento = 'sin_lead_time'
    } else if (diasParaPedir <= DIAS_PEDIR_YA) {
      estadoAbastecimiento = 'pedir_ya'
    } else if (diasParaPedir <= DIAS_PEDIR_PRONTO) {
      estadoAbastecimiento = 'pedir_pronto'
    } else {
      estadoAbastecimiento = 'con_tiempo'
    }

    // Anticipacion: dias entre la fecha del archivo de explosion y la
    // fecha en que el material necesitaba estar en almacen segun el mes de
    // fabricacion. Si es negativo, la explosion pidio algo que ya debia
    // haber llegado -> "pedido tardio": evidencia de que
    // planeamiento/produccion lo solicito fuera de fecha.
    const { mesFab, fechaReq: fechaReqFabricacion } = mesFabricacionEfectivo(
      f.mesFabricacionProximo, f.fechaRequeridaIngreso, f.meses)
    let diasAnticipacion = null
    let pedidoTardio = false
    if (fechaCorte && fechaReqFabricacion) {
      diasAnticipacion = Math.round(
        (new Date(fechaReqFabricacion + 'T00:00:00') - new Date(fechaCorte + 'T00:00:00')) / DIA
      )
      pedidoTardio = diasAnticipacion < 0
    }

    return {
      ...f,
      mesFabricacionProximo: mesFab,
      fechaRequeridaIngreso,
      mermaPct,
      loteMinimoAplicado,
      mesesCobertura,
      necesidadCobertura: necesidad,
      ocPendiente: oc.saldoPendiente,
      ocEntregas: oc.entregas,
      fechaEntregaProgramada: oc.fechaProgramada,
      stockEfectivo: stock,
      stockDiarioEntry,
      usaStockDiario: !!stockDiarioEntry,
      ingresosPosterioresAlCorte,
      faltanteReal,
      compraSugerida,
      alcanzaHasta,
      alcanzaTodoElHorizonte,
      tipo,
      origen,
      origenFuente,
      origenCompra: oc.origen || null,
      leadTime,
      leadTimeFuente,
      fechaLimitePedido,
      diasParaPedir,
      ocLlegaTarde,
      estadoAbastecimiento,
      diasAnticipacion,
      pedidoTardio,
    }
  })
}
